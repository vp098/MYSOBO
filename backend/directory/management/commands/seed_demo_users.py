"""
Seed clearly-labelled DEMO residents, business owners and businesses for testing.

    python manage.py seed_mysobo            # categories first
    python manage.py seed_demo_users        # then this (safe to run again)
    python manage.py seed_demo_users --clear   # remove ONLY the demo data

How demo data is marked (and how --clear finds it):
  * people, societies and businesses have names ending in " (Demo)"
  * demo mobiles start with 99999 (log in as +91 99999 xxxxx)
  * demo usernames start with "demo-", demo business slugs start with "demo-sobo-"
  * demo businesses have source="demo_seed"

Row-level security: if the database role does not bypass RLS, the command sets the
same `mysobo.user_id` context the app's middleware uses — an existing super admin
for most writes, and each demo user for their own reviews and claims.
"""
from datetime import time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import AdminRole, Profile, Society, User
from directory.models import (
    Business,
    BusinessHour,
    BusinessMember,
    BusinessPost,
    BusinessProduct,
    BusinessService,
    Category,
    Claim,
    Review,
    SavedBusiness,
    Subcategory,
)

DEMO = " (Demo)"
MOBILE_PREFIX = "99999"
SOURCE = "demo_seed"
AREA = "South Bopal, Ahmedabad"

SOCIETIES = [
    "Applewoods Township",
    "Shilaj Heights",
    "Sobo Centre Residency",
    "Safal Parisar",
    "Shivalik Bungalows",
]

RESIDENTS = [
    "Aarav Patel", "Diya Shah", "Kabir Mehta", "Ananya Desai", "Vivaan Joshi",
    "Isha Trivedi", "Reyansh Parikh", "Myra Bhatt", "Arjun Modi", "Saanvi Pandya",
    "Dhruv Thakkar", "Kiara Vyas", "Yash Chauhan", "Nisha Rana", "Om Raval",
]

OWNERS = [
    "Riya Shah", "Dr. Ketan Patel", "Harsh Mehta", "Nidhi Joshi", "Amit Desai",
    "Pooja Trivedi", "Manish Rao", "Sneha Parikh", "Vikram Solanki", "Kavya Iyer",
]

WEEKDAYS = range(0, 6)  # Mon-Sat; dow 6 = Sunday

# owner index -> businesses. "items" are services for service businesses,
# products for product businesses; "both" gets one of each kind.
BUSINESSES = [
    dict(owner=0, name="Brew & Banyan Café", kind="both", category="Food and dining", sub="Cafes",
         address="Shop 4, Sobo Centre, South Bopal, Ahmedabad 380058", society=2,
         hours=(time(8), time(23), (time(9), time(23))), plan="pro",
         services=[("Dine-in coffee & snacks", 150, 600), ("Birthday table booking", 500, 2000)],
         products=[("Cold brew bottle 300ml", "Brew & Banyan", 180), ("House-roast coffee beans 250g", "Brew & Banyan", 450)],
         posts=[("Monsoon special: masala cold brew", "Try our new masala cold brew, only this month."),
                ("Open late on weekends", "We're now open till 11pm every Saturday and Sunday.")]),
    dict(owner=0, name="Sobo Bake House", kind="product", category="Bakery and confectionery", sub="Cakes",
         address="Ground floor, Shilp Aaron, Ambli–Bopal Road, Ahmedabad 380058", society=None,
         hours=(time(9), time(22), (time(10), time(22))),
         products=[("Chocolate truffle cake 1kg", "Sobo Bake House", 750), ("Eggless red velvet cake 500g", "Sobo Bake House", 520), ("Whole wheat bread", "Sobo Bake House", 60)],
         posts=[("Custom cakes in 24 hours", "Order your birthday cake a day ahead — eggless options available.")]),
    dict(owner=1, name="Sobo Family Clinic", kind="service", category="Medical and health", sub="Clinics",
         address="1st floor, Sobo Centre, South Bopal, Ahmedabad 380058", society=2,
         hours=(time(9, 30), time(20, 30), None),
         services=[("General consultation", 400, 500), ("Child vaccination", 300, 1500), ("Health check-up package", 1200, 3500)],
         posts=[("Flu vaccine now available", "Walk in between 10am and 1pm, Monday to Saturday."),
                ("Free BP & sugar check on Sundays", "Every Sunday morning for senior citizens of South Bopal.")]),
    dict(owner=1, name="Smile Studio Dental", kind="service", category="Medical and health", sub="Dentists",
         address="Shop 18, Shivalik Plaza, Ambli–Bopal Road, Ahmedabad 380058", society=4,
         hours=(time(10), time(20), None),
         services=[("Dental check-up & cleaning", 500, 1200), ("Root canal treatment", 4000, 8000)],
         posts=[("Kids' dental camp this Saturday", "Free check-up for children under 12.")]),
    dict(owner=2, name="Iron Peak Gym", kind="service", category="Fitness and wellness", sub="Gyms",
         address="Near Safal Parisar, Bopal–Ghuma Road, Ahmedabad 380058", society=3,
         hours=(time(5, 30), time(22, 30), (time(6), time(12))), plan="premium",
         services=[("Monthly membership", 1500, 2500), ("Personal training (12 sessions)", 6000, 9000), ("Zumba batch", 1200, 1500)],
         posts=[("New year offer: 3 months at the price of 2", "Valid for new members who join this month."),
                ("Morning HIIT batch starting", "6:30am every weekday. Limited spots.")]),
    dict(owner=3, name="Glow & Grace Salon", kind="service", category="Fitness and wellness", sub="Salons",
         address="Shop 7, Applewoods Commercial, South Bopal, Ahmedabad 380058", society=0,
         hours=(time(10), time(21), (time(10), time(20))),
         services=[("Haircut & styling", 300, 900), ("Bridal makeup", 8000, 25000), ("Facial & clean-up", 800, 2500)],
         posts=[("Festive season bookings open", "Book bridal and party makeup slots early.")]),
    dict(owner=4, name="Bopal Electronics Hub", kind="product", category="Electronics and home appliances", sub="Televisions",
         address="Shop 2, Gala Gymkhana Road, South Bopal, Ahmedabad 380058", society=None,
         hours=(time(10), time(21), (time(11), time(20))), plan="pro",
         products=[("43-inch 4K Smart TV", "Demo Brand", 27999), ("1.5 ton inverter AC", "Demo Brand", 36500), ("7kg front-load washing machine", "Demo Brand", 29990)],
         posts=[("Exchange offer on TVs", "Get up to ₹5,000 off when you exchange your old TV."),
                ("Free AC installation", "On all ACs bought this month in South Bopal.")]),
    dict(owner=4, name="Sobo Mobile Point", kind="product", category="Electronics and home appliances", sub="Smartphones",
         sub_slug="mobile-smartphones",
         address="Shop 11, Sobo Centre, South Bopal, Ahmedabad 380058", society=2,
         hours=(time(10), time(21, 30), (time(11), time(21))),
         products=[("5G smartphone 128GB", "Demo Brand", 15999), ("20W fast charger", "Demo Brand", 899), ("Wireless earbuds", "Demo Brand", 1999)],
         posts=[("Screen guard fitted free", "With every phone purchase this week.")]),
    dict(owner=5, name="Fresh Basket Mart", kind="product", category="Grocery and supermarkets", sub="Packaged foods",
         address="Ground floor, Shilaj Heights, Shilaj Road, Ahmedabad 380058", society=1,
         hours=(time(7), time(22), (time(7), time(22))),
         products=[("Basmati rice 5kg", "Demo Brand", 650), ("Groundnut oil 5L", "Demo Brand", 980), ("Breakfast cereal 500g", "Demo Brand", 240)],
         posts=[("Free home delivery above ₹500", "Within South Bopal, Shilaj and Ambli."),
                ("Weekend fresh produce sale", "Fruits and vegetables at 10% off on Saturdays.")]),
    dict(owner=6, name="QuickFix Home Services", kind="service", category="Home services", sub="AC repair",
         address="Plot 22, Bopal Gam, South Bopal, Ahmedabad 380058", society=None,
         hours=(time(9), time(20), (time(10), time(14))),
         services=[("AC servicing", 499, 899), ("AC gas refill", 1800, 2800), ("Appliance repair visit", 299, 599)],
         posts=[("Summer AC servicing slots open", "Book now to avoid the May rush.")]),
    dict(owner=6, name="SparkLine Electricals", kind="service", category="Home services", sub="Electrician",
         address="Shop 3, Ghuma Gam Road, Ahmedabad 380058", society=None, unverified=True,
         hours=(time(9), time(19), None),
         services=[("Wiring & fitting", 300, 2500), ("Inverter installation", 800, 1500)],
         posts=[("24x7 emergency electrician", "Call us any time for urgent repairs.")]),
    dict(owner=7, name="Little Steps Daycare", kind="service", category="Daycare and elder care", sub="Daycare",
         address="Bungalow 9, Shivalik Bungalows, South Bopal, Ahmedabad 380058", society=4,
         hours=(time(8), time(19), None),
         services=[("Full-day daycare (monthly)", 6500, 9000), ("After-school care (monthly)", 3500, 5000)],
         posts=[("Admissions open for the new term", "Ages 1.5 to 6 years. Visit us for a tour."),
                ("Summer activity camp", "Art, music and storytelling — 2 weeks in May.")]),
    dict(owner=8, name="Ambli Book & Stationery", kind="product", category="Shopping and daily needs", sub="Stationery",
         address="Shop 5, Ambli–Bopal Road, Ahmedabad 380058", society=None,
         hours=(time(9, 30), time(21), (time(10), time(14))),
         products=[("School notebook set (12)", "Demo Brand", 420), ("Geometry box", "Demo Brand", 150), ("A4 printing paper (500)", "Demo Brand", 320)],
         posts=[("Back-to-school kits ready", "Complete kits for Std 1 to 10.")]),
    dict(owner=8, name="Sobo Pharmacy Plus", kind="product", category="Medical and health", sub="Pharmacies",
         address="Shop 9, Sobo Centre, South Bopal, Ahmedabad 380058", society=2, unverified=True,
         hours=(time(8), time(23), (time(9), time(22))),
         products=[("Digital thermometer", "Demo Brand", 250), ("BP monitor", "Demo Brand", 1650)],
         posts=[("Medicine home delivery", "Send your prescription on WhatsApp.")]),
    dict(owner=9, name="Bright Minds Tuition", kind="service", category="Tuition and coaching", sub="Coaching classes",
         address="2nd floor, Applewoods Commercial, South Bopal, Ahmedabad 380058", society=0, unverified=True,
         hours=(time(15), time(21), (time(9), time(13))),
         services=[("Maths & Science (Std 8–10)", 2500, 4000), ("Spoken English batch", 1500, 2500)],
         posts=[("Free demo class this week", "Bring a friend and get 10% off the first month.")]),
]

REVIEW_TEXTS = [
    (5, "Really good experience, would recommend to neighbours."),
    (4, "Good service and friendly staff. Slightly busy on weekends."),
    (5, "Quick, reliable and fairly priced."),
    (3, "Decent, but there was a bit of a wait."),
    (4, "Convenient location in South Bopal and helpful people."),
]


def demo_mobile(group, n):
    """10-digit mobile as the app stores it (login with +91 in front)."""
    return f"{MOBILE_PREFIX}{group}{n:04d}"


class Command(BaseCommand):
    help = "Create (or with --clear, remove) clearly-labelled DEMO users, societies and businesses."

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Delete only the demo data created by this command.")
        parser.add_argument(
            "--admin-mobile",
            help="Mobile of an existing super admin to act as when the DB role is subject to row-level security.",
        )

    # ---------- row-level security context ----------
    def _setup_rls(self, admin_mobile):
        self.rls = False
        self.admin = None
        if connection.vendor != "postgresql":
            return
        with connection.cursor() as cur:
            cur.execute(
                "SELECT r.rolsuper OR r.rolbypassrls OR t.tableowner = current_user "
                "FROM pg_roles r, pg_tables t "
                "WHERE r.rolname = current_user AND t.schemaname = 'public' AND t.tablename = 'directory_business'"
            )
            row = cur.fetchone()
        if row and row[0]:
            return  # this DB role is not restricted by RLS
        self.rls = True
        admins = User.objects.filter(Q(is_superuser=True) | Q(admin_roles__role=AdminRole.Role.SUPER_ADMIN)).distinct()
        if admin_mobile:
            admins = admins.filter(mobile=admin_mobile)
        self.admin = admins.first()
        if not self.admin:
            raise CommandError(
                "Row-level security is active for this database role and no super admin was found. "
                "Create one first (python manage.py createsuperuser) or pass --admin-mobile."
            )

    def _act_as(self, user):
        if self.rls:
            with connection.cursor() as cur:
                cur.execute("SELECT set_config('mysobo.user_id', %s, true)", [str(user.pk) if user else ""])

    def _as_admin(self):
        self._act_as(self.admin)

    # ---------- entry point ----------
    def handle(self, *args, **options):
        with transaction.atomic():
            self._setup_rls(options.get("admin_mobile"))
            self._as_admin()
            if options["clear"]:
                self._clear()
            else:
                self._seed()

    # ---------- clear ----------
    def _clear(self):
        businesses = Business.objects.filter(source=SOURCE, name__endswith=DEMO, slug__startswith="demo-sobo-")
        users = User.objects.filter(mobile__startswith=MOBILE_PREFIX, username__startswith="demo-")
        societies = Society.objects.filter(name__endswith=DEMO)
        counts = {
            "businesses": businesses.count(),
            "users": users.count(),
            "societies": societies.count(),
        }
        businesses.delete()   # cascades: hours, products, services, posts, members, claims, reviews, saved
        users.delete()        # cascades: profiles, members, claims, reviews, saved
        societies.delete()
        self.stdout.write(self.style.SUCCESS(
            f"Removed demo data: {counts['businesses']} businesses, {counts['users']} users, "
            f"{counts['societies']} societies."
        ))

    # ---------- seed ----------
    def _seed(self):
        now = timezone.now()
        if not Category.objects.exists():
            raise CommandError("No categories found. Run `python manage.py seed_mysobo` first.")

        societies = []
        for name in SOCIETIES:
            society, _ = Society.objects.update_or_create(name=name + DEMO, defaults={"area": AREA})
            societies.append(society)

        residents = [
            self._person(f"demo-resident-{i:02d}", name, demo_mobile(1, i), societies[(i - 1) % len(societies)], now)
            for i, name in enumerate(RESIDENTS, start=1)
        ]
        owners = [
            self._person(f"demo-owner-{i:02d}", name, demo_mobile(2, i), societies[(i - 1) % len(societies)], now)
            for i, name in enumerate(OWNERS, start=1)
        ]

        businesses = []
        for spec in BUSINESSES:
            businesses.append(self._business(spec, owners[spec["owner"]], societies, now))

        public = [b for b in businesses if not b.hidden]
        verified = [b for b in businesses if b.verification_level >= 2]

        # Saved businesses: first 10 residents save 3 businesses each.
        self._as_admin()
        for i, resident in enumerate(residents[:10]):
            for j in range(3):
                SavedBusiness.objects.get_or_create(user=resident, business=public[(i * 2 + j) % len(public)])

        # Reviews: residents review verified businesses (RLS requires acting as the author).
        for i, resident in enumerate(residents[:12]):
            self._act_as(resident)
            for j in range(2):
                business = verified[(i + j * 5) % len(verified)]
                rating, body = REVIEW_TEXTS[(i + j) % len(REVIEW_TEXTS)]
                Review.objects.update_or_create(user=resident, business=business, defaults={"rating": rating, "body": body})
        self._as_admin()

        self._report(residents, owners, businesses)

    def _person(self, username, name, mobile, society, now):
        self._as_admin()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"mobile": mobile, "first_name": name.split()[-2] if name.startswith("Dr.") else name.split()[0]},
        )
        if created:
            user.set_unusable_password()  # demo users sign in with OTP only
            user.save(update_fields=["password"])
        elif user.mobile != mobile:
            user.mobile = mobile
            user.save(update_fields=["mobile"])
        profile, _ = Profile.objects.update_or_create(
            id=user,
            defaults={
                "name": name + DEMO,
                "mobile": mobile,
                "society": society,
                "consent_version": settings.OTP_CONSENT_VERSION,
            },
        )
        if profile.consent_at is None:
            profile.consent_at = now
            profile.save(update_fields=["consent_at"])
        return user

    def _business(self, spec, owner, societies, now):
        self._as_admin()
        category = Category.objects.filter(slug=slugify(spec["category"])).first()
        if not category:
            raise CommandError(f"Category '{spec['category']}' not found. Run `python manage.py seed_mysobo` first.")
        subcategory = Subcategory.objects.filter(
            category=category, slug=spec.get("sub_slug") or slugify(spec["sub"])
        ).first()
        if not subcategory:
            raise CommandError(
                f"Subcategory '{spec['sub']}' in '{spec['category']}' not found. Run `python manage.py seed_mysobo` first."
            )

        unverified = spec.get("unverified", False)
        owner_mobile = owner.mobile
        index = BUSINESSES.index(spec) + 1
        defaults = {
            "name": spec["name"] + DEMO,
            "kind": spec["kind"],
            "category": category,
            "subcategory": subcategory,
            "description": (
                f"{spec['name']} is a demo listing in South Bopal for testing search, filters and "
                f"listing pages. Not a real business."
            ),
            "phone": owner_mobile,
            "whatsapp": owner_mobile,
            "email": f"demo-business-{index:02d}@example.com",
            "address": spec["address"],
            "lat": round(23.0225 + (index % 5) * 0.0031, 6),
            "lng": round(72.4690 + (index % 4) * 0.0037, 6),
            "society": societies[spec["society"]] if spec["society"] is not None else None,
            "source": SOURCE,
            "created_by": owner,
            "hidden": False,
            "plan": spec.get("plan", Business.Plan.FREE),
            "verification_level": 0 if unverified else 2,
            "verified_by": None if unverified else self.admin,
            "verification_note": "Demo data — pending claim review." if unverified else "Demo data — verified for testing.",
        }
        business, _ = Business.objects.update_or_create(slug=f"demo-sobo-{slugify(spec['name'])}", defaults=defaults)
        if not unverified and business.verified_on is None:
            business.verified_on = now
            business.save(update_fields=["verified_on"])

        BusinessMember.objects.update_or_create(user=owner, business=business, defaults={"role": BusinessMember.Role.OWNER})

        weekday_open, weekday_close, sunday = spec["hours"]
        for dow in range(7):
            if dow in WEEKDAYS:
                values = {"opens": weekday_open, "closes": weekday_close, "closed": False}
            elif sunday:
                values = {"opens": sunday[0], "closes": sunday[1], "closed": False}
            else:
                values = {"opens": None, "closes": None, "closed": True}
            BusinessHour.objects.update_or_create(business=business, dow=dow, defaults=values)

        for name, low, high in spec.get("services", []):
            BusinessService.objects.update_or_create(
                business=business,
                name=name,
                defaults={
                    "category": category,
                    "subcategory": subcategory,
                    "description": f"{name} — demo service.",
                    "service_area": "South Bopal, Bopal, Ambli, Shela, Ghuma",
                    "experience_years": 3 + index % 8,
                    "price_min": Decimal(low),
                    "price_max": Decimal(high),
                    "available": True,
                    "active": True,
                },
            )
        for name, brand, price in spec.get("products", []):
            BusinessProduct.objects.update_or_create(
                business=business,
                name=name,
                defaults={
                    "category": category,
                    "subcategory": subcategory,
                    "brand": brand,
                    "description": f"{name} — demo product.",
                    "price": Decimal(price),
                    "available": True,
                    "active": True,
                },
            )

        for title, body in spec["posts"]:
            BusinessPost.objects.update_or_create(
                business=business,
                title=title,
                defaults={
                    "body": body,
                    "status": BusinessPost.Status.PENDING if unverified else BusinessPost.Status.APPROVED,
                    "reviewed_by": None if unverified else self.admin,
                },
            )

        if unverified:
            self._act_as(owner)  # RLS: claims are created by the claimant
            if not Claim.objects.filter(business=business, user=owner).exists():
                Claim.objects.create(
                    business=business,
                    user=owner,
                    status=Claim.Status.PENDING,
                    note="Demo claim — waiting for admin review.",
                )
            self._as_admin()
        return business

    # ---------- summary ----------
    def _report(self, residents, owners, businesses):
        demo_biz = Business.objects.filter(source=SOURCE, slug__startswith="demo-sobo-")
        demo_users = User.objects.filter(mobile__startswith=MOBILE_PREFIX, username__startswith="demo-")
        rows = [
            ("Societies", Society.objects.filter(name__endswith=DEMO).count()),
            ("Users", demo_users.count()),
            ("Profiles", Profile.objects.filter(id__in=demo_users).count()),
            ("Businesses", demo_biz.count()),
            ("  verified", demo_biz.filter(verification_level__gte=2).count()),
            ("  unverified", demo_biz.filter(verification_level__lt=2).count()),
            ("BusinessMembers", BusinessMember.objects.filter(business__in=demo_biz).count()),
            ("BusinessHours", BusinessHour.objects.filter(business__in=demo_biz).count()),
            ("BusinessServices", BusinessService.objects.filter(business__in=demo_biz).count()),
            ("BusinessProducts", BusinessProduct.objects.filter(business__in=demo_biz).count()),
            ("BusinessPosts", BusinessPost.objects.filter(business__in=demo_biz).count()),
            ("Claims (pending)", Claim.objects.filter(business__in=demo_biz, status=Claim.Status.PENDING).count()),
            ("SavedBusinesses", SavedBusiness.objects.filter(user__in=demo_users).count()),
            ("Reviews", Review.objects.filter(user__in=demo_users).count()),
            ("Categories (all)", Category.objects.count()),
            ("Subcategories (all)", Subcategory.objects.count()),
        ]
        self.stdout.write(self.style.SUCCESS("\nDemo data ready:"))
        for label, n in rows:
            self.stdout.write(f"  {label:<22}{n:>5}")

        unverified_owner = next(
            o for o in owners
            if not BusinessMember.objects.filter(user=o, business__verification_level__gte=2).exists()
        )
        self.stdout.write("\nDemo logins (OTP):")
        self.stdout.write(f"  Resident:          +91 {residents[0].mobile}  {residents[0].profile.name}")
        self.stdout.write(f"  Owner (verified):  +91 {owners[0].mobile}  {owners[0].profile.name}")
        self.stdout.write(f"  Owner (pending):   +91 {unverified_owner.mobile}  {unverified_owner.profile.name}")
        self.stdout.write("\nRemove later with: python manage.py seed_demo_users --clear")

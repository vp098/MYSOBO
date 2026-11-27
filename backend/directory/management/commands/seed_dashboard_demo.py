"""Fill the database with sample South Bopal listings so the dashboards look real.

    python manage.py seed_dashboard_demo                         # listings, reviews, offers
    python manage.py seed_dashboard_demo --owner-email you@gmail.com   # also give that Google account sample owner listings
    python manage.py seed_dashboard_demo --owner-mobile 98XXXXXXXX     # same, for a mobile (OTP) account
    python manage.py seed_dashboard_demo --remove                # delete everything this command created

Every listing is marked with source="sample". Phone numbers are placeholders
of the form 00000 00NNN, which cannot reach a real person. Run --remove before launch.
"""
from datetime import time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import User
from billing.models import PlanPrice, SubscriptionRequest
from directory.models import (
    Business,
    BusinessHour,
    BusinessMember,
    BusinessPost,
    BusinessService,
    BusinessProduct,
    Category,
    Review,
)

SOURCE = "sample"
REVIEWER_PREFIX = "sample-resident-"

# name, kind, category, area, plan, description, (item name, price) or None
LISTINGS = [
    ("Sobo Rapid Home & AC Care", "service", "Home services", "Gala Gymkhana Road, South Bopal", "pro",
     "AC service and gas refill, deep home cleaning and same-day appliance repair.", ("AC service", 499)),
    ("Dr. Mehta Child & Family Clinic", "service", "Medical and health", "Sun City Sector 1, South Bopal", "pro",
     "Family physician and child care. Blood tests at home, vaccinations and ECG.", ("Consultation", 400)),
    ("Shreeji Kathiyawadi & Jain Tiffin", "service", "Food and dining", "Near SOBO Center, South Bopal", "free",
     "Kathiyawadi and Jain thalis cooked fresh at home. Lunch and dinner delivery.", ("Kathiyawadi thali", 140)),
    ("Krishna Pure Organic A2 Milk & Dairy", "product", "Dairy and milk products", "South Bopal Main Road", "free",
     "A2 Gir cow milk, fresh paneer and ghee delivered before 7 AM.", ("A2 milk, 1 litre", 95)),
    ("Excel CBSE & GSEB Home Tutors", "service", "Tuition and coaching", "Near TRP Mall, Bopal", "free",
     "Home tutors for CBSE and GSEB, classes 1 to 12. Maths, science and English.", ("Home tuition, monthly", 3000)),
    ("Dr. R. K. Patel, Senior Paediatrician", "service", "Medical and health", "Gala Gymkhana Road, South Bopal", "premium",
     "Child specialist with 25 years of practice. OPD 5 PM to 9 PM. Vaccinations and newborn care.", ("Consultation", 500)),
    ("Shreeji Maths & Science Academy", "service", "Tuition and coaching", "Safal Parisar 1, South Bopal", "pro",
     "CBSE and ICSE, classes 8 to 10. At most 12 students per batch. Home visits available.", ("Monthly batch fee", 2500)),
    ("The Crust & Crumb Artisan Bakehouse", "product", "Bakery and confectionery", "Sobo Center, South Bopal", "pro",
     "Sourdough breads and custom cakes. Fully vegetarian and eggless.", ("Sourdough loaf", 220)),
    ("TrustCare Domestic Services", "service", "House help", "Gala Haven cross road, South Bopal", "free",
     "Background-checked, police-verified maids, cooks and nannies.", ("Full-time cook, monthly", 9000)),
    ("SoBo Smashers Pickleball & Box Cricket Turf", "service", "Fitness and wellness", "Near TRP Mall circle, South Bopal", "premium",
     "Floodlit night slots and equipment on rent. Box cricket and pickleball.", ("Turf booking, per hour", 800)),
    ("Safal Parisar Sparkle Home Care", "service", "Home services", "Safal Parisar, South Bopal", "premium",
     "Deep home cleaning, sofa shampoo and kitchen degreasing by a trained team.", ("Full home deep cleaning", 2499)),
    ("Shivalik Appliance Clinic", "service", "Home services", "Shivalik Sharda, Bopal", "pro",
     "AC, washing machine, fridge and microwave repair with same-day visits.", ("AC service and gas check", 599)),
    ("AquaPure Plumbing Services", "service", "Home services", "Ghuma Road", "free",
     "Leak repair, bathroom fittings and water tank cleaning.", ("Plumber visit", 299)),
    ("Kathiyawadi Swad Home Tiffin", "both", "Food and dining", "Iscon Platinum, South Bopal", "pro",
     "Home-cooked Gujarati thali — rotli, shaak, dal-bhaat — with Jain options.", ("Gujarati thali tiffin", 120)),
    ("Shela Farm Fresh Vegetables", "product", "Fruits and vegetables", "Shela", "free",
     "Organic vegetables and seasonal fruits from farms near Sanand, delivered daily.", ("Mixed vegetable basket", 349)),
    ("Bopal Gir Gau Dairy", "product", "Dairy and milk products", "Bopal Gam", "pro",
     "A2 Gir cow milk, fresh dahi, chaas and ghee every morning.", ("A2 milk, 1 litre", 90)),
    ("Sobo Family Health Clinic", "service", "Medical and health", "Sun City, South Bopal", "premium",
     "General physician, child care, blood tests at home and ECG.", ("Doctor consultation", 400)),
    ("Ghuma Physio and Rehab", "service", "Medical and health", "Ghuma", "free",
     "Back, knee and post-surgery physiotherapy, with home visits for seniors.", ("Physio session", 500)),
    ("Little Steps Daycare", "service", "Daycare and elder care", "Applewoods, Shela", "pro",
     "Safe daycare for 1 to 6 year olds with meals, play and nap time.", ("Full-day daycare, monthly", 6500)),
    ("Bright Minds Tuition Classes", "service", "Tuition and coaching", "South Bopal", "free",
     "GSEB and CBSE maths and science coaching for classes 6 to 12.", ("Monthly tuition", 1800)),
    ("Shree Krishna Bakery", "product", "Bakery and confectionery", "Bopal Circle", "free",
     "Eggless cakes, fresh breads, khari and nankhatai baked every day.", ("Eggless cake, 500 g", 450)),
    ("Jalaram Sweets and Farsan", "product", "Sweets and namkeen", "South Bopal", "pro",
     "Fafda, jalebi, khaman, dhokla and festival sweets.", ("Fafda, 250 g", 120)),
    ("FitZone Yoga and Gym", "service", "Fitness and wellness", "Shela", "free",
     "Morning yoga, strength training and senior-friendly fitness batches.", ("Monthly membership", 1500)),
    ("Mahavir Kirana Store", "product", "Grocery and supermarkets", "South Bopal", "free",
     "Daily groceries, staples and household items with free home delivery.", ("Monthly ration pack", 2999)),
    ("Riddhi Siddhi Electricals", "product", "Paints and electrical supplies", "Bopal-Ghuma Road", "free",
     "Wires, switches, LED lights, fans and paint shades.", ("LED bulb, 9 W", 99)),
    ("Shubh Events and Decor", "service", "Weddings and events", "South Bopal", "pro",
     "Birthday, engagement and pooja decoration with catering tie-ups.", ("Birthday decoration", 4999)),
]

# More services or products per listing (name, price, extra detail)
MORE_ITEMS = {
    "Sobo Rapid Home & AC Care": [("Full home deep cleaning", 2299, ""), ("Washing machine repair", 349, "")],
    "Dr. Mehta Child & Family Clinic": [("Child vaccination", 300, ""), ("Blood test at home", 650, "")],
    "Shreeji Kathiyawadi & Jain Tiffin": [("Jain thali", 150, ""), ("Monthly lunch tiffin", 3400, "")],
    "Krishna Pure Organic A2 Milk & Dairy": [("Fresh paneer, 250 g", 120, "A2"), ("A2 ghee, 500 ml", 1100, "Gir cow")],
    "Excel CBSE & GSEB Home Tutors": [("Board exam batch, class 10", 4500, ""), ("Spoken English, 1 month", 2000, "")],
    "Dr. R. K. Patel, Senior Paediatrician": [("Vaccination visit", 300, ""), ("Newborn check-up", 700, "")],
    "Shreeji Maths & Science Academy": [("Board exam crash course", 6000, ""), ("Home tuition, per hour", 600, "")],
    "The Crust & Crumb Artisan Bakehouse": [("Custom birthday cake, 1 kg", 1200, "Eggless"), ("Focaccia", 180, "")],
    "TrustCare Domestic Services": [("Part-time maid, monthly", 3500, ""), ("Nanny, full day", 14000, "")],
    "SoBo Smashers Pickleball & Box Cricket Turf": [("Pickleball court, per hour", 600, ""), ("Night slot (floodlit)", 1000, "")],
    "Safal Parisar Sparkle Home Care": [("Sofa shampoo, 5 seats", 899, ""), ("Kitchen degreasing", 1199, "")],
    "Shivalik Appliance Clinic": [("Washing machine repair", 349, ""), ("Fridge gas refill", 1499, "")],
    "AquaPure Plumbing Services": [("Tap and mixer fitting", 199, ""), ("Water tank cleaning", 799, "")],
    "Kathiyawadi Swad Home Tiffin": [("Jain thali tiffin", 130, ""), ("Monthly tiffin, lunch", 3200, "")],
    "Shela Farm Fresh Vegetables": [("Seasonal fruit box", 499, "Organic"), ("Leafy greens bundle", 149, "Organic")],
    "Bopal Gir Gau Dairy": [("Fresh dahi, 500 g", 60, "Gir cow"), ("A2 ghee, 500 ml", 1150, "Gir cow")],
    "Sobo Family Health Clinic": [("Blood test at home", 650, ""), ("Child check-up", 500, "")],
    "Ghuma Physio and Rehab": [("Home visit physio", 800, ""), ("Back pain programme", 4500, "")],
    "Little Steps Daycare": [("Half-day daycare, monthly", 4200, ""), ("Hourly drop-in", 150, "")],
    "Bright Minds Tuition Classes": [("Class 10 board batch", 2400, ""), ("Weekend doubt classes", 900, "")],
    "Shree Krishna Bakery": [("Whole wheat bread", 55, "Fresh daily"), ("Nankhatai, 250 g", 120, "Eggless")],
    "Jalaram Sweets and Farsan": [("Khaman, 500 g", 140, "Fresh"), ("Kaju katli, 250 g", 320, "")],
    "FitZone Yoga and Gym": [("Senior yoga batch", 1200, ""), ("Personal training, 12 sessions", 6000, "")],
    "Mahavir Kirana Store": [("Sona masoori rice, 5 kg", 420, "India Gate"), ("Groundnut oil, 1 litre", 190, "Tirupati")],
    "Riddhi Siddhi Electricals": [("Ceiling fan", 1850, "Crompton"), ("Extension board", 349, "Anchor")],
    "Shubh Events and Decor": [("Pooja decoration", 2499, ""), ("Engagement stage decor", 14999, "")],
}

# For the owner account: index into LISTINGS-like specs, state
OWNER_LISTINGS = [
    ("Sobo Tailoring Studio", "service", "Clothing and fashion", "South Bopal", "pro", "live",
     "Blouse, kurti and alteration work with home pickup."),
    ("Sobo Mobile Repair Hub", "service", "Mobile phones and accessories", "Bopal", "free", "live",
     "Screen and battery replacement while you wait."),
    ("Sobo Organic Pantry", "product", "Grocery and supermarkets", "Shela", "free", "requested",
     "Cold-pressed oils, millets and organic staples."),
    ("Sobo Pet Care Corner", "product", "Pet supplies", "South Bopal", "free", "draft",
     "Pet food, grooming kits and accessories."),
]

# How many sample reviews each featured listing gets (capped by the number of sample reviewers)
REVIEW_TARGET = {
    "Sobo Rapid Home & AC Care": 12, "Dr. Mehta Child & Family Clinic": 10,
    "Shreeji Kathiyawadi & Jain Tiffin": 12, "Krishna Pure Organic A2 Milk & Dairy": 8,
    "Excel CBSE & GSEB Home Tutors": 9,
}
REVIEWER_NAMES = ["Hetal", "Rakesh", "Neha", "Jignesh", "Priya", "Amit", "Kinjal", "Bhavesh", "Riya", "Mehul", "Pooja", "Darshan"]

REVIEWS = [
    (5, "Very good service, on time and polite."),
    (5, "Highly recommended for South Bopal families."),
    (4, "Good quality. Slightly busy on weekends."),
    (5, "Trustworthy and fair prices."),
    (4, "Nice experience, will use again."),
]

OFFERS = {
    "SoBo Smashers Pickleball & Box Cricket Turf": ("Weekday morning slots at ₹500/hr", "Monday to Friday, 6 AM to 10 AM."),
    "The Crust & Crumb Artisan Bakehouse": ("Free cookie with every sourdough", "This weekend only."),
    "Safal Parisar Sparkle Home Care": ("15% off your first deep cleaning", "Valid Monday to Friday for South Bopal homes."),
    "Kathiyawadi Swad Home Tiffin": ("First week tiffin at ₹99 per meal", "For new monthly subscribers."),
    "Bopal Gir Gau Dairy": ("Free 500 ml dahi with monthly milk plan", "On new subscriptions this month."),
    "Jalaram Sweets and Farsan": ("Free jalebi with fafda above ₹300", "Every Sunday morning."),
}


def category_for(name):
    category = Category.objects.filter(slug=slugify(name)).first()
    if category is None:
        category = Category.objects.create(
            name=name, slug=slugify(name), supports_services=True, supports_products=True,
        )
    return category


class Command(BaseCommand):
    help = "Create (or remove with --remove) sample listings for the MySobo dashboards"

    def add_arguments(self, parser):
        parser.add_argument("--owner-mobile", help="10-digit mobile of the account that should own sample listings")
        parser.add_argument("--owner-email", help="Google email of the account that should own sample listings")
        parser.add_argument("--remove", action="store_true", help="Delete all sample data this command created")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["remove"]:
            businesses = Business.objects.filter(source=SOURCE)
            count = businesses.count()
            businesses.delete()
            User.objects.filter(username__startswith=REVIEWER_PREFIX).delete()
            self.stdout.write(self.style.SUCCESS(f"Removed {count} sample listings and sample reviewers."))
            return

        for plan, price in (("free", 0), ("pro", 499), ("premium", 1999)):
            PlanPrice.objects.get_or_create(plan=plan, defaults={"monthly_price": price})

        reviewers = []
        for index in range(1, len(REVIEWER_NAMES) + 1):
            user, created = User.objects.get_or_create(username=f"{REVIEWER_PREFIX}{index}")
            if created:
                user.first_name = REVIEWER_NAMES[index - 1]
                user.set_unusable_password()
                user.save()
            reviewers.append(user)

        now = timezone.now()
        for index, (name, kind, category_name, area, plan, description, item) in enumerate(LISTINGS):
            category = category_for(category_name)
            business, _ = Business.objects.update_or_create(
                slug=f"sample-{slugify(name)}",
                defaults=dict(
                    name=name, kind=kind, category=category, address=area, plan=plan,
                    description=description, source=SOURCE, hidden=False,
                    verification_level=2,
                    phone=f"0000000{index + 1:03d}", whatsapp=f"0000000{index + 1:03d}",
                ),
            )
            for dow in range(7):
                BusinessHour.objects.update_or_create(
                    business=business, dow=dow,
                    defaults=(
                        {"closed": True, "opens": None, "closes": None}
                        if dow == 6 and index % 2 else
                        {"closed": False, "opens": time(9 if dow < 6 else 10), "closes": time(20 if dow < 6 else 14)}
                    ),
                )
            Business.objects.filter(pk=business.pk).update(created_at=now - timedelta(days=index * 2))
            items = [(item[0], item[1], "")] + MORE_ITEMS.get(name, [])
            for item_name, price, detail in items:
                if kind == "product":
                    BusinessProduct.objects.update_or_create(
                        business=business, name=item_name,
                        defaults={"category": category, "price": Decimal(price), "brand": detail},
                    )
                else:
                    BusinessService.objects.update_or_create(
                        business=business, name=item_name,
                        defaults={"category": category, "price_min": Decimal(price), "service_area": area, "description": detail},
                    )
            for offset in range(min(REVIEW_TARGET.get(name, 3 + index % 3), len(reviewers))):
                rating, body = REVIEWS[(index + offset) % len(REVIEWS)]
                Review.objects.update_or_create(
                    business=business, user=reviewers[offset % len(reviewers)],
                    defaults={"rating": rating, "body": body},
                )
            if name in OFFERS:
                title, body = OFFERS[name]
                BusinessPost.objects.update_or_create(
                    business=business, title=title,
                    defaults={"body": body, "status": BusinessPost.Status.APPROVED},
                )

        owned = 0
        owner = None
        if options["owner_email"]:
            email = options["owner_email"].strip().lower()
            if "@" not in email:
                raise CommandError("Give a valid email address.")
            owner = User.objects.filter(email__iexact=email).order_by("date_joined").first()
            if owner is None:
                owner = User.objects.create_user(username=f"google-sample-{slugify(email)}"[:150], email=email)
                owner.set_unusable_password()
                owner.save()
            tag = slugify(email.split("@")[0])[-12:]
            label = email
        elif options["owner_mobile"]:
            mobile = "".join(ch for ch in options["owner_mobile"] if ch.isdigit())[-10:]
            if len(mobile) != 10:
                raise CommandError("Give a 10-digit mobile number.")
            owner = User.objects.filter(mobile=mobile).first()
            if owner is None:
                owner = User.objects.create_user(username=f"resident-{mobile}-sample", mobile=mobile)
                owner.set_unusable_password()
                owner.save()
            tag = mobile[-4:]
            label = mobile
        if owner is not None:
            for name, kind, category_name, area, plan, state, description in OWNER_LISTINGS:
                category = category_for(category_name)
                business, _ = Business.objects.update_or_create(
                    slug=f"sample-owner-{slugify(name)}-{tag}",
                    defaults=dict(
                        name=name, kind=kind, category=category, address=area, plan=plan,
                        description=description, source=SOURCE,
                        phone="0000000900", whatsapp="0000000900",
                        hidden=state != "live",
                        verification_level=2 if state == "live" else 0,
                        approval_requested_at=now - timedelta(hours=5) if state == "requested" else None,
                    ),
                )
                BusinessMember.objects.get_or_create(
                    user=owner, business=business, defaults={"role": BusinessMember.Role.OWNER},
                )
                owned += 1
                if state == "live":
                    for offset in range(4):
                        rating, body = REVIEWS[offset]
                        Review.objects.update_or_create(
                            business=business, user=reviewers[offset],
                            defaults={"rating": rating, "body": body},
                        )
            tailor = Business.objects.get(slug=f"sample-owner-{slugify(OWNER_LISTINGS[0][0])}-{tag}")
            BusinessPost.objects.update_or_create(
                business=tailor, title="Free alteration on your first stitching order",
                defaults={"body": "For orders above ₹800 this month.", "status": BusinessPost.Status.APPROVED},
            )
            mobile_hub = Business.objects.get(slug=f"sample-owner-{slugify(OWNER_LISTINGS[1][0])}-{tag}")
            BusinessPost.objects.update_or_create(
                business=mobile_hub, title="Free screen guard with every repair",
                defaults={"body": "Till the end of the month.", "status": BusinessPost.Status.PENDING},
            )
            SubscriptionRequest.objects.get_or_create(
                business=mobile_hub, requested_plan="pro", status=SubscriptionRequest.Status.PENDING,
                defaults={"requested_by": owner},
            )

        self.stdout.write(self.style.SUCCESS(
            f"Sample data ready: {len(LISTINGS)} public listings"
            + (f", {owned} listings owned by {label}" if owned else "")
            + ". Remove before launch with --remove."
        ))

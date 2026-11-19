from django.core.management.base import BaseCommand
from django.utils.text import slugify

from billing.models import AppSetting, PlanPrice
from directory.models import Category, Subcategory


class Command(BaseCommand):
    help = "Seed MySobo launch categories and default settings"

    def handle(self, *args, **options):
        categories = [
            ("Medical and health", True, True),
            ("Tuition and coaching", True, False),
            ("House help", True, False),
            ("Schools", True, False),
            ("Academies", True, False),
            ("Daycare and elder care", True, False),
            ("Home services", True, False),
            ("Shopping and daily needs", False, True),
            ("Food and dining", True, True),
            ("Property", True, True),
            ("Used cars and vehicles", False, True),
            ("Weddings and events", True, False),
            ("Transport and travel", True, False),
            ("Jobs and coworking", True, False),
            ("Professional services", True, False),
            ("Fitness and wellness", True, False),
            ("Civic essentials", True, False),
            ("Influencers and creators", True, False),
            ("Grocery and supermarkets", False, True),
            ("Dairy and milk products", False, True),
            ("Fruits and vegetables", False, True),
            ("Bakery and confectionery", False, True),
            ("Sweets and namkeen", False, True),
            ("Clothing and fashion", False, True),
            ("Footwear", False, True),
            ("Jewellery and accessories", False, True),
            ("Cosmetics and beauty products", False, True),
            ("Electronics and home appliances", False, True),
            ("Mobile phones and accessories", False, True),
            ("Computers and IT accessories", False, True),
            ("Furniture and home decor", False, True),
            ("Kitchenware and household items", False, True),
            ("Hardware and building materials", False, True),
            ("Paints and electrical supplies", False, True),
            ("Plumbing and sanitary products", False, True),
            ("Stationery and books", False, True),
            ("Toys and baby products", False, True),
            ("Sports and fitness equipment", False, True),
            ("Medical stores and healthcare products", False, True),
            ("Pet supplies", False, True),
            ("Automobile parts and accessories", False, True),
            ("Tyres and batteries", False, True),
            ("Gifts and handicrafts", False, True),
            ("Flowers and plants", False, True),
            ("Agricultural supplies", False, True),
            ("Packaging materials", False, True),
            ("Optical shops and eyewear", False, True),
            ("Watches and clocks", False, True),
            ("Bags and luggage", False, True),
            ("Home furnishing and textiles", False, True),
            ("Water purifiers and accessories", False, True),
            ("Cleaning and hygiene products", False, True),
            ("Industrial and safety products", False, True),
        ]
        for priority, (name, supports_services, supports_products) in enumerate(categories, start=1):
            category, _ = Category.objects.update_or_create(
                slug=slugify(name),
                defaults={
                    "name": name,
                    "priority": priority,
                    "supports_services": supports_services,
                    "supports_products": supports_products,
                },
            )
            if not category.description:
                category.description = f"Browse local {name.lower()} and find nearby options in South Bopal."
                category.save(update_fields=("description",))
        subcategories = {
            "Medical and health": [
                ("General physicians", True, False), ("Paediatricians", True, False),
                ("Gynaecologists", True, False), ("Dentists", True, False),
                ("Dermatologists", True, False), ("ENT specialists", True, False),
                ("Orthopaedic specialists", True, False), ("Eye specialists", True, False),
                ("Clinics", True, False), ("Diagnostic laboratories", True, False),
                ("Pharmacies", False, True), ("Physiotherapy", True, False),
                ("Home nursing", True, False),
            ],
            "Tuition and coaching": [
                ("Home tutors", True, False), ("Coaching classes", True, False),
                ("Subject-based tuition", True, False), ("School tuition", True, False),
                ("College tuition", True, False),
                ("Competitive examination coaching", True, False),
                ("Music and skill classes", True, False),
            ],
            "House help": [
                ("Agencies", True, False), ("Maids", True, False), ("Cooks", True, False),
                ("Nannies", True, False), ("Elder care attendants", True, False),
                ("Drivers", True, False),
            ],
            "Schools": [
                ("Preschool", True, False), ("Primary school", True, False),
                ("Secondary school", True, False), ("Higher secondary school", True, False),
            ],
            "Academies": [
                ("Dance", True, False), ("Music", True, False), ("Art", True, False),
                ("Sports", True, False), ("Martial arts", True, False),
                ("Swimming", True, False), ("Languages", True, False),
            ],
            "Daycare and elder care": [
                ("Daycare", True, False), ("Creche", True, False),
                ("After-school care", True, False), ("Elder care", True, False),
                ("Senior citizen care", True, False),
            ],
            "Home services": [
                ("Plumber", True, False), ("Electrician", True, False),
                ("Carpenter", True, False), ("AC repair", True, False),
                ("Pest control", True, False), ("Cleaning", True, False),
                ("Painting", True, False), ("Appliance repair", True, False),
                ("RO service", True, False),
            ],
            "Shopping and daily needs": [
                ("Grocery", False, True), ("Dairy", False, True),
                ("Vegetables", False, True), ("Stationery", False, True),
                ("Electronics", False, True), ("Clothing", False, True),
                ("Hardware", False, True), ("Gifts", False, True),
                ("Other shops", False, True),
            ],
            "Food and dining": [
                ("Restaurants", True, False), ("Cafes", True, False),
                ("Bakers", True, True), ("Tiffin services", True, False),
                ("Home kitchens", True, False), ("Caterers", True, False),
                ("Sweet shops", True, True), ("Street food", True, True),
            ],
            "Property": [
                ("Rent", False, True), ("Resale", False, True),
                ("Builders", True, False), ("Brokers", True, False),
                ("PG and hostels", False, True), ("Commercial property", False, True),
            ],
            "Used cars and vehicles": [
                ("Cars", False, True), ("Two-wheelers", False, True),
                ("Dealers", False, True), ("Individual sellers", False, True),
            ],
            "Weddings and events": [
                ("Halls", True, False), ("Event planners", True, False),
                ("Photographers", True, False), ("Decorators", True, False),
                ("Makeup artists", True, False), ("DJs", True, False),
                ("Caterers", True, False),
            ],
            "Transport and travel": [
                ("Cabs", True, False), ("Tempo and movers", True, False),
                ("Travel agents", True, False), ("School vans", True, False),
            ],
            "Jobs and coworking": [
                ("Job posts", True, False), ("Coworking spaces", True, False),
                ("Part-time work", True, False),
            ],
            "Professional services": [
                ("Chartered accountants", True, False), ("Lawyers", True, False),
                ("Architects", True, False), ("Interior designers", True, False),
                ("Consultants", True, False), ("Insurance services", True, False),
                ("Tax filers", True, False),
            ],
            "Fitness and wellness": [
                ("Gyms", True, False), ("Yoga", True, False),
                ("Fitness trainers", True, False), ("Salons", True, False),
                ("Spas", True, False), ("Nutrition services", True, False),
            ],
            "Civic essentials": [
                ("Hospitals and emergency numbers", True, False),
                ("Police", True, False), ("Ward office", True, False),
                ("Water complaints", True, False),
                ("Electricity complaints", True, False),
                ("Society offices", True, False),
            ],
            "Influencers and creators": [
                ("Photographers", True, False), ("Video makers", True, False),
                ("Bloggers", True, False), ("Reels creators", True, False),
                ("Models", True, False),
            ],
        }
        product_subcategories = {
            "Grocery and supermarkets": [
                "Rice and grains", "Pulses", "Cooking oils", "Spices",
                "Packaged foods", "Snacks", "Beverages", "Household essentials",
            ],
            "Dairy and milk products": [
                "Fresh milk", "Curd and yoghurt", "Paneer", "Butter and ghee",
                "Cheese", "Ice cream", "Milk powder", "Dairy alternatives",
            ],
            "Fruits and vegetables": [
                "Fresh fruits", "Seasonal fruits", "Leafy vegetables",
                "Root vegetables", "Exotic produce", "Organic produce",
                "Cut fruits and vegetables",
            ],
            "Bakery and confectionery": [
                "Bread and buns", "Cakes", "Pastries", "Cookies and biscuits",
                "Rusk and toast", "Chocolates", "Dessert supplies",
            ],
            "Sweets and namkeen": [
                "Indian sweets", "Dry fruit sweets", "Namkeen", "Farsan",
                "Chivda", "Chips and savoury snacks", "Festival assortments",
            ],
            "Clothing and fashion": [
                "Men's clothing", "Women's clothing", "Kids' clothing",
                "Ethnic wear", "Western wear", "Sportswear", "Uniforms",
                "Fabric and tailoring materials",
            ],
            "Footwear": [
                "Men's footwear", "Women's footwear", "Kids' footwear",
                "School shoes", "Sports shoes", "Sandals and slippers",
                "Safety footwear",
            ],
            "Jewellery and accessories": [
                "Gold jewellery", "Silver jewellery", "Imitation jewellery",
                "Fashion accessories", "Hair accessories", "Belts and wallets",
            ],
            "Cosmetics and beauty products": [
                "Skincare", "Makeup", "Hair care", "Fragrances",
                "Personal grooming", "Beauty tools", "Natural cosmetics",
            ],
            "Electronics and home appliances": [
                "Refrigerators", "Washing machines", "Air conditioners",
                "Televisions", "Microwaves", "Fans", "Water heaters",
                "Small kitchen appliances", "Mobile phones and accessories",
            ],
            "Mobile phones and accessories": [
                "Smartphones", "Feature phones", "Phone cases and covers",
                "Chargers and cables", "Power banks", "Screen protectors",
                "Headphones and earbuds",
            ],
            "Computers and IT accessories": [
                "Laptops", "Desktop computers", "Monitors", "Keyboards and mice",
                "Printers and scanners", "Storage devices", "Networking equipment",
                "Computer components",
            ],
            "Furniture and home decor": [
                "Living room furniture", "Bedroom furniture", "Dining furniture",
                "Office furniture", "Mattresses", "Lighting", "Wall decor",
                "Home accessories",
            ],
            "Kitchenware and household items": [
                "Cookware", "Dinnerware", "Kitchen tools", "Storage containers",
                "Household plastics", "Home organisation", "Tableware",
            ],
            "Hardware and building materials": [
                "Cement", "Steel", "Pipes", "Electrical hardware", "Tools",
                "Fasteners", "Bricks and blocks", "Roofing materials",
            ],
            "Paints and electrical supplies": [
                "Interior paints", "Exterior paints", "Primers and putty",
                "Wires and cables", "Switches and sockets", "Lighting supplies",
                "Electrical fittings",
            ],
            "Plumbing and sanitary products": [
                "Bathroom fittings", "Sanitaryware", "Water pipes and fittings",
                "Taps and showers", "Water tanks", "Drainage products",
                "Plumbing tools",
            ],
            "Stationery and books": [
                "School stationery", "Office stationery", "Notebooks and paper",
                "Textbooks", "Children's books", "Reference books",
                "Art and craft supplies",
            ],
            "Toys and baby products": [
                "Educational toys", "Baby toys", "Building toys", "Board games",
                "Baby clothing", "Feeding products", "Baby care products",
                "Strollers and carriers",
            ],
            "Sports and fitness equipment": [
                "Exercise equipment", "Yoga accessories", "Cricket equipment",
                "Football equipment", "Badminton equipment", "Cycling accessories",
                "Outdoor sports gear",
            ],
            "Medical stores and healthcare products": [
                "Prescription medicines", "Over-the-counter medicines",
                "First aid supplies", "Medical devices", "Mobility aids",
                "Health and wellness products", "Surgical supplies",
            ],
            "Pet supplies": [
                "Dog food and supplies", "Cat food and supplies", "Bird supplies",
                "Aquarium supplies", "Pet grooming products", "Pet toys",
                "Pet accessories",
            ],
            "Automobile parts and accessories": [
                "Car parts", "Two-wheeler parts", "Car accessories",
                "Two-wheeler accessories", "Lubricants and oils",
                "Vehicle lighting", "Car care products",
            ],
            "Tyres and batteries": [
                "Car tyres", "Two-wheeler tyres", "Commercial vehicle tyres",
                "Car batteries", "Inverter batteries", "Battery accessories",
                "Tyre tubes and repair kits",
            ],
            "Gifts and handicrafts": [
                "Gift hampers", "Handmade crafts", "Home crafts",
                "Personalised gifts", "Festive gifts", "Souvenirs",
                "Greeting cards and wrapping",
            ],
            "Flowers and plants": [
                "Fresh flowers", "Bouquets", "Indoor plants", "Outdoor plants",
                "Seeds and bulbs", "Pots and planters", "Gardening supplies",
            ],
            "Agricultural supplies": [
                "Seeds", "Fertilisers", "Crop protection", "Animal feed",
                "Farm tools", "Irrigation supplies", "Agricultural equipment",
            ],
            "Packaging materials": [
                "Corrugated boxes", "Cartons", "Plastic packaging",
                "Paper bags and packaging", "Protective packaging",
                "Food packaging", "Labels and tapes",
            ],
            "Optical shops and eyewear": [
                "Prescription eyeglasses", "Sunglasses", "Contact lenses",
                "Reading glasses", "Eyewear frames", "Lens care products",
            ],
            "Watches and clocks": [
                "Wrist watches", "Smart watches", "Wall clocks",
                "Table clocks", "Watch straps", "Watch batteries",
            ],
            "Bags and luggage": [
                "School bags", "Backpacks", "Handbags", "Travel luggage",
                "Laptop bags", "Wallets and purses", "Travel accessories",
            ],
            "Home furnishing and textiles": [
                "Bed sheets", "Curtains and blinds", "Towels",
                "Cushion covers", "Carpets and rugs", "Blankets and quilts",
                "Upholstery fabrics",
            ],
            "Water purifiers and accessories": [
                "RO water purifiers", "UV water purifiers",
                "Water purifier filters", "Replacement cartridges",
                "Water dispensers", "Purifier spare parts",
            ],
            "Cleaning and hygiene products": [
                "Household cleaners", "Laundry products", "Dishwashing products",
                "Disinfectants", "Paper hygiene products", "Personal hygiene",
                "Cleaning tools",
            ],
            "Industrial and safety products": [
                "Personal protective equipment", "Workwear", "Safety footwear",
                "Fire safety equipment", "Industrial tools", "Warning signs",
                "Safety and testing equipment",
            ],
        }
        for category_name, names in product_subcategories.items():
            subcategories[category_name] = [(name, False, True) for name in names]
        for category_name, entries in subcategories.items():
            category = Category.objects.get(slug=slugify(category_name))
            for priority, (name, supports_services, supports_products) in enumerate(entries, start=1):
                subcategory, _ = Subcategory.objects.update_or_create(
                    category=category,
                    slug=slugify(name),
                    defaults={
                        "name": name,
                        "approved": True,
                        "supports_services": supports_services,
                        "supports_products": supports_products,
                        "priority": priority,
                    },
                )
                if not subcategory.description:
                    subcategory.description = f"Find local {name.lower()} in South Bopal."
                    subcategory.save(update_fields=("description",))
        electronics = Category.objects.get(slug=slugify("Electronics and home appliances"))
        mobile_phones = Subcategory.objects.get(
            category=electronics, slug=slugify("Mobile phones and accessories")
        )
        for priority, name in enumerate(
            ("Smartphones", "Feature phones", "Phone cases and covers",
             "Chargers and cables", "Power banks", "Screen protectors",
             "Headphones and earbuds"),
            start=1,
        ):
            nested_subcategory, _ = Subcategory.objects.update_or_create(
                category=electronics,
                slug=f"mobile-{slugify(name)}",
                defaults={
                    "parent": mobile_phones,
                    "name": name,
                    "approved": True,
                    "supports_services": False,
                    "supports_products": True,
                    "priority": priority,
                },
            )
            if not nested_subcategory.description:
                nested_subcategory.description = f"Browse local {name.lower()} in South Bopal."
                nested_subcategory.save(update_fields=("description",))
        PlanPrice.objects.update_or_create(plan="pro", defaults={"monthly_price": 499, "active": True})
        PlanPrice.objects.update_or_create(plan="premium", defaults={"monthly_price": 1999, "active": True})
        PlanPrice.objects.update_or_create(plan="free", defaults={"monthly_price": 0, "active": True})
        AppSetting.objects.update_or_create(key="grace_days", defaults={"value": {"days": 7}})
        AppSetting.objects.update_or_create(key="free_pro_cap", defaults={"value": {"count": 100}})
        AppSetting.objects.update_or_create(key="claim_sla_hours", defaults={"value": {"hours": 48}})
        self.stdout.write(self.style.SUCCESS("Seeded MySobo launch data"))

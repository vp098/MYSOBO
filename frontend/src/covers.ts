import type { Business } from "./services/api";

/* Category illustrations in public/covers, used when a listing has no cover photo. */
const RULES: [RegExp, string][] = [
  [/mobile|computer/, "mobile"],
  [/home-services|house-help|property/, "home"],
  [/bakery|sweets/, "bakery"],
  [/food|dining|tiffin/, "food"],
  [/medical|health|pharma/, "health"],
  [/dairy|milk/, "dairy"],
  [/grocery|fruits|vegetables|daily-needs|kitchenware|supermarket/, "grocery"],
  [/tuition|school|academ|stationery|book|coaching/, "education"],
  [/fitness|sports|wellness|yoga|gym/, "fitness"],
  [/wedding|event/, "events"],
  [/daycare|toys|baby|kids/, "kids"],
  [/electr|paint|hardware|plumbing|building/, "electric"],
  [/pet/, "pets"],
  [/cloth|fashion|footwear|jewel|cosmetic|tailor/, "clothing"],
];

export function coverFor(business: Pick<Business, "cover_image" | "category" | "name">) {
  if (business.cover_image) return business.cover_image;
  const key = `${business.category?.slug ?? ""} ${business.name}`.toLowerCase();
  const match = RULES.find(([pattern]) => pattern.test(key));
  return `/covers/${match ? match[1] : "shop"}.svg`;
}

export function coverForCategory(slug: string, name = "") {
  const key = `${slug} ${name}`.toLowerCase();
  const match = RULES.find(([pattern]) => pattern.test(key));
  return `/covers/${match ? match[1] : "shop"}.svg`;
}

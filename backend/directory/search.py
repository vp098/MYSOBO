"""Search for listings: one meaningful word is enough.

How it works:
1. The query is lower-cased and split into words. Very short words and
   filler words are dropped, simple plurals are reduced ("salons" -> "salon").
2. Each word is widened with a few everyday synonyms ("doctor" also looks for
   clinic / medical, "restaurant" for food / cafe / dining).
3. A listing matches when every word (or one of its synonyms) appears in its
   name, category, subcategory, products, services, description or area.
   If nothing matches all words, listings matching any word are returned.
4. Results are ranked: name starts with the word > name contains it >
   category or subcategory > product or service > description > area.
5. No match at all? Each word is compared with the words that really exist
   in listing names and categories (difflib), so "electrican" or "resturant"
   still finds electricians and restaurants.
"""
import difflib
import re

from django.core.cache import cache
from django.db.models import Case, Exists, IntegerField, OuterRef, Q, Value, When

from .models import Business, BusinessProduct, BusinessService, Category, Subcategory

STOP_WORDS = {"the", "and", "for", "near", "me", "in", "at", "of", "a", "an", "shop", "store", "best", "good", "south", "bopal"}
SYNONYMS = {
    "doctor": ["clinic", "medical", "physician", "hospital"],
    "dr": ["clinic", "medical", "doctor"],
    "clinic": ["doctor", "medical"],
    "dentist": ["dental", "clinic"],
    "salon": ["beauty", "parlour", "hair"],
    "parlour": ["salon", "beauty"],
    "parlor": ["salon", "beauty"],
    "barber": ["salon", "hair"],
    "grocery": ["kirana", "supermarket", "provision"],
    "kirana": ["grocery"],
    "electrician": ["electrical", "electric", "wiring"],
    "electric": ["electrician", "electrical"],
    "plumber": ["plumbing", "sanitary"],
    "restaurant": ["food", "dining", "cafe"],
    "food": ["restaurant", "dining", "tiffin"],
    "cafe": ["coffee", "restaurant"],
    "tuition": ["tutor", "coaching", "classes"],
    "tutor": ["tuition", "coaching"],
    "gym": ["fitness"],
    "medicine": ["pharmacy", "chemist", "medical"],
    "chemist": ["pharmacy", "medical"],
    "ac": ["air conditioner", "appliance"],
    "tailor": ["stitching", "alteration", "boutique"],
}
MIN_WORD = 2


def _stem(word):
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("es") and word[-3] in "sxz":
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def words_of(query):
    raw = re.findall(r"[\w']+", (query or "").lower())
    words = []
    for word in raw:
        word = _stem(word.strip("'"))
        if len(word) >= MIN_WORD and word not in STOP_WORDS and word not in words:
            words.append(word)
    return words[:6]


def _variants(word):
    return [word, *SYNONYMS.get(word, [])]


def _field_match(term):
    products = BusinessProduct.objects.filter(business_id=OuterRef("pk"), active=True, available=True).filter(
        Q(name__icontains=term) | Q(brand__icontains=term) | Q(category__name__icontains=term) | Q(subcategory__name__icontains=term)
    )
    services = BusinessService.objects.filter(business_id=OuterRef("pk"), active=True, available=True).filter(
        Q(name__icontains=term) | Q(category__name__icontains=term) | Q(subcategory__name__icontains=term)
    )
    return products, services


def _word_q(word):
    """Q for one word and its synonyms, plus a rank expression."""
    match = Q()
    rank_whens = []
    for index, term in enumerate(_variants(word)):
        weight = 1.0 if index == 0 else 0.6  # the typed word counts more than a synonym
        products, services = _field_match(term)
        match |= (
            Q(name__icontains=term) | Q(category__name__icontains=term) | Q(subcategory__name__icontains=term)
            | Q(description__icontains=term) | Q(address__icontains=term) | Q(society__name__icontains=term)
            | Exists(products) | Exists(services)
        )
        rank_whens += [
            When(name__istartswith=term, then=Value(int(100 * weight))),
            When(name__icontains=term, then=Value(int(60 * weight))),
            When(Q(category__name__icontains=term) | Q(subcategory__name__icontains=term), then=Value(int(50 * weight))),
            When(Exists(products) | Exists(services), then=Value(int(40 * weight))),
            When(description__icontains=term, then=Value(int(20 * weight))),
            When(Q(address__icontains=term) | Q(society__name__icontains=term), then=Value(int(10 * weight))),
        ]
    return match, Case(*rank_whens, default=Value(0), output_field=IntegerField())


def vocabulary():
    """Real words from listing names, categories, products and services (cached for 10 minutes)."""
    words = cache.get("search-vocabulary")
    if words is None:
        texts = list(Category.objects.values_list("name", flat=True)) + list(Subcategory.objects.values_list("name", flat=True))
        texts += list(Business.objects.filter(hidden=False, deleted_at__isnull=True).values_list("name", flat=True)[:5000])
        texts += list(BusinessService.objects.filter(active=True).values_list("name", flat=True)[:5000])
        texts += list(BusinessProduct.objects.filter(active=True).values_list("name", flat=True)[:5000])
        words = sorted({_stem(word) for text in texts for word in re.findall(r"[a-z]+", text.lower()) if len(word) >= 3})
        words += [word for word in SYNONYMS if word not in words]
        cache.set("search-vocabulary", words, 600)
    return words


def corrected(words):
    vocab = vocabulary()
    fixed = []
    for word in words:
        close = difflib.get_close_matches(word, vocab, n=1, cutoff=0.75)
        fixed.append(close[0] if close else word)
    return fixed


def apply_search(queryset, query, extra_match=None):
    """Filter and rank a Business queryset. Returns (queryset, words used, corrected?)."""
    words = words_of(query)
    if not words:
        return queryset, [], False

    def run(terms, require_all):
        parts = [_word_q(word) for word in terms]
        combined = Q()
        for match, _ in parts:
            combined = (combined & match) if require_all else (combined | match)
        if extra_match is not None:
            combined |= extra_match
        ranked = queryset.filter(combined)
        score = parts[0][1]
        for _, rank in parts[1:]:
            score = score + rank
        return ranked.annotate(_search_rank=score)

    result = run(words, True)
    if len(words) > 1 and not result.exists():
        result = run(words, False)
    used, was_corrected = words, False
    if not result.exists():
        fixed = corrected(words)
        if fixed != words:
            used, was_corrected = fixed, True
            result = run(fixed, True)
            if len(fixed) > 1 and not result.exists():
                result = run(fixed, False)
    return result.order_by("-_search_rank", "-verification_level", "name").distinct(), used, was_corrected

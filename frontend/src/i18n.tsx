import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/*
 * MySobo translations. Gujarati is the default language.
 * Each entry is [English, Gujarati, Hindi]. Use {name}-style placeholders
 * for values filled in at runtime: t("listings.count", { n: 4 }).
 */
export type Lang = "gu" | "en" | "hi";

export const LANGUAGES: { code: Lang; short: string; label: string }[] = [
  { code: "gu", short: "ગુ", label: "ગુજરાતી" },
  { code: "en", short: "EN", label: "English" },
  { code: "hi", short: "हि", label: "हिंदी" },
];

const DEFAULT_LANG: Lang = "gu";
const STORAGE_KEY = "mysobo-lang";

const messages = {
  // Top bar and shared
  "nav.residents": ["Residents", "રહેવાસીઓ", "निवासी"],
  "nav.business": ["For businesses", "વ્યવસાય માટે", "व्यवसाय के लिए"],
  "nav.superadmin": ["Super admin", "સુપર એડમિન", "सुपर एडमिन"],
  "nav.login": ["Log in", "લૉગ ઇન", "लॉग इन"],
  "nav.logout": ["Log out", "લૉગ આઉટ", "लॉग आउट"],
  "nav.home": ["MySobo home", "MySobo હોમ", "MySobo होम"],
  "lang.label": ["Language", "ભાષા", "भाषा"],
  "close": ["Close", "બંધ કરો", "बंद करें"],
  "verified": ["Verified", "ચકાસાયેલ", "सत्यापित"],
  "tryAgain": ["Try again", "ફરી પ્રયાસ કરો", "फिर कोशिश करें"],
  "retry": ["Retry", "ફરી પ્રયાસ", "फिर कोशिश"],
  "any": ["Any", "કોઈપણ", "कोई भी"],
  "yes": ["Yes", "હા", "हाँ"],
  "no": ["No", "ના", "नहीं"],
  "kind.service": ["Service", "સેવા", "सेवा"],
  "kind.product": ["Product", "ઉત્પાદન", "उत्पाद"],
  "kind.both": ["Both", "બંને", "दोनों"],
  "listings.count": ["{n} listings", "{n} લિસ્ટિંગ", "{n} लिस्टिंग"],
  "err.logout": ["Could not log out.", "લૉગ આઉટ થઈ શક્યું નહીં.", "लॉग आउट नहीं हो सका।"],
  "err.request": ["The request failed.", "વિનંતી નિષ્ફળ ગઈ.", "अनुरोध विफल रहा।"],
  "err.checkApi": ["Check the connection and try again.", "કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.", "कनेक्शन जाँचें और फिर कोशिश करें।"],

  // Login
  "login.eyebrow": ["Residents and business owners", "રહેવાસીઓ અને વ્યવસાય માલિકો", "निवासी और व्यवसाय मालिक"],
  "login.title": ["Log in to MySobo", "MySobo માં લૉગ ઇન કરો", "MySobo में लॉग इन करें"],
  "login.intro": ["Sign in with a one-time code sent to your mobile number.", "તમારા મોબાઇલ નંબર પર મોકલેલા એક વખતના કોડથી સાઇન ઇન કરો.", "अपने मोबाइल नंबर पर भेजे गए वन-टाइम कोड से साइन इन करें।"],
  "login.enterCode": ["Enter the 6-digit code sent to {mobile}.", "{mobile} પર મોકલેલો 6 અંકનો કોડ દાખલ કરો.", "{mobile} पर भेजा गया 6 अंकों का कोड दर्ज करें।"],
  "login.code": ["Verification code", "ચકાસણી કોડ", "सत्यापन कोड"],
  "login.verifying": ["Verifying…", "ચકાસી રહ્યા છીએ…", "सत्यापित कर रहे हैं…"],
  "login.verify": ["Verify and sign in", "ચકાસો અને સાઇન ઇન કરો", "सत्यापित करें और साइन इन करें"],
  "login.changeNumber": ["Change number", "નંબર બદલો", "नंबर बदलें"],
  "login.resendIn": ["Resend in {s}s", "{s} સેકન્ડમાં ફરી મોકલો", "{s} सेकंड में फिर भेजें"],
  "login.resend": ["Resend code", "કોડ ફરી મોકલો", "कोड फिर भेजें"],
  "login.mobile": ["Mobile number", "મોબાઇલ નંબર", "मोबाइल नंबर"],
  "login.mobilePh": ["10-digit mobile number", "10 અંકનો મોબાઇલ નંબર", "10 अंकों का मोबाइल नंबर"],
  "login.consent": ["I agree to MySobo's terms and privacy policy.", "હું MySobo ની શરતો અને ગોપનીયતા નીતિ સાથે સંમત છું.", "मैं MySobo की शर्तों और गोपनीयता नीति से सहमत हूँ।"],
  "login.sending": ["Sending code…", "કોડ મોકલી રહ્યા છીએ…", "कोड भेज रहे हैं…"],
  "login.send": ["Send verification code", "ચકાસણી કોડ મોકલો", "सत्यापन कोड भेजें"],
  "login.username": ["Username", "યુઝરનેમ", "यूज़रनेम"],
  "login.password": ["Password", "પાસવર્ડ", "पासवर्ड"],
  "login.signingIn": ["Signing in…", "સાઇન ઇન થઈ રહ્યું છે…", "साइन इन हो रहा है…"],
  "login.withPassword": ["Sign in with password", "પાસવર્ડથી સાઇન ઇન કરો", "पासवर्ड से साइन इन करें"],
  "login.usePassword": ["Use username and password instead", "તેના બદલે યુઝરનેમ અને પાસવર્ડ વાપરો", "इसके बजाय यूज़रनेम और पासवर्ड इस्तेमाल करें"],
  "login.useOtp": ["Use a one-time code instead", "તેના બદલે એક વખતનો કોડ વાપરો", "इसके बजाय वन-टाइम कोड इस्तेमाल करें"],
  "err.sendCode": ["Could not send a verification code.", "ચકાસણી કોડ મોકલી શકાયો નહીં.", "सत्यापन कोड नहीं भेजा जा सका।"],
  "err.verify": ["Could not verify this code.", "આ કોડ ચકાસી શકાયો નહીં.", "यह कोड सत्यापित नहीं हो सका।"],
  "err.login": ["Unable to log in.", "લૉગ ઇન થઈ શક્યું નહીં.", "लॉग इन नहीं हो सका।"],

  // Search and cards
  "search.placeholder": ["Search by service, business or area", "સેવા, વ્યવસાય અથવા વિસ્તાર શોધો", "सेवा, व्यवसाय या इलाका खोजें"],
  "search.label": ["Search MySobo", "MySobo માં શોધો", "MySobo में खोजें"],
  "search.button": ["Search", "શોધો", "खोजें"],
  "cards.noneTitle": ["No listings found", "કોઈ લિસ્ટિંગ મળ્યું નથી", "कोई लिस्टिंग नहीं मिली"],
  "cards.noneText": ["Try a different search or category.", "બીજી શોધ અથવા કેટેગરી અજમાવો.", "कोई दूसरी खोज या श्रेणी आज़माएँ।"],
  "cards.open": ["Open {name} listing", "{name} લિસ્ટિંગ ખોલો", "{name} लिस्टिंग खोलें"],
  "cards.inSouthBopal": ["{kind} in South Bopal", "સાઉથ બોપલમાં {kind}", "साउथ बोपल में {kind}"],
  "cards.localService": ["Local service", "સ્થાનિક સેવા", "स्थानीय सेवा"],
  "cards.from": ["From ₹{price}", "₹{price} થી શરૂ", "₹{price} से शुरू"],

  // Listing dialog
  "listing.dialog": ["Business details", "વ્યવસાયની વિગતો", "व्यवसाय का विवरण"],
  "listing.loading": ["Loading business…", "વ્યવસાય લોડ થઈ રહ્યો છે…", "व्यवसाय लोड हो रहा है…"],
  "listing.defaultCategory": ["South Bopal business", "સાઉથ બોપલનો વ્યવસાય", "साउथ बोपल का व्यवसाय"],
  "listing.defaultDesc": ["Trusted local listing in South Bopal.", "સાઉથ બોપલમાં વિશ્વસનીય સ્થાનિક લિસ્ટિંગ.", "साउथ बोपल में भरोसेमंद स्थानीय लिस्टिंग।"],
  "listing.call": ["Call", "કૉલ કરો", "कॉल करें"],
  "listing.callName": ["Call {name}", "{name} ને કૉલ કરો", "{name} को कॉल करें"],
  "listing.whatsapp": ["WhatsApp", "વોટ્સએપ", "व्हाट्सऐप"],
  "listing.whatsappName": ["WhatsApp {name}", "{name} ને વોટ્સએપ કરો", "{name} को व्हाट्सऐप करें"],
  "listing.save": ["Save", "સેવ કરો", "सेव करें"],
  "listing.saved": ["Saved", "સેવ કરેલું", "सेव किया"],
  "listing.phone": ["Phone", "ફોન", "फ़ोन"],
  "listing.email": ["Email", "ઇમેઇલ", "ईमेल"],
  "listing.website": ["Website", "વેબસાઇટ", "वेबसाइट"],
  "listing.reviews": ["Resident reviews", "રહેવાસીઓના રિવ્યૂ", "निवासियों की समीक्षाएँ"],
  "listing.noReviews": ["No reviews yet. Share the first one.", "હજી કોઈ રિવ્યૂ નથી. પહેલો રિવ્યૂ આપો.", "अभी कोई समीक्षा नहीं। पहली समीक्षा लिखें।"],
  "listing.rating": ["Rating", "રેટિંગ", "रेटिंग"],
  "listing.stars": ["{n} stars", "{n} સ્ટાર", "{n} स्टार"],
  "listing.yourReview": ["Your review", "તમારો રિવ્યૂ", "आपकी समीक्षा"],
  "listing.reviewPh": ["How was your experience?", "તમારો અનુભવ કેવો રહ્યો?", "आपका अनुभव कैसा रहा?"],
  "listing.post": ["Post review", "રિવ્યૂ પોસ્ટ કરો", "समीक्षा पोस्ट करें"],
  "listing.unavailable": ["Listing unavailable", "લિસ્ટિંગ ઉપલબ્ધ નથી", "लिस्टिंग उपलब्ध नहीं"],
  "listing.removed": ["Removed from saved businesses.", "સેવ કરેલા વ્યવસાયોમાંથી દૂર કર્યું.", "सेव किए गए व्यवसायों से हटाया गया।"],
  "listing.savedMsg": ["Business saved.", "વ્યવસાય સેવ થયો.", "व्यवसाय सेव हो गया।"],
  "listing.thanks": ["Thanks for sharing your review.", "તમારો રિવ્યૂ આપવા બદલ આભાર.", "अपनी समीक्षा साझा करने के लिए धन्यवाद।"],
  "err.save": ["Could not save this business.", "આ વ્યવસાય સેવ થઈ શક્યો નહીં.", "यह व्यवसाय सेव नहीं हो सका।"],
  "err.review": ["Could not submit your review.", "તમારો રિવ્યૂ મોકલી શકાયો નહીં.", "आपकी समीक्षा भेजी नहीं जा सकी।"],
  "err.contact": ["Could not record this contact action.", "આ સંપર્ક નોંધી શકાયો નહીં.", "यह संपर्क दर्ज नहीं हो सका।"],

  // Resident home
  "home.place": ["South Bopal, Ahmedabad", "સાઉથ બોપલ, અમદાવાદ", "साउथ बोपल, अहमदाबाद"],
  "home.title1": ["Find trusted help,", "વિશ્વસનીય મદદ,", "भरोसेमंद मदद,"],
  "home.title2": ["close to home.", "ઘરની નજીક.", "घर के पास।"],
  "home.tabsLabel": ["Browse services or products", "સેવાઓ અથવા ઉત્પાદનો જુઓ", "सेवाएँ या उत्पाद देखें"],
  "tab.all": ["All listings", "બધું", "सभी लिस्टिंग"],
  "tab.service": ["Services", "સેવાઓ", "सेवाएँ"],
  "tab.product": ["Products", "ઉત્પાદનો", "उत्पाद"],
  "hero.top": ["South Bopal", "સાઉથ બોપલ", "साउथ बोपल"],
  "hero.big": ["Local", "સ્થાનિક", "स्थानीय"],
  "hero.bottom": ["and trusted", "અને વિશ્વસનીય", "और भरोसेमंद"],
  "home.browseLocal": ["Browse local", "સ્થાનિક જુઓ", "स्थानीय देखें"],
  "home.popular": ["Popular categories", "લોકપ્રિય કેટેગરી", "लोकप्रिय श्रेणियाँ"],
  "home.clearCategory": ["Clear category ×", "કેટેગરી દૂર કરો ×", "श्रेणी हटाएँ ×"],
  "home.allIn": ["All {name}", "બધું: {name}", "सभी {name}"],
  "home.subLabel": ["{name} subcategories", "{name} ની પેટા કેટેગરી", "{name} की उप-श्रेणियाँ"],
  "err.categories": ["Could not load categories. Check the connection and try again.", "કેટેગરી લોડ થઈ શકી નહીં. કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.", "श्रेणियाँ लोड नहीं हो सकीं। कनेक्शन जाँचें और फिर कोशिश करें।"],
  "home.loadingCats": ["Loading categories…", "કેટેગરી લોડ થઈ રહી છે…", "श्रेणियाँ लोड हो रही हैं…"],
  "home.noCats": ["No categories are configured for this listing type yet.", "આ પ્રકાર માટે હજી કોઈ કેટેગરી નથી.", "इस प्रकार के लिए अभी कोई श्रेणी नहीं है।"],
  "home.eyCategory": ["Category listings", "કેટેગરીના લિસ્ટિંગ", "श्रेणी की लिस्टिंग"],
  "home.eyServiceCat": ["Service category listings", "સેવા કેટેગરીના લિસ્ટિંગ", "सेवा श्रेणी की लिस्टिंग"],
  "home.eyProductCat": ["Product category listings", "ઉત્પાદન કેટેગરીના લિસ્ટિંગ", "उत्पाद श्रेणी की लिस्टिंग"],
  "home.eyShop": ["Shop local", "સ્થાનિક ખરીદી કરો", "स्थानीय खरीदारी करें"],
  "home.eyFind": ["Find a service", "સેવા શોધો", "सेवा खोजें"],
  "home.eyBrowse": ["Browse local listings", "સ્થાનિક લિસ્ટિંગ જુઓ", "स्थानीय लिस्टिंग देखें"],
  "home.searchResult": ["Search: {q}", "શોધ: {q}", "खोज: {q}"],
  "home.trusted": ["Trusted nearby", "નજીકના વિશ્વસનીય", "पास के भरोसेमंद"],
  "home.finding": ["Finding local businesses…", "સ્થાનિક વ્યવસાયો શોધી રહ્યા છીએ…", "स्थानीय व्यवसाय खोज रहे हैं…"],
  "err.listingsTitle": ["Could not load listings", "લિસ્ટિંગ લોડ થઈ શક્યા નહીં", "लिस्टिंग लोड नहीं हो सकीं"],
  "empty.namedTitle": ["No {name} listings yet", "{name} માં હજી કોઈ લિસ્ટિંગ નથી", "{name} में अभी कोई लिस्टिंग नहीं"],
  "empty.allTitle": ["No local listings yet", "હજી કોઈ સ્થાનિક લિસ્ટિંગ નથી", "अभी कोई स्थानीय लिस्टिंग नहीं"],
  "empty.serviceTitle": ["No service listings yet", "હજી કોઈ સેવા લિસ્ટિંગ નથી", "अभी कोई सेवा लिस्टिंग नहीं"],
  "empty.productTitle": ["No product listings yet", "હજી કોઈ ઉત્પાદન લિસ્ટિંગ નથી", "अभी कोई उत्पाद लिस्टिंग नहीं"],
  "empty.selectionText": ["There are no businesses in this selection yet. Try another category or check back soon.", "આ પસંદગીમાં હજી કોઈ વ્યવસાય નથી. બીજી કેટેગરી અજમાવો અથવા થોડા સમય પછી ફરી જુઓ.", "इस चयन में अभी कोई व्यवसाय नहीं है। दूसरी श्रेणी आज़माएँ या जल्द फिर देखें।"],
  "empty.searchText": ["Try a different search term.", "બીજો શબ્દ શોધી જુઓ.", "कोई दूसरा शब्द खोजें।"],
  "empty.allText": ["There are no verified local businesses to show yet.", "હજી બતાવવા માટે કોઈ ચકાસાયેલ સ્થાનિક વ્યવસાય નથી.", "अभी दिखाने के लिए कोई सत्यापित स्थानीय व्यवसाय नहीं है।"],
  "empty.serviceText": ["There are no verified local service businesses to show yet.", "હજી કોઈ ચકાસાયેલ સ્થાનિક સેવા નથી.", "अभी कोई सत्यापित स्थानीय सेवा नहीं है।"],
  "empty.productText": ["There are no verified local product businesses to show yet.", "હજી કોઈ ચકાસાયેલ સ્થાનિક ઉત્પાદન નથી.", "अभी कोई सत्यापित स्थानीय उत्पाद नहीं है।"],
  "home.browseAll": ["Browse all categories", "બધી કેટેગરી જુઓ", "सभी श्रेणियाँ देखें"],

  // Category page
  "cat.home": ["Home", "હોમ", "होम"],
  "cat.category": ["Category", "કેટેગરી", "श्रेणी"],
  "cat.breadcrumb": ["Page path", "પેજનો માર્ગ", "पेज पथ"],
  "cat.loading": ["Loading category…", "કેટેગરી લોડ થઈ રહી છે…", "श्रेणी लोड हो रही है…"],
  "cat.loadError": ["Could not load this category.", "આ કેટેગરી લોડ થઈ શકી નહીં.", "यह श्रेणी लोड नहीं हो सकी।"],
  "cat.notFound": ["Category not found", "કેટેગરી મળી નથી", "श्रेणी नहीं मिली"],
  "cat.removed": ["This category or subcategory may have been removed.", "આ કેટેગરી અથવા પેટા કેટેગરી કદાચ દૂર કરવામાં આવી છે.", "यह श्रेणी या उप-श्रेणी शायद हटा दी गई है।"],
  "cat.browseCategories": ["Browse categories", "કેટેગરી જુઓ", "श्रेणियाँ देखें"],
  "cat.eyAll": ["Local listings", "સ્થાનિક લિસ્ટિંગ", "स्थानीय लिस्टिंग"],
  "cat.eyService": ["Local services", "સ્થાનિક સેવાઓ", "स्थानीय सेवाएँ"],
  "cat.eyProduct": ["Local products", "સ્થાનિક ઉત્પાદનો", "स्थानीय उत्पाद"],
  "cat.active": ["{n} active listings", "{n} સક્રિય લિસ્ટિંગ", "{n} सक्रिय लिस्टिंग"],
  "cat.moreIn": ["More in {name}", "{name} માં વધુ", "{name} में और"],
  "cat.browseName": ["Browse {name}", "{name} જુઓ", "{name} देखें"],
  "cat.filterTitle": ["Search and filter", "શોધો અને ફિલ્ટર કરો", "खोजें और फ़िल्टर करें"],
  "cat.search": ["Search", "શોધો", "खोजें"],
  "cat.searchPh": ["Search {name}", "{name} માં શોધો", "{name} में खोजें"],
  "cat.location": ["Location", "સ્થાન", "स्थान"],
  "cat.locationPh": ["Area or locality", "વિસ્તાર અથવા સોસાયટી", "इलाका या मोहल्ला"],
  "cat.sort": ["Sort by", "આ મુજબ ગોઠવો", "इसके अनुसार क्रम"],
  "sort.relevance": ["Most relevant", "સૌથી સંબંધિત", "सबसे प्रासंगिक"],
  "sort.rating": ["Highest rated", "સૌથી વધુ રેટિંગ", "सबसे ज़्यादा रेटिंग"],
  "sort.recent": ["Recently added", "તાજેતરમાં ઉમેરાયેલ", "हाल ही में जोड़े गए"],
  "sort.alpha": ["Alphabetical", "અક્ષરક્રમ મુજબ", "वर्णानुक्रम"],
  "sort.priceLow": ["Price: low to high", "કિંમત: ઓછીથી વધુ", "कीमत: कम से ज़्यादा"],
  "sort.priceHigh": ["Price: high to low", "કિંમત: વધુથી ઓછી", "कीमत: ज़्यादा से कम"],
  "cat.minRating": ["Minimum rating", "ઓછામાં ઓછું રેટિંગ", "न्यूनतम रेटिंग"],
  "cat.anyRating": ["Any rating", "કોઈપણ રેટિંગ", "कोई भी रेटिंग"],
  "cat.starsPlus": ["{n}+ stars", "{n}+ સ્ટાર", "{n}+ स्टार"],
  "cat.verifiedOnly": ["Verified businesses", "ચકાસાયેલ વ્યવસાયો", "सत्यापित व्यवसाय"],
  "cat.minPrice": ["Minimum price", "ઓછામાં ઓછી કિંમત", "न्यूनतम कीमत"],
  "cat.maxPrice": ["Maximum price", "વધુમાં વધુ કિંમત", "अधिकतम कीमत"],
  "cat.apply": ["Apply filters", "ફિલ્ટર લાગુ કરો", "फ़िल्टर लागू करें"],
  "cat.clearAll": ["Clear all", "બધું સાફ કરો", "सब हटाएँ"],
  "cat.matchingAll": ["Matching businesses", "મેળ ખાતા વ્યવસાયો", "मिलते-जुलते व्यवसाय"],
  "cat.matchingService": ["Matching service listings", "મેળ ખાતી સેવાઓ", "मिलती-जुलती सेवाएँ"],
  "cat.matchingProduct": ["Matching product listings", "મેળ ખાતા ઉત્પાદનો", "मिलते-जुलते उत्पाद"],
  "cat.results": ["{n} results", "{n} પરિણામ", "{n} परिणाम"],
  "cat.finding": ["Finding matching listings…", "મેળ ખાતા લિસ્ટિંગ શોધી રહ્યા છીએ…", "मिलती-जुलती लिस्टिंग खोज रहे हैं…"],
  "cat.listingsError": ["Could not load listings.", "લિસ્ટિંગ લોડ થઈ શક્યા નહીં.", "लिस्टिंग लोड नहीं हो सकीं।"],
  "cat.pages": ["Listing pages", "લિસ્ટિંગનાં પાનાં", "लिस्टिंग पेज"],
  "cat.prev": ["Previous", "પાછળ", "पिछला"],
  "cat.next": ["Next", "આગળ", "अगला"],
  "cat.pageOf": ["Page {page} of {total}", "પાનું {page} / {total}", "पेज {page} / {total}"],
  "cat.emptyTitle": ["No listings available in this category yet.", "આ કેટેગરીમાં હજી કોઈ લિસ્ટિંગ નથી.", "इस श्रेणी में अभी कोई लिस्टिंग नहीं है।"],
  "cat.emptySub": ["There are no matching listings in {name} yet.", "{name} માં હજી કોઈ મેળ ખાતું લિસ્ટિંગ નથી.", "{name} में अभी कोई मिलती-जुलती लिस्टिंग नहीं है।"],
  "cat.checkBack": ["Please check back soon.", "થોડા સમય પછી ફરી જુઓ.", "कृपया जल्द फिर देखें।"],
  "cat.returnTo": ["Return to {name}", "{name} પર પાછા જાઓ", "{name} पर वापस जाएँ"],

  // Owner portal
  "owner.eyebrow": ["Business owner portal", "વ્યવસાય માલિક પોર્ટલ", "व्यवसाय मालिक पोर्टल"],
  "owner.title": ["Manage your local presence", "તમારા વ્યવસાયની ઓળખ સંભાળો", "अपनी स्थानीय पहचान सँभालें"],
  "owner.copy": ["Claim your existing listing or create one, post offers, track review status and request a plan.", "તમારું લિસ્ટિંગ ક્લેમ કરો અથવા નવું બનાવો, ઓફર મૂકો, ચકાસણીની સ્થિતિ જુઓ અને પ્લાન માટે વિનંતી કરો.", "अपनी लिस्टिंग क्लेम करें या नई बनाएँ, ऑफ़र डालें, समीक्षा की स्थिति देखें और प्लान का अनुरोध करें।"],
  "owner.signInTitle": ["Sign in to continue", "આગળ વધવા સાઇન ઇન કરો", "जारी रखने के लिए साइन इन करें"],
  "owner.signInText": ["Use your MySobo account to manage your business listing.", "તમારું વ્યવસાય લિસ્ટિંગ સંભાળવા MySobo એકાઉન્ટ વાપરો.", "अपनी व्यवसाय लिस्टिंग सँभालने के लिए MySobo खाता इस्तेमाल करें।"],
  "owner.yourListings": ["Your listings", "તમારા લિસ્ટિંગ", "आपकी लिस्टिंग"],
  "owner.status": ["Business status", "વ્યવસાયની સ્થિતિ", "व्यवसाय की स्थिति"],
  "owner.loading": ["Loading your listings…", "તમારા લિસ્ટિંગ લોડ થઈ રહ્યા છે…", "आपकी लिस्टिंग लोड हो रही है…"],
  "owner.uncategorized": ["Uncategorized", "કેટેગરી વગર", "बिना श्रेणी"],
  "owner.planName": ["{plan} plan", "{plan} પ્લાન", "{plan} प्लान"],
  "owner.underReview": ["Under review", "ચકાસણી હેઠળ", "समीक्षा में"],
  "owner.noClaimed": ["No claimed listings yet.", "હજી કોઈ ક્લેમ કરેલ લિસ્ટિંગ નથી.", "अभी कोई क्लेम की गई लिस्टिंग नहीं।"],
  "owner.claimEyebrow": ["Claim a business", "વ્યવસાય ક્લેમ કરો", "व्यवसाय क्लेम करें"],
  "owner.findExisting": ["Find your existing listing", "તમારું હાલનું લિસ્ટિંગ શોધો", "अपनी मौजूदा लिस्टिंग खोजें"],
  "owner.searchName": ["Search by business name", "વ્યવસાયના નામથી શોધો", "व्यवसाय के नाम से खोजें"],
  "owner.claim": ["Claim", "ક્લેમ કરો", "क्लेम करें"],
  "owner.claimSubmitted": ["Claim submitted. We will update its status after verification.", "ક્લેમ મોકલાયો. ચકાસણી પછી અમે સ્થિતિ અપડેટ કરીશું.", "क्लेम भेज दिया गया। सत्यापन के बाद हम स्थिति अपडेट करेंगे।"],
  "owner.claimsReviewed": ["Claims are reviewed before owner access is granted.", "માલિકીની ઍક્સેસ આપતા પહેલાં ક્લેમ ચકાસવામાં આવે છે.", "मालिक की पहुँच देने से पहले क्लेम की समीक्षा की जाती है।"],
  "owner.createEyebrow": ["Create listing", "લિસ્ટિંગ બનાવો", "लिस्टिंग बनाएँ"],
  "owner.addBusiness": ["Add your business", "તમારો વ્યવસાય ઉમેરો", "अपना व्यवसाय जोड़ें"],
  "owner.offersEyebrow": ["Offers and updates", "ઓફર અને અપડેટ", "ऑफ़र और अपडेट"],
  "owner.postOffer": ["Post an offer", "ઓફર મૂકો", "ऑफ़र डालें"],
  "owner.business": ["Business", "વ્યવસાય", "व्यवसाय"],
  "owner.chooseListing": ["Choose listing", "લિસ્ટિંગ પસંદ કરો", "लिस्टिंग चुनें"],
  "owner.offerTitle": ["Offer title", "ઓફરનું શીર્ષક", "ऑफ़र का शीर्षक"],
  "owner.details": ["Details", "વિગતો", "विवरण"],
  "owner.submitOffer": ["Submit offer", "ઓફર મોકલો", "ऑफ़र भेजें"],
  "owner.claimToPost": ["Claim or create a listing to post offers.", "ઓફર મૂકવા લિસ્ટિંગ ક્લેમ કરો અથવા બનાવો.", "ऑफ़र डालने के लिए लिस्टिंग क्लेम करें या बनाएँ।"],
  "owner.plansEyebrow": ["Plans", "પ્લાન", "प्लान"],
  "owner.choosePlan": ["Choose a plan", "પ્લાન પસંદ કરો", "प्लान चुनें"],
  "owner.plan": ["Plan", "પ્લાન", "प्लान"],
  "owner.perMonth": ["{plan} — ₹{price}/month", "{plan} — ₹{price}/મહિને", "{plan} — ₹{price}/महीना"],
  "owner.requestPlan": ["Request plan change", "પ્લાન બદલવાની વિનંતી કરો", "प्लान बदलने का अनुरोध करें"],
  "owner.addBeforePlan": ["Add or claim a listing before selecting a plan.", "પ્લાન પસંદ કરતાં પહેલાં લિસ્ટિંગ ઉમેરો અથવા ક્લેમ કરો.", "प्लान चुनने से पहले लिस्टिंग जोड़ें या क्लेम करें।"],
  "owner.planRequest": ["{plan} plan request · {status}", "{plan} પ્લાન વિનંતી · {status}", "{plan} प्लान अनुरोध · {status}"],
  "owner.howEyebrow": ["How it works", "આ કેવી રીતે કામ કરે છે", "यह कैसे काम करता है"],
  "owner.verifiedTitle": ["Verified, not just listed", "માત્ર લિસ્ટેડ નહીં, ચકાસાયેલ", "सिर्फ़ लिस्टेड नहीं, सत्यापित"],
  "owner.howText": ["New listings and offers remain under review until MySobo verifies them. Your listing status and current plan appear here.", "MySobo ચકાસે ત્યાં સુધી નવા લિસ્ટિંગ અને ઓફર ચકાસણી હેઠળ રહે છે. તમારા લિસ્ટિંગની સ્થિતિ અને હાલનો પ્લાન અહીં દેખાય છે.", "MySobo के सत्यापन तक नई लिस्टिंग और ऑफ़र समीक्षा में रहते हैं। आपकी लिस्टिंग की स्थिति और मौजूदा प्लान यहाँ दिखते हैं।"],
  "owner.created": ["Your listing was created and is awaiting verification.", "તમારું લિસ્ટિંગ બન્યું છે અને ચકાસણીની રાહ જુએ છે.", "आपकी लिस्टिंग बन गई है और सत्यापन की प्रतीक्षा में है।"],
  "owner.offerSent": ["Offer sent for review.", "ઓફર ચકાસણી માટે મોકલાઈ.", "ऑफ़र समीक्षा के लिए भेजा गया।"],
  "owner.planSubmitted": ["Plan request submitted for approval.", "પ્લાન વિનંતી મંજૂરી માટે મોકલાઈ.", "प्लान अनुरोध मंज़ूरी के लिए भेजा गया।"],
  "owner.updated": ["Listing details updated.", "લિસ્ટિંગની વિગતો અપડેટ થઈ.", "लिस्टिंग का विवरण अपडेट हुआ।"],

  // Listing forms
  "form.category": ["Category", "કેટેગરી", "श्रेणी"],
  "form.chooseCategory": ["Choose category", "કેટેગરી પસંદ કરો", "श्रेणी चुनें"],
  "form.type": ["Type", "પ્રકાર", "प्रकार"],
  "form.subcategory": ["Subcategory", "પેટા કેટેગરી", "उप-श्रेणी"],
  "form.chooseSub": ["Choose subcategory (optional)", "પેટા કેટેગરી પસંદ કરો (વૈકલ્પિક)", "उप-श्रेणी चुनें (वैकल्पिक)"],
  "form.chooseField": ["Choose {label}", "{label} પસંદ કરો", "{label} चुनें"],
  "form.choose": ["Choose", "પસંદ કરો", "चुनें"],
  "form.edit": ["Edit listing details", "લિસ્ટિંગની વિગતો બદલો", "लिस्टिंग का विवरण बदलें"],
  "form.name": ["Business name", "વ્યવસાયનું નામ", "व्यवसाय का नाम"],
  "form.description": ["Description", "વર્ણન", "विवरण"],
  "form.phone": ["Phone", "ફોન", "फ़ोन"],
  "form.whatsapp": ["WhatsApp", "વોટ્સએપ", "व्हाट्सऐप"],
  "form.address": ["Address", "સરનામું", "पता"],
  "form.save": ["Save changes", "ફેરફારો સેવ કરો", "बदलाव सेव करें"],
  "form.create": ["Create listing", "લિસ્ટિંગ બનાવો", "लिस्टिंग बनाएँ"],
} as const satisfies Record<string, readonly [string, string, string]>;

export type MessageKey = keyof typeof messages;
type Vars = Record<string, string | number>;

const LANG_INDEX: Record<Lang, 0 | 1 | 2> = { en: 0, gu: 1, hi: 2 };

function isLang(value: unknown): value is Lang {
  return value === "gu" || value === "en" || value === "hi";
}

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return DEFAULT_LANG;
}

type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors; the choice still applies for this visit.
    }
  }, []);

  const t = useCallback((key: MessageKey, vars?: Vars) => {
    const entry = messages[key];
    let text: string = entry[LANG_INDEX[lang]] || entry[0];
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useT must be used inside LanguageProvider");
  return context;
}

export function LanguageSwitch() {
  const { lang, setLang, t } = useT();
  return (
    <div className="langSwitch" role="group" aria-label={t("lang.label")}>
      {LANGUAGES.map((item) => (
        <button
          key={item.code}
          type="button"
          lang={item.code}
          aria-label={item.label}
          aria-pressed={lang === item.code}
          className={lang === item.code ? "active" : ""}
          onClick={() => setLang(item.code)}
        >
          {item.short}
        </button>
      ))}
    </div>
  );
}

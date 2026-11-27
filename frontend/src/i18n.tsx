import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  "install.button": ["Install app", "એપ ઇન્સ્ટોલ કરો", "ऐप इंस्टॉल करें"],
  "install.iosTitle": ["Add MySobo to your Home Screen", "MySobo ને હોમ સ્ક્રીન પર ઉમેરો", "MySobo को होम स्क्रीन पर जोड़ें"],
  "install.iosStep1": ["Tap the Share button at the bottom of Safari.", "Safari ની નીચે શેર બટન દબાવો.", "Safari में नीचे शेयर बटन दबाएँ।"],
  "install.iosStep2": ["Choose “Add to Home Screen”.", "“Add to Home Screen” પસંદ કરો.", "“Add to Home Screen” चुनें।"],
  "install.iosStep3": ["Tap Add. MySobo opens straight to your local directory.", "Add દબાવો. MySobo સીધું તમારી સ્થાનિક ડિરેક્ટરી ખોલશે.", "Add दबाएँ। MySobo सीधे आपकी स्थानीय डायरेक्टरी खोलेगा।"],
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
  // Owner dashboard
  "od.portal": ["Owner portal", "માલિક પોર્ટલ", "मालिक पोर्टल"],
  "od.workspace": ["Owner workspace", "માલિકનું કાર્યક્ષેત્ર", "मालिक का कार्यक्षेत्र"],
  "od.nav.overview": ["Overview", "ઝાંખી", "सारांश"],
  "od.nav.businesses": ["My businesses", "મારા વ્યવસાય", "मेरे व्यवसाय"],
  "od.nav.add": ["Add business", "વ્યવસાય ઉમેરો", "व्यवसाय जोड़ें"],
  "od.nav.claim": ["Claim business", "વ્યવસાય ક્લેમ કરો", "व्यवसाय क्लेम करें"],
  "od.nav.offers": ["Offers & promotions", "ઓફર અને પ્રમોશન", "ऑफ़र और प्रमोशन"],
  "od.nav.plans": ["Plans & billing", "પ્લાન અને બિલિંગ", "प्लान और बिलिंग"],
  "od.nav.profile": ["Profile & settings", "પ્રોફાઇલ અને સેટિંગ્સ", "प्रोफ़ाइल और सेटिंग्स"],
  "od.nav.help": ["Help & support", "મદદ અને સહાય", "मदद और सहायता"],
  "od.status.pending": ["Pending", "બાકી", "लंबित"],
  "od.status.approved": ["Approved", "મંજૂર", "स्वीकृत"],
  "od.status.rejected": ["Rejected", "નામંજૂર", "अस्वीकृत"],
  "od.plan.free": ["Free", "ફ્રી", "फ़्री"],
  "od.plan.pro": ["Pro", "પ્રો", "प्रो"],
  "od.plan.premium": ["Premium", "પ્રીમિયમ", "प्रीमियम"],
  "od.welcomeChip": ["South Bopal · MySobo for businesses", "સાઉથ બોપલ · વ્યવસાય માટે MySobo", "साउथ बोपल · व्यवसाय के लिए MySobo"],
  "od.welcomeTitle": ["Grow your local presence in South Bopal.", "સાઉથ બોપલમાં તમારા વ્યવસાયની ઓળખ વધારો.", "साउथ बोपल में अपने व्यवसाय की पहचान बढ़ाएँ।"],
  "od.welcomeText": ["Shops, clinics, tutors and home-service providers in South Bopal, Shela and Ghuma can create verified listings, post offers for neighbours and manage their plan in one place.", "સાઉથ બોપલ, શેલા અને ઘુમાની દુકાનો, ક્લિનિક, ટ્યુટર અને ઘરેલુ સેવા આપનારા અહીં ચકાસાયેલ લિસ્ટિંગ બનાવી શકે છે, પડોશીઓ માટે ઓફર મૂકી શકે છે અને પોતાનો પ્લાન એક જ જગ્યાએ સંભાળી શકે છે.", "साउथ बोपल, शेला और घुमा की दुकानें, क्लिनिक, ट्यूटर और घरेलू सेवा देने वाले यहाँ सत्यापित लिस्टिंग बना सकते हैं, पड़ोसियों के लिए ऑफ़र डाल सकते हैं और अपना प्लान एक ही जगह संभाल सकते हैं।"],
  "od.perk1": ["Trusted local discovery", "વિશ્વસનીય સ્થાનિક ઓળખ", "भरोसेमंद स्थानीय पहचान"],
  "od.perk1Text": ["Verified listings that residents nearby can trust.", "નજીકના રહેવાસીઓ ભરોસો કરી શકે એવું ચકાસાયેલ લિસ્ટિંગ.", "सत्यापित लिस्टिंग जिस पर आसपास के निवासी भरोसा कर सकें।"],
  "od.perk2": ["Products & services", "ઉત્પાદનો અને સેવાઓ", "उत्पाद और सेवाएँ"],
  "od.perk2Text": ["Categories made for shops, clinics and service providers.", "દુકાનો, ક્લિનિક અને સેવા આપનારા માટે બનાવેલી કેટેગરી.", "दुकानों, क्लिनिक और सेवा देने वालों के लिए बनी श्रेणियाँ।"],
  "od.perk3": ["Offers & plan upgrades", "ઓફર અને પ્લાન અપગ્રેડ", "ऑफ़र और प्लान अपग्रेड"],
  "od.perk3Text": ["Post offers and move to Pro or Premium when you are ready.", "ઓફર મૂકો અને તૈયાર હો ત્યારે પ્રો અથવા પ્રીમિયમ પર જાઓ.", "ऑफ़र डालें और तैयार होने पर प्रो या प्रीमियम लें।"],
  "od.journey": ["How to get listed", "લિસ્ટ કેવી રીતે થવું", "लिस्ट कैसे हों"],
  "od.step1": ["Sign in with mobile", "મોબાઇલથી સાઇન ઇન", "मोबाइल से साइन इन"],
  "od.step2": ["Business type", "વ્યવસાયનો પ્રકાર", "व्यवसाय का प्रकार"],
  "od.step3": ["Create listing", "લિસ્ટિંગ બનાવો", "लिस्टिंग बनाएँ"],
  "od.step4": ["MySobo verifies", "MySobo ચકાસે છે", "MySobo सत्यापित करता है"],
  "od.step5": ["Choose a plan", "પ્લાન પસંદ કરો", "प्लान चुनें"],
  "od.startTitle": ["Start with your mobile number", "તમારા મોબાઇલ નંબરથી શરૂ કરો", "अपने मोबाइल नंबर से शुरू करें"],
  "od.startText": ["We send a one-time code. No password to remember.", "અમે એક વખતનો કોડ મોકલીએ છીએ. કોઈ પાસવર્ડ યાદ રાખવાનો નથી.", "हम एक बार का कोड भेजते हैं। कोई पासवर्ड याद नहीं रखना।"],
  "od.startButton": ["Sign in or create account", "સાઇન ઇન કરો અથવા એકાઉન્ટ બનાવો", "साइन इन करें या खाता बनाएँ"],
  "od.alreadyListed": ["Already on MySobo? Sign in to claim your listing.", "MySobo પર પહેલેથી છો? તમારું લિસ્ટિંગ ક્લેમ કરવા સાઇન ઇન કરો.", "MySobo पर पहले से हैं? अपनी लिस्टिंग क्लेम करने के लिए साइन इन करें।"],
  "od.claimExisting": ["Claim an existing business", "હાલનો વ્યવસાય ક્લેમ કરો", "मौजूदा व्यवसाय क्लेम करें"],
  "od.overviewChip": ["Owner overview · South Bopal", "માલિકની ઝાંખી · સાઉથ બોપલ", "मालिक सारांश · साउथ बोपल"],
  "od.welcomeBack": ["Welcome back, {name}!", "ફરી સ્વાગત છે, {name}!", "फिर से स्वागत है, {name}!"],
  "od.managing": ["You manage {n} business listings.", "તમે {n} વ્યવસાય લિસ્ટિંગ સંભાળો છો.", "आप {n} व्यवसाय लिस्टिंग संभालते हैं।"],
  "od.noneYet": ["Add or claim your first business to get started.", "શરૂ કરવા તમારો પહેલો વ્યવસાય ઉમેરો અથવા ક્લેમ કરો.", "शुरू करने के लिए अपना पहला व्यवसाय जोड़ें या क्लेम करें।"],
  "od.summary": ["Summary", "સારાંશ", "सारांश"],
  "od.kpi.total": ["Total businesses", "કુલ વ્યવસાય", "कुल व्यवसाय"],
  "od.kpi.totalHint": ["Listings you manage", "તમે સંભાળો છો તે લિસ્ટિંગ", "आपकी लिस्टिंग"],
  "od.kpi.verified": ["Verified", "ચકાસાયેલ", "सत्यापित"],
  "od.kpi.verifiedHint": ["Visible to residents", "રહેવાસીઓને દેખાય છે", "निवासियों को दिखती हैं"],
  "od.kpi.review": ["Under review", "ચકાસણી હેઠળ", "समीक्षा में"],
  "od.kpi.reviewHint": ["Awaiting verification", "ચકાસણીની રાહમાં", "सत्यापन की प्रतीक्षा"],
  "od.kpi.claims": ["Pending claims", "બાકી ક્લેમ", "लंबित क्लेम"],
  "od.kpi.claimsHint": ["Ownership requests", "માલિકીની વિનંતીઓ", "मालिकाना अनुरोध"],
  "od.kpi.offers": ["Pending offers", "બાકી ઓફર", "लंबित ऑफ़र"],
  "od.kpi.offersHint": ["Waiting for approval", "મંજૂરીની રાહમાં", "स्वीकृति की प्रतीक्षा"],
  "od.kpi.plan": ["Current plan", "હાલનો પ્લાન", "मौजूदा प्लान"],
  "od.kpi.planHint": ["Highest active plan", "સૌથી ઊંચો સક્રિય પ્લાન", "सबसे ऊँचा सक्रिय प्लान"],
  "od.quickActions": ["Quick actions", "ઝડપી પગલાં", "त्वरित काम"],
  "od.manageListings": ["Manage listings", "લિસ્ટિંગ સંભાળો", "लिस्टिंग संभालें"],
  "od.createOffer": ["Create offer", "ઓફર બનાવો", "ऑफ़र बनाएँ"],
  "od.viewPlans": ["View plans", "પ્લાન જુઓ", "प्लान देखें"],
  "od.yourListings": ["Your business listings", "તમારા વ્યવસાય લિસ્ટિંગ", "आपकी व्यवसाय लिस्टिंग"],
  "od.viewAll": ["View all", "બધું જુઓ", "सब देखें"],
  "od.manage": ["Manage", "સંભાળો", "संभालें"],
  "od.hidden": ["Hidden from public search", "જાહેર શોધમાં છુપાયેલું", "सार्वजनिक खोज से छिपा"],
  "od.activity": ["Recent activity", "તાજેતરની પ્રવૃત્તિ", "हाल की गतिविधि"],
  "od.act.claim": ["Ownership claim for {name}", "{name} માટે માલિકીનો ક્લેમ", "{name} के लिए मालिकाना क्लेम"],
  "od.act.offer": ["Offer submitted for {name}", "{name} માટે ઓફર મોકલી", "{name} के लिए ऑफ़र भेजा"],
  "od.act.plan": ["{plan} plan requested for {name}", "{name} માટે {plan} પ્લાનની વિનંતી", "{name} के लिए {plan} प्लान का अनुरोध"],
  "od.emptyActivity": ["Your claims, offers and plan requests will show here.", "તમારા ક્લેમ, ઓફર અને પ્લાન વિનંતીઓ અહીં દેખાશે.", "आपके क्लेम, ऑफ़र और प्लान अनुरोध यहाँ दिखेंगे।"],
  "od.emptyListings": ["You have no listings yet. Add your business so neighbours can find you.", "હજી તમારું કોઈ લિસ્ટિંગ નથી. તમારો વ્યવસાય ઉમેરો જેથી પડોશીઓ તમને શોધી શકે.", "अभी आपकी कोई लिस्टिंग नहीं है। अपना व्यवसाय जोड़ें ताकि पड़ोसी आपको ढूँढ सकें।"],
  "od.businessesCopy": ["See and update every listing on your account.", "તમારા એકાઉન્ટના દરેક લિસ્ટિંગ જુઓ અને અપડેટ કરો.", "अपने खाते की हर लिस्टिंग देखें और अपडेट करें।"],
  "od.claimListing": ["Claim listing", "લિસ્ટિંગ ક્લેમ કરો", "लिस्टिंग क्लेम करें"],
  "od.searchBusinesses": ["Search by name, category or address", "નામ, કેટેગરી અથવા સરનામાથી શોધો", "नाम, श्रेणी या पते से खोजें"],
  "od.allTypes": ["All types", "બધા પ્રકાર", "सभी प्रकार"],
  "od.allStatuses": ["All statuses", "બધી સ્થિતિ", "सभी स्थितियाँ"],
  "od.status": ["Status", "સ્થિતિ", "स्थिति"],
  "od.editing": ["Editing {name}", "{name} બદલી રહ્યા છો", "{name} बदल रहे हैं"],
  "od.editListing": ["Edit listing", "લિસ્ટિંગ બદલો", "लिस्टिंग बदलें"],
  "od.viewPublic": ["View", "જુઓ", "देखें"],
  "od.addCopy": ["Fill in the details residents need. MySobo verifies every new listing before it goes public.", "રહેવાસીઓને જોઈતી વિગતો ભરો. દરેક નવું લિસ્ટિંગ જાહેર થાય તે પહેલાં MySobo ચકાસે છે.", "निवासियों के लिए ज़रूरी विवरण भरें। हर नई लिस्टिंग सार्वजनिक होने से पहले MySobo सत्यापित करता है।"],
  "od.afterSubmit": ["After you submit", "મોકલ્યા પછી", "भेजने के बाद"],
  "od.after1": ["Your listing is saved and marked Under review.", "તમારું લિસ્ટિંગ સેવ થાય છે અને ‘ચકાસણી હેઠળ’ બતાવે છે.", "आपकी लिस्टिंग सेव होती है और ‘समीक्षा में’ दिखती है।"],
  "od.after2": ["The MySobo team checks the details, usually within 2 working days.", "MySobo ટીમ વિગતો તપાસે છે, સામાન્ય રીતે 2 કામકાજના દિવસમાં.", "MySobo टीम विवरण जाँचती है, आमतौर पर 2 कार्य दिवसों में।"],
  "od.after3": ["Once verified, residents can find, call and WhatsApp you.", "ચકાસણી પછી રહેવાસીઓ તમને શોધી, કૉલ અને વોટ્સએપ કરી શકે છે.", "सत्यापन के बाद निवासी आपको खोज, कॉल और व्हाट्सऐप कर सकते हैं।"],
  "od.claimCopy": ["Your business may already be listed by our field team. Search for it and claim it.", "તમારો વ્યવસાય અમારી ફીલ્ડ ટીમે પહેલેથી ઉમેર્યો હોઈ શકે. તેને શોધો અને ક્લેમ કરો.", "आपका व्यवसाय हमारी फ़ील्ड टीम ने पहले से जोड़ा हो सकता है। उसे खोजें और क्लेम करें।"],
  "od.noMatch": ["No matching business found. You can add it as a new listing.", "કોઈ મેળ ખાતો વ્યવસાય મળ્યો નથી. તમે તેને નવા લિસ્ટિંગ તરીકે ઉમેરી શકો છો.", "कोई मिलता व्यवसाय नहीं मिला। आप इसे नई लिस्टिंग के रूप में जोड़ सकते हैं।"],
  "od.yourClaims": ["Your claims", "તમારા ક્લેમ", "आपके क्लेम"],
  "od.noClaims": ["You have not claimed any business yet.", "તમે હજી કોઈ વ્યવસાય ક્લેમ કર્યો નથી.", "आपने अभी कोई व्यवसाय क्लेम नहीं किया है।"],
  "od.offersCopy": ["Create offers for residents and track their review status.", "રહેવાસીઓ માટે ઓફર બનાવો અને તેની ચકાસણીની સ્થિતિ જુઓ.", "निवासियों के लिए ऑफ़र बनाएँ और उनकी समीक्षा स्थिति देखें।"],
  "od.offerTitlePh": ["e.g. 10% off on first home cleaning", "દા.ત. પહેલી ઘર સફાઈ પર 10% છૂટ", "जैसे पहली घर सफ़ाई पर 10% छूट"],
  "od.offerBodyPh": ["Terms, valid days and who can use it", "શરતો, માન્ય દિવસો અને કોણ લાભ લઈ શકે", "शर्तें, मान्य दिन और कौन लाभ ले सकता है"],
  "od.submittedOffers": ["Submitted offers", "મોકલેલી ઓફર", "भेजे गए ऑफ़र"],
  "od.allBusinesses": ["All businesses", "બધા વ્યવસાય", "सभी व्यवसाय"],
  "od.submittedOn": ["Submitted {date}", "{date} એ મોકલી", "{date} को भेजा"],
  "od.noOffers": ["No offers yet.", "હજી કોઈ ઓફર નથી.", "अभी कोई ऑफ़र नहीं।"],
  "od.plansCopy": ["Compare plans and request an upgrade for each listing.", "પ્લાનની સરખામણી કરો અને દરેક લિસ્ટિંગ માટે અપગ્રેડની વિનંતી કરો.", "प्लान की तुलना करें और हर लिस्टिंग के लिए अपग्रेड का अनुरोध करें।"],
  "od.selectListing": ["Business listing", "વ્યવસાય લિસ્ટિંગ", "व्यवसाय लिस्टिंग"],
  "od.currentPlanFor": ["Current plan for {name}", "{name} નો હાલનો પ્લાન", "{name} का मौजूदा प्लान"],
  "od.month": ["month", "મહિને", "महीना"],
  "od.renews": ["Valid until {date}", "{date} સુધી માન્ય", "{date} तक मान्य"],
  "od.currentPlan": ["Current plan", "હાલનો પ્લાન", "मौजूदा प्लान"],
  "od.currentlyActive": ["Currently active", "હાલમાં ચાલુ", "अभी सक्रिय"],
  "od.requested": ["Request sent", "વિનંતી મોકલી", "अनुरोध भेजा"],
  "od.requestPlan": ["Request {plan}", "{plan} માટે વિનંતી કરો", "{plan} का अनुरोध करें"],
  "od.planTag.free": ["Everything you need to be found.", "શોધાવા માટે જરૂરી બધું.", "खोजे जाने के लिए ज़रूरी सब कुछ।"],
  "od.planTag.pro": ["Stand out with offers and more photos.", "ઓફર અને વધુ ફોટા સાથે અલગ દેખાઓ.", "ऑफ़र और ज़्यादा फ़ोटो के साथ अलग दिखें।"],
  "od.planTag.premium": ["Top placement and full showcase.", "ટોચનું સ્થાન અને સંપૂર્ણ પ્રદર્શન.", "सबसे ऊपर जगह और पूरा प्रदर्शन।"],
  "od.feat.free1": ["Basic business listing", "સામાન્ય વ્યવસાય લિસ્ટિંગ", "सामान्य व्यवसाय लिस्टिंग"],
  "od.feat.free2": ["Up to 3 photos", "3 ફોટા સુધી", "3 फ़ोटो तक"],
  "od.feat.free3": ["Call and WhatsApp buttons", "કૉલ અને વોટ્સએપ બટન", "कॉल और व्हाट्सऐप बटन"],
  "od.feat.free4": ["Verified badge after review", "ચકાસણી પછી ચકાસાયેલ બેજ", "समीक्षा के बाद सत्यापित बैज"],
  "od.feat.pro1": ["Everything in Free", "ફ્રીમાં છે તે બધું", "फ़्री की सारी सुविधाएँ"],
  "od.feat.pro2": ["Up to 10 photos", "10 ફોટા સુધી", "10 फ़ोटो तक"],
  "od.feat.pro3": ["Offers shown to residents", "રહેવાસીઓને ઓફર દેખાય", "निवासियों को ऑफ़र दिखें"],
  "od.feat.pro4": ["Better placement in search", "શોધમાં વધુ સારું સ્થાન", "खोज में बेहतर जगह"],
  "od.feat.prem1": ["Everything in Pro", "પ્રોમાં છે તે બધું", "प्रो की सारी सुविधाएँ"],
  "od.feat.prem2": ["Up to 25 photos", "25 ફોટા સુધી", "25 फ़ोटो तक"],
  "od.feat.prem3": ["Featured on the home page", "હોમ પેજ પર ફીચર્ડ", "होम पेज पर फ़ीचर्ड"],
  "od.feat.prem4": ["Priority placement in its category", "કેટેગરીમાં પ્રાથમિક સ્થાન", "अपनी श्रेणी में प्राथमिक जगह"],
  "od.requestHistory": ["Plan request history", "પ્લાન વિનંતીનો ઇતિહાસ", "प्लान अनुरोध इतिहास"],
  "od.requestsCount": ["{n} requests", "{n} વિનંતી", "{n} अनुरोध"],
  "od.requestedPlan": ["Requested plan", "માગેલો પ્લાન", "माँगा गया प्लान"],
  "od.submitted": ["Submitted", "મોકલ્યું", "भेजा"],
  "od.noRequests": ["No plan requests yet.", "હજી કોઈ પ્લાન વિનંતી નથી.", "अभी कोई प्लान अनुरोध नहीं।"],
  "od.profileCopy": ["Your account details and language.", "તમારા એકાઉન્ટની વિગતો અને ભાષા.", "आपके खाते का विवरण और भाषा।"],
  "od.account": ["Account", "એકાઉન્ટ", "खाता"],
  "od.profileNote": ["To change your mobile number, contact the MySobo team.", "મોબાઇલ નંબર બદલવા MySobo ટીમનો સંપર્ક કરો.", "मोबाइल नंबर बदलने के लिए MySobo टीम से संपर्क करें।"],
  "od.helpCopy": ["Answers to common questions from business owners.", "વ્યવસાય માલિકોના સામાન્ય પ્રશ્નોના જવાબ.", "व्यवसाय मालिकों के आम सवालों के जवाब।"],
  "od.faq1q": ["How long does verification take?", "ચકાસણીમાં કેટલો સમય લાગે છે?", "सत्यापन में कितना समय लगता है?"],
  "od.faq1a": ["Usually up to 2 working days. You will see the status change to Verified on your dashboard.", "સામાન્ય રીતે 2 કામકાજના દિવસ સુધી. તમારા ડેશબોર્ડ પર સ્થિતિ ‘ચકાસાયેલ’ થઈ જશે.", "आमतौर पर 2 कार्य दिवस तक। आपके डैशबोर्ड पर स्थिति ‘सत्यापित’ हो जाएगी।"],
  "od.faq2q": ["My business is already on MySobo. What do I do?", "મારો વ્યવસાય પહેલેથી MySobo પર છે. હું શું કરું?", "मेरा व्यवसाय पहले से MySobo पर है। मैं क्या करूँ?"],
  "od.faq2a": ["Open Claim business, search for it and press Claim. After the team confirms you are the owner, it appears under My businesses.", "‘વ્યવસાય ક્લેમ કરો’ ખોલો, તેને શોધો અને ‘ક્લેમ કરો’ દબાવો. તમે માલિક છો તેની ખાતરી થયા પછી તે ‘મારા વ્યવસાય’માં દેખાશે.", "‘व्यवसाय क्लेम करें’ खोलें, उसे खोजें और ‘क्लेम करें’ दबाएँ। आपके मालिक होने की पुष्टि के बाद वह ‘मेरे व्यवसाय’ में दिखेगा।"],
  "od.faq3q": ["When do residents see my offer?", "રહેવાસીઓને મારી ઓફર ક્યારે દેખાય?", "निवासियों को मेरा ऑफ़र कब दिखेगा?"],
  "od.faq3a": ["After MySobo approves it. Its status changes from Pending to Approved.", "MySobo મંજૂર કરે પછી. તેની સ્થિતિ ‘બાકી’ માંથી ‘મંજૂર’ થાય છે.", "MySobo की स्वीकृति के बाद। उसकी स्थिति ‘लंबित’ से ‘स्वीकृत’ हो जाती है।"],
  "od.faq4q": ["How do I pay for Pro or Premium?", "પ્રો અથવા પ્રીમિયમ માટે ચુકવણી કેવી રીતે કરું?", "प्रो या प्रीमियम के लिए भुगतान कैसे करूँ?"],
  "od.faq4a": ["Request the plan from Plans & billing. The MySobo team contacts you to confirm payment and then activates it.", "‘પ્લાન અને બિલિંગ’માંથી પ્લાનની વિનંતી કરો. MySobo ટીમ ચુકવણી માટે સંપર્ક કરશે અને પછી પ્લાન ચાલુ કરશે.", "‘प्लान और बिलिंग’ से प्लान का अनुरोध करें। MySobo टीम भुगतान के लिए संपर्क करेगी और फिर प्लान चालू करेगी।"],
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = LANGUAGES.find((item) => item.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="langMenu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="langButton"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("lang.label")}: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
        <span lang={current.code}>{current.short}</span>
      </button>
      {open && (
        <div className="langList" role="menu" aria-label={t("lang.label")}>
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              type="button"
              role="menuitemradio"
              aria-checked={lang === item.code}
              lang={item.code}
              className={lang === item.code ? "active" : ""}
              onClick={() => {
                setLang(item.code);
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              <span>{item.label}</span>
              {lang === item.code && (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

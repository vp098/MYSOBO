import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode, type FormEvent } from "react";
import { apiGet, type Business, type Category } from "./services/api";

const categorySeed: Category[] = [
  "Medical & health", "Tuition & coaching", "House help", "Schools",
  "Academies", "Daycare & elder care", "Home services", "Shopping",
  "Food & dining", "Property", "Cars & vehicles", "Weddings",
  "Transport", "Jobs & coworking", "Professional services",
  "Fitness", "Civic essentials", "Influencers",
].map((name, index) => ({
  id: String(index),
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  priority: index,
}));

const categoryIcons: Record<string, string> = {
  "Medical": "✚", "Tuition": "A", "House": "⌂", "Schools": "▦",
  "Academies": "◫", "Daycare": "♡", "Home": "⌂", "Shopping": "◎",
  "Food": "◉", "Property": "⌑", "Cars": "◇", "Weddings": "♦",
  "Transport": "↗", "Jobs": "J", "Professional": "⚖",
  "Fitness": "◉", "Civic": "★", "Influencers": "M",
};

function categoryIcon(name: string) {
  return categoryIcons[Object.keys(categoryIcons).find((key) => name.includes(key)) ?? ""] ?? "•";
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/mysobo" aria-label="MySobo home">
          <span className="brandMark">M</span>
          <span>MySobo</span>
        </a>
        <nav>
          <a href="/mysobo/explore">Explore</a>
          <a href="/mysobo/owner">For businesses</a>
          <a href="/mysobo/login" className="button buttonLight">Login</a>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

function SearchBox({ initial = "", large = false }: { initial?: string; large?: boolean }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);

  function submit(event: FormEvent) {
    event.preventDefault();
    navigate(`/mysobo/search?q=${encodeURIComponent(value.trim())}`);
  }

  return (
    <form className={`search ${large ? "searchLarge" : ""}`} onSubmit={submit}>
      <span aria-hidden="true">⌕</span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by service, business or area"
        aria-label="Search MySobo"
      />
      {large && <button type="submit">Search</button>}
    </form>
  );
}

function Home() {
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<Category[]>("/categories/"),
  });
  const { data: businessData } = useQuery({
    queryKey: ["businesses"],
    queryFn: () => apiGet<{ results: Business[] } | Business[]>("/businesses/"),
  });
  const businesses = Array.isArray(businessData) ? businessData : businessData?.results ?? [];

  return (
    <Shell>
      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">South Bopal, Ahmedabad</p>
          <h1>Find trusted help,<br />close to home.</h1>
          <SearchBox large />
          <div className="kindTabs" aria-label="Listing type">
            <a className="active" href="/mysobo/explore">Services</a>
            <a href="/mysobo/explore">Products</a>
            <a href="/mysobo/explore">Both</a>
          </div>
        </div>
        <div className="heroArt" aria-hidden="true">
          <div className="heroCircle"><span>Verified</span><strong>{businesses.length || "0"}</strong><span>local listings</span></div>
        </div>
      </section>

      <section className="section categorySection">
        <div className="sectionTitle">
          <div><p className="eyebrow">Explore</p><h2>Popular categories</h2></div>
          <a className="textLink" href="/mysobo/explore">View all <span>→</span></a>
        </div>
        <div className="categoryGrid">
          {(categories?.length ? categories : categorySeed).map((category) => (
            <a className="categoryCard" href={`/mysobo/c/${category.slug}`} key={category.id}>
              <span className="categoryIcon">{categoryIcon(category.name)}</span>
              <strong>{category.name}</strong>
              <span className="cardArrow">→</span>
            </a>
          ))}
        </div>
      </section>

      {businesses.length > 0 && (
        <section className="section">
          <div className="sectionTitle">
            <div><p className="eyebrow">Recommended</p><h2>Trusted nearby</h2></div>
          </div>
          <BusinessGrid businesses={businesses.slice(0, 6)} />
        </section>
      )}
    </Shell>
  );
}

function BusinessGrid({ businesses }: { businesses: Business[] }) {
  return (
    <div className="businessGrid">
      {businesses.map((business) => (
        <a className="businessCard" href={`/mysobo/b/${business.slug}`} key={business.id}>
          <div className="businessAvatar">{business.name.charAt(0)}</div>
          <div>
            <div className="businessNameRow">
              <strong>{business.name}</strong>
              {business.verification_level >= 2 && <span className="verifiedBadge" title="Verified">✓</span>}
            </div>
            <p>{business.description || `${business.kind} in South Bopal`}</p>
            {business.address && <small>{business.address}</small>}
          </div>
          <span className="cardArrow">→</span>
        </a>
      ))}
    </div>
  );
}

function Explore() {
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<Category[]>("/categories/"),
  });
  const { data: businessData } = useQuery({
    queryKey: ["businesses"],
    queryFn: () => apiGet<{ results: Business[] } | Business[]>("/businesses/"),
  });
  const businesses = Array.isArray(businessData) ? businessData : businessData?.results ?? [];
  return (
    <Shell>
      <section className="section pageHero">
        <p className="eyebrow">MySobo directory</p>
        <h1>Explore South Bopal</h1>
        <SearchBox />
      </section>
      <section className="section">
        <div className="categoryGrid">
          {(categories?.length ? categories : categorySeed).map((category) => (
            <a className="categoryCard" href={`/mysobo/c/${category.slug}`} key={category.id}>
              <span className="categoryIcon">{categoryIcon(category.name)}</span>
              <strong>{category.name}</strong>
              <span className="cardArrow">→</span>
            </a>
          ))}
        </div>
      </section>
      {businesses.length > 0 && (
        <section className="section">
          <div className="sectionTitle"><div><p className="eyebrow">All listings</p><h2>Businesses</h2></div></div>
          <BusinessGrid businesses={businesses} />
        </section>
      )}
    </Shell>
  );
}

function SearchResults() {
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const { data: businessData, isLoading } = useQuery({
    queryKey: ["search", query],
    queryFn: () => apiGet<{ results: Business[] } | Business[]>(`/businesses/${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  });
  const businesses = Array.isArray(businessData) ? businessData : businessData?.results ?? [];
  return (
    <Shell>
      <section className="section pageHero compact">
        <p className="eyebrow">Search</p>
        <h1>{query ? `Results for “${query}”` : "Find a local business"}</h1>
        <SearchBox initial={query} />
      </section>
      <section className="section">
        {isLoading ? <p className="emptyState">Searching…</p> : businesses.length ? (
          <BusinessGrid businesses={businesses} />
        ) : <p className="emptyState">No listings found. Try another service or area.</p>}
      </section>
    </Shell>
  );
}

function CategoryPage() {
  const { category } = useParams();
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<Category[]>("/categories/"),
  });
  const categoryRecord = categories?.find((item) => item.slug === category)
    ?? categorySeed.find((item) => item.slug === category);
  const title = categoryRecord?.name ?? category?.replace(/-/g, " ") ?? "Category";
  const { data: businessData, isLoading } = useQuery({
    queryKey: ["category-businesses", category],
    queryFn: () => apiGet<{ results: Business[] } | Business[]>(`/businesses/?category=${encodeURIComponent(category ?? "")}`),
  });
  const businesses = Array.isArray(businessData) ? businessData : businessData?.results ?? [];
  return (
    <Shell>
      <section className="section pageHero compact categoryHero">
        <p className="eyebrow">Category</p>
        <h1>{title}</h1>
        <SearchBox />
      </section>
      <section className="section">
        {isLoading ? <p className="emptyState">Loading listings…</p> : businesses.length ? (
          <BusinessGrid businesses={businesses} />
        ) : (
          <div className="emptyState">
            <span className="emptyIcon">{categoryIcon(title)}</span>
            <h2>No listings yet</h2>
            <p>Be the first to add a trusted local business in this category.</p>
            <a className="button" href="/mysobo/owner">Add a business</a>
          </div>
        )}
      </section>
    </Shell>
  );
}

function ListingPage() {
  const { slug } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => apiGet<Business>(`/businesses/${slug}/`),
  });
  return (
    <Shell>
      <section className="section listingPage">
        {isLoading ? <p className="emptyState">Loading…</p> : data ? (
          <div className="listingLayout">
            <div className="listingMain">
              <div className="listingAvatar">{data.name.charAt(0)}</div>
              <p className="eyebrow">South Bopal business</p>
              <div className="businessNameRow"><h1>{data.name}</h1>{data.verification_level >= 2 && <span className="verifiedBadge">✓</span>}</div>
              <p className="listingDescription">{data.description || "Trusted local listing in South Bopal."}</p>
              {data.address && <p className="listingAddress"><span>⌖</span>{data.address}</p>}
            </div>
            <aside className="listingActions">
              {data.phone && <a className="button" href={`tel:${data.phone}`}><span>☎</span> Call now</a>}
              {data.whatsapp && <a className="button whatsapp" href={`https://wa.me/${data.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><span>◉</span> WhatsApp</a>}
              <button type="button" className="button secondaryButton">♡ Save</button>
              <p>Information may change. Call before visiting.</p>
            </aside>
          </div>
        ) : <div className="emptyState"><h1>Listing not found</h1><a className="button" href="/mysobo/explore">Browse all listings</a></div>}
      </section>
    </Shell>
  );
}

function Owner() {
  return (
    <Shell>
      <section className="section pageHero">
        <p className="eyebrow">For businesses</p>
        <h1>Grow your local business</h1>
        <p>Claim or add your listing, collect customer trust, and manage your profile.</p>
        <a className="button" href="/mysobo/login">Get started</a>
      </section>
    </Shell>
  );
}

function Login() {
  return (
    <Shell>
      <section className="authSection">
        <div className="authCard">
          <p className="eyebrow">Welcome to MySobo</p>
          <h1>Log in</h1>
          <label>Mobile number<input placeholder="+91 98765 43210" inputMode="tel" /></label>
          <button className="button authButton" type="button">Continue</button>
        </div>
      </section>
    </Shell>
  );
}

function Admin() {
  return <Shell><section className="section"><p className="eyebrow">Super admin</p><h1>Operations console</h1></section></Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/mysobo" replace />} />
      <Route path="/mysobo" element={<Home />} />
      <Route path="/mysobo/explore" element={<Explore />} />
      <Route path="/mysobo/c/:category" element={<CategoryPage />} />
      <Route path="/mysobo/b/:slug" element={<ListingPage />} />
      <Route path="/mysobo/search" element={<SearchResults />} />
      <Route path="/mysobo/login" element={<Login />} />
      <Route path="/mysobo/owner" element={<Owner />} />
      <Route path="/mysobo/superadmin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/mysobo" replace />} />
    </Routes>
  );
}

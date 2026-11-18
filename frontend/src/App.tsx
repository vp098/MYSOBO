import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type Business, type Category } from "./services/api";

const categoriesSeed = [
  "Medical & health", "Tuition & coaching", "House help", "Schools",
  "Academies", "Daycare & elder care", "Home services", "Shopping",
  "Food & dining", "Property", "Cars & vehicles", "Weddings",
  "Transport", "Jobs & coworking", "Professional services",
  "Fitness", "Civic essentials", "Influencers",
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/mysobo">
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

function Home() {
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<Category[]>("/categories/"),
  });
  const { data: businesses } = useQuery({
    queryKey: ["businesses"],
    queryFn: () => apiGet<{ results: Business[] }>("/businesses/"),
  });

  return (
    <Shell>
      <section className="hero">
        <div>
          <p className="eyebrow">South Bopal, Ahmedabad</p>
          <h1>Find trusted help,<br />close to home.</h1>
          <label className="search">
            <span>Search</span>
            <input placeholder="Electrician, tuition, clinic..." />
          </label>
          <div className="kindTabs">
            <button className="active">Services</button>
            <button>Products</button>
          </div>
        </div>
        <div className="heroCard">
          <p>Verified nearby</p>
          <strong>{businesses?.results?.length ?? 0}</strong>
          <span>local listings</span>
        </div>
      </section>
      <section className="section">
        <div className="sectionTitle">
          <div><p className="eyebrow">Explore</p><h2>Popular categories</h2></div>
          <a href="/mysobo/explore">View all</a>
        </div>
        <div className="categoryGrid">
          {(categories?.length ? categories : categoriesSeed.map((name, i) => ({ id: String(i), name, slug: name, priority: i }))).map((category) => (
            <a className="categoryCard" href={`/mysobo/c/${category.slug}`} key={category.id}>
              <span className="categoryIcon">{category.name.charAt(0)}</span>
              <strong>{category.name}</strong>
            </a>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function Explore() {
  return <Shell><section className="section"><h1>Explore South Bopal</h1><p>Browse every service and product category.</p></section></Shell>;
}

function CategoryPage() {
  const { category } = useParams();
  return <Shell><section className="section"><p className="eyebrow">Category</p><h1>{category}</h1></section></Shell>;
}

function ListingPage() {
  const { slug } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["listing", slug],
    queryFn: async () => {
      const businesses = await apiGet<{ results: Business[] }>("/businesses/");
      return businesses.results.find((business) => business.slug === slug);
    },
  });
  return (
    <Shell>
      <section className="section">
        {isLoading ? <p>Loading...</p> : data ? (
          <>
            <p className="eyebrow">South Bopal business</p>
            <h1>{data.name}</h1>
            <p>{data.description || "Trusted local listing."}</p>
            {data.address && <p>{data.address}</p>}
            {data.phone && <a className="button" href={`tel:${data.phone}`}>Call</a>}
          </>
        ) : <h1>Listing not found</h1>}
      </section>
    </Shell>
  );
}

function Owner() {
  return <Shell><section className="section"><p className="eyebrow">Owner dashboard</p><h1>Grow your local business</h1><p>Sign in to manage listings, photos, offers and billing.</p></section></Shell>;
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
      <Route path="/mysobo/search" element={<Explore />} />
      <Route path="/mysobo/login" element={<Explore />} />
      <Route path="/mysobo/owner" element={<Owner />} />
      <Route path="/mysobo/superadmin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/mysobo" replace />} />
    </Routes>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body instanceof FormData) headers.delete("Content-Type");
  else headers.set("Content-Type", "application/json");
  const token = sessionStorage.getItem("mysobo-token");
  if (token) headers.set("Authorization", `Token ${token}`);
  const response = await fetch(`${API_BASE}/${path.replace(/^\/+/, "")}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `API request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string) {
  return apiRequest<T>(path);
}

export function apiPost<T>(path: string, data?: unknown) {
  return apiRequest<T>(path, {
    method: "POST",
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

export function apiPatch<T>(path: string, data: unknown) {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(data) });
}

export function apiPut<T>(path: string, data: unknown) {
  return apiRequest<T>(path, { method: "PUT", body: JSON.stringify(data) });
}

export function apiDelete<T>(path: string) {
  return apiRequest<T>(path, { method: "DELETE" });
}

export function apiUpload<T>(path: string, formData: FormData, method: "POST" | "PATCH" = "POST") {
  return apiRequest<T>(path, { method, body: formData });
}

export type Subcategory = {
  id: string;
  name: string;
  description: string;
  slug: string;
  parent_id: string | null;
  approved: boolean;
  active: boolean;
  priority: number;
  icon: string;
  icon_image: string;
  image: string;
  listing_count: number;
  supports_services: boolean;
  supports_products: boolean;
};

export type Category = {
  id: string;
  name: string;
  description: string;
  priority: number;
  slug: string;
  active: boolean;
  icon: string;
  icon_image: string;
  image: string;
  listing_count: number;
  fields: CategoryField[];
  supports_services: boolean;
  supports_products: boolean;
  subcategories: Subcategory[];
};

export type CategoryField = {
  id: string;
  key: string;
  label: string;
  field_type: "text" | "number" | "boolean" | "choice";
  options: string[];
  subcategory_id: string | null;
  applies_to: "service" | "product" | "both";
  required: boolean;
  filterable: boolean;
  active: boolean;
  priority: number;
};

export type ManagedCategory = Omit<Category, "listing_count" | "subcategories" | "fields">;
export type ManagedSubcategory = Omit<Subcategory, "listing_count"> & {
  category_id: string;
};
export type ManagedCategoryField = CategoryField & {
  category: string;
  subcategory: string | null;
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  kind: "service" | "product" | "both";
  category: Category | null;
  subcategory: Subcategory | null;
  description: string;
  phone: string;
  whatsapp: string;
  address: string | null;
  hide_address: boolean;
  verified: boolean;
  verification_level?: number;
  plan?: "free" | "pro" | "premium";
  plan_expires_on?: string | null;
  hidden?: boolean;
  approval_requested_at?: string | null;
  review_note?: string;
  created_at?: string;
  source?: string;
  email?: string;
  website?: string;
  logo?: string;
  cover_image?: string;
  photos?: string[];
  hours?: BusinessHour[];
  average_rating?: number | null;
  review_count?: number;
  category_data?: Record<string, string | number | boolean>;
};

export type BusinessHour = {
  dow: number;
  opens: string | null;
  closes: string | null;
  closed: boolean;
};

export type BusinessSummary = {
  id: string;
  slug: string;
  name: string;
  kind: Business["kind"];
  description: string;
  phone: string;
  whatsapp: string;
  address: string | null;
  verified: boolean;
  category_name: string;
  subcategory_name: string;
};

export type BusinessProduct = {
  id: string;
  business: BusinessSummary;
  category: Category;
  subcategory: Subcategory | null;
  name: string;
  brand: string;
  model: string;
  description: string;
  price: string | null;
  available: boolean;
  active: boolean;
  image: string;
  category_data: Record<string, string | number | boolean>;
};

export type BusinessService = {
  id: string;
  business: BusinessSummary;
  category: Category;
  subcategory: Subcategory | null;
  name: string;
  description: string;
  service_area: string;
  experience_years: number | null;
  price_min: string | null;
  price_max: string | null;
  available: boolean;
  active: boolean;
  category_data: Record<string, string | number | boolean>;
};

export type PortalUser = {
  id: string;
  username: string;
  mobile: string | null;
  email?: string;
  name?: string;
  is_superadmin: boolean;
};

export type Review = {
  id: string;
  rating: number;
  body: string;
  user_name: string;
  created_at: string;
  mine?: boolean;
};

/** Multipart upload that reports progress (fetch cannot report upload progress). */
export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress: (fraction: number) => void,
  method: "POST" | "PUT" = "POST",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_BASE}/${path.replace(/^\/+/, "")}`);
    const token = sessionStorage.getItem("mysobo-token");
    if (token) xhr.setRequestHeader("Authorization", `Token ${token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new Error((body as { detail?: string } | null)?.detail ?? `Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.send(formData);
  });
}

export type BusinessPhoto = {
  id: string;
  url: string;
  sort: number;
  is_cover: boolean;
  is_logo: boolean;
  size: number | null;
  created_at: string;
};

export type PhotoLibrary = { photos: BusinessPhoto[]; limit: number; plan: string; errors?: string[] };

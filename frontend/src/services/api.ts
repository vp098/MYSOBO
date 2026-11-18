const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export type Category = {
  id: string;
  name: string;
  priority: number;
  slug: string;
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  kind: "service" | "product" | "both";
  description: string;
  phone: string;
  whatsapp: string;
  address: string | null;
  hide_address: boolean;
  verification_level: number;
  plan: "free" | "pro" | "premium";
};

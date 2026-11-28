import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, type PortalUser } from "./services/api";

/** Every page path the app links to. Keep old paths only as redirects in App. */
export const ROUTES = {
  landing: "/sobo",
  discover: "/mysobo",
  app: "/sobo/app",
  resident: "/sobo/resident",
  residentSaved: "/sobo/resident/saved",
  owner: "/sobo/business-owner",
  admin: "/sobo/admin",
  business: (slug: string) => `/business/${encodeURIComponent(slug)}`,
} as const;

export const ME_KEY = ["me"] as const;

/** The signed-in user from the session cookie, or null for guests. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await apiGet<PortalUser>("/auth/me/");
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

/** Call after login or logout: refetches the user and everything that depends on them. */
export function useSessionChanged() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries();
  };
}

export type LoginResult = { ok: boolean; home: string };

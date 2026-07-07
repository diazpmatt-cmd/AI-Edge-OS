import { useAuth } from "@clerk/react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function apiFetch<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    ...restInit,
    headers: {
      "Content-Type": "application/json",
      ...(initHeaders as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function useApiFetch() {
  const { getToken } = useAuth();
  return async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken().catch(() => null);
    return apiFetch<T>(path, init, token);
  };
}

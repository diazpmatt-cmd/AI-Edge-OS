import { useCallback } from "react";
import { useAuth } from "@clerk/react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function isReferralListRequest(path: string, method?: string): boolean {
  return (method ?? "GET").toUpperCase() === "GET" && /^\/referrals(?:\?.*)?$/.test(path);
}

function normalizeReferralList<T>(path: string, method: string | undefined, body: unknown): T {
  if (!isReferralListRequest(path, method) || !Array.isArray(body)) return body as T;

  return body.map((row: Record<string, unknown>) => ({
    ...row,
    programId: row.programId ?? row.program_id ?? null,
    programName: row.programName ?? row.program_name ?? null,
    referrerName: row.referrerName ?? row.referrer_name ?? "",
    referrerEmail: row.referrerEmail ?? row.referrer_email ?? null,
    referrerPhone: row.referrerPhone ?? row.referrer_phone ?? null,
    referredName: row.referredName ?? row.referred_name ?? null,
    referredEmail: row.referredEmail ?? row.referred_email ?? null,
    referredPhone: row.referredPhone ?? row.referred_phone ?? null,
    rewardAmount: row.rewardAmount ?? row.reward_amount ?? null,
    referralCode: row.referralCode ?? row.referral_code ?? null,
    convertedAt: row.convertedAt ?? row.converted_at ?? null,
    paidAt: row.paidAt ?? row.paid_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  })) as T;
}

export async function apiFetch<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const referralListRequest = isReferralListRequest(path, init?.method);
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    ...restInit,
    ...(referralListRequest ? { cache: "no-store" as RequestCache } : {}),
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
  const body = await res.json();
  return normalizeReferralList<T>(path, init?.method, body);
}

export function useApiFetch() {
  const { getToken } = useAuth();
  return useCallback(async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken().catch(() => null);
    return apiFetch<T>(path, init, token);
  }, [getToken]);
}

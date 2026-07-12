import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { queryKeys } from "../query-keys";

vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn().mockResolvedValue("test-token") })),
}));

function makeQueryWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

// ── 1. queryKeys factory ────────────────────────────────────────────────────

describe("queryKeys factory", () => {
  describe("leads", () => {
    it("all returns ['leads']", () => {
      expect(queryKeys.leads.all).toEqual(["leads"]);
    });
    it("key is structurally stable across accesses", () => {
      expect(queryKeys.leads.all).toEqual(queryKeys.leads.all);
    });
  });

  describe("socialPosts", () => {
    it("all returns ['social-posts']", () => {
      expect(queryKeys.socialPosts.all).toEqual(["social-posts"]);
    });
  });

  describe("callIntelligence", () => {
    it("period('30days') returns ['call-intelligence', '30days']", () => {
      expect(queryKeys.callIntelligence.period("30days")).toEqual(["call-intelligence", "30days"]);
    });
    it("period('today') returns ['call-intelligence', 'today']", () => {
      expect(queryKeys.callIntelligence.period("today")).toEqual(["call-intelligence", "today"]);
    });
    it("different periods produce different keys", () => {
      expect(queryKeys.callIntelligence.period("30days")).not.toEqual(
        queryKeys.callIntelligence.period("today"),
      );
    });
    it("same period produces equal key arrays", () => {
      expect(queryKeys.callIntelligence.period("30days")).toEqual(
        queryKeys.callIntelligence.period("30days"),
      );
    });
  });
});

// ── 2. Cache sharing — hooks with same key share one entry ──────────────────

describe("cache sharing via canonical keys", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("two useLeadsQuery callers share one fetch — only one network request", async () => {
    const payload = { leads: [], stats: { total: 0, active: 0, thisMonth: 0, withMessages: 0 } };
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const { qc, Wrapper } = makeQueryWrapper();
    const { useLeadsQuery } = await import("../../hooks/useLeadsQuery");

    const { result: r1 } = renderHook(() => useLeadsQuery(), { wrapper: Wrapper });
    const { result: r2 } = renderHook(() => useLeadsQuery(), { wrapper: Wrapper });

    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(r1.current.data).toEqual(r2.current.data);
    qc.clear();
  });

  it("two useSocialPostsQuery callers share one fetch", async () => {
    const payload = [{ id: "1", platforms: ["facebook"], caption: "Hello", captionFacebook: null, captionGoogle: null, scheduledAt: null, status: "published", publishedAt: null, createdAt: new Date().toISOString() }];
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const { qc, Wrapper } = makeQueryWrapper();
    const { useSocialPostsQuery } = await import("../../hooks/useSocialPostsQuery");

    const { result: r1 } = renderHook(() => useSocialPostsQuery(), { wrapper: Wrapper });
    const { result: r2 } = renderHook(() => useSocialPostsQuery(), { wrapper: Wrapper });

    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(r1.current.data).toEqual(r2.current.data);
    qc.clear();
  });

  it("call-intelligence with different periods uses separate cache entries", async () => {
    const thirtyDaysPayload = { metrics: { total_calls: 50, missed_calls: 5, transferred_calls: 2, sms_conversations: 10, leads_captured: 3, recovery_rate: 0.6 }, recent_activity: [] };
    const todayPayload      = { metrics: { total_calls: 3,  missed_calls: 1, transferred_calls: 0, sms_conversations: 1,  leads_captured: 0, recovery_rate: null }, recent_activity: [] };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(thirtyDaysPayload), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(todayPayload),      { status: 200, headers: { "Content-Type": "application/json" } }));

    const { qc, Wrapper } = makeQueryWrapper();
    const { useCallIntelligenceQuery } = await import("../../hooks/useCallIntelligenceQuery");

    const { result: r30 } = renderHook(() => useCallIntelligenceQuery("30days"), { wrapper: Wrapper });
    const { result: rToday } = renderHook(() => useCallIntelligenceQuery("today"), { wrapper: Wrapper });

    await waitFor(() => expect(r30.current.isSuccess).toBe(true));
    await waitFor(() => expect(rToday.current.isSuccess).toBe(true));

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
    expect(r30.current.data?.metrics.total_calls).toBe(50);
    expect(rToday.current.data?.metrics.total_calls).toBe(3);
    qc.clear();
  });
});

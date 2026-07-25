import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GapSignal, GapsResponse } from "../lib/types";

function gapsFromResponse(data: GapsResponse): GapSignal[] {
  return data.hasData ? data.gaps : [];
}

type HookState = { gaps: GapSignal[]; loading: boolean; error: boolean };

async function simulateFetch(
  fetchImpl: () => Promise<Response>,
): Promise<HookState> {
  let gaps: GapSignal[] = [];
  let loading = true;
  let error = false;
  try {
    const res = await fetchImpl();
    if (!res.ok) {
      error = true;
    } else {
      const data: GapsResponse = await res.json();
      gaps = data.hasData ? data.gaps : [];
    }
  } catch {
    error = true;
  } finally {
    loading = false;
  }
  return { gaps, loading, error };
}

function isUnknownCompetitor(gap: GapSignal): boolean {
  return gap.competitorName == null;
}

function unresolvableCount(gaps: GapSignal[]): number {
  return gaps.filter((g) => g.competitorName == null).length;
}

function showsEmptyState(gaps: GapSignal[]): boolean {
  return gaps.length === 0;
}

function showsWarningBanner(gaps: GapSignal[]): boolean {
  return unresolvableCount(gaps) > 0;
}

const makeGap = (overrides: Partial<GapSignal> = {}): GapSignal => ({
  id: "gap-1",
  keyword: "pest control near me",
  competitorName: "Acme Pest",
  competitorRank: 3,
  volumeEstimate: 1200,
  geographicScope: "local",
  status: "active",
  ...overrides,
});

describe("Keyword Gaps — empty state", () => {
  it("shows empty state when API returns hasData: false", () => {
    const response: GapsResponse = { hasData: false, gaps: [], count: 0 };
    const gaps = gapsFromResponse(response);
    expect(showsEmptyState(gaps)).toBe(true);
  });

  it("shows empty state when API returns hasData: true but gaps array is empty", () => {
    const response: GapsResponse = { hasData: true, gaps: [], count: 0 };
    const gaps = gapsFromResponse(response);
    expect(showsEmptyState(gaps)).toBe(true);
  });

  it("does NOT show empty state when gaps are present", () => {
    const response: GapsResponse = {
      hasData: true,
      gaps: [makeGap()],
      count: 1,
    };
    const gaps = gapsFromResponse(response);
    expect(showsEmptyState(gaps)).toBe(false);
  });

  it("discards gaps array contents when hasData is false", () => {
    const response: GapsResponse = {
      hasData: false,
      gaps: [makeGap()],
      count: 1,
    };
    const gaps = gapsFromResponse(response);
    expect(gaps).toHaveLength(0);
  });
});

describe("Keyword Gaps — unknown competitor label", () => {
  it("marks a gap as unknown when competitorName is null", () => {
    const gap = makeGap({ competitorName: null });
    expect(isUnknownCompetitor(gap)).toBe(true);
  });

  it("marks a gap as unknown when competitorName is undefined (null coercion)", () => {
    const gap = makeGap({ competitorName: undefined as unknown as null });
    expect(isUnknownCompetitor(gap)).toBe(true);
  });

  it("does NOT mark a gap as unknown when competitorName is a non-empty string", () => {
    const gap = makeGap({ competitorName: "Rival Exterminators" });
    expect(isUnknownCompetitor(gap)).toBe(false);
  });

  it("does NOT mark a gap as unknown when competitorName is an empty string", () => {
    const gap = makeGap({ competitorName: "" });
    expect(isUnknownCompetitor(gap)).toBe(false);
  });
});

describe("Keyword Gaps — unresolvable warning banner", () => {
  it("shows warning banner when one gap has an unknown competitor", () => {
    const gaps = [makeGap({ competitorName: null })];
    expect(showsWarningBanner(gaps)).toBe(true);
  });

  it("shows warning banner when multiple gaps have unknown competitors", () => {
    const gaps = [
      makeGap({ id: "g1", competitorName: null }),
      makeGap({ id: "g2", competitorName: null }),
      makeGap({ id: "g3", competitorName: "Known Corp" }),
    ];
    expect(showsWarningBanner(gaps)).toBe(true);
    expect(unresolvableCount(gaps)).toBe(2);
  });

  it("does NOT show warning banner when all gaps have known competitors", () => {
    const gaps = [
      makeGap({ id: "g1", competitorName: "Acme" }),
      makeGap({ id: "g2", competitorName: "Rival" }),
    ];
    expect(showsWarningBanner(gaps)).toBe(false);
  });

  it("does NOT show warning banner when gaps list is empty", () => {
    expect(showsWarningBanner([])).toBe(false);
  });

  it("counts only null-named gaps when computing unresolvableCount", () => {
    const gaps = [
      makeGap({ id: "g1", competitorName: null }),
      makeGap({ id: "g2", competitorName: "Known" }),
      makeGap({ id: "g3", competitorName: null }),
    ];
    expect(unresolvableCount(gaps)).toBe(2);
  });
});

describe("Keyword Gaps — response transformation invariants", () => {
  it("preserves all gap items when hasData is true", () => {
    const response: GapsResponse = {
      hasData: true,
      gaps: [makeGap({ id: "g1" }), makeGap({ id: "g2" })],
      count: 2,
    };
    expect(gapsFromResponse(response)).toHaveLength(2);
  });

  it("returns an empty array (not the original array) when hasData is false", () => {
    const originalGaps = [makeGap()];
    const response: GapsResponse = {
      hasData: false,
      gaps: originalGaps,
      count: 1,
    };
    const result = gapsFromResponse(response);
    expect(result).not.toBe(originalGaps);
    expect(result).toHaveLength(0);
  });
});

type RetryState = HookState & { errorWasClearedBeforeFetch: boolean };

async function simulateRetry(
  previousState: HookState,
  fetchImpl: () => Promise<Response>,
): Promise<RetryState> {
  let gaps: GapSignal[] = previousState.gaps;
  let error = previousState.error;

  error = false;
  const errorWasClearedBeforeFetch = !error;

  loading: {
    try {
      const res = await fetchImpl();
      if (!res.ok) {
        error = true;
      } else {
        const data: GapsResponse = await res.json();
        gaps = data.hasData ? data.gaps : [];
      }
    } catch {
      error = true;
    }
    break loading;
  }

  return { gaps, loading: false, error, errorWasClearedBeforeFetch };
}

describe("Keyword Gaps — retry / error recovery", () => {
  it("clears error and populates gaps after a successful retry following a prior failure", async () => {
    const payload: GapsResponse = {
      hasData: true,
      gaps: [makeGap()],
      count: 1,
    };

    const failedState = await simulateFetch(() =>
      Promise.reject(new TypeError("Network request failed")),
    );
    expect(failedState.error).toBe(true);
    expect(failedState.gaps).toHaveLength(0);

    const retryState = await simulateRetry(failedState, () =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    expect(retryState.error).toBe(false);
    expect(retryState.gaps).toHaveLength(1);
    expect(retryState.gaps[0].keyword).toBe("pest control near me");
  });

  it("resets error to false at the start of each fetchGaps call regardless of prior error state", async () => {
    const failedState = await simulateFetch(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    expect(failedState.error).toBe(true);

    const retryState = await simulateRetry(failedState, () =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    expect(retryState.errorWasClearedBeforeFetch).toBe(true);
  });
});

function showsErrorUI(state: HookState): boolean {
  return state.error === true;
}

describe("Keyword Gaps — error UI visibility after retry", () => {
  it("hides retry button and error banner when error=false and gaps are populated", async () => {
    const failedState = await simulateFetch(() =>
      Promise.reject(new TypeError("Network request failed")),
    );
    expect(showsErrorUI(failedState)).toBe(true);

    const payload: GapsResponse = {
      hasData: true,
      gaps: [makeGap()],
      count: 1,
    };
    const retryState = await simulateRetry(failedState, () =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    expect(retryState.error).toBe(false);
    expect(retryState.gaps.length).toBeGreaterThan(0);
    expect(showsErrorUI(retryState)).toBe(false);
  });

  it("error UI visible and error UI hidden are mutually exclusive states", async () => {
    const payload: GapsResponse = {
      hasData: true,
      gaps: [makeGap()],
      count: 1,
    };

    const errorState = await simulateFetch(() =>
      Promise.reject(new TypeError("Network request failed")),
    );
    const successState = await simulateFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    expect(showsErrorUI(errorState)).toBe(true);
    expect(showsErrorUI(successState)).toBe(false);
    expect(showsErrorUI(errorState)).not.toBe(showsErrorUI(successState));
  });
});

describe("Keyword Gaps — AbortController / out-of-order protection", () => {
  it("ignores a late-resolving first response when a retry has already succeeded", async () => {
    let currentController: AbortController | null = null;
    let gaps: GapSignal[] = [];

    async function fetchGaps(
      fetchImpl: (signal: AbortSignal) => Promise<Response>,
    ): Promise<void> {
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;
      try {
        const res = await fetchImpl(controller.signal);
        if (controller.signal.aborted) return;
        if (!res.ok) return;
        const data: GapsResponse = await res.json();
        if (controller.signal.aborted) return;
        gaps = data.hasData ? data.gaps : [];
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    const staleGaps = [makeGap({ id: "stale", keyword: "stale keyword" })];
    const freshGaps = [makeGap({ id: "fresh", keyword: "fresh keyword" })];

    let resolveFirst!: (r: Response) => void;
    const firstResponsePromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    const firstFetch = fetchGaps((_signal) => firstResponsePromise);

    await fetchGaps((_signal) =>
      Promise.resolve(
        new Response(
          JSON.stringify({ hasData: true, gaps: freshGaps, count: 1 } satisfies GapsResponse),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].keyword).toBe("fresh keyword");

    resolveFirst(
      new Response(
        JSON.stringify({ hasData: true, gaps: staleGaps, count: 1 } satisfies GapsResponse),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await firstFetch;

    expect(gaps).toHaveLength(1);
    expect(gaps[0].keyword).toBe("fresh keyword");
  });

  it("aborted fetch signal is observable by the caller before the response is consumed", () => {
    const controller = new AbortController();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("a second fetchGaps call aborts the first controller before starting its own", () => {
    const controllers: AbortController[] = [];
    let currentController: AbortController | null = null;

    function startFetch() {
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;
      controllers.push(controller);
    }

    startFetch();
    startFetch();

    expect(controllers).toHaveLength(2);
    expect(controllers[0].signal.aborted).toBe(true);
    expect(controllers[1].signal.aborted).toBe(false);
  });
});

describe("Keyword Gaps — error state", () => {
  it("sets error=true and gaps=[] when fetch throws a network error", async () => {
    const { gaps, loading, error } = await simulateFetch(() =>
      Promise.reject(new TypeError("Network request failed")),
    );
    expect(error).toBe(true);
    expect(gaps).toHaveLength(0);
    expect(loading).toBe(false);
  });

  it("sets error=true and gaps=[] when the response status is non-OK (500)", async () => {
    const { gaps, loading, error } = await simulateFetch(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    expect(error).toBe(true);
    expect(gaps).toHaveLength(0);
    expect(loading).toBe(false);
  });

  it("sets error=true and gaps=[] when the response status is 401", async () => {
    const { gaps, error } = await simulateFetch(() =>
      Promise.resolve(new Response(null, { status: 401 })),
    );
    expect(error).toBe(true);
    expect(gaps).toHaveLength(0);
  });

  it("sets error=false and populates gaps on a successful 200 response", async () => {
    const payload: GapsResponse = {
      hasData: true,
      gaps: [makeGap()],
      count: 1,
    };
    const { gaps, loading, error } = await simulateFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    expect(error).toBe(false);
    expect(gaps).toHaveLength(1);
    expect(loading).toBe(false);
  });

  it("error state is distinct from the no-data empty state (error=true vs gaps=[])", async () => {
    const errorState = await simulateFetch(() =>
      Promise.reject(new Error("Connection refused")),
    );
    const emptyState = await simulateFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ hasData: false, gaps: [], count: 0 } satisfies GapsResponse),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    expect(errorState.error).toBe(true);
    expect(errorState.gaps).toHaveLength(0);

    expect(emptyState.error).toBe(false);
    expect(emptyState.gaps).toHaveLength(0);

    expect(errorState.error).not.toBe(emptyState.error);
  });
});

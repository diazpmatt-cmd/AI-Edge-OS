/**
 * Component-level rendering tests for the mobile Keywords → Gaps view.
 *
 * Uses vitest + @testing-library/react with React Native primitives mocked as
 * equivalent DOM elements so the component tree renders in jsdom without a
 * native runtime.
 *
 * Covers three acceptance criteria:
 *   1. "No gaps found yet" empty state when API returns hasData:false OR errors
 *   2. "Unknown competitor" label + alert-triangle icon when competitorName is null
 *   3. Unresolvable warning banner when unresolvableCount > 0
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { GapSignal, GapsResponse } from "../lib/types";

// ── React Native + ecosystem mocks ────────────────────────────────────────────
// vi.mock is hoisted — all helpers must live inside factories (no outer refs).

vi.mock("react-native", () => {
  const R = require("react");

  function omitStyle(props: Record<string, unknown>): Record<string, unknown> {
    const { style: _s, ...rest } = props;
    return rest;
  }

  return {
    View: (props: Record<string, unknown>) =>
      R.createElement("div", omitStyle(props), props.children),
    Text: (props: Record<string, unknown>) =>
      R.createElement("span", omitStyle(props), props.children),
    ScrollView: (props: Record<string, unknown>) =>
      R.createElement("div", omitStyle(props), props.children),
    FlatList: (props: {
      data?: unknown[];
      renderItem?: (arg: { item: unknown }) => R.ReactNode;
      ListEmptyComponent?: R.ReactNode;
      keyExtractor?: (item: unknown, i: number) => string;
      contentContainerStyle?: unknown;
      refreshControl?: R.ReactNode;
      scrollEnabled?: boolean;
      showsVerticalScrollIndicator?: boolean;
    }) => {
      if (!props.data || props.data.length === 0) {
        return R.createElement("div", {}, props.ListEmptyComponent ?? null);
      }
      return R.createElement(
        "div",
        {},
        props.data.map((item, i) =>
          R.createElement(
            "div",
            { key: props.keyExtractor ? props.keyExtractor(item, i) : i },
            props.renderItem?.({ item }) ?? null,
          ),
        ),
      );
    },
    Pressable: (props: Record<string, unknown>) => {
      const { onPress, children, style: _s, hitSlop: _h, accessibilityRole: _ar, accessibilityLabel: _al, ...rest } = props;
      return R.createElement("button", { onClick: onPress, ...rest }, children);
    },
    TextInput: (props: Record<string, unknown>) => {
      const { style: _s, clearButtonMode: _cbm, autoCapitalize: _ac, ...rest } = props;
      return R.createElement("input", rest);
    },
    RefreshControl: () => null,
    StyleSheet: { create: (s: unknown) => s },
    Platform: { OS: "web" },
    Linking: { openURL: vi.fn() },
    useColorScheme: () => "light",
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => ({
  Feather: ({ name }: { name: string; style?: unknown; size?: number; color?: string }) => {
    const R = require("react");
    return R.createElement("span", { "data-icon": name }, name);
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  useListKeywords: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
  customFetch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  customFetch: vi.fn(),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    foreground: "#000",
    card: "#f5f5f5",
    border: "#e0e0e0",
    muted: "#f0f0f0",
    mutedForeground: "#888",
    primary: "#00AEEF",
    success: "#16a34a",
    warning: "#d97706",
    destructive: "#dc2626",
    radius: 12,
  }),
}));

// ── Component + mocked module imports (must come after all vi.mock calls) ─────

import KeywordsScreen from "../app/(tabs)/keywords";
import * as libApi from "../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGap(overrides: Partial<GapSignal> = {}): GapSignal {
  return {
    id: "gap-1",
    keyword: "pest control near me",
    competitorName: "Acme Pest",
    competitorRank: 3,
    volumeEstimate: 1200,
    geographicScope: "local",
    status: "active",
    ...overrides,
  };
}

function customFetchMock() {
  return vi.mocked(libApi.customFetch);
}

function resolveWith(data: GapsResponse) {
  customFetchMock().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function resolveError() {
  customFetchMock().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
}

function rejectWith(err: Error) {
  customFetchMock().mockRejectedValue(err);
}

async function renderAndSwitchToGaps() {
  render(<KeywordsScreen />);
  const gapsBtn = screen.getByText("Gaps");
  await act(async () => {
    fireEvent.click(gapsBtn);
  });
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe("Gaps view — empty state", () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders "No gaps found yet" when API returns hasData: false', async () => {
    resolveWith({ hasData: false, gaps: [], count: 0 });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("No gaps found yet")).toBeTruthy();
    });
  });

  it('renders "No gaps found yet" when hasData: true but gaps array is empty', async () => {
    resolveWith({ hasData: true, gaps: [], count: 0 });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("No gaps found yet")).toBeTruthy();
    });
  });

  it('renders "No gaps found yet" when API returns a non-OK response (error path)', async () => {
    resolveError();
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("No gaps found yet")).toBeTruthy();
    });
  });

  it('renders "No gaps found yet" when the fetch throws a network error', async () => {
    rejectWith(new Error("Network error"));
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("No gaps found yet")).toBeTruthy();
    });
  });

  it("does NOT show the empty state when gaps are present", async () => {
    resolveWith({ hasData: true, gaps: [makeGap()], count: 1 });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.queryByText("No gaps found yet")).toBeNull();
    });
  });
});

describe("Gaps view — unknown competitor label", () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders "Unknown competitor" when competitorName is null', async () => {
    resolveWith({
      hasData: true,
      gaps: [makeGap({ competitorName: null })],
      count: 1,
    });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("Unknown competitor")).toBeTruthy();
    });
  });

  it("renders the alert-triangle icon alongside the unknown competitor label", async () => {
    resolveWith({
      hasData: true,
      gaps: [makeGap({ competitorName: null })],
      count: 1,
    });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      const icon = document.querySelector("[data-icon='alert-triangle']");
      expect(icon).not.toBeNull();
    });
  });

  it("renders the competitor name instead of unknown label when competitorName is set", async () => {
    resolveWith({
      hasData: true,
      gaps: [makeGap({ competitorName: "Rival Pest Co" })],
      count: 1,
    });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("Rival Pest Co")).toBeTruthy();
      expect(screen.queryByText("Unknown competitor")).toBeNull();
    });
  });
});

describe("Gaps view — unresolvable warning banner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the banner when one gap has a null competitor", async () => {
    resolveWith({
      hasData: true,
      gaps: [makeGap({ id: "g1", competitorName: null })],
      count: 1,
    });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("1 gap with unknown competitor")).toBeTruthy();
    });
  });

  it("pluralises banner correctly for multiple unresolvable gaps", async () => {
    resolveWith({
      hasData: true,
      gaps: [
        makeGap({ id: "g1", competitorName: null }),
        makeGap({ id: "g2", competitorName: null }),
        makeGap({ id: "g3", competitorName: "Known Corp" }),
      ],
      count: 3,
    });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("2 gaps with unknown competitor")).toBeTruthy();
    });
  });

  it("does NOT render the banner when all competitors are resolved", async () => {
    resolveWith({
      hasData: true,
      gaps: [
        makeGap({ id: "g1", competitorName: "Acme" }),
        makeGap({ id: "g2", competitorName: "Rival" }),
      ],
      count: 2,
    });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.queryByText(/gap.*with unknown competitor/)).toBeNull();
    });
  });

  it("does NOT render the banner in the empty state (hasData: false)", async () => {
    resolveWith({ hasData: false, gaps: [], count: 0 });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("No gaps found yet")).toBeTruthy();
      expect(screen.queryByText(/gap.*with unknown competitor/)).toBeNull();
    });
  });
});

describe("Gaps segment badge — error vs. real count", () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows "—" in the Gaps badge when the fetch returns a non-OK response', async () => {
    resolveError();
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("—")).toBeTruthy();
    });
  });

  it('shows "—" in the Gaps badge when the fetch throws a network error', async () => {
    rejectWith(new Error("Network failure"));
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("—")).toBeTruthy();
    });
  });

  it("shows the real count in the Gaps badge when data loads successfully", async () => {
    resolveWith({
      hasData: true,
      gaps: [makeGap({ id: "g1" }), makeGap({ id: "g2" }), makeGap({ id: "g3" })],
      count: 3,
    });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getByText("3")).toBeTruthy();
    });
  });

  it('shows 0 in the Gaps badge (not "—") when API returns hasData:false — no error, just no data', async () => {
    resolveWith({ hasData: false, gaps: [], count: 0 });
    await renderAndSwitchToGaps();
    await waitFor(() => {
      expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("—")).toBeNull();
    });
  });
});

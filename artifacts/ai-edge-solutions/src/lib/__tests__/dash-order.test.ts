import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSavedDashOrder,
  saveDashOrder,
  clearDashOrder,
  DASHBOARD_ORDER_LS_KEY,
  type DashTile,
} from "../dashboard-order";

const TILES: DashTile[] = [
  { id: "tile-a", label: "Tile A", icon: "🅰", link: "/admin/a", color: "#22C55E" },
  { id: "tile-b", label: "Tile B", icon: "🅱", link: "/admin/b", color: "#3B82F6" },
  { id: "tile-c", label: "Tile C", icon: "🅲", link: "/admin/c", color: "#F59E0B" },
  { id: "tile-d", label: "Tile D", icon: "🅳", link: "/admin/d", color: "#EF4444" },
];

function setLS(value: string) { localStorage.setItem(DASHBOARD_ORDER_LS_KEY, value); }
function ids(items: DashTile[]) { return items.map(t => t.id); }

// ── 1. Default order ──────────────────────────────────────────────────────────
describe("loadSavedDashOrder — default order", () => {
  beforeEach(() => localStorage.clear());

  it("returns default order when localStorage is empty", () => {
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });

  it("returns default order when key is missing", () => {
    localStorage.removeItem(DASHBOARD_ORDER_LS_KEY);
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });
});

// ── 2. Saved order restored ───────────────────────────────────────────────────
describe("loadSavedDashOrder — saved order is restored", () => {
  beforeEach(() => localStorage.clear());

  it("restores a saved order exactly", () => {
    setLS(JSON.stringify(["tile-c", "tile-a", "tile-d", "tile-b"]));
    expect(ids(loadSavedDashOrder(TILES))).toEqual(["tile-c", "tile-a", "tile-d", "tile-b"]);
  });

  it("restores a partial saved order and appends the rest in canonical order", () => {
    setLS(JSON.stringify(["tile-b", "tile-d"]));
    const result = ids(loadSavedDashOrder(TILES));
    expect(result.slice(0, 2)).toEqual(["tile-b", "tile-d"]);
    expect(result).toContain("tile-a");
    expect(result).toContain("tile-c");
    expect(result).toHaveLength(TILES.length);
  });
});

// ── 3. Invalid JSON falls back safely ─────────────────────────────────────────
describe("loadSavedDashOrder — corrupt storage fallback", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to default on malformed JSON", () => {
    setLS("not-valid-json{{{");
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });

  it("falls back to default when parsed value is an object", () => {
    setLS(JSON.stringify({ ids: ["tile-a"] }));
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });

  it("falls back to default when parsed value is null", () => {
    setLS(JSON.stringify(null));
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });

  it("falls back to default when parsed value is a number", () => {
    setLS(JSON.stringify(42));
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });
});

// ── 4. Unknown tile IDs are stripped ─────────────────────────────────────────
describe("loadSavedDashOrder — unknown IDs stripped", () => {
  beforeEach(() => localStorage.clear());

  it("strips unknown IDs from saved order", () => {
    setLS(JSON.stringify(["tile-a", "tile-REMOVED", "tile-b", "tile-c", "tile-d"]));
    const result = loadSavedDashOrder(TILES);
    expect(ids(result)).not.toContain("tile-REMOVED");
    expect(result).toHaveLength(TILES.length);
  });

  it("returns default when all saved IDs are unknown", () => {
    setLS(JSON.stringify(["tile-GONE1", "tile-GONE2"]));
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });

  it("ignores non-string entries in saved array", () => {
    setLS(JSON.stringify(["tile-a", 99, null, "tile-b", "tile-c", "tile-d"]));
    const result = loadSavedDashOrder(TILES);
    expect(result).toHaveLength(TILES.length);
    expect(ids(result)).not.toContain(99);
  });
});

// ── 5. Duplicate IDs are collapsed ───────────────────────────────────────────
describe("loadSavedDashOrder — duplicate IDs collapsed", () => {
  beforeEach(() => localStorage.clear());

  it("keeps first occurrence of a duplicate ID", () => {
    setLS(JSON.stringify(["tile-a", "tile-b", "tile-a", "tile-c", "tile-d"]));
    const result = ids(loadSavedDashOrder(TILES));
    expect(result.filter(id => id === "tile-a")).toHaveLength(1);
    expect(result).toHaveLength(TILES.length);
  });
});

// ── 6. Newly added tiles appended ────────────────────────────────────────────
describe("loadSavedDashOrder — newly added tiles appended", () => {
  beforeEach(() => localStorage.clear());

  it("appends tiles not present in saved order to the end", () => {
    setLS(JSON.stringify(["tile-a", "tile-c"]));
    const result = ids(loadSavedDashOrder(TILES));
    expect(result[0]).toBe("tile-a");
    expect(result[1]).toBe("tile-c");
    const tail = result.slice(2);
    expect(tail).toContain("tile-b");
    expect(tail).toContain("tile-d");
  });

  it("handles fully empty saved array by returning all tiles", () => {
    setLS(JSON.stringify([]));
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });
});

// ── 7. Reset restores default ─────────────────────────────────────────────────
describe("clearDashOrder — reset restores default order", () => {
  beforeEach(() => localStorage.clear());

  it("clearDashOrder removes the key from localStorage", () => {
    saveDashOrder(TILES);
    clearDashOrder();
    expect(localStorage.getItem(DASHBOARD_ORDER_LS_KEY)).toBeNull();
  });

  it("loadSavedDashOrder returns default after clearDashOrder", () => {
    saveDashOrder([TILES[2], TILES[1], TILES[0], TILES[3]]);
    clearDashOrder();
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(TILES));
  });
});

// ── 8. Save and restore round-trip ───────────────────────────────────────────
describe("saveDashOrder — round-trip persistence", () => {
  beforeEach(() => localStorage.clear());

  it("saves only tile IDs to localStorage", () => {
    saveDashOrder(TILES);
    const raw = localStorage.getItem(DASHBOARD_ORDER_LS_KEY);
    expect(JSON.parse(raw!)).toEqual(ids(TILES));
  });

  it("saves a reordered list correctly", () => {
    const reordered: DashTile[] = [TILES[2], TILES[0], TILES[3], TILES[1]];
    saveDashOrder(reordered);
    const raw = localStorage.getItem(DASHBOARD_ORDER_LS_KEY);
    expect(JSON.parse(raw!)).toEqual(["tile-c", "tile-a", "tile-d", "tile-b"]);
  });

  it("saved reordering is correctly restored by loadSavedDashOrder", () => {
    const reordered: DashTile[] = [TILES[3], TILES[2], TILES[0], TILES[1]];
    saveDashOrder(reordered);
    expect(ids(loadSavedDashOrder(TILES))).toEqual(ids(reordered));
  });
});

// ── 9. DASHBOARD_ORDER_LS_KEY is stable ──────────────────────────────────────
describe("DASHBOARD_ORDER_LS_KEY", () => {
  it("uses the expected versioned key", () => {
    expect(DASHBOARD_ORDER_LS_KEY).toBe("ai-edge:command-center-layout:v1");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSavedOrder,
  saveNavOrder,
  clearNavOrder,
  NAV_ORDER_LS_KEY,
  type NavItem,
} from "../nav-order";

const NAV: NavItem[] = [
  { to: "/admin/a", icon: "🅰", label: "A", bg: "#000", accent: "#fff" },
  { to: "/admin/b", icon: "🅱", label: "B", bg: "#000", accent: "#fff" },
  { to: "/admin/c", icon: "🅲", label: "C", bg: "#000", accent: "#fff" },
  { to: "/admin/d", icon: "🅳", label: "D", bg: "#000", accent: "#fff" },
];

function setLS(value: string) { localStorage.setItem(NAV_ORDER_LS_KEY, value); }
function routes(items: NavItem[]) { return items.map(n => n.to); }

// ── 1. Default order ──────────────────────────────────────────────────────────
describe("loadSavedOrder — default order", () => {
  beforeEach(() => localStorage.clear());

  it("returns default order when localStorage is empty", () => {
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });

  it("returns default order when key is missing (not null-safe crash)", () => {
    localStorage.removeItem(NAV_ORDER_LS_KEY);
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });
});

// ── 2. Saved order restored ───────────────────────────────────────────────────
describe("loadSavedOrder — saved order is restored", () => {
  beforeEach(() => localStorage.clear());

  it("restores a saved order exactly", () => {
    setLS(JSON.stringify(["/admin/c", "/admin/a", "/admin/d", "/admin/b"]));
    expect(routes(loadSavedOrder(NAV))).toEqual(["/admin/c", "/admin/a", "/admin/d", "/admin/b"]);
  });

  it("restores a partial saved order and appends the rest", () => {
    setLS(JSON.stringify(["/admin/b", "/admin/d"]));
    const result = routes(loadSavedOrder(NAV));
    expect(result.slice(0, 2)).toEqual(["/admin/b", "/admin/d"]);
    expect(result).toContain("/admin/a");
    expect(result).toContain("/admin/c");
    expect(result).toHaveLength(NAV.length);
  });
});

// ── 3. Invalid JSON falls back safely ─────────────────────────────────────────
describe("loadSavedOrder — invalid JSON fallback", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to default when JSON is malformed", () => {
    setLS("not-valid-json{{{");
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });

  it("falls back to default when parsed value is an object", () => {
    setLS(JSON.stringify({ routes: ["/admin/a"] }));
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });

  it("falls back to default when parsed value is null", () => {
    setLS(JSON.stringify(null));
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });

  it("falls back to default when parsed value is a number", () => {
    setLS(JSON.stringify(42));
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });
});

// ── 4. Unknown routes are ignored ─────────────────────────────────────────────
describe("loadSavedOrder — unknown routes ignored", () => {
  beforeEach(() => localStorage.clear());

  it("strips unknown routes from saved order", () => {
    setLS(JSON.stringify(["/admin/a", "/admin/REMOVED", "/admin/b", "/admin/c", "/admin/d"]));
    const result = loadSavedOrder(NAV);
    expect(routes(result)).not.toContain("/admin/REMOVED");
    expect(result).toHaveLength(NAV.length);
  });

  it("returns default when all saved IDs are unknown", () => {
    setLS(JSON.stringify(["/admin/GONE1", "/admin/GONE2"]));
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });

  it("ignores non-string entries in saved array", () => {
    setLS(JSON.stringify(["/admin/a", 99, null, "/admin/b", "/admin/c", "/admin/d"]));
    const result = loadSavedOrder(NAV);
    expect(result).toHaveLength(NAV.length);
    expect(routes(result)).not.toContain(99);
  });
});

// ── 5. Newly added routes appended ───────────────────────────────────────────
describe("loadSavedOrder — newly added routes appended", () => {
  beforeEach(() => localStorage.clear());

  it("appends routes not present in saved order to the end", () => {
    setLS(JSON.stringify(["/admin/a", "/admin/c"]));
    const result = routes(loadSavedOrder(NAV));
    expect(result[0]).toBe("/admin/a");
    expect(result[1]).toBe("/admin/c");
    const tail = result.slice(2);
    expect(tail).toContain("/admin/b");
    expect(tail).toContain("/admin/d");
  });

  it("handles fully empty saved array by returning all items (all treated as new)", () => {
    setLS(JSON.stringify([]));
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });
});

// ── 6. Reset restores default ─────────────────────────────────────────────────
describe("clearNavOrder — reset restores default order", () => {
  beforeEach(() => localStorage.clear());

  it("clearNavOrder removes the key from localStorage", () => {
    saveNavOrder(NAV);
    clearNavOrder();
    expect(localStorage.getItem(NAV_ORDER_LS_KEY)).toBeNull();
  });

  it("loadSavedOrder returns default after clearNavOrder", () => {
    saveNavOrder([NAV[2], NAV[1], NAV[0], NAV[3]]);
    clearNavOrder();
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(NAV));
  });
});

// ── 7. Reordering updates localStorage ───────────────────────────────────────
describe("saveNavOrder — reordering updates localStorage", () => {
  beforeEach(() => localStorage.clear());

  it("saves only route IDs to localStorage", () => {
    saveNavOrder(NAV);
    const raw = localStorage.getItem(NAV_ORDER_LS_KEY);
    expect(JSON.parse(raw!)).toEqual(routes(NAV));
  });

  it("saves a reordered list correctly", () => {
    const reordered: NavItem[] = [NAV[2], NAV[0], NAV[3], NAV[1]];
    saveNavOrder(reordered);
    const raw = localStorage.getItem(NAV_ORDER_LS_KEY);
    expect(JSON.parse(raw!)).toEqual(["/admin/c", "/admin/a", "/admin/d", "/admin/b"]);
  });

  it("saved reordering is correctly restored by loadSavedOrder", () => {
    const reordered: NavItem[] = [NAV[3], NAV[2], NAV[0], NAV[1]];
    saveNavOrder(reordered);
    expect(routes(loadSavedOrder(NAV))).toEqual(routes(reordered));
  });
});

// ── 8. NAV_ORDER_LS_KEY is stable ────────────────────────────────────────────
describe("NAV_ORDER_LS_KEY", () => {
  it("uses the expected stable key", () => {
    expect(NAV_ORDER_LS_KEY).toBe("ai-edge-command-center-order-v1");
  });
});

// ── Dashboard Quick-Actions Order ─────────────────────────────────────────────
// Persists the user's chosen ordering for Command Center quick-action tiles.
// Mirrors the pattern from nav-order.ts; designed so Clerk metadata can replace
// localStorage later by swapping just the load/save helpers.

export const DASHBOARD_ORDER_LS_KEY = "ai-edge-dash-actions-v1";

export interface DashTile {
  id:    string;
  label: string;
  icon:  string;
  link:  string;
  color: string;
}

/**
 * Loads the saved order from localStorage, falling back to `defaults`.
 * - Unknown IDs are stripped.
 * - Duplicate IDs are collapsed.
 * - Tiles added to `defaults` after a save are appended at the end.
 * - Any corrupt JSON silently falls back to `defaults`.
 */
export function loadSavedDashOrder(defaults: DashTile[]): DashTile[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_ORDER_LS_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return defaults;
    const byId = new Map(defaults.map(d => [d.id, d]));
    const seen = new Set<string>();
    const ordered: DashTile[] = [];
    for (const entry of saved) {
      if (typeof entry === "string" && byId.has(entry) && !seen.has(entry)) {
        ordered.push(byId.get(entry)!);
        seen.add(entry);
      }
    }
    for (const d of defaults) {
      if (!seen.has(d.id)) ordered.push(d);
    }
    return ordered;
  } catch {
    return defaults;
  }
}

export function saveDashOrder(items: DashTile[]): void {
  localStorage.setItem(DASHBOARD_ORDER_LS_KEY, JSON.stringify(items.map(d => d.id)));
}

export function clearDashOrder(): void {
  localStorage.removeItem(DASHBOARD_ORDER_LS_KEY);
}

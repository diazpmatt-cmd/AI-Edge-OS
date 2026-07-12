// ── Command Center Layout Order ────────────────────────────────────────────────
// Persists the user's chosen ordering for the Command Center quick-action tiles.
// Mirrors the pattern from nav-order.ts; designed so Clerk metadata can replace
// localStorage later by swapping just the load/save helpers.

export const DASHBOARD_ORDER_LS_KEY = "ai-edge:command-center-layout:v1";

export interface DashTile {
  id:    string;
  label: string;
  icon:  string;
  link:  string;
  color: string;
}

/**
 * Loads the saved order from localStorage, falling back to `defaults`.
 *
 * Normalization rules (all applied before returning):
 *   - unknown IDs are stripped
 *   - duplicate IDs are collapsed (first occurrence wins)
 *   - tiles newly added to `defaults` after a save are appended at the end
 *   - any corrupt or non-array JSON silently falls back to `defaults`
 *   - if localStorage is unavailable, `defaults` is returned
 */
export function loadSavedDashOrder(defaults: DashTile[]): DashTile[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_ORDER_LS_KEY);
    if (!raw) return defaults;
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return defaults;
    const byId  = new Map(defaults.map(d => [d.id, d]));
    const seen  = new Set<string>();
    const ordered: DashTile[] = [];
    for (const entry of saved) {
      if (typeof entry === "string" && byId.has(entry) && !seen.has(entry)) {
        ordered.push(byId.get(entry)!);
        seen.add(entry);
      }
    }
    // Append any tiles added to defaults after this save
    for (const d of defaults) {
      if (!seen.has(d.id)) ordered.push(d);
    }
    return ordered;
  } catch {
    return defaults;
  }
}

/** Persists the reordered tile IDs (stable IDs only, never full objects). */
export function saveDashOrder(items: DashTile[]): void {
  try {
    localStorage.setItem(DASHBOARD_ORDER_LS_KEY, JSON.stringify(items.map(d => d.id)));
  } catch {
    // Ignore quota / private-browsing errors — order is still applied in memory
  }
}

/** Removes the saved order so the default is used on next load. */
export function clearDashOrder(): void {
  try {
    localStorage.removeItem(DASHBOARD_ORDER_LS_KEY);
  } catch {
    // ignore
  }
}

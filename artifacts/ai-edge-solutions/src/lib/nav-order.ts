export const NAV_ORDER_LS_KEY = "ai-edge-command-center-order-v1";

export interface NavItem {
  to:     string;
  icon:   string;
  label:  string;
  bg:     string;
  accent: string;
}

/**
 * Loads a saved tile order from localStorage.
 * - Ignores unknown routes (removed tiles)
 * - Appends newly added routes not present in the saved list
 * - Falls back silently to defaultNav if data is missing or corrupt
 */
export function loadSavedOrder(defaultNav: NavItem[]): NavItem[] {
  try {
    const raw = localStorage.getItem(NAV_ORDER_LS_KEY);
    if (!raw) return defaultNav;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultNav;
    const byRoute = new Map(defaultNav.map(n => [n.to, n]));
    const validIds = parsed.filter((id): id is string => typeof id === "string" && byRoute.has(id));
    const ordered  = validIds.map(id => byRoute.get(id)!);
    const seen     = new Set(validIds);
    const missing  = defaultNav.filter(n => !seen.has(n.to));
    return [...ordered, ...missing];
  } catch {
    return defaultNav;
  }
}

/** Persists the reordered tile IDs to localStorage (routes only, never full objects). */
export function saveNavOrder(items: NavItem[]): void {
  try {
    localStorage.setItem(NAV_ORDER_LS_KEY, JSON.stringify(items.map(n => n.to)));
  } catch {
    // ignore quota / private-browsing errors
  }
}

/** Removes the saved order so the default is used on next load. */
export function clearNavOrder(): void {
  try {
    localStorage.removeItem(NAV_ORDER_LS_KEY);
  } catch {
    // ignore
  }
}

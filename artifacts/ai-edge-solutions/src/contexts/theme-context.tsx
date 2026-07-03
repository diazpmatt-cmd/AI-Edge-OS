import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

export type ThemeColors = {
  bg: string;
  panel: string;
  card: string;
  cardSubtle: string;
  cardHover: string;
  border: string;
  borderStrong: string;
  text: string;
  text2: string;
  text3: string;
  inputBg: string;
  inputBorder: string;
  shadow: string;
  tableRow: string;
  tableRowAlt: string;
  tableHead: string;
};

const DARK: ThemeColors = {
  bg:          "#030612",
  panel:       "#0B1629",
  card:        "#0D1829",
  cardSubtle:  "rgba(0,174,239,0.04)",
  cardHover:   "rgba(255,255,255,0.03)",
  border:      "rgba(0,174,239,0.1)",
  borderStrong:"rgba(0,174,239,0.22)",
  text:        "#FFFFFF",
  text2:       "#94A3B8",
  text3:       "#64748B",
  inputBg:     "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.12)",
  shadow:      "0 4px 24px rgba(0,0,0,0.4)",
  tableRow:    "rgba(255,255,255,0.02)",
  tableRowAlt: "transparent",
  tableHead:   "rgba(0,174,239,0.06)",
};

const LIGHT: ThemeColors = {
  bg:          "#F5F7FA",
  panel:       "#FFFFFF",
  card:        "#FFFFFF",
  cardSubtle:  "#F8FAFC",
  cardHover:   "#F1F5F9",
  border:      "#DDE3EA",
  borderStrong:"#B8C4D0",
  text:        "#0F172A",
  text2:       "#475569",
  text3:       "#94A3B8",
  inputBg:     "#FFFFFF",
  inputBorder: "#DDE3EA",
  shadow:      "0 2px 12px rgba(0,0,0,0.08)",
  tableRow:    "#F8FAFC",
  tableRowAlt: "#FFFFFF",
  tableHead:   "#EEF2F7",
};

export const THEME_COLORS: Record<Theme, ThemeColors> = { dark: DARK, light: LIGHT };

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  colors: ThemeColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  colors: DARK,
  isDark: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("ae-theme");
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("ae-theme", t); } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.style.background = THEME_COLORS[theme].bg;
    document.body.style.transition = "background 0.25s";
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors: THEME_COLORS[theme], isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

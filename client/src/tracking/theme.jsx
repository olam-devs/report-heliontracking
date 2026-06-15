import { createContext, useContext, useMemo } from "react";

const helionMintDeep = "#3daf7a";

export const themes = {
  light: {
    bg: "#f0f4f8",
    panel: "#ffffff",
    panelBright: "#f8fafc",
    border: "#dce3eb",
    accent: helionMintDeep,
    accentAlt: "#5ecf9a",
    accentSoft: "rgba(61, 175, 122, 0.12)",
    green: "#2e7d32",
    greenSoft: "rgba(46, 125, 50, 0.1)",
    red: "#d32f2f",
    redSoft: "rgba(211, 47, 47, 0.08)",
    orange: "#ed6c02",
    text: "#1a2332",
    textSoft: "#5c6b7a",
    muted: "#7a8a99",
  },
};

export const ThemeContext = createContext({ t: themes.light });

export function ThemeProvider({ children }) {
  const t = themes.light;
  const value = useMemo(() => ({ t }), [t]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

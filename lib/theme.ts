// Theme preference lives in localStorage (per device). <html data-theme> always holds the resolved "light" | "dark".
export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "wsp-theme";

/** Inlined in <head> so the theme is applied before first paint, and follows the OS while set to "system". */
export const themeScript = `(function(){
  var m = window.matchMedia("(prefers-color-scheme: dark)");
  function apply(){
    var p; try { p = localStorage.getItem("${THEME_KEY}"); } catch (e) {}
    var dark = p === "dark" || (p !== "light" && m.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  apply();
  m.addEventListener("change", apply);
  window.__applyTheme = apply;
})();`;

export function getThemePref(): ThemePref {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  (window as any).__applyTheme?.();
}

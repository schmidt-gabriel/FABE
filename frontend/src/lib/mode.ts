// Two apps in one: the CNPJ side (everything under "/") and the Pessoa Física
// side (everything under "/pf"), swapped by the switch at the top of the
// sidebar. They share the database; the PF collections carry the `_invest`
// suffix.
//
// The mode is derived from the route, never held in state, so the two can
// never disagree. localStorage only remembers which side to land on after a
// reload.

export type Mode = "pj" | "pf";

const KEY = "app_mode";

export const modeOf = (pathname: string): Mode =>
  pathname === "/pf" || pathname.startsWith("/pf/") ? "pf" : "pj";

export const savedMode = (): Mode => (localStorage.getItem(KEY) === "pf" ? "pf" : "pj");

export const saveMode = (mode: Mode) => localStorage.setItem(KEY, mode);

export const modeHome = (mode: Mode) => (mode === "pf" ? "/pf" : "/");

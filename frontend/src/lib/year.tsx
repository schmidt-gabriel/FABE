import { createContext, useContext, useState, type ReactNode } from "react";

// Global year filter, selected in the sidebar and applied across pages
// (Overview, Remessas, Notas Fiscais, Despesas, Distribuição de Lucros).

const FIRST_YEAR = 2023; // first year with data

export function yearOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= FIRST_YEAR; y--) years.push(y);
  return years;
}

const YearContext = createContext<{ year: number; setYear: (y: number) => void }>({
  year: new Date().getFullYear(),
  setYear: () => {},
});

export function YearProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState(() => {
    const saved = Number(localStorage.getItem("app_year"));
    const current = new Date().getFullYear();
    return saved >= FIRST_YEAR && saved <= current ? saved : current;
  });
  const setYear = (y: number) => {
    localStorage.setItem("app_year", String(y));
    setYearState(y);
  };
  return <YearContext.Provider value={{ year, setYear }}>{children}</YearContext.Provider>;
}

export function useYear() {
  return useContext(YearContext);
}

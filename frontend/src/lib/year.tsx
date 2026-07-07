import { createContext, useContext, useState, type ReactNode } from "react";

// Global year + month filters, selected in the sidebar and applied across
// pages (Visão geral, Remessas, Notas Fiscais, Despesas).

const FIRST_YEAR = 2023; // first year with data

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function yearOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= FIRST_YEAR; y--) years.push(y);
  return years;
}

// Month filter, "01".."12". Defaults to the current month in the current year
// and to December in past years.
const defaultMonth = (year: number) =>
  year === new Date().getFullYear()
    ? String(new Date().getMonth() + 1).padStart(2, "0")
    : "12";

const initialYear = () => {
  const saved = Number(localStorage.getItem("app_year"));
  const current = new Date().getFullYear();
  return saved >= FIRST_YEAR && saved <= current ? saved : current;
};

const YearContext = createContext<{
  year: number;
  setYear: (y: number) => void;
  month: string;
  setMonth: (m: string) => void;
}>({
  year: new Date().getFullYear(),
  setYear: () => {},
  month: "01",
  setMonth: () => {},
});

export function YearProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState(initialYear);
  const [month, setMonth] = useState(() => defaultMonth(initialYear()));
  const setYear = (y: number) => {
    localStorage.setItem("app_year", String(y));
    setYearState(y);
    // Switching year resets the month (this month, or December in past years).
    setMonth(defaultMonth(y));
  };
  return (
    <YearContext.Provider value={{ year, setYear, month, setMonth }}>
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  return useContext(YearContext);
}

import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { pb } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import { MONTHS, useYear, yearOptions } from "../lib/year";
import { applyTheme, getInitialTheme, type Theme } from "../lib/theme";

// Pages driven by the sidebar month filter, separated from the annual ones.
const navMonthly = [
  { to: "/", label: "Visão geral", end: true },
  { to: "/remessas", label: "Remessas" },
  { to: "/importacoes", label: "Notas Fiscais" },
  { to: "/despesas", label: "Despesas" },
];
const navAnnual = [
  { to: "/lucros", label: "Distribuição de Lucros" },
  { to: "/impostos", label: "Impostos" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium ${
    isActive
      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
  }`;

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme());
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }
  const icon =
    theme === "dark" ? (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </>
    ) : (
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    );
  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      title="Alternar tema"
      className="w-fit rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
    </button>
  );
}

export default function Layout() {
  const { year, setYear, month, setMonth } = useYear();
  // Same pattern as the Overview dropdown: don't offer future months in the
  // current year.
  const now = new Date();
  const maxMonth = year === now.getFullYear() ? now.getMonth() : 11;

  // Re-render when the auth record changes (e.g. email edited in Config →
  // Usuário) so the sidebar shows the current email.
  const [, setAuthTick] = useState(0);
  useEffect(() => pb.authStore.onChange(() => setAuthTick((t) => t + 1)), []);

  // settings is a singleton and has no `created` field, so override the default
  // sort (-created would 400).
  const settings = useCollection<{ id: string; cnpj?: string }>("settings", {
    sort: "-updated",
  });
  const cnpj = settings.list.data?.[0]?.cnpj;
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex">
        <aside className="sticky top-0 flex h-screen w-56 flex-col border-r border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="px-2 py-3">
            <h1 className="text-lg font-semibold">Finance · CNPJ</h1>
            {cnpj && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{cnpj}</p>
            )}
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {pb.authStore.record?.email}
            </p>
          </div>
          <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />
          <div className="px-2 pb-1">
            <label className="mb-1 block text-xs font-medium text-neutral-400 dark:text-neutral-500">
              Ano
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="px-2 pb-1 pt-2">
            <label className="mb-1 block text-xs font-medium text-neutral-400 dark:text-neutral-500">
              Mês
            </label>
            {/* Months listed newest-first so the current month is always on
                top, mirroring the Overview dropdown. */}
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {MONTHS.slice(0, maxMonth + 1)
                .map((name, i) => (
                  <option key={name} value={String(i + 1).padStart(2, "0")}>
                    {name}
                  </option>
                ))
                .reverse()}
            </select>
          </div>
          <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />
          <nav className="flex-1 space-y-1">
            {navMonthly.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
            <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />
            {navAnnual.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-800">
            <NavLink to="/config" className={linkClass}>
              Config
            </NavLink>
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  pb.authStore.clear();
                  location.reload();
                }}
                className="rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                Sair
              </button>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { pb } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import { MONTHS, useYear, yearOptions } from "../lib/year";
import { applyTheme, getInitialTheme, type Theme } from "../lib/theme";
import { modeHome, modeOf, saveMode, type Mode } from "../lib/mode";

// Pages driven by the sidebar month filter, separated from the annual ones.
const navMonthly = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/remessas", label: "Remessas", newTo: "/remessas?new=1" },
  { to: "/importacoes", label: "Notas Fiscais", newTo: "/importacoes?new=1" },
  { to: "/despesas", label: "Despesas", newTo: "/despesas?new=1" },
];
const navAnnual = [
  { to: "/lucros", label: "Distribuição de Lucros", newTo: "/lucros?new=1" },
  { to: "/impostos", label: "Impostos" },
];

// Pessoa Física: a separate app sharing the same DB (collections suffixed
// `_invest`). It has no month/year filter, so its nav is a single list.
const navPF = [
  { to: "/pf", label: "Investimentos", end: true, newTo: "/pf?new=1" },
];

type NavItem = { to: string; label: string; end?: boolean; newTo?: string };

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg py-2 pl-3 pr-8 text-sm font-medium ${
    isActive
      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
  }`;

// Each row that can create a record carries a "+" at its right edge. It is
// hidden until the pointer is over the row (or the button takes keyboard
// focus, so it stays reachable without a mouse) and goes solid on hover. It
// sits beside the link, not inside it, so the two targets stay separate.
function NavRow({ item }: { item: NavItem }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
  return (
    <div className="group relative">
      <NavLink to={item.to} end={item.end} className={linkClass}>
        {item.label}
      </NavLink>
      {item.newTo && (
        <button
          onClick={() => navigate(item.newTo!)}
          aria-label={`Novo registro em ${item.label}`}
          title={`Novo registro em ${item.label}`}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-0 transition group-hover:opacity-50 hover:opacity-100 focus-visible:opacity-100 ${
            active
              ? "text-white hover:bg-white/20 dark:text-neutral-900 dark:hover:bg-black/15"
              : "text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
    </div>
  );
}

// PJ / PF switch, at the very top of the page. It just navigates: the mode is
// read back from the route (see lib/mode.ts).
function ModeSwitch({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const options: { key: Mode; label: string }[] = [
    { key: "pj", label: "CNPJ" },
    { key: "pf", label: "Pessoa Física" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Modalidade"
      className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800"
    >
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={mode === o.key}
          onClick={() => {
            saveMode(o.key);
            navigate(modeHome(o.key));
          }}
          className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
            mode === o.key
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
  // Which side of the app is on screen. Derived from the route, and remembered
  // so a reload lands on the same side.
  const mode = modeOf(useLocation().pathname);
  useEffect(() => saveMode(mode), [mode]);
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
          <div className="px-1 pb-2 pt-1">
            <ModeSwitch mode={mode} />
          </div>
          <div className="px-2 pb-3 pt-1">
            <h1 className="text-lg font-semibold">
              {mode === "pf" ? "Finance · PF" : "Finance · CNPJ"}
            </h1>
            {mode === "pj" && cnpj && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{cnpj}</p>
            )}
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {pb.authStore.record?.email}
            </p>
          </div>
          <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />
          {/* The month/year filter only drives the CNPJ pages. */}
          {mode === "pj" && (
          <>
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
          </>
          )}
          <nav className="flex-1 space-y-1">
            {mode === "pf" ? (
              navPF.map((item) => <NavRow key={item.to} item={item} />)
            ) : (
              <>
                {navMonthly.map((item) => (
                  <NavRow key={item.to} item={item} />
                ))}
                <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />
                {navAnnual.map((item) => (
                  <NavRow key={item.to} item={item} />
                ))}
              </>
            )}
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

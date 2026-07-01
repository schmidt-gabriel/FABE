import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { pb } from "../lib/pb";
import { applyTheme, getInitialTheme, type Theme } from "../lib/theme";

const nav = [
  { to: "/", label: "Visão geral", end: true },
  { to: "/remessas", label: "Remessas" },
  { to: "/importacoes", label: "Notas Fiscais" },
  { to: "/despesas", label: "Despesas" },
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
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex">
        <aside className="sticky top-0 flex h-screen w-56 flex-col border-r border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="px-2 py-3">
            <h1 className="text-lg font-semibold">Finance · CNPJ</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {pb.authStore.record?.email}
            </p>
          </div>
          <nav className="mt-2 flex-1 space-y-1">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
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

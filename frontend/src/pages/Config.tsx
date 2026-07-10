import { useState } from "react";
import Clients from "./Clients";
import Platforms from "./Platforms";
import RecurringServices from "./RecurringServices";
import Export from "./Export";
import Account from "./Account";
import Maintenance from "./Maintenance";

const TABS = [
  { key: "clientes", label: "Clientes" },
  { key: "plataformas", label: "Plataformas" },
  { key: "vencimentos", label: "Vencimentos" },
  { key: "rotinas", label: "Rotinas" },
  { key: "dados", label: "Dados" },
  { key: "usuario", label: "Usuário" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function Config() {
  const [tab, setTab] = useState<TabKey>("clientes");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>

      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clientes" && <Clients />}
      {tab === "plataformas" && <Platforms />}
      {tab === "vencimentos" && <RecurringServices />}
      {tab === "rotinas" && <Maintenance />}
      {tab === "dados" && <Export />}
      {tab === "usuario" && <Account />}
    </div>
  );
}

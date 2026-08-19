import { useEffect, useState } from "react";
import { brl } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import {
  DEFAULT_CONFIG,
  MAX_MONTHS,
  horizon,
  kindLabel,
  liquidityLabel,
  simulateOne,
  type InvestKind,
  type SimConfig,
  type SimResult,
} from "../lib/invest";
import { Button, Card, Field, Input, Select } from "./ui";

// Shared pieces of the Pessoa Física module: the global simulation inputs
// (persisted in the `settings_invest` singleton, so both PF pages read the same
// numbers) and the result card both pages render.

type InvestSettings = {
  id: string;
  cdi_rate?: number;
  amount?: number;
  months?: number;
};

/**
 * The global config (CDI, valor, prazo), kept in local state and written back
 * to `settings_invest` with a debounce: the prazo slider fires on every pixel.
 */
export function useSimConfig() {
  const { list, create, update } = useCollection<InvestSettings>("settings_invest", {
    // singleton: no `created` field, so the default -created sort would 400.
    sort: "-updated",
  });
  const record = list.data?.[0];
  const [cfg, setCfg] = useState<SimConfig | null>(null);

  // Adopt the stored values once, when they arrive.
  useEffect(() => {
    if (cfg || !list.isSuccess) return;
    setCfg({
      cdi: record?.cdi_rate ?? DEFAULT_CONFIG.cdi,
      amount: record?.amount ?? DEFAULT_CONFIG.amount,
      months: record?.months ?? DEFAULT_CONFIG.months,
    });
  }, [list.isSuccess, record, cfg]);

  useEffect(() => {
    if (!cfg || !list.isSuccess) return;
    if (
      record &&
      record.cdi_rate === cfg.cdi &&
      record.amount === cfg.amount &&
      record.months === cfg.months
    ) {
      return;
    }
    const data = { cdi_rate: cfg.cdi, amount: cfg.amount, months: cfg.months };
    const timer = setTimeout(() => {
      if (record) update.mutate({ id: record.id, data });
      else create.mutate(data);
    }, 700);
    return () => clearTimeout(timer);
    // The mutations are stable enough for this; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, record, list.isSuccess]);

  return { cfg: cfg ?? DEFAULT_CONFIG, setCfg, ready: cfg !== null };
}

// CDI, valor a investir e prazo, os parâmetros de uma classe de ativo.
function ConfigFields({
  cfg,
  onChange,
}: {
  cfg: SimConfig;
  onChange: (c: SimConfig) => void;
}) {
  return (
    <>
      <Field label="CDI (% a.a.)">
        <Input
          type="number"
          step="0.01"
          min={0}
          value={cfg.cdi}
          onChange={(e) => onChange({ ...cfg, cdi: Number(e.target.value) })}
        />
      </Field>
      <Field label="Valor a investir">
        <Input
          type="number"
          step="100"
          min={0}
          value={cfg.amount}
          onChange={(e) => onChange({ ...cfg, amount: Number(e.target.value) })}
        />
      </Field>
      <Field label={`Prazo: ${cfg.months} ${cfg.months === 1 ? "mês" : "meses"}`}>
        <input
          type="range"
          min={1}
          max={MAX_MONTHS}
          step={1}
          value={cfg.months}
          onChange={(e) => onChange({ ...cfg, months: Number(e.target.value) })}
          className="h-9 w-full accent-neutral-900 dark:accent-neutral-100"
        />
      </Field>
    </>
  );
}

/**
 * A seção Renda fixa da Simulação, em um card só: os parâmetros em cima e,
 * abaixo da linha, uma taxa digitada na hora com o resultado ao lado. Responde
 * direto "valor X a 102% do CDI em 2 anos rende quanto" sem cadastrar nada; a
 * lista cadastrada, quando existe, aparece embaixo só para comparar.
 */
export function RendaFixaCard({
  cfg,
  onChange,
}: {
  cfg: SimConfig;
  onChange: (c: SimConfig) => void;
}) {
  const [cdiPct, setCdiPct] = useState("102");
  const [kind, setKind] = useState<InvestKind>("cdb");

  const r = simulateOne(
    { id: "quick", name: "", kind, cdi_pct: Number(cdiPct) || 0, liquidity: "daily" },
    cfg,
    horizon(cfg.months),
  );

  return (
    <Card className="p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <ConfigFields cfg={cfg} onChange={onChange} />
      </div>

      <div className="my-4 border-t border-neutral-100 dark:border-neutral-800" />

      <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_2fr]">
        <Field label="Taxa (% do CDI)">
          <Input
            type="number"
            step="0.1"
            min={0}
            value={cdiPct}
            onChange={(e) => setCdiPct(e.target.value)}
          />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as InvestKind)}>
            <option value="cdb">CDB (IR regressivo)</option>
            <option value="lci_lca">LCI/LCA (isento)</option>
          </Select>
        </Field>
        {/* O resultado encosta na borda direita do card: é o que se lê primeiro. */}
        <div className="pb-1 text-right">
          <p className="text-3xl font-semibold tabular-nums">{brl(r.net)}</p>
          <p className="mt-0.5 text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
            + {brl(r.netGain)} líquido
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
            {r.netCdiPct.toFixed(1)}% do CDI líquido
            {r.taxRate > 0 && ` · IR ${(r.taxRate * 100).toFixed(1)}%`}
          </p>
        </div>
      </div>
    </Card>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "win" | "warn";
}) {
  const styles = {
    neutral:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    win: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400",
  }[tone];
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {children}
    </span>
  );
}

/**
 * One investment with its simulated outcome. `best` paints the winner; the
 * action slot is what the Investimentos page uses for editar/excluir.
 */
export function ResultCard({
  result,
  best = false,
  actions,
}: {
  result: SimResult;
  best?: boolean;
  actions?: React.ReactNode;
}) {
  const { investment: inv } = result;
  return (
    <Card
      className={`flex flex-col p-4 ${
        best ? "ring-2 ring-emerald-500 dark:ring-emerald-500" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold leading-tight">{inv.name}</h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {kindLabel(inv.kind)} · {inv.cdi_pct}% do CDI
          </p>
        </div>
        {best && <Badge tone="win">✓ Melhor</Badge>}
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-2xl font-semibold tabular-nums">{brl(result.net)}</p>
        <p className="text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
          + {brl(result.netGain)} líquido
        </p>
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {result.netCdiPct.toFixed(1)}% do CDI líquido
          {result.taxRate > 0 && ` · IR ${(result.taxRate * 100).toFixed(1)}%`}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge>{liquidityLabel(inv.liquidity)}</Badge>
        {inv.maturity && <Badge>Vence {inv.maturity.slice(0, 10).split("-").reverse().join("/")}</Badge>}
        {result.maturesEarly && (
          <Badge tone="warn">Vence antes: reinveste à mesma taxa</Badge>
        )}
        {result.lockedPastHorizon && <Badge tone="warn">Sem resgate no prazo</Badge>}
      </div>

      {actions && (
        <div className="mt-4 flex justify-end gap-1 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          {actions}
        </div>
      )}
    </Card>
  );
}

/** Empty state shared by both PF pages. */
export function NoInvestments({ onAdd }: { onAdd?: () => void }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Nenhum investimento cadastrado.
      </p>
      {onAdd && (
        <Button className="mt-4" onClick={onAdd}>
          + Adicionar
        </Button>
      )}
    </Card>
  );
}

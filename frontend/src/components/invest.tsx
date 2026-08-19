import { useEffect, useState } from "react";
import { brl } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import {
  DEFAULT_CONFIG,
  MAX_MONTHS,
  horizon,
  kindLabel,
  liquidityLabel,
  equivalentTaxFreePct,
  yieldOf,
  type Position,
  type SimConfig,
  type Yield,
} from "../lib/invest";
import { fmtDate, pct } from "../lib/pb";
import { Button, Card, Field, Input } from "./ui";

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
 * A seção Renda fixa da Simulação, em um card só. A pergunta que ela responde
 * é "CDB ou LCI?", então os dois aparecem lado a lado com o mesmo valor e o
 * mesmo prazo: só as taxas mudam. Embaixo, o veredito e a taxa isenta que
 * empata com o CDB, que é o número que decide.
 */
export function RendaFixaCard({
  cfg,
  onChange,
}: {
  cfg: SimConfig;
  onChange: (c: SimConfig) => void;
}) {
  const [cdbPct, setCdbPct] = useState("102");
  const [lciPct, setLciPct] = useState("92");

  const days = horizon(cfg.months).calendarDays;
  const cdb = yieldOf(cfg.amount, cfg.cdi, Number(cdbPct) || 0, "cdb", days);
  const lci = yieldOf(cfg.amount, cfg.cdi, Number(lciPct) || 0, "lci_lca", days);
  // A LCI precisa desta taxa para empatar com o CDB digitado.
  const breakEven = equivalentTaxFreePct(
    cdb.netGain,
    cfg.amount,
    cfg.cdi,
    cdb.businessDays,
  );
  const diff = Math.abs(cdb.netGain - lci.netGain);
  const winner = cdb.netGain >= lci.netGain ? "CDB" : "LCI/LCA";

  return (
    <Card className="p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <ConfigFields cfg={cfg} onChange={onChange} />
      </div>

      <div className="my-4 border-t border-neutral-100 dark:border-neutral-800" />

      <div className="grid gap-6 sm:grid-cols-2">
        <Option
          label="CDB"
          note={`IR ${pct(cdb.taxRate * 100)}%`}
          pct={cdbPct}
          onPct={setCdbPct}
          result={cdb}
          best={winner === "CDB"}
        />
        <div className="sm:border-l sm:border-neutral-100 sm:pl-6 sm:dark:border-neutral-800">
          <Option
            label="LCI/LCA"
            note="Isento"
            pct={lciPct}
            onPct={setLciPct}
            result={lci}
            best={winner === "LCI/LCA"}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-3 text-sm font-medium dark:border-neutral-800">
        {winner} rende {brl(diff)} a mais. CDB {cdbPct}% empata com LCI{" "}
        {pct(breakEven)}%.
      </div>
    </Card>
  );
}

// Uma das duas colunas: a taxa digitada e o que ela rende.
function Option({
  label,
  note,
  pct,
  onPct,
  result,
  best,
}: {
  label: string;
  note: string;
  pct: string;
  onPct: (v: string) => void;
  result: Yield;
  best: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {best && <Badge tone="win">✓ Melhor</Badge>}
      </div>
      <Field label="Taxa (% do CDI)">
        <Input
          type="number"
          step="0.1"
          min={0}
          value={pct}
          onChange={(e) => onPct(e.target.value)}
        />
      </Field>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{brl(result.net)}</p>
      <p className="mt-0.5 text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
        + {brl(result.netGain)} líquido
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
        {note}
      </p>
    </div>
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
 * Uma posição real: o destaque é **quanto tenho hoje**, líquido, ou seja o que
 * cairia na conta num resgate agora (o IR já descontado pela faixa dos dias
 * corridos desde a aplicação). O vencimento vem como linha secundária.
 */
export function PositionCard({
  position: p,
  best = false,
  actions,
}: {
  position: Position;
  best?: boolean;
  actions?: React.ReactNode;
}) {
  const inv = p.investment;
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
            {inv.broker ? `${inv.broker} · ` : ""}
            {kindLabel(inv.kind)} · {inv.cdi_pct}% do CDI
          </p>
        </div>
        {best && <Badge tone="win">✓ Melhor</Badge>}
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-2xl font-semibold tabular-nums">{brl(p.today.net)}</p>
        <p className="text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
          + {brl(p.today.netGain)} líquido
        </p>
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {brl(p.amount)} aplicados
          {inv.applied_at && ` em ${fmtDate(inv.applied_at)}`}
        </p>
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {pct(p.today.netCdiPct)}% do CDI líquido
          {p.today.taxRate > 0 && ` · IR ${pct(p.today.taxRate * 100)}%`}
        </p>
        {p.atMaturity && !p.matured && (
          <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
            No vencimento: {brl(p.atMaturity.net)}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge>{liquidityLabel(inv.liquidity)}</Badge>
        {inv.maturity && <Badge>Vence {fmtDate(inv.maturity)}</Badge>}
        {p.matured && <Badge tone="warn">Vencido</Badge>}
        {p.pending && <Badge tone="warn">Sem data de aplicação</Badge>}
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

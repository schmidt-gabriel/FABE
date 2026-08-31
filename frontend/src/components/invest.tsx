import { useEffect, useState } from "react";
import { brl } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import {
  DEFAULT_CDI,
  kindLabel,
  liquidityLabel,
  type Position,
} from "../lib/invest";
import { fmtDate, pct } from "../lib/pb";
import { Button, Card } from "./ui";

// Shared pieces of the Pessoa Física module: the CDI (persisted in the
// `settings_invest` singleton) and the card each position is rendered as.

type InvestSettings = {
  id: string;
  cdi_rate?: number;
};

/**
 * O CDI, mantido em estado local e escrito de volta em `settings_invest` com um
 * debounce, já que ele é editado num input.
 */
export function useCdi() {
  const { list, create, update } = useCollection<InvestSettings>("settings_invest", {
    // singleton: no `created` field, so the default -created sort would 400.
    sort: "-updated",
  });
  const record = list.data?.[0];
  const [cdi, setCdi] = useState<number | null>(null);

  // Adopt the stored value once, when it arrives.
  useEffect(() => {
    if (cdi !== null || !list.isSuccess) return;
    setCdi(record?.cdi_rate ?? DEFAULT_CDI);
  }, [list.isSuccess, record, cdi]);

  useEffect(() => {
    if (cdi === null || !list.isSuccess) return;
    if (record && record.cdi_rate === cdi) return;
    const timer = setTimeout(() => {
      if (record) update.mutate({ id: record.id, data: { cdi_rate: cdi } });
      else create.mutate({ cdi_rate: cdi });
    }, 700);
    return () => clearTimeout(timer);
    // The mutations are stable enough for this; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdi, record, list.isSuccess]);

  return { cdi: cdi ?? DEFAULT_CDI, setCdi, ready: cdi !== null };
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
  actions,
}: {
  position: Position;
  actions?: React.ReactNode;
}) {
  const inv = p.investment;
  return (
    <Card className="flex flex-col p-4">
      <div>
        <h3 className="font-semibold leading-tight">{inv.name}</h3>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {inv.broker ? `${inv.broker} · ` : ""}
          {kindLabel(inv.kind)}
        </p>
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-2xl font-semibold tabular-nums">{brl(p.today.net)}</p>
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {brl(p.amount)} aplicados
          {inv.applied_at && ` em ${fmtDate(inv.applied_at)}`}
        </p>
        {/* A taxa contratada, como ela foi digitada no formulário. */}
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {inv.cdi_pct.toLocaleString("pt-BR")}% do CDI
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

/** Empty state of the Investimentos page. */
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCollection } from "../lib/useCollection";
import { MONTHS, useYear } from "../lib/year";
import type { Client, Expense, ImportRecord, ProfitDistribution, RecurringService, Remittance } from "../lib/types";
import { expensePaid, IRRF_MONTHLY_LIMIT, IRRF_START_YEAR, suggestedIrrf } from "../lib/types";
import { pb, brl, usd } from "../lib/pb";
import { Button, Card } from "../components/ui";
const MONTHLY_LIMIT = 50000; // R$50k/month of invoices: where the accounting fee tier jumps
const ANNUAL_REFUND_LIMIT = 600000; // refundable in IRPF if yearly income stays below this
const yearOf = (d?: string) => (d ? Number(d.slice(0, 4)) : 0);
const monthOf = (d?: string) => (d ? d.slice(0, 7) : "");
const sum = <T,>(rows: T[] | undefined, pick: (r: T) => number, year: number, date: (r: T) => string) =>
  (rows ?? []).filter((r) => yearOf(date(r)) === year).reduce((s, r) => s + pick(r), 0);
const sumMonth = <T,>(rows: T[] | undefined, pick: (r: T) => number, ym: string, date: (r: T) => string) =>
  (rows ?? []).filter((r) => monthOf(date(r)) === ym).reduce((s, r) => s + pick(r), 0);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </Card>
  );
}

// Accounting monthly fee tier by the month's invoiced revenue (faturamento).
// Source: contador's "Tabela de cobrança de faturamento extra".
const accountingFee = (f: number) =>
  f <= 50000 ? 295 : f <= 100000 ? 444 : f <= 1000000 ? 622 : 918;

// Notas fiscais: the R$50k mark is where the accounting mensalidade jumps
// (R$295 up to R$50k, R$444 above), not a legal cap.
function InvoiceFeeCard({ used }: { used: number }) {
  const fee = accountingFee(used);
  const over50 = used > MONTHLY_LIMIT;
  const pct = Math.min(100, (used / MONTHLY_LIMIT) * 100);
  return (
    <Card className="p-5">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Notas fiscais (faturamento do mês)
      </p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {brl(used)}
        <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500"> faturado</span>
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className={`h-full ${over50 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
        {over50
          ? `${brl(used - MONTHLY_LIMIT)} acima de ${brl(MONTHLY_LIMIT)}`
          : `Faltam ${brl(MONTHLY_LIMIT - used)} para ${brl(MONTHLY_LIMIT)}`}
      </p>
      <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
        Mensalidade contábil: {brl(fee)}. Acima de {brl(MONTHLY_LIMIT)}/mês sobe para {brl(444)}.
      </p>
    </Card>
  );
}

// Total of the month's paid expenses, next to the invoice/distribution cards.
function MonthExpensesCard({ total }: { total: number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Despesas do mês</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {brl(total)}
        <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500"> pago</span>
      </p>
      <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
        Soma das despesas pagas no mês.
      </p>
    </Card>
  );
}

// Profit distribution: above R$50k/month the full month's amount is taxed at
// 10% IRRF (alta renda). It is not a hard cap, so we show the withholding.
// `irrf` is the sum of what the records themselves recorded as withheld (the
// source of truth); `expected` is what the 10% rule would charge, shown only
// when the two disagree.
function DistributionMonthCard({
  used,
  irrf,
  expected,
  applyIrrf,
}: {
  used: number;
  irrf: number;
  expected: number;
  applyIrrf: boolean;
}) {
  const overLimit = used > IRRF_MONTHLY_LIMIT;
  const over = applyIrrf && irrf > 0;
  const diverges = applyIrrf && Math.abs(irrf - expected) >= 0.01;
  const pct = Math.min(100, (used / IRRF_MONTHLY_LIMIT) * 100);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Distribuição de lucros</p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            over
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          }`}
        >
          {over ? "IRRF 10%" : "Isento"}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {brl(used)}
        <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500"> distribuído</span>
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div className={`h-full ${over ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
        {overLimit
          ? `${brl(used - IRRF_MONTHLY_LIMIT)} acima de ${brl(IRRF_MONTHLY_LIMIT)}`
          : `Faltam ${brl(IRRF_MONTHLY_LIMIT - used)} para ${brl(IRRF_MONTHLY_LIMIT)}`}
      </p>
      <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
        {over ? `IRRF retido ${brl(irrf)}` : "Isento"} · isenção até {brl(IRRF_MONTHLY_LIMIT)}/mês
        {diverges && ` · pela regra: ${brl(expected)}`}
      </p>
    </Card>
  );
}

// Sum the year's distributions. The withheld IRRF is the sum of what each
// record recorded (profit_distributions.irrf is the source of truth, so a DARF
// that came out different from the rule is reported as it really was);
// `expected` is what the 10% rule would charge on every month above R$50k (the
// base is the full month, per Lei 15.270/2025), kept only to flag divergence.
function annualDistribution(rows: ProfitDistribution[] | undefined, year: number) {
  const byMonth: Record<string, number> = {};
  const inYear = (rows ?? []).filter((r) => yearOf(r.month) === year);
  inYear.forEach((r) => {
    const m = monthOf(r.month);
    byMonth[m] = (byMonth[m] ?? 0) + r.amount;
  });
  const taxable = year >= IRRF_START_YEAR;
  const total = Object.values(byMonth).reduce((s, v) => s + v, 0);
  const irrf = inYear.reduce((s, r) => s + (r.irrf ?? 0), 0);
  const expected = Object.values(byMonth).reduce((s, v) => s + suggestedIrrf(v, year), 0);
  return { total, irrf, expected, taxable };
}

export default function Overview() {
  const now0 = new Date();
  const { year, month } = useYear(); // global, selected in the sidebar
  const [showYearSummary, setShowYearSummary] = useState(
    () => localStorage.getItem("overview-year-summary") !== "0",
  );
  const toggleYearSummary = () =>
    setShowYearSummary((v) => {
      localStorage.setItem("overview-year-summary", v ? "0" : "1");
      return !v;
    });
  const [showMonthSection, setShowMonthSection] = useState(
    () => localStorage.getItem("overview-month-section") !== "0",
  );
  const toggleMonthSection = () =>
    setShowMonthSection((v) => {
      localStorage.setItem("overview-month-section", v ? "0" : "1");
      return !v;
    });
  const navigate = useNavigate();

  const imports = useCollection<ImportRecord>("imports", { sort: "-convert_day" });
  const remittances = useCollection<Remittance>("remittances", { sort: "-pay_day" });
  const expenses = useCollection<Expense>("expenses", { sort: "-date" });
  const dist = useCollection<ProfitDistribution>("profit_distributions", { sort: "-month" });

  const tax = useQuery<{ year_total: number }>({
    queryKey: ["tax", year],
    queryFn: async () => {
      const res = await fetch(`/api/tax/compute?year=${year}`, {
        headers: { Authorization: pb.authStore.token },
      });
      if (!res.ok) throw new Error("falha");
      return res.json();
    },
  });

  // The quote comes from a third party, so a failed call is retried and the
  // last good value is kept on screen instead of blanking the card.
  const fx = useQuery<{ rate: number; date: string; stale?: boolean }>({
    queryKey: ["fx-latest"],
    queryFn: async () => {
      const res = await fetch(`/api/fx/usd-brl`, {
        headers: { Authorization: pb.authStore.token },
      });
      if (!res.ok) throw new Error("falha");
      return res.json();
    },
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const bruto = sum(imports.list.data, (r) => r.amount_brl, year, (r) => r.convert_day);
  const importedUsd = sum(imports.list.data, (r) => r.amount_usd, year, (r) => r.convert_day);
  const receivedUsd = sum(remittances.list.data, (r) => r.amount_usd, year, (r) => r.pay_day);
  // Scheduled expenses only count once paid.
  const despesas = sum(
    (expenses.list.data ?? []).filter(expensePaid),
    (r) => r.amount,
    year,
    (r) => r.date,
  );

  const liquido = bruto - despesas;
  const toBring = receivedUsd - importedUsd;
  const rate = fx.data?.rate ?? 0;
  // Rate used to approximate "valor a trazer" in BRL. The market quote is
  // preferred, but when AwesomeAPI is unreachable the effective rate of the
  // year's own imports (BRL received ÷ USD sent, fees included) keeps the
  // estimate on screen, and is arguably closer to what will actually land.
  const effectiveRate = importedUsd > 0 ? bruto / importedUsd : 0;
  const estimateRate = rate || effectiveRate;
  const estimateSource = rate ? `cotação ${rate.toFixed(4)}` : `câmbio efetivo ${effectiveRate.toFixed(4)}`;

  // Monthly view (limits + due dates), driven by the sidebar year + month.
  // A month past the latest available one (this month, or December for past
  // years) is clamped down to it.
  const maxMonth = year === now0.getFullYear() ? now0.getMonth() : 11;
  const selMonth = Math.min(Number(month) - 1, maxMonth);
  const ym = `${year}-${String(selMonth + 1).padStart(2, "0")}`;
  const invoiceUsed = sumMonth(imports.list.data, (r) => r.amount_brl, ym, (r) => r.convert_day);
  const distUsed = sumMonth(dist.list.data, (r) => r.amount, ym, (r) => r.month);
  // Withheld IRRF as recorded on the distributions themselves, not recomputed.
  const distIrrf = sumMonth(dist.list.data, (r) => r.irrf ?? 0, ym, (r) => r.month);
  const annualDist = annualDistribution(dist.list.data, year);
  // Total of the month's paid expenses (scheduled ones only once paid).
  const despesasMes = sumMonth(
    (expenses.list.data ?? []).filter(expensePaid),
    (r) => r.amount,
    ym,
    (r) => r.date,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Visão geral</h1>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => navigate("/remessas?new=1")}>
          + Remessa
        </Button>
        <Button variant="ghost" onClick={() => navigate("/importacoes?new=1")}>
          + Nota fiscal
        </Button>
        <Button variant="ghost" onClick={() => navigate("/despesas?new=1")}>
          + Despesa
        </Button>
        <Button variant="ghost" onClick={() => navigate("/lucros?new=1")}>
          + Distribuição de lucro
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleMonthSection}
          className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          aria-expanded={showMonthSection}
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showMonthSection ? "rotate-90" : ""}`}
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
          {/* Month comes from the sidebar selector; shown here for context. */}
          Mês de {MONTHS[selMonth]}
        </button>
      </div>

      {showMonthSection && (
      <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpcomingPayments ym={ym} />
        <Receivables ym={ym} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <InvoiceFeeCard used={invoiceUsed} />
        <DistributionMonthCard
          used={distUsed}
          irrf={distIrrf}
          expected={suggestedIrrf(distUsed, Number(ym.slice(0, 4)))}
          applyIrrf={Number(ym.slice(0, 4)) >= IRRF_START_YEAR}
        />
        <MonthExpensesCard total={despesasMes} />
      </div>
      </>
      )}

      <button
        onClick={toggleYearSummary}
        className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        aria-expanded={showYearSummary}
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform ${showYearSummary ? "rotate-90" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4V4z" />
        </svg>
        Resumo de {year}
      </button>

      {showYearSummary && (
      <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Bruto (importado)"
          value={brl(bruto)}
          hint={`${usd(importedUsd)} convertidos de ${usd(receivedUsd)} recebidos`}
        />
        <Stat
          label="Líquido (bruto − despesas)"
          value={brl(liquido)}
          hint={`Despesas: ${brl(despesas)}`}
        />
        <Stat
          label="Valor a trazer"
          value={usd(toBring)}
          hint={
            estimateRate
              ? `≈ ${brl(toBring * estimateRate)} (aproximado · ${estimateSource})`
              : "recebido − importado"
          }
        />
        <Stat label="Impostos do ano (apuração)" value={brl(tax.data?.year_total ?? 0)} />
      </div>

      {/* The IRRF alta renda details only apply from 2026 on; earlier years
          show just the annual total. */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Distribuição de lucros no ano · {year}
          </p>
          {annualDist.taxable && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                annualDist.total > ANNUAL_REFUND_LIMIT
                  ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
              }`}
            >
              {annualDist.total > ANNUAL_REFUND_LIMIT ? "Acima de R$600k" : "IRRF restituível"}
            </span>
          )}
        </div>
        <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          {brl(annualDist.total)}
          {annualDist.taxable && (
            <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500">
              {" "}
              de {brl(ANNUAL_REFUND_LIMIT)}
            </span>
          )}
        </p>
        {annualDist.taxable && (
          <>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className={`h-full ${annualDist.total > ANNUAL_REFUND_LIMIT ? "bg-red-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, (annualDist.total / ANNUAL_REFUND_LIMIT) * 100)}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
              IRRF alta renda retido no ano:{" "}
              <span className="font-semibold">{brl(annualDist.irrf)}</span>
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              Soma do IRRF registrado em cada distribuição (DARF cód. 1841): 10% sobre o total dos
              meses acima de {brl(IRRF_MONTHLY_LIMIT)}.
              {Math.abs(annualDist.irrf - annualDist.expected) >= 0.01 &&
                ` Pela regra seriam ${brl(annualDist.expected)}; confira os valores em Distribuição de Lucros.`}{" "}
              Restituível na declaração anual (IRPF) se o total anual de rendimentos ficar abaixo de{" "}
              {brl(ANNUAL_REFUND_LIMIT)}.
            </p>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Stat
          label="Cotação atual (USD/BRL)"
          value={rate ? rate.toFixed(4) : fx.isLoading ? "…" : "—"}
          hint={
            fx.data?.date
              ? `fonte: AwesomeAPI · ${fx.data.date}${fx.data.stale ? " (desatualizada)" : ""}`
              : fx.isError
                ? "cotação indisponível no momento"
                : undefined
          }
        />
        <Stat
          label="Total recebido (remessas)"
          value={usd(receivedUsd)}
          hint={`${usd(importedUsd)} já importados`}
        />
      </div>
      </>
      )}

    </div>
  );
}

function UpcomingPayments({ ym }: { ym: string }) {
  const services = useCollection<RecurringService>("recurring_services", { sort: "exp_day" });
  const expenses = useCollection<Expense>("expenses", { sort: "-date" });

  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Effective day-of-month for the "atrasado" check: fully elapsed for past
  // months, not started for future months, today for the current month.
  const day = ym < currentYm ? 32 : ym > currentYm ? 0 : now.getDate();
  const paidThisMonth = (name: string) =>
    (expenses.list.data ?? []).some(
      (e) =>
        expensePaid(e) &&
        e.category.toUpperCase() === name.toUpperCase() &&
        e.date.slice(0, 7) === ym,
    );

  // One-off future expenses (despesas a pagar) due in the selected month;
  // they keep showing here as "pago" after being marked as paid.
  const monthScheduled = (expenses.list.data ?? []).filter(
    (e) => e.scheduled && e.date.slice(0, 7) === ym,
  );

  const items = [
    ...(services.list.data ?? []).map((s) => ({
      key: s.id,
      name: s.name,
      day: s.exp_day,
      amount: 0,
      paid: paidThisMonth(s.name),
      auto: s.payment_type === "auto",
    })),
    ...monthScheduled.map((e) => ({
      key: e.id,
      name: e.notes || e.category,
      day: Number(e.date.slice(8, 10)),
      amount: e.amount,
      paid: !!e.paid,
      auto: false,
    })),
  ];

  // Nearest due date first: overdue on top (most urgent), then upcoming by
  // days left, paid ones at the end.
  const sortKey = (it: { day: number; paid: boolean }) => {
    if (it.paid) return 1000 + it.day;
    if (day > it.day) return -100 + it.day;
    return it.day - day;
  };
  items.sort((a, b) => sortKey(a) - sortKey(b));

  const status = (it: { day: number; paid: boolean }) => {
    if (it.paid) return { text: "pago", cls: "text-emerald-600 dark:text-emerald-400" };
    if (ym > currentYm)
      return { text: `dia ${it.day}`, cls: "text-neutral-500 dark:text-neutral-400" };
    if (day > it.day)
      return {
        text: `atrasado · venceu dia ${it.day}`,
        cls: "font-medium text-red-600 dark:text-red-400",
      };
    const left = it.day - day;
    const text =
      left === 0 ? "vence hoje" : left === 1 ? "vence amanhã" : `faltam ${left} dias · dia ${it.day}`;
    return {
      text,
      cls:
        left < 5
          ? "font-medium text-amber-600 dark:text-amber-400"
          : "text-neutral-500 dark:text-neutral-400",
    };
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Próximos pagamentos
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-px bg-neutral-100 dark:bg-neutral-800">
        {items.map((it) => {
          const st = status(it);
          const overdue = !it.paid && ym <= currentYm && day > it.day;
          return (
            <div
              key={it.key}
              className={`flex items-center justify-between gap-3 px-4 py-2 ${
                overdue ? "bg-red-50 dark:bg-red-950/30" : "bg-white dark:bg-neutral-900"
              }`}
            >
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {it.name}
                {it.amount > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-neutral-400 dark:text-neutral-500">
                    {brl(it.amount)}
                  </span>
                )}
                {it.auto && (
                  <span className="ml-1.5 text-xs font-normal text-neutral-400 dark:text-neutral-500">
                    · automático
                  </span>
                )}
              </p>
              <p className={`shrink-0 text-xs ${st.cls}`}>{st.text}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Monthly reference per client, mirroring Clients.tsx: hourly clients store the
// hourly rate in monthly_amount, converted at 160h/month.
const HOURS_PER_MONTH = 160;
const monthlyReference = (c: Client) =>
  !c.monthly_amount ? 0 : c.billing_type === "hourly" ? c.monthly_amount * HOURS_PER_MONTH : c.monthly_amount;

function Receivables({ ym }: { ym: string }) {
  const clients = useCollection<Client>("clients", { sort: "name" });
  const remittances = useCollection<Remittance>("remittances", { sort: "-pay_day" });
  const rems = remittances.list.data ?? [];

  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // The contract window is inferred from the remittance history: a client
  // counts in a month if it lies between their first and last remittance
  // months (extended to today while the client is active). This keeps
  // past-month views true to who was actually under contract back then.
  const inContract = (c: Client) => {
    const months = rems.filter((r) => r.client === c.id).map((r) => r.pay_day.slice(0, 7));
    if (!months.length) return c.active !== false && ym >= currentYm;
    const first = months.reduce((a, b) => (a < b ? a : b));
    const last = months.reduce((a, b) => (a > b ? a : b));
    const end = c.active !== false && currentYm > last ? currentYm : last;
    return ym >= first && ym <= end;
  };

  const rows = (clients.list.data ?? [])
    .filter((c) => monthlyReference(c) > 0 && inContract(c))
    .map((c) => {
      const expected = monthlyReference(c);
      const received = rems
        .filter((r) => r.client === c.id && r.pay_day.slice(0, 7) === ym)
        .reduce((s, r) => s + r.amount_usd, 0);
      return { c, expected, received, remaining: Math.max(0, expected - received) };
    });

  if (!rows.length) return null;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          A receber no mês
        </h2>
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-px bg-neutral-100 dark:bg-neutral-800">
        {rows.map(({ c, expected, received, remaining }) => {
          const done = remaining <= 0;
          // Past months are settled (holidays, fewer hours), so the shortfall
          // is just informative: neutral difference instead of an amber alert.
          const past = ym < currentYm;
          const pct = Math.min(100, (received / expected) * 100);
          return (
            <div
              key={c.id}
              className="flex flex-col justify-center bg-white px-4 py-2 dark:bg-neutral-900"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {c.name}
                  <span className="ml-1.5 text-xs font-normal text-neutral-400 dark:text-neutral-500">
                    {usd(received)} de {usd(expected)}
                  </span>
                </p>
                <p
                  className={`shrink-0 text-xs ${
                    done
                      ? "text-emerald-600 dark:text-emerald-400"
                      : past
                        ? "text-neutral-500 dark:text-neutral-400"
                        : "font-medium text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {done ? "completo" : past ? `−${usd(remaining)}` : `falta ${usd(remaining)}`}
                </p>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className={`h-full ${
                    done ? "bg-emerald-500" : past ? "bg-neutral-300 dark:bg-neutral-600" : "bg-amber-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

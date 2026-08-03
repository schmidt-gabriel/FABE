import { useQuery } from "@tanstack/react-query";
import { useCollection } from "../lib/useCollection";
import { MONTHS, useYear } from "../lib/year";
import type { Client, Expense, ImportRecord, ProfitDistribution, RecurringService, Remittance } from "../lib/types";
import {
  expenseMatchesService,
  expensePaid,
  IRRF_MONTHLY_LIMIT,
  IRRF_START_YEAR,
  suggestedIrrf,
} from "../lib/types";
import { pb, brl, usd, fmtDate } from "../lib/pb";
import { Card } from "./ui";

// The non-chart half of the Dashboard: one KPI strip for the year, then the
// month cards (three meters + what is due and what is coming in). No section
// headers or collapse: every card names its own period, and the numbers that
// would need a paragraph of context live on their own page (Distribuição de
// Lucros explains the R$600k quota, Impostos the assessment).

const MONTHLY_LIMIT = 50000; // R$50k/month of invoices: where the accounting fee tier jumps
const ANNUAL_REFUND_LIMIT = 600000; // refundable in IRPF if yearly income stays below this
const yearOf = (d?: string) => (d ? Number(d.slice(0, 4)) : 0);
const monthOf = (d?: string) => (d ? d.slice(0, 7) : "");
const sum = <T,>(rows: T[] | undefined, pick: (r: T) => number, year: number, date: (r: T) => string) =>
  (rows ?? []).filter((r) => yearOf(date(r)) === year).reduce((s, r) => s + pick(r), 0);
const sumMonth = <T,>(rows: T[] | undefined, pick: (r: T) => number, ym: string, date: (r: T) => string) =>
  (rows ?? []).filter((r) => monthOf(date(r)) === ym).reduce((s, r) => s + pick(r), 0);

// Accounting monthly fee tier by the month's invoiced revenue (faturamento).
// Source: contador's "Tabela de cobrança de faturamento extra".
const accountingFee = (f: number) =>
  f <= 50000 ? 295 : f <= 100000 ? 444 : f <= 1000000 ? 622 : 918;

// The month the sidebar is pointing at, clamped to the latest available one
// (this month, or December in a past year). Shared by the page header and the
// month cards, so both always name the same month.
export function useSelectedMonth() {
  const { year, month } = useYear();
  const now = new Date();
  const maxMonth = year === now.getFullYear() ? now.getMonth() : 11;
  const index = Math.min(Number(month) - 1, maxMonth);
  return {
    year,
    index,
    name: MONTHS[index],
    ym: `${year}-${String(index + 1).padStart(2, "0")}`,
  };
}

// Shared floor for the cards that sit on top of a chart: the short ones (the
// meters) all render at least this tall, and a longer list grows past it
// instead of scrolling. `grow` makes each card take whatever height its cell
// has left over, so when the card beside it is taller the slack ends up inside
// the card instead of as a gap between the card and its chart.
const CARD_H = "min-h-[168px] grow";

// One cell of the year strip.
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white px-4 py-3 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}

// A month value against its R$50k mark.
function Meter({
  label,
  value,
  badge,
  pct,
  over,
  hint,
}: {
  label: string;
  value: string;
  badge?: string;
  pct?: number;
  over?: boolean;
  hint: string;
}) {
  return (
    <Card className={`flex ${CARD_H} flex-col p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
        {badge && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              over
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      {pct !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className={`h-full ${over ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
      <p className="mt-auto pt-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">{hint}</p>
    </Card>
  );
}

// The year in six numbers. Everything that used to take a card of its own
// (annual distribution, FX quote, total received) is a hint here.
export function YearSummary() {
  const { year } = useYear(); // global, selected in the sidebar

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
  // last good value is kept on screen instead of blanking the number.
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
  // The market quote is preferred, but when AwesomeAPI is unreachable the
  // effective rate of the year's own imports (BRL received ÷ USD sent, fees
  // included) keeps the estimate on screen.
  const effectiveRate = importedUsd > 0 ? bruto / importedUsd : 0;
  const estimateRate = rate || effectiveRate;
  const annualDist = annualDistribution(dist.list.data, year);
  const yearTotal = tax.data?.year_total ?? 0;

  return (
    <Card className="grid grid-cols-2 gap-px overflow-hidden bg-neutral-100 sm:grid-cols-3 lg:grid-cols-6 dark:bg-neutral-800">
      <Kpi
        label="Faturamento"
        value={brl(bruto)}
        hint={receivedUsd > 0 ? `${((importedUsd / receivedUsd) * 100).toFixed(0)}% do recebido convertido` : undefined}
      />
      <Kpi label="Despesas" value={brl(despesas)} hint="pagas no ano" />
      <Kpi
        label="Líquido"
        value={brl(liquido)}
        hint={bruto > 0 ? `margem de ${((liquido / bruto) * 100).toFixed(1)}%` : undefined}
      />
      <Kpi
        label="Impostos (apuração)"
        value={brl(yearTotal)}
        hint={bruto > 0 ? `${((yearTotal / bruto) * 100).toFixed(1)}% do faturamento` : undefined}
      />
      <Kpi
        label="Lucros distribuídos"
        value={brl(annualDist.total)}
        hint={
          annualDist.taxable
            ? `IRRF ${brl(annualDist.irrf)} · ${((annualDist.total / ANNUAL_REFUND_LIMIT) * 100).toFixed(0)}% da cota de R$600k${
                Math.abs(annualDist.irrf - annualDist.expected) >= 0.01
                  ? ` · pela regra ${brl(annualDist.expected)}`
                  : ""
              }`
            : undefined
        }
      />
      <Kpi
        label="A trazer"
        value={usd(toBring)}
        hint={
          estimateRate
            ? `≈ ${brl(toBring * estimateRate)} · cotação ${(rate || effectiveRate).toFixed(4)}${rate ? (fx.data?.stale ? " (desatualizada)" : "") : " (efetiva)"}`
            : `de ${usd(receivedUsd)} recebidos`
        }
      />
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

// The month cards are separate components so the page can pair each one with
// the chart that tells the same story (meter on top, chart below). They each
// read the month from the sidebar and their own collection; the queries are
// shared by TanStack Query, so this costs no extra requests.

// Lowercase: the month is read inline in a label ("Notas fiscais · agosto"),
// never as a heading.
const useMonthLabel = () => useSelectedMonth().name.toLowerCase();

export function InvoiceMeter() {
  const { ym } = useSelectedMonth();
  const monthName = useMonthLabel();
  const imports = useCollection<ImportRecord>("imports", { sort: "-convert_day" });
  const invoiced = sumMonth(imports.list.data, (r) => r.amount_brl, ym, (r) => r.convert_day);
  const over = invoiced > MONTHLY_LIMIT;
  return (
    <Meter
      label={`Notas fiscais · ${monthName}`}
      value={brl(invoiced)}
      pct={(invoiced / MONTHLY_LIMIT) * 100}
      over={over}
      hint={`${
        over
          ? `${brl(invoiced - MONTHLY_LIMIT)} acima de R$50k`
          : `faltam ${brl(MONTHLY_LIMIT - invoiced)} para R$50k`
      } · contábil ${brl(accountingFee(invoiced))}`}
    />
  );
}

export function DistributionMeter() {
  const { year, ym } = useSelectedMonth();
  const monthName = useMonthLabel();
  const dist = useCollection<ProfitDistribution>("profit_distributions", { sort: "-month" });
  const distributed = sumMonth(dist.list.data, (r) => r.amount, ym, (r) => r.month);
  // Withheld IRRF as recorded on the distributions themselves, not recomputed.
  const irrf = sumMonth(dist.list.data, (r) => r.irrf ?? 0, ym, (r) => r.month);
  const expected = suggestedIrrf(distributed, year);
  const taxed = year >= IRRF_START_YEAR && irrf > 0;
  const diverges = year >= IRRF_START_YEAR && Math.abs(irrf - expected) >= 0.01;
  return (
    <Meter
      label={`Distribuição de lucros · ${monthName}`}
      value={brl(distributed)}
      badge={taxed ? "IRRF 10%" : "Isento"}
      pct={(distributed / IRRF_MONTHLY_LIMIT) * 100}
      over={taxed}
      hint={
        taxed
          ? `IRRF retido ${brl(irrf)}${diverges ? ` · pela regra ${brl(expected)}` : ""}`
          : `faltam ${brl(Math.max(0, IRRF_MONTHLY_LIMIT - distributed))} para R$50k`
      }
    />
  );
}

export function ExpensesMeter() {
  const { ym } = useSelectedMonth();
  const monthName = useMonthLabel();
  const expenses = useCollection<Expense>("expenses", { sort: "-date" });
  const spent = sumMonth(
    (expenses.list.data ?? []).filter(expensePaid),
    (r) => r.amount,
    ym,
    (r) => r.date,
  );
  return <Meter label={`Despesas · ${monthName}`} value={brl(spent)} hint="Pagas no mês" />;
}

// Sits above the effective-rate chart: the conversion that produced the last
// point on that line, spelled out.
export function LastImport() {
  const { year } = useYear();
  const imports = useCollection<ImportRecord>("imports", { sort: "-convert_day" });
  const last = (imports.list.data ?? []).find((r) => yearOf(r.convert_day) === year);
  if (!last) {
    return (
      <Meter
        label="Última importação"
        value="—"
        hint={`nenhuma conversão registrada em ${year}`}
      />
    );
  }
  const effective = last.amount_usd > 0 ? last.amount_brl / last.amount_usd : 0;
  return (
    <Meter
      label={`Última importação · ${fmtDate(last.convert_day)}`}
      value={brl(last.amount_brl)}
      hint={`${usd(last.amount_usd)}${effective ? ` a ${effective.toFixed(4)}` : ""}${
        last.platform ? ` · ${last.platform}` : ""
      }`}
    />
  );
}

export function UpcomingPayments() {
  const { ym } = useSelectedMonth();
  const monthName = useMonthLabel();
  const services = useCollection<RecurringService>("recurring_services", { sort: "exp_day" });
  const expenses = useCollection<Expense>("expenses", { sort: "-date" });

  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Effective day-of-month for the "atrasado" check: fully elapsed for past
  // months, not started for future months, today for the current month.
  const day = ym < currentYm ? 32 : ym > currentYm ? 0 : now.getDate();
  const paidThisMonth = (name: string) =>
    (expenses.list.data ?? []).some(
      (e) => expensePaid(e) && expenseMatchesService(e, name) && e.date.slice(0, 7) === ym,
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
      name: e.payee?.trim() || e.notes || e.category,
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
    <Card className={`flex ${CARD_H} flex-col overflow-hidden`}>
      <div className="border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Próximos pagamentos · {monthName}
        </h2>
      </div>
      <div className="grid auto-rows-min grid-cols-1 gap-px bg-neutral-100 dark:bg-neutral-800">
        {items.map((it) => {
          const st = status(it);
          const overdue = !it.paid && ym <= currentYm && day > it.day;
          return (
            <div
              key={it.key}
              className={`flex items-center justify-between gap-3 px-4 py-1.5 ${
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

export function Receivables() {
  const { ym } = useSelectedMonth();
  const monthName = useMonthLabel();
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

  return (
    <Card className={`flex ${CARD_H} flex-col overflow-hidden`}>
      <div className="border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          A receber · {monthName}
        </h2>
      </div>
      {!rows.length && (
        <p className="px-4 py-3 text-sm text-neutral-400 dark:text-neutral-500">
          Nenhum cliente com valor mensal neste mês.
        </p>
      )}
      <div className="grid auto-rows-min grid-cols-1 gap-px bg-neutral-100 dark:bg-neutral-800">
        {rows.map(({ c, expected, received, remaining }) => {
          const done = remaining <= 0;
          // Past months are settled (holidays, fewer hours), so the shortfall
          // is just informative: neutral difference instead of an amber alert.
          const past = ym < currentYm;
          const pct = Math.min(100, (received / expected) * 100);
          return (
            <div
              key={c.id}
              className="flex flex-col justify-center bg-white px-4 py-1.5 dark:bg-neutral-900"
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
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCollection } from "../lib/useCollection";
import type { Expense, ImportRecord, ProfitDistribution, Remittance } from "../lib/types";
import { pb, brl, usd } from "../lib/pb";
import { Button, Card, Select } from "../components/ui";

const YEARS = [2026, 2025, 2024, 2023];
const MONTHLY_LIMIT = 50000; // R$50k/month for invoices and for profit distribution
const IRRF_RATE = 0.1; // 10% IRRF alta renda on the full month's distribution above R$50k
const ANNUAL_REFUND_LIMIT = 600000; // refundable in IRPF if yearly income stays below this
const IRRF_START_YEAR = 2026; // the alta-renda rule only applies from 2026 on
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Notas fiscais (faturamento do mês)
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            over50
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          }`}
        >
          contábil {brl(fee)}
        </span>
      </div>
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
        Mensalidade contábil: {brl(fee)}. Acima de {brl(MONTHLY_LIMIT)}/mês sobe para {brl(444)}.
      </p>
    </Card>
  );
}

// Profit distribution: above R$50k/month the full month's amount is taxed at
// 10% IRRF (alta renda). It is not a hard cap, so we show the withholding.
function DistributionMonthCard({ used, applyIrrf }: { used: number; applyIrrf: boolean }) {
  const over = applyIrrf && used > MONTHLY_LIMIT;
  const irrf = over ? used * IRRF_RATE : 0;
  const pct = Math.min(100, (used / MONTHLY_LIMIT) * 100);
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
        {over
          ? `IRRF retido ~${brl(irrf)} (estimado)`
          : `${brl(MONTHLY_LIMIT - used)} isento disponível`}{" "}
        · isenção até {brl(MONTHLY_LIMIT)}/mês
      </p>
    </Card>
  );
}

// Sum the year's distributions by month and withhold 10% on every month that
// exceeds R$50k (the base is the full month, per Lei 15.270/2025).
function annualDistribution(rows: { month: string; amount: number }[] | undefined, year: number) {
  const byMonth: Record<string, number> = {};
  (rows ?? [])
    .filter((r) => yearOf(r.month) === year)
    .forEach((r) => {
      const m = monthOf(r.month);
      byMonth[m] = (byMonth[m] ?? 0) + r.amount;
    });
  const taxable = year >= IRRF_START_YEAR;
  let total = 0;
  let irrf = 0;
  for (const v of Object.values(byMonth)) {
    total += v;
    if (taxable && v > MONTHLY_LIMIT) irrf += v * IRRF_RATE;
  }
  return { total, irrf, taxable };
}

export default function Overview() {
  const [year, setYear] = useState(2026);
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

  const fx = useQuery<{ rate: number; date: string }>({
    queryKey: ["fx-latest"],
    queryFn: async () => {
      const res = await fetch(`/api/fx/usd-brl`, {
        headers: { Authorization: pb.authStore.token },
      });
      if (!res.ok) throw new Error("falha");
      return res.json();
    },
  });

  const bruto = sum(imports.list.data, (r) => r.amount_brl, year, (r) => r.convert_day);
  const importedUsd = sum(imports.list.data, (r) => r.amount_usd, year, (r) => r.convert_day);
  const receivedUsd = sum(remittances.list.data, (r) => r.amount_usd, year, (r) => r.pay_day);
  const despesas = sum(expenses.list.data, (r) => r.amount, year, (r) => r.date);

  const liquido = bruto - despesas;
  const toBring = receivedUsd - importedUsd;
  const rate = fx.data?.rate ?? 0;

  // Monthly operating limits (current calendar month, local time).
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const invoiceUsed = sumMonth(imports.list.data, (r) => r.amount_brl, ym, (r) => r.convert_day);
  const distUsed = sumMonth(dist.list.data, (r) => r.amount, ym, (r) => r.month);
  const annualDist = annualDistribution(dist.list.data, year);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <div className="w-32">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
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

      <Vencimentos />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          Limites de {monthLabel}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InvoiceFeeCard used={invoiceUsed} />
          <DistributionMonthCard
            used={distUsed}
            applyIrrf={Number(ym.slice(0, 4)) >= IRRF_START_YEAR}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Bruto (importado)"
          value={brl(bruto)}
          hint={`${usd(importedUsd)} convertidos de ${usd(receivedUsd)} recebidos`}
        />
        <Stat label="Despesas" value={brl(despesas)} />
        <Stat label="Líquido (bruto − despesas)" value={brl(liquido)} />
        <Stat
          label="Valor a trazer"
          value={usd(toBring)}
          hint={
            rate
              ? `≈ ${brl(toBring * rate)} (aproximado · cotação ${rate.toFixed(4)})`
              : "recebido − importado"
          }
        />
        <Stat label="Impostos do ano (apuração)" value={brl(tax.data?.year_total ?? 0)} />
        <Stat label="Distribuição de lucros (ano)" value={brl(annualDist.total)} />
      </div>

      {annualDist.taxable && (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Distribuição de lucros no ano · {year}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              annualDist.total > ANNUAL_REFUND_LIMIT
                ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            }`}
          >
            {annualDist.total > ANNUAL_REFUND_LIMIT ? "Acima de R$600k" : "IRRF restituível"}
          </span>
        </div>
        <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          {brl(annualDist.total)}
          <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500">
            {" "}
            de {brl(ANNUAL_REFUND_LIMIT)}
          </span>
        </p>
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
          Retido 10% sobre o total dos meses acima de {brl(MONTHLY_LIMIT)} (DARF cód. 1841).
          Restituível na declaração anual (IRPF) se o total anual de rendimentos ficar abaixo de{" "}
          {brl(ANNUAL_REFUND_LIMIT)}.
        </p>
      </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Stat
          label="Cotação atual (USD/BRL)"
          value={rate ? rate.toFixed(4) : "—"}
          hint={fx.data?.date ? `fonte: AwesomeAPI · ${fx.data.date}` : undefined}
        />
        <Stat
          label="Total recebido (remessas)"
          value={usd(receivedUsd)}
          hint={`${usd(importedUsd)} já importados`}
        />
      </div>
    </div>
  );
}

function Vencimentos() {
  const services = useCollection<{ id: string; name: string; exp_day: number }>(
    "recurring_services",
    { sort: "exp_day" },
  );
  const expenses = useCollection<Expense>("expenses", { sort: "-date" });

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const day = now.getDate();
  const paidThisMonth = (name: string) =>
    (expenses.list.data ?? []).some(
      (e) => e.category.toUpperCase() === name.toUpperCase() && e.date.slice(0, 7) === ym,
    );

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-neutral-100 px-5 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Vencimentos recorrentes
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-px bg-neutral-100 sm:grid-cols-3 lg:grid-cols-5 dark:bg-neutral-800">
        {services.list.data?.map((s) => {
          const paid = paidThisMonth(s.name);
          const overdue = !paid && day > s.exp_day;
          return (
            <div
              key={s.id}
              className={`px-5 py-4 ${
                overdue ? "bg-red-50 dark:bg-red-950/30" : "bg-white dark:bg-neutral-900"
              }`}
            >
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{s.name}</p>
              <p
                className={`text-xs ${
                  overdue
                    ? "font-medium text-red-600 dark:text-red-400"
                    : paid
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                {overdue ? `atrasado · venceu dia ${s.exp_day}` : paid ? "pago" : `dia ${s.exp_day}`}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

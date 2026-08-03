import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCollection } from "../lib/useCollection";
import { useYear } from "../lib/year";
import type { Client, Expense, ImportRecord, ProfitDistribution, Remittance } from "../lib/types";
import { expensePaid, IRRF_MONTHLY_LIMIT } from "../lib/types";
import { pb, brl, usd, fmtDate } from "../lib/pb";
import {
  MonthSection,
  QuickActions,
  SectionToggle,
  YearSection,
} from "../components/OverviewSections";
import { BarChart, ColumnChart, LineChart, type Datum } from "../components/charts";

// Single landing page: the quick actions, the month block, the year block (both
// from the old "Visão geral") and, below them, the year in charts.

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const INVOICE_LIMIT = 50000; // where the accounting fee tier jumps (same as the month card)
const TOP_CLIENTS = 3; // beyond this the tail folds into "Outros"
const TOP_CATEGORIES = 8;

const yearOf = (d?: string) => (d ? Number(d.slice(0, 4)) : 0);
const monthIdx = (d: string) => Number(d.slice(5, 7)) - 1;

// Compact axis ticks; the exact values live in the tooltips and the table view.
const brlTick = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
    : v >= 1000
      ? `R$ ${Math.round(v / 1000)}k`
      : `R$ ${Math.round(v)}`;
const usdTick = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

type Quarter = { quarter: number; irpj: number; irpj_adicional: number; csll: number; total: number };

export default function Dashboard() {
  const { year } = useYear(); // global, selected in the sidebar
  const [showCharts, setShowCharts] = useState(
    () => localStorage.getItem("dashboard-charts") !== "0",
  );
  const toggleCharts = () =>
    setShowCharts((v) => {
      localStorage.setItem("dashboard-charts", v ? "0" : "1");
      return !v;
    });

  const now = new Date();
  // Don't plot months that haven't happened yet in the current year.
  const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;
  const months = MONTH_SHORT.slice(0, lastMonth + 1);

  const imports = useCollection<ImportRecord>("imports", { sort: "convert_day" });
  const remittances = useCollection<Remittance>("remittances", { sort: "pay_day" });
  const expenses = useCollection<Expense>("expenses", { sort: "-date" });
  const dist = useCollection<ProfitDistribution>("profit_distributions", { sort: "month" });
  const clients = useCollection<Client>("clients", { sort: "name" });

  const tax = useQuery<{ quarters: Quarter[]; year_total: number }>({
    queryKey: ["tax", year],
    queryFn: async () => {
      const res = await fetch(`/api/tax/compute?year=${year}`, {
        headers: { Authorization: pb.authStore.token },
      });
      if (!res.ok) throw new Error("falha");
      return res.json();
    },
  });

  const inYear = <T,>(rows: T[] | undefined, date: (r: T) => string) =>
    (rows ?? []).filter((r) => yearOf(date(r)) === year);

  const yearImports = inYear(imports.list.data, (r) => r.convert_day);
  const yearRemittances = inYear(remittances.list.data, (r) => r.pay_day);
  const yearExpenses = inYear((expenses.list.data ?? []).filter(expensePaid), (r) => r.date);
  const yearDist = inYear(dist.list.data, (r) => r.month);

  // One bucket per month, filled by whichever collection feeds the chart.
  const byMonth = <T,>(rows: T[], date: (r: T) => string, pick: (r: T) => number) => {
    const out: number[] = Array(lastMonth + 1).fill(0);
    rows.forEach((r) => {
      const i = monthIdx(date(r));
      if (i >= 0 && i <= lastMonth) out[i] += pick(r);
    });
    return out;
  };

  const invoicedByMonth = byMonth(yearImports, (r) => r.convert_day, (r) => r.amount_brl);
  const expensesByMonth = byMonth(yearExpenses, (r) => r.date, (r) => r.amount);
  const distByMonth = byMonth(yearDist, (r) => r.month, (r) => r.amount);

  const faturamento: Datum[] = months.map((m, i) => ({ label: m, values: [invoicedByMonth[i]] }));
  const brutoVsDespesas: Datum[] = months.map((m, i) => ({
    label: m,
    values: [invoicedByMonth[i], expensesByMonth[i]],
  }));
  const lucros: Datum[] = months.map((m, i) => ({ label: m, values: [distByMonth[i]] }));

  // Received per client, stacked by month. Only the biggest clients get their
  // own hue; the tail folds into a neutral "Outros" (never a generated 4th).
  const clientName = (id: string) =>
    clients.list.data?.find((c) => c.id === id)?.name ?? "Sem cliente";
  const totalByClient = new Map<string, number>();
  yearRemittances.forEach((r) =>
    totalByClient.set(r.client, (totalByClient.get(r.client) ?? 0) + r.amount_usd),
  );
  const topClients = [...totalByClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CLIENTS)
    .map(([id]) => id);
  const hasOthers = totalByClient.size > topClients.length;
  const clientSeries = [
    ...topClients.map((id, i) => ({
      key: id,
      label: clientName(id),
      color: `var(--viz-s${i + 1})`,
    })),
    ...(hasOthers ? [{ key: "others", label: "Outros", color: "var(--viz-neutral)" }] : []),
  ];
  const received: Datum[] = months.map((m, i) => ({
    label: m,
    values: [
      ...topClients.map((id) =>
        yearRemittances
          .filter((r) => r.client === id && monthIdx(r.pay_day) === i)
          .reduce((s, r) => s + r.amount_usd, 0),
      ),
      ...(hasOthers
        ? [
            yearRemittances
              .filter((r) => !topClients.includes(r.client) && monthIdx(r.pay_day) === i)
              .reduce((s, r) => s + r.amount_usd, 0),
          ]
        : []),
    ],
  }));

  // Expenses by category, biggest first, tail folded into "Outros".
  const byCategory = new Map<string, number>();
  yearExpenses.forEach((e) => byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount));
  const sortedCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const tail = sortedCategories.slice(TOP_CATEGORIES).reduce((s, [, v]) => s + v, 0);
  const categories: Datum[] = [
    ...sortedCategories.slice(0, TOP_CATEGORIES).map(([label, v]) => ({ label, values: [v] })),
    ...(tail > 0 ? [{ label: "Outros", values: [tail] }] : []),
  ];

  // Quarterly assessment: IRPJ (with the surtax) and CSLL stacked into the DARF.
  const quarters: Datum[] = (tax.data?.quarters ?? []).map((q) => ({
    label: `T${q.quarter}`,
    values: [q.irpj + q.irpj_adicional, q.csll],
  }));

  // Effective rate of each import (BRL received ÷ USD sent), so the platform
  // fees are baked in: this is what the money really converted at.
  const effective: Datum[] = yearImports
    .filter((r) => r.amount_usd > 0)
    .map((r) => ({
      label: fmtDate(r.convert_day).slice(0, 5),
      values: [r.amount_brl / r.amount_usd],
    }));
  const avgRate = effective.length
    ? effective.reduce((s, d) => s + d.values[0], 0) / effective.length
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <QuickActions />
      <MonthSection />
      <YearSection />

      <SectionToggle open={showCharts} onToggle={toggleCharts} label={`Gráficos de ${year}`} />

      {showCharts && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ColumnChart
            title="Faturamento mensal (notas fiscais)"
            subtitle={`Reais recebidos por mês de conversão · a linha marca ${brl(INVOICE_LIMIT)}, onde a mensalidade contábil sobe`}
            data={faturamento}
            series={[{ key: "brl", label: "Faturado", color: "var(--viz-s1)" }]}
            format={brl}
            tick={brlTick}
            threshold={{ value: INVOICE_LIMIT, label: brlTick(INVOICE_LIMIT) }}
          />

          <ColumnChart
            title="Faturamento × despesas"
            subtitle="O espaço entre as colunas é o líquido do mês"
            data={brutoVsDespesas}
            series={[
              { key: "bruto", label: "Faturado", color: "var(--viz-s1)" },
              { key: "despesas", label: "Despesas", color: "var(--viz-s2)" },
            ]}
            format={brl}
            tick={brlTick}
          />

          <ColumnChart
            title="Recebido por cliente (USD)"
            subtitle="Remessas por mês de pagamento, empilhadas por cliente"
            data={received}
            series={clientSeries}
            format={usd}
            tick={usdTick}
            stacked
          />

          <BarChart
            title="Despesas por categoria"
            subtitle={`Pagas em ${year}, maiores primeiro`}
            data={categories}
            color="var(--viz-s2)"
            format={brl}
          />

          <ColumnChart
            title="Distribuição de lucros por mês"
            subtitle={`Acima de ${brl(IRRF_MONTHLY_LIMIT)} no mês o IRRF de 10% incide sobre o total do mês`}
            data={lucros}
            series={[{ key: "dist", label: "Distribuído", color: "var(--viz-s3)" }]}
            format={brl}
            tick={brlTick}
            threshold={{ value: IRRF_MONTHLY_LIMIT, label: brlTick(IRRF_MONTHLY_LIMIT) }}
          />

          <ColumnChart
            title="Impostos por trimestre"
            subtitle="Apuração do Lucro Presumido: IRPJ (com adicional) e CSLL do DARF"
            data={quarters}
            series={[
              { key: "irpj", label: "IRPJ", color: "var(--viz-s1)" },
              { key: "csll", label: "CSLL", color: "var(--viz-s2)" },
            ]}
            format={brl}
            tick={brlTick}
            stacked
          />

          <div className="xl:col-span-2">
            <LineChart
              title="Cotação efetiva das importações"
              subtitle={
                avgRate
                  ? `BRL recebido ÷ USD enviado, taxas da plataforma incluídas · média ${avgRate.toFixed(4)}`
                  : "BRL recebido ÷ USD enviado, taxas da plataforma incluídas"
              }
              data={effective}
              color="var(--viz-s1)"
              label="Cotação efetiva"
              format={(v) => v.toFixed(4)}
              tick={(v) => v.toFixed(2)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

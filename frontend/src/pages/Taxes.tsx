import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, brl, fmtDate } from "../lib/pb";
import { MONTHS, useYear } from "../lib/year";
import { useCollection } from "../lib/useCollection";
import { IRRF_START_YEAR, type ProfitDistribution } from "../lib/types";
import { Button, Card } from "../components/ui";

type Quarter = {
  quarter: number;
  revenue: number;
  base_irpj: number;
  irpj: number;
  irpj_adicional: number;
  csll: number;
  total: number;
  status: "locked" | "forecast";
  due_date: string;
};

type TaxResponse = {
  year: number;
  quarters: Quarter[];
  year_total: number;
};

const QUARTER_MONTHS = ["jan-mar", "abr-jun", "jul-set", "out-dez"];
const today = () => new Date().toISOString().slice(0, 10);

async function authFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: pb.authStore.token, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Falha na requisição");
  return res.json();
}

/**
 * IRRF alta renda, mês a mês. O valor vem dos registros de Distribuição de
 * Lucros (onde é derivado da regra), não é recalculado aqui: um número, um
 * dono. Esta tela só o traz para onde os DARFs são lidos.
 */
function IrrfSection({ year }: { year: number }) {
  const { list } = useCollection<ProfitDistribution>("profit_distributions", {
    sort: "-month",
  });

  if (year < IRRF_START_YEAR) return null;

  // Um mês por linha: a retenção é do mês inteiro, então é assim que ela é paga.
  const byMonth = new Map<string, { amount: number; irrf: number }>();
  for (const d of list.data ?? []) {
    if (d.month.slice(0, 4) !== String(year)) continue;
    const ym = d.month.slice(0, 7);
    const acc = byMonth.get(ym) ?? { amount: 0, irrf: 0 };
    byMonth.set(ym, { amount: acc.amount + d.amount, irrf: acc.irrf + (d.irrf ?? 0) });
  }
  const rows = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, [, v]) => sum + v.irrf, 0);

  return (
    <>
      <h2 className="pt-2 text-lg font-semibold">IRRF sobre lucros</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Mês</th>
              <th className="px-4 py-3 text-right">Distribuído</th>
              <th className="px-4 py-3 text-right">IRRF (cód. 1841)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([ym, v]) => (
              <tr key={ym} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3 font-medium">
                  {MONTHS[Number(ym.slice(5, 7)) - 1]}
                </td>
                <td className="px-4 py-3 text-right">{brl(v.amount)}</td>
                <td
                  className={`px-4 py-3 text-right ${
                    v.irrf > 0
                      ? "font-medium text-amber-600 dark:text-amber-400"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {brl(v.irrf)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-800/50">
            <tr className="border-t border-neutral-200 dark:border-neutral-700">
              <td className="px-4 py-3" colSpan={2}>
                Total do ano
              </td>
              <td className="px-4 py-3 text-right">{brl(total)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Retido na distribuição, 10% sobre o mês que passa de R$50k. O valor é o
        guardado em Distribuição de Lucros, onde é calculado pela regra.
      </p>
    </>
  );
}

export default function Taxes() {
  const { year } = useYear(); // global, selected in the sidebar
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<TaxResponse>({
    queryKey: ["tax", year],
    queryFn: () => authFetch(`/api/tax/compute?year=${year}`),
  });

  const lock = useMutation({
    mutationFn: (v: { quarter: number; locked: boolean }) =>
      authFetch(`/api/tax/${v.locked ? "lock" : "unlock"}`, {
        method: "POST",
        body: JSON.stringify({ year, quarter: v.quarter }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax", year] }),
  });

  // Next payment = nearest upcoming quarterly DARF still in forecast. One-off
  // taxes (TFE, IPTU, ...) are plain expenses now, tracked in Despesas.
  const next = (() => {
    const obligations = (data?.quarters ?? [])
      .filter((q) => q.status === "forecast" && q.total > 0)
      .map((q) => ({
        label: `Imposto T${q.quarter} (${QUARTER_MONTHS[q.quarter - 1]})`,
        due: q.due_date,
        amount: q.total,
      }))
      .sort((a, b) => a.due.localeCompare(b.due));
    return obligations.find((o) => o.due >= today()) ?? obligations[0];
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Impostos · {year}</h1>
      </div>

      {isLoading && <p className="text-neutral-500 dark:text-neutral-400">Calculando…</p>}
      {error && <p className="text-red-600">{(error as Error).message}</p>}

      {next && (
        <Card className="p-5">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Próximo pagamento · {next.label}
          </p>
          <p className="mt-1 text-3xl font-semibold">{brl(next.amount)}</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            vence em {fmtDate(next.due)}
          </p>
        </Card>
      )}

      {data && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-left">Trimestre</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Vencimento</th>
                <th className="px-4 py-3 text-right">Receita</th>
                <th className="px-4 py-3 text-right">IRPJ</th>
                <th className="px-4 py-3 text-right">CSLL</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.quarters.map((q) => {
                const locked = q.status === "locked";
                return (
                  <tr key={q.quarter} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-4 py-3 font-medium">
                      T{q.quarter}{" "}
                      <span className="font-normal text-neutral-400 dark:text-neutral-500">
                        ({QUARTER_MONTHS[q.quarter - 1]})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          locked
                            ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                        }`}
                      >
                        {locked ? "Travado" : "Previsão"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {fmtDate(q.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right">{brl(q.revenue)}</td>
                    <td className="px-4 py-3 text-right">{brl(q.irpj + q.irpj_adicional)}</td>
                    <td className="px-4 py-3 text-right">{brl(q.csll)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(q.total)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {locked && (
                        <Button
                          variant="ghost"
                          disabled={lock.isPending}
                          onClick={() => lock.mutate({ quarter: q.quarter, locked: false })}
                        >
                          Destravar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-800/50">
              <tr className="border-t border-neutral-200 dark:border-neutral-700">
                <td className="px-4 py-3" colSpan={6}>
                  Total do ano
                </td>
                <td className="px-4 py-3 text-right">{brl(data.year_total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Trimestres travam automaticamente no vencimento, congelando o valor pago.
        Trimestres em aberto mostram a previsão ao vivo. Use “Destravar” para corrigir.
      </p>

      <IrrfSection year={year} />
    </div>
  );
}

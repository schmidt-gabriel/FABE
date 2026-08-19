import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { useYear } from "../lib/year";
import type { ProfitDistribution } from "../lib/types";
import { IRRF_MONTHLY_LIMIT, IRRF_START_YEAR, suggestedIrrf } from "../lib/types";
import { brl, fmtDate, toDateInput, fromDateInput } from "../lib/pb";
import { Button, Card, Field, Input, Modal } from "../components/ui";

const ANNUAL_LIMIT = 600000; // yearly quota; above it the IRRF stops being refundable
const yearOf = (d: string) => d.slice(0, 4);
const monthOf = (d: string) => d.slice(0, 7);
const round2 = (v: number) => Math.round(v * 100) / 100;

const empty = { month: "", amount: "", notes: "" };

export default function ProfitDistributions() {
  const { list, create, update, remove } = useCollection<ProfitDistribution>(
    "profit_distributions",
    { sort: "-month" },
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProfitDistribution | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [searchParams, setSearchParams] = useSearchParams();

  // Reacts to the query string, not just to mounting: the sidebar "+" links
  // here with ?new=1, and it has to open the form even when this page is
  // already the one on screen.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // What one record owes: the law taxes the month as a whole, so 10% is applied
  // over the other records of that month plus this amount, and this record is
  // charged its own share of it.
  function irrfFor(monthInput: string, amount: number, excludeId?: string) {
    if (!monthInput || !amount) return 0;
    const ym = monthInput.slice(0, 7);
    const others = (list.data ?? [])
      .filter((d) => d.id !== excludeId && monthOf(d.month) === ym)
      .reduce((s, d) => s + d.amount, 0);
    const monthIrrf = suggestedIrrf(others + amount, Number(ym.slice(0, 4)));
    return monthIrrf === 0 ? 0 : round2((monthIrrf * amount) / (others + amount));
  }

  // The withholding belongs to the month, not to the record, so touching one
  // record changes every other record's share of it. After any write, rewrite
  // the whole month's shares. `changed` is the record as it now stands (absent
  // when it was deleted), `dropId` the one that left this month.
  async function syncMonth(
    ym: string,
    changed?: { id: string; month: string; amount: number; irrf?: number },
    dropId?: string,
  ) {
    const kept = (list.data ?? []).filter(
      (d) => monthOf(d.month) === ym && d.id !== dropId && d.id !== changed?.id,
    );
    const records = changed ? [...kept, changed] : kept;
    const total = records.reduce((sum, d) => sum + d.amount, 0);
    const monthIrrf = total > 0 ? suggestedIrrf(total, Number(ym.slice(0, 4))) : 0;
    await Promise.all(
      records
        .filter((d) => {
          const share = total > 0 ? round2((monthIrrf * d.amount) / total) : 0;
          return Math.abs((d.irrf ?? 0) - share) >= 0.01;
        })
        .map((d) =>
          update.mutateAsync({
            id: d.id,
            data: { irrf: round2((monthIrrf * d.amount) / total) },
          }),
        ),
    );
  }

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(d: ProfitDistribution) {
    setEditing(d);
    setForm({
      month: toDateInput(d.month),
      amount: String(d.amount),
      notes: d.notes ?? "",
    });
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    const data = {
      month: fromDateInput(form.month),
      amount,
      irrf: irrfFor(form.month, amount, editing?.id),
      notes: form.notes,
    };
    const saved = editing
      ? await update.mutateAsync({ id: editing.id, data })
      : await create.mutateAsync(data);
    setOpen(false);

    const ym = monthOf(data.month);
    const from = editing ? monthOf(editing.month) : null;
    // Moving a record between months leaves both to rebalance.
    if (from && from !== ym) await syncMonth(from, undefined, editing!.id);
    await syncMonth(ym, { ...saved, amount, month: data.month });
  }

  async function removeOne(d: ProfitDistribution) {
    await remove.mutateAsync(d.id);
    await syncMonth(monthOf(d.month), undefined, d.id);
  }

  const { year } = useYear();
  const rows = (list.data ?? []).filter((d) => yearOf(d.month) === String(year));

  // Annual total of the selected year, for the R$600k quota.
  const byYear: Record<string, number> = {};
  rows.forEach((d) => {
    const y = yearOf(d.month);
    byYear[y] = (byYear[y] ?? 0) + d.amount;
  });

  // Monthly totals: both the R$50k threshold and the 10% apply to the month as
  // a whole, so a month split across records is judged by its sum.
  const byMonth: Record<string, number> = {};
  rows.forEach((d) => {
    byMonth[monthOf(d.month)] = (byMonth[monthOf(d.month)] ?? 0) + d.amount;
  });

  // What the rule charges for what is currently typed in the form.
  const formIrrf = irrfFor(form.month, Number(form.amount), editing?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Distribuição de Lucros · {year}</h1>
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      {Object.entries(byYear)
        .filter(([yr]) => Number(yr) >= IRRF_START_YEAR)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([yr, total]) => {
          const over = total > ANNUAL_LIMIT;
          const pct = Math.min(100, (total / ANNUAL_LIMIT) * 100);
          return (
            <Card key={yr} className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Cota anual · {yr}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    over
                      ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                  }`}
                >
                  {over ? "Acima de R$600k" : "Dentro da cota"}
                </span>
              </div>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  over ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100"
                }`}
              >
                {brl(total)}
                <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500">
                  {" "}
                  de {brl(ANNUAL_LIMIT)}
                </span>
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className={`h-full ${over ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Card>
          );
        })}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Mês</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Cota restante no mês</th>
              <th className="px-4 py-3 text-right">IRRF retido</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const applies = Number(yearOf(d.month)) >= IRRF_START_YEAR;
              const monthTotal = byMonth[monthOf(d.month)] ?? 0;
              const cota = IRRF_MONTHLY_LIMIT - monthTotal;
              const negative = applies && cota < 0;
              const irrf = d.irrf ?? 0;
              // The stored value is what we report; flag it when it does not
              // match the 10% rule so a stale or missing one is visible.
              const expected = irrfFor(d.month, d.amount, d.id);
              const diverges = applies && Math.abs(irrf - expected) >= 0.01;
              return (
                <tr key={d.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-3 font-medium">{fmtDate(d.month)}</td>
                  <td className="px-4 py-3 text-right">{brl(d.amount)}</td>
                  <td
                    className={`px-4 py-3 text-right ${
                      negative
                        ? "font-medium text-red-600 dark:text-red-400"
                        : "text-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    {applies ? brl(cota) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {applies ? (
                      <>
                        <span
                          className={
                            irrf > 0
                              ? "font-medium text-amber-600 dark:text-amber-400"
                              : "text-neutral-600 dark:text-neutral-400"
                          }
                        >
                          {brl(irrf)}
                        </span>
                        {diverges && (
                          <span className="block text-xs text-neutral-400 dark:text-neutral-500">
                            regra: {brl(expected)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-neutral-600 dark:text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" onClick={() => openEdit(d)}>
                      Editar
                    </Button>
                    <Button variant="danger" onClick={() => removeOne(d)}>
                      Excluir
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhuma distribuição registrada em {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        A cota restante é derivada (R$ {IRRF_MONTHLY_LIMIT.toLocaleString("pt-BR")} − total do mês).
        Quando fica negativa, o mês excede R$50k e há retenção de 10% sobre o mês inteiro
        (restituível no IRPF se o ano ficar abaixo de R$600k). O <strong>IRRF retido</strong> é
        calculado pela regra, nunca digitado: cada registro carrega a sua parte do mês, e
        salvar ou excluir um deles reescreve a parte dos outros do mesmo mês. Se algum registro
        antigo ficou com valor diferente, a linha mostra o esperado ao lado.
      </p>

      {open && (
        <Modal
          title={editing ? "Editar distribuição" : "Nova distribuição"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Mês">
              <Input
                type="date"
                required
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
              />
            </Field>
            <Field label="Valor (BRL)">
              <Input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            {/* Derivado, nunca digitado: a retenção é 10% do mês inteiro e cada
                registro carrega a sua parte dele, então digitar um valor aqui
                só criaria divergência com a regra. */}
            <div className="rounded-lg bg-neutral-50 px-3 py-2.5 dark:bg-neutral-800/50">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  IRRF retido
                </span>
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    formIrrf > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {brl(formIrrf)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                {formIrrf > 0
                  ? "10% sobre o mês inteiro (DARF cód. 1841)."
                  : "Mês isento: abaixo de R$50k ou anterior a 2026."}
              </p>
            </div>
            <Field label="Observação">
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

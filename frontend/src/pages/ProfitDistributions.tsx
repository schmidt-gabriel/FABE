import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import type { ProfitDistribution } from "../lib/types";
import { brl, fmtDate, toDateInput, fromDateInput } from "../lib/pb";
import { Button, Card, Field, Input, Modal } from "../components/ui";

const MONTHLY_LIMIT = 50000; // monthly IRRF alta renda threshold
const ANNUAL_LIMIT = 600000; // yearly quota; above it the IRRF stops being refundable
const IRRF_START_YEAR = 2026; // the alta-renda rule only applies from 2026 on
const yearOf = (d: string) => d.slice(0, 4);

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

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(d: ProfitDistribution) {
    setEditing(d);
    setForm({ month: toDateInput(d.month), amount: String(d.amount), notes: d.notes ?? "" });
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    const data = {
      month: fromDateInput(form.month),
      amount,
      // Computed, not user-editable: remaining tax-free quota for the month.
      cota_irrf: MONTHLY_LIMIT - amount,
      notes: form.notes,
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  // Annual totals per year, for the R$600k quota.
  const byYear: Record<string, number> = {};
  (list.data ?? []).forEach((d) => {
    const y = yearOf(d.month);
    byYear[y] = (byYear[y] ?? 0) + d.amount;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Distribuição de Lucros</h1>
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
              <th className="px-4 py-3 text-right">Cota IRRF alta renda</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((d) => {
              const applies = Number(yearOf(d.month)) >= IRRF_START_YEAR;
              const cota = MONTHLY_LIMIT - d.amount;
              const negative = applies && cota < 0;
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
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" onClick={() => openEdit(d)}>
                      Editar
                    </Button>
                    <Button variant="danger" onClick={() => remove.mutate(d.id)}>
                      Excluir
                    </Button>
                  </td>
                </tr>
              );
            })}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhuma distribuição registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        A cota IRRF alta renda é calculada automaticamente (R${" "}
        {MONTHLY_LIMIT.toLocaleString("pt-BR")} − valor do mês). Quando fica negativa, a parcela do
        mês excede R$50k e há retenção de 10% (restituível no IRPF se o ano ficar abaixo de R$600k).
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

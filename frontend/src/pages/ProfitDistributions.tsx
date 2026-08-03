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

const empty = { month: "", amount: "", irrf: "", notes: "" };

export default function ProfitDistributions() {
  const { list, create, update, remove } = useCollection<ProfitDistribution>(
    "profit_distributions",
    { sort: "-month" },
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProfitDistribution | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
  // Once the IRRF field is edited by hand we stop overwriting it with the
  // suggestion: the DARF is the source of truth, not our 10%.
  const [irrfEdited, setIrrfEdited] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suggested withholding for one record: the law taxes the month as a whole,
  // so we apply 10% over the other records of that month plus this amount, and
  // charge this record its own share.
  function suggestionFor(monthInput: string, amount: number, excludeId?: string) {
    if (!monthInput || !amount) return 0;
    const ym = monthInput.slice(0, 7);
    const others = (list.data ?? [])
      .filter((d) => d.id !== excludeId && monthOf(d.month) === ym)
      .reduce((s, d) => s + d.amount, 0);
    const monthIrrf = suggestedIrrf(others + amount, Number(ym.slice(0, 4)));
    return monthIrrf === 0 ? 0 : (monthIrrf * amount) / (others + amount);
  }

  // Keeps the IRRF field in sync with the suggestion while it is untouched.
  function setField(patch: Record<string, string>) {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!irrfEdited) {
        next.irrf = String(
          round2(suggestionFor(next.month, Number(next.amount), editing?.id)),
        );
      }
      return next;
    });
  }

  function openNew() {
    setEditing(null);
    setForm(empty);
    setIrrfEdited(false);
    setOpen(true);
  }
  function openEdit(d: ProfitDistribution) {
    setEditing(d);
    setForm({
      month: toDateInput(d.month),
      amount: String(d.amount),
      irrf: String(d.irrf ?? 0),
      notes: d.notes ?? "",
    });
    // An existing record already carries a decided value; never overwrite it.
    setIrrfEdited(true);
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      month: fromDateInput(form.month),
      amount: Number(form.amount),
      irrf: Number(form.irrf || 0),
      notes: form.notes,
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
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

  // What the 10% rule would charge for what is currently typed in the form.
  const formSuggestion = round2(suggestionFor(form.month, Number(form.amount), editing?.id));

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
              const expected = round2(suggestionFor(d.month, d.amount, d.id));
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
                    <Button variant="danger" onClick={() => remove.mutate(d.id)}>
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
        (restituível no IRPF se o ano ficar abaixo de R$600k). O <strong>IRRF retido</strong> é o
        valor guardado no registro e é o que aparece nos totais do Painel: o formulário sugere os
        10%, mas vale o que o DARF (cód. 1841) realmente foi. Quando o valor guardado difere da
        regra, a linha mostra o valor esperado.
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
                onChange={(e) => setField({ month: e.target.value })}
              />
            </Field>
            <Field label="Valor (BRL)">
              <Input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setField({ amount: e.target.value })}
              />
            </Field>
            <div>
              <Field label="IRRF retido (BRL)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.irrf}
                  onChange={(e) => {
                    setIrrfEdited(true);
                    setForm({ ...form, irrf: e.target.value });
                  }}
                />
              </Field>
              <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                {formSuggestion > 0
                  ? `Pela regra: ${brl(formSuggestion)} (10% sobre o mês inteiro, DARF cód. 1841).`
                  : "Mês isento pela regra (abaixo de R$50k ou anterior a 2026)."}{" "}
                Ajuste para o valor real do DARF se for diferente.
                {irrfEdited && (
                  <button
                    type="button"
                    className="ml-1 underline"
                    onClick={() => {
                      setIrrfEdited(false);
                      setForm((f) => ({ ...f, irrf: String(formSuggestion) }));
                    }}
                  >
                    usar o sugerido
                  </button>
                )}
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

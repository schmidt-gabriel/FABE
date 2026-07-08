import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { MONTHS, useYear } from "../lib/year";
import type { Expense } from "../lib/types";
import { EXPENSE_CATEGORIES, expensePaid } from "../lib/types";
import { brl, fmtDate, toDateInput, fromDateInput } from "../lib/pb";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const empty = { date: "", category: "", amount: "", notes: "" };

export default function Expenses() {
  const { list, create, update, remove } = useCollection<Expense>("expenses", {
    sort: "-date",
  });
  // Year + month come from the sidebar selectors.
  const { year, month } = useYear();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
  // "Já paga" checkbox; unchecked creates a future expense (a pagar) whose
  // date is the due date, shown in the Overview "Próximos pagamentos" card.
  const [paga, setPaga] = useState(true);
  const [filter, setFilter] = useState("");
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
    setPaga(true);
    setOpen(true);
  }
  function openEdit(x: Expense) {
    setEditing(x);
    setForm({
      date: toDateInput(x.date),
      category: x.category,
      amount: String(x.amount),
      notes: x.notes ?? "",
    });
    setPaga(expensePaid(x));
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      date: fromDateInput(form.date),
      category: form.category,
      amount: Number(form.amount),
      notes: form.notes,
      // Once scheduled, stay scheduled so a paid one still shows as "pago"
      // in the Overview card instead of vanishing from it.
      scheduled: (editing?.scheduled ?? false) || !paga,
      paid: paga,
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  const inYear = (list.data ?? []).filter((x) => x.date.slice(0, 4) === String(year));
  const rows = inYear.filter(
    (x) => (!filter || x.category === filter) && x.date.slice(5, 7) === month,
  );
  const total = rows.filter(expensePaid).reduce((s, x) => s + x.amount, 0);
  const pendingTotal = rows.filter((x) => !expensePaid(x)).reduce((s, x) => s + x.amount, 0);
  const today = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Despesas · {year}</h1>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Todas as categorias</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={openNew}>+ Adicionar</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Categoria</th>
              <th className="px-4 py-3 text-left">Observação</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3">{fmtDate(x.date)}</td>
                <td className="px-4 py-3 font-medium">
                  {x.category}
                  {!expensePaid(x) && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                        x.date.slice(0, 10) < today
                          ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                      }`}
                    >
                      {x.date.slice(0, 10) < today ? "atrasada" : "a pagar"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">{x.notes || "—"}</td>
                <td className="px-4 py-3 text-right">{brl(x.amount)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => openEdit(x)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(x.id)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhuma despesa{" "}
                  {filter
                    ? "com esses filtros"
                    : `registrada em ${MONTHS[Number(month) - 1]} de ${year}`}
                  .
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-800/50">
            <tr className="border-t border-neutral-200 dark:border-neutral-700">
              <td className="px-4 py-3" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-3 text-right">{brl(total)}</td>
              <td />
            </tr>
            {pendingTotal > 0 && (
              <tr className="border-t border-neutral-200 text-amber-600 dark:border-neutral-700 dark:text-amber-400">
                <td className="px-4 py-3" colSpan={3}>
                  A pagar
                </td>
                <td className="px-4 py-3 text-right">{brl(pendingTotal)}</td>
                <td />
              </tr>
            )}
          </tfoot>
        </table>
      </Card>

      {open && (
        <Modal
          title={editing ? "Editar despesa" : "Nova despesa"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label={paga ? "Data" : "Vencimento"}>
              <Input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Categoria">
              <Select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Selecione…</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
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
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={paga}
                  onChange={(e) => setPaga(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-neutral-900 dark:accent-neutral-100"
                />
                Já paga
              </label>
              {!paga && (
                <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                  Despesa futura: aparece em "Próximos pagamentos" na visão geral até ser
                  marcada como paga.
                </p>
              )}
            </div>
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

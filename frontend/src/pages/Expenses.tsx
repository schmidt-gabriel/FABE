import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { MONTHS, useYear } from "../lib/year";
import type { Expense, RecurringService } from "../lib/types";
import {
  EXPENSE_CATEGORIES,
  expenseLabel,
  expenseMatchesService,
  expensePaid,
  paymentLabel,
} from "../lib/types";
import { brl, fmtDate, toDateInput, fromDateInput } from "../lib/pb";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const empty = {
  date: "",
  payee: "",
  category: "",
  amount: "",
  notes: "",
  payment_type: "manual",
};

export default function Expenses() {
  const { list, create, update, remove } = useCollection<Expense>("expenses", {
    sort: "-date",
  });
  // Recurring services show as "a pagar" rows until their expense exists,
  // mirroring the Overview "Próximos pagamentos" card.
  const services = useCollection<RecurringService>("recurring_services", { sort: "exp_day" });
  // Year + month come from the sidebar selectors.
  const { year, month } = useYear();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
  // "Já paga" checkbox; unchecked creates a future expense (a pagar) whose
  // date is the due date, shown in the Overview "Próximos pagamentos" card.
  const [paga, setPaga] = useState(true);
  // True when the modal was opened from an upcoming row's "Registrar": the
  // expense is necessarily paid, so the checkbox is hidden and the submit
  // button reads "Registrar".
  const [registering, setRegistering] = useState(false);
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

  function openNew() {
    setEditing(null);
    setForm(empty);
    setPaga(true);
    setRegistering(false);
    setOpen(true);
  }
  function openEdit(x: Expense) {
    setEditing(x);
    setForm({
      date: toDateInput(x.date),
      payee: x.payee ?? "",
      category: x.category,
      amount: String(x.amount),
      notes: x.notes ?? "",
      payment_type: x.payment_type || "manual",
    });
    setPaga(expensePaid(x));
    setRegistering(false);
    setOpen(true);
  }
  // "Registrar" on an upcoming service row: opens the new-expense modal
  // pre-filled as paid today, which removes the pending row once saved.
  function registerUpcoming(u: {
    payee: string;
    category: string;
    notes: string;
    amount: number;
    payment_type: string;
  }) {
    setEditing(null);
    setForm({
      date: today,
      payee: u.payee,
      category: u.category,
      amount: u.amount ? String(u.amount) : "",
      notes: u.notes,
      payment_type: u.payment_type,
    });
    setPaga(true);
    setRegistering(true);
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      date: fromDateInput(form.date),
      payee: form.payee,
      category: form.category,
      amount: Number(form.amount),
      notes: form.notes,
      payment_type: form.payment_type,
      // Once scheduled, stay scheduled so a paid one still shows as "pago"
      // in the Overview card instead of vanishing from it.
      scheduled: (editing?.scheduled ?? false) || !paga,
      paid: paga,
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  const today = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const inYear = (list.data ?? []).filter((x) => x.date.slice(0, 4) === String(year));
  const rows = inYear.filter((x) => x.date.slice(5, 7) === month);

  // Recurring services without an expense in the selected month yet. Each gets
  // a "Registrar" shortcut that creates the matching expense.
  const ym = `${year}-${month}`;
  const servicePaid = (name: string) =>
    inYear.some(
      (x) => expensePaid(x) && expenseMatchesService(x, name) && x.date.slice(5, 7) === month,
    );
  const upcoming = (services.list.data ?? [])
    .filter((s) => !servicePaid(s.name))
    .map((s) => ({
      key: `svc-${s.id}`,
      date: `${ym}-${String(s.exp_day).padStart(2, "0")}`,
      payee: s.name,
      // A service without its own category names the category after itself,
      // which is what expenses did before they had a payee.
      category: s.category?.trim() || s.name,
      notes: "",
      amount: s.default_amount ?? 0,
      payment_type: s.payment_type === "auto" ? "auto" : "manual",
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const total = rows.filter(expensePaid).reduce((s, x) => s + x.amount, 0);
  const pendingTotal =
    rows.filter((x) => !expensePaid(x)).reduce((s, x) => s + x.amount, 0) +
    upcoming.reduce((s, u) => s + u.amount, 0);

  // Both fields are free text. Payees suggest the recurring services (a service
  // is marked paid by an expense naming it as payee) plus the payees already in
  // use; categories, the known ones plus whatever is already in the data.
  const suggestions = (values: (string | undefined)[]) =>
    [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  const payeeSuggestions = suggestions([
    ...(services.list.data ?? []).map((s) => s.name),
    ...(list.data ?? []).map((x) => x.payee),
  ]);
  const categorySuggestions = suggestions([
    ...EXPENSE_CATEGORIES,
    ...(services.list.data ?? []).map((s) => s.category),
    ...(list.data ?? []).map((x) => x.category),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Despesas · {year}</h1>
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Recebedor</th>
              <th className="px-4 py-3 text-left">Categoria</th>
              <th className="px-4 py-3 text-left">Observação</th>
              <th className="px-4 py-3 text-left">Pagamento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {upcoming.map((u) => (
              <tr key={u.key} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">
                  {fmtDate(u.date)}
                </td>
                <td className="px-4 py-3 font-medium">
                  {u.payee}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.date < today
                        ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                    }`}
                  >
                    {u.date < today ? "atrasada" : "a pagar"}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">{u.category}</td>
                <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">
                  {u.notes || "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {paymentLabel(u.payment_type as "auto" | "manual")}
                </td>
                <td className="px-4 py-3 text-right">{u.amount ? brl(u.amount) : "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => registerUpcoming(u)}>
                    Registrar
                  </Button>
                </td>
              </tr>
            ))}
            {rows.map((x) => (
              <tr key={x.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3">{fmtDate(x.date)}</td>
                <td className="px-4 py-3 font-medium">
                  {expenseLabel(x)}
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
                <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">{x.category}</td>
                <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">{x.notes || "—"}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {paymentLabel(x.payment_type)}
                </td>
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
            {rows.length === 0 && upcoming.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhuma despesa registrada em {MONTHS[Number(month) - 1]} de {year}.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-800/50">
            <tr className="border-t border-neutral-200 dark:border-neutral-700">
              <td className="px-4 py-3" colSpan={5}>
                Total
              </td>
              <td className="px-4 py-3 text-right">{brl(total)}</td>
              <td />
            </tr>
            {pendingTotal > 0 && (
              <tr className="border-t border-neutral-200 text-amber-600 dark:border-neutral-700 dark:text-amber-400">
                <td className="px-4 py-3" colSpan={5}>
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
          title={editing ? "Editar despesa" : registering ? "Registrar pagamento" : "Nova despesa"}
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
            <Field label="Recebedor">
              <Input
                list="expense-payees"
                placeholder="Ex.: Unimed"
                value={form.payee}
                onChange={(e) => setForm({ ...form, payee: e.target.value })}
              />
              <datalist id="expense-payees">
                {payeeSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <Field label="Categoria">
              <Input
                required
                list="expense-categories"
                placeholder="Selecione ou digite…"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="expense-categories">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
            <Field label="Pagamento">
              <Select
                value={form.payment_type}
                onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
              >
                <option value="manual">Manual</option>
                <option value="auto">Automático (débito automático)</option>
              </Select>
            </Field>
            {!registering && (
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
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{registering ? "Registrar" : "Salvar"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

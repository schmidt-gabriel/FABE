import { useState } from "react";
import { useCollection } from "../lib/useCollection";
import type { RecurringService } from "../lib/types";
import { brl } from "../lib/pb";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const empty = { name: "", exp_day: "", default_amount: "", payment_type: "manual" };

export default function RecurringServices() {
  const { list, create, update, remove } = useCollection<RecurringService>(
    "recurring_services",
    { sort: "exp_day" },
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringService | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(empty);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(s: RecurringService) {
    setEditing(s);
    setForm({
      name: s.name,
      exp_day: String(s.exp_day),
      default_amount: s.default_amount ? String(s.default_amount) : "",
      payment_type: s.payment_type || "manual",
    });
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      exp_day: Number(form.exp_day),
      default_amount: form.default_amount ? Number(form.default_amount) : 0,
      payment_type: form.payment_type,
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Vencimentos mensais acompanhados no Overview (marcados como pagos via
          despesa com a mesma categoria no mês).
        </p>
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Dia do vencimento</th>
              <th className="px-4 py-3 text-left">Pagamento</th>
              <th className="px-4 py-3 text-right">Valor padrão</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">dia {s.exp_day}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {s.payment_type === "auto" ? "Automático" : "Manual"}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.default_amount ? brl(s.default_amount) : "—"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => openEdit(s)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(s.id)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhum vencimento recorrente cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {open && (
        <Modal
          title={editing ? "Editar vencimento" : "Novo vencimento"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome">
              <Input
                required
                value={form.name as string}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Dia do vencimento (1–31)">
              <Input
                type="number"
                min={1}
                max={31}
                required
                value={form.exp_day as string}
                onChange={(e) => setForm({ ...form, exp_day: e.target.value })}
              />
            </Field>
            <Field label="Valor padrão (R$, opcional)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.default_amount as string}
                onChange={(e) => setForm({ ...form, default_amount: e.target.value })}
              />
            </Field>
            <Field label="Pagamento">
              <Select
                value={form.payment_type as string}
                onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
              >
                <option value="manual">Manual</option>
                <option value="auto">Automático (débito automático)</option>
              </Select>
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

import { useState } from "react";
import { useCollection, usePlatformNames } from "../lib/useCollection";
import type { Client } from "../lib/types";
import { usd } from "../lib/pb";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const empty = {
  name: "",
  default_platform: "",
  monthly_amount: "",
  billing_type: "monthly",
  pay_frequency: "monthly",
  active: true,
};

const BILLING_LABEL: Record<string, string> = { monthly: "Por mês", hourly: "Por hora" };
const FREQ_LABEL: Record<string, string> = { monthly: "Mensal", weekly: "Semanal" };

// Standard full-time month used to turn an hourly rate into a monthly reference
// (4 weeks x 40h). The monthly_amount field stores the hourly rate for hourly
// clients and the monthly amount for monthly clients.
const HOURS_PER_MONTH = 160;
function monthlyReference(c: { monthly_amount?: number; billing_type?: string }) {
  if (!c.monthly_amount) return 0;
  return c.billing_type === "hourly" ? c.monthly_amount * HOURS_PER_MONTH : c.monthly_amount;
}

export default function Clients() {
  const { list, create, update, remove } = useCollection<Client>("clients", {
    sort: "name",
  });
  const platforms = usePlatformNames();
  const [editing, setEditing] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>(empty);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(c: Client) {
    setEditing(c);
    setForm({
      name: c.name,
      default_platform: c.default_platform ?? "",
      monthly_amount: c.monthly_amount != null ? String(c.monthly_amount) : "",
      billing_type: c.billing_type || "monthly",
      pay_frequency: c.pay_frequency || "monthly",
      active: c.active ?? true,
    });
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      ...form,
      monthly_amount: form.monthly_amount === "" ? 0 : Number(form.monthly_amount),
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Plataforma padrão</th>
              <th className="px-4 py-3 text-left">Cobrança</th>
              <th className="px-4 py-3 text-left">Pagamento</th>
              <th className="px-4 py-3 text-right">Valor de referência mensal</th>
              <th className="px-4 py-3 text-left">Ativo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{c.default_platform || "—"}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{BILLING_LABEL[c.billing_type ?? ""] ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{FREQ_LABEL[c.pay_frequency ?? ""] ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {c.monthly_amount ? usd(monthlyReference(c)) : "—"}
                </td>
                <td className="px-4 py-3">{c.active ? "Sim" : "Não"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => openEdit(c)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(c.id)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhum cliente cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {open && (
        <Modal title={editing ? "Editar cliente" : "Novo cliente"} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome">
              <Input
                required
                value={form.name as string}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Plataforma padrão">
              <Select
                value={form.default_platform as string}
                onChange={(e) => setForm({ ...form, default_platform: e.target.value })}
              >
                <option value="">—</option>
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cobrança">
                <Select
                  value={form.billing_type as string}
                  onChange={(e) => setForm({ ...form, billing_type: e.target.value })}
                >
                  <option value="monthly">Por mês</option>
                  <option value="hourly">Por hora</option>
                </Select>
              </Field>
              <Field label="Pagamento">
                <Select
                  value={form.pay_frequency as string}
                  onChange={(e) => setForm({ ...form, pay_frequency: e.target.value })}
                >
                  <option value="monthly">Mensal</option>
                  <option value="weekly">Semanal</option>
                </Select>
              </Field>
            </div>
            <Field
              label={`Valor de referência ${
                form.billing_type === "hourly" ? "por hora" : "mensal"
              } (USD)`}
            >
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.monthly_amount as string}
                onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })}
              />
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                {form.billing_type === "hourly"
                  ? `Taxa por hora. Referência mensal ≈ ${usd(
                      Number(form.monthly_amount || 0) * HOURS_PER_MONTH,
                    )} (${HOURS_PER_MONTH}h/mês). `
                  : ""}
                Serve só para pré-preencher a remessa, sempre editável.
              </span>
            </Field>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={form.active as boolean}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Ativo
            </label>
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

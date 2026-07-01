import { useState } from "react";
import { useCollection, usePlatformNames } from "../lib/useCollection";
import type { Client } from "../lib/types";
import { usd } from "../lib/pb";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const empty = { name: "", default_platform: "", monthly_amount: "", active: true };

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
              <th className="px-4 py-3 text-right">Valor mensal</th>
              <th className="px-4 py-3 text-left">Ativo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{c.default_platform || "—"}</td>
                <td className="px-4 py-3 text-right">{c.monthly_amount ? usd(c.monthly_amount) : "—"}</td>
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
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
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
            <Field label="Valor mensal (USD)">
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.monthly_amount as string}
                onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })}
              />
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

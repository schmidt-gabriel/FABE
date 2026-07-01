import { useState } from "react";
import { useCollection } from "../lib/useCollection";
import type { PlatformRecord } from "../lib/types";
import { Button, Card, Field, Input, Modal } from "../components/ui";

const empty = { name: "", active: true };

export default function Platforms() {
  const { list, create, update, remove } = useCollection<PlatformRecord>("platforms", {
    sort: "name",
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformRecord | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(empty);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(p: PlatformRecord) {
    setEditing(p);
    setForm({ name: p.name, active: p.active ?? true });
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) await update.mutateAsync({ id: editing.id, data: form });
    else await create.mutateAsync(form);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Ativa</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">{p.active !== false ? "Sim" : "Não"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => openEdit(p)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(p.id)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhuma plataforma cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {open && (
        <Modal title={editing ? "Editar plataforma" : "Nova plataforma"} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome">
              <Input
                required
                value={form.name as string}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={form.active as boolean}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Ativa
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

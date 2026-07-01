import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection, usePlatformNames } from "../lib/useCollection";
import { useYear } from "../lib/year";
import type { Client, Remittance } from "../lib/types";
import { usd, fmtDate, toDateInput, fromDateInput } from "../lib/pb";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const empty = { client: "", platform: "", amount_usd: "", pay_day: "", notes: "" };

export default function Remittances() {
  const { list, create, update, remove } = useCollection<Remittance>("remittances", {
    sort: "pay_day",
    expand: "client",
  });
  const clients = useCollection<Client>("clients", { sort: "name" });
  const platforms = usePlatformNames();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Remittance | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(empty);
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
  function openEdit(r: Remittance) {
    setEditing(r);
    setForm({
      client: r.client,
      platform: r.platform,
      amount_usd: r.amount_usd,
      pay_day: toDateInput(r.pay_day),
      notes: r.notes ?? "",
    });
    setOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      ...form,
      amount_usd: Number(form.amount_usd),
      pay_day: fromDateInput(form.pay_day as string),
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  const { year } = useYear();
  const rows = (list.data ?? []).filter((r) => r.pay_day.slice(0, 4) === String(year));
  const total = rows.reduce((s, r) => s + r.amount_usd, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Remessas · {year}</h1>
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Plataforma</th>
              <th className="px-4 py-3 text-right">Valor (USD)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3">{fmtDate(r.pay_day)}</td>
                <td className="px-4 py-3 font-medium">{r.expand?.client?.name ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{r.platform}</td>
                <td className="px-4 py-3 text-right">{usd(r.amount_usd)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => openEdit(r)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(r.id)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhuma remessa registrada em {year}.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-800/50">
            <tr className="border-t border-neutral-200 dark:border-neutral-700">
              <td className="px-4 py-3" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-3 text-right">{usd(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      {open && (
        <Modal
          title={editing ? "Editar remessa" : "Nova remessa"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Cliente">
              <Select
                required
                value={form.client as string}
                onChange={(e) => {
                  const c = clients.list.data?.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    client: e.target.value,
                    platform: c?.default_platform ?? form.platform,
                    // pre-fill with the client's standard monthly amount; stays
                    // editable for differences (e.g. vacation).
                    amount_usd: c?.monthly_amount ? String(c.monthly_amount) : form.amount_usd,
                  });
                }}
              >
                <option value="">Selecione…</option>
                {clients.list.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Plataforma">
              <Select
                required
                value={form.platform as string}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                <option value="">Selecione…</option>
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Valor (USD)">
              <Input
                type="number"
                step="0.01"
                required
                value={form.amount_usd as string}
                onChange={(e) => setForm({ ...form, amount_usd: e.target.value })}
              />
            </Field>
            <Field label="Data do pagamento">
              <Input
                type="date"
                required
                value={form.pay_day as string}
                onChange={(e) => setForm({ ...form, pay_day: e.target.value })}
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

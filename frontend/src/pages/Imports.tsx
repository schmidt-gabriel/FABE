import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection, usePlatformNames } from "../lib/useCollection";
import { useYear } from "../lib/year";
import type { ImportRecord } from "../lib/types";
import { pb, brl, usd, fmtDate, toDateInput, fromDateInput } from "../lib/pb";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const empty = { platform: "", amount_usd: "", convert_day: "", amount_brl: "", notes: "" };

export default function Imports() {
  const { list, create, update, remove } = useCollection<ImportRecord>("imports", {
    sort: "convert_day",
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ImportRecord | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [fetchingFx, setFetchingFx] = useState(false);
  const [fxError, setFxError] = useState("");
  const platforms = usePlatformNames();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effective rate = BRL received / USD sent (embeds the platform fee).
  const effectiveRate = (() => {
    const u = Number(form.amount_usd);
    const b = Number(form.amount_brl);
    return u > 0 && b > 0 ? b / u : 0;
  })();

  function openNew() {
    setEditing(null);
    setForm(empty);
    setFxError("");
    setOpen(true);
  }
  function openEdit(i: ImportRecord) {
    setEditing(i);
    setFxError("");
    setForm({
      platform: i.platform,
      amount_usd: String(i.amount_usd),
      convert_day: toDateInput(i.convert_day),
      amount_brl: String(i.amount_brl),
      notes: i.notes ?? "",
    });
    setOpen(true);
  }

  // Estimate the BRL received from the market rate (starting point; the user
  // then adjusts to the actual value received after the platform fee).
  async function estimateBrl() {
    setFetchingFx(true);
    setFxError("");
    try {
      const res = await fetch(`/api/fx/usd-brl?date=${form.convert_day || ""}`, {
        headers: { Authorization: pb.authStore.token },
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rate: number };
      const u = Number(form.amount_usd);
      setForm((f) => ({ ...f, amount_brl: u > 0 ? (u * data.rate).toFixed(2) : f.amount_brl }));
    } catch {
      setFxError("Não foi possível buscar a cotação.");
    } finally {
      setFetchingFx(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      platform: form.platform,
      amount_usd: Number(form.amount_usd),
      convert_day: fromDateInput(form.convert_day),
      rate: effectiveRate,
      amount_brl: Number(form.amount_brl),
      notes: form.notes,
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  const { year } = useYear();
  const rows = (list.data ?? []).filter((i) => i.convert_day.slice(0, 4) === String(year));
  const totalUsd = rows.reduce((s, i) => s + i.amount_usd, 0);
  const totalBrl = rows.reduce((s, i) => s + i.amount_brl, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notas Fiscais · {year}</h1>
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Plataforma</th>
              <th className="px-4 py-3 text-right">USD</th>
              <th className="px-4 py-3 text-right">Cotação</th>
              <th className="px-4 py-3 text-right">BRL</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3">{fmtDate(i.convert_day)}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{i.platform}</td>
                <td className="px-4 py-3 text-right">{usd(i.amount_usd)}</td>
                <td className="px-4 py-3 text-right">{i.rate.toFixed(4)}</td>
                <td className="px-4 py-3 text-right font-medium">{brl(i.amount_brl)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => openEdit(i)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(i.id)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhuma importação registrada em {year}.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-800/50">
            <tr className="border-t border-neutral-200 dark:border-neutral-700">
              <td className="px-4 py-3" colSpan={2}>
                Total
              </td>
              <td className="px-4 py-3 text-right">{usd(totalUsd)}</td>
              <td />
              <td className="px-4 py-3 text-right">{brl(totalBrl)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      {open && (
        <Modal
          title={editing ? "Editar importação" : "Nova importação"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Plataforma">
              <Select
                required
                value={form.platform}
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
                value={form.amount_usd}
                onChange={(e) => setForm({ ...form, amount_usd: e.target.value })}
              />
            </Field>
            <Field label="Data da conversão">
              <Input
                type="date"
                required
                value={form.convert_day}
                onChange={(e) => setForm({ ...form, convert_day: e.target.value })}
              />
            </Field>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Valor recebido (BRL)">
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={form.amount_brl}
                    onChange={(e) => setForm({ ...form, amount_brl: e.target.value })}
                  />
                </Field>
              </div>
              <Button type="button" variant="ghost" onClick={estimateBrl} disabled={fetchingFx}>
                {fetchingFx ? "Buscando…" : "Estimar pelo câmbio"}
              </Button>
            </div>
            {fxError && <p className="text-sm text-red-600">{fxError}</p>}
            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              Cotação efetiva:{" "}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {effectiveRate ? effectiveRate.toFixed(4) : "—"}
              </span>
              <span className="text-neutral-400 dark:text-neutral-500"> (BRL ÷ USD, já com a taxa da plataforma)</span>
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

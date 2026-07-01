import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, brl, fmtDate, toDateInput, fromDateInput } from "../lib/pb";
import { useCollection } from "../lib/useCollection";
import type { OtherTax } from "../lib/types";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

type Quarter = {
  quarter: number;
  revenue: number;
  base_irpj: number;
  irpj: number;
  irpj_adicional: number;
  csll: number;
  total: number;
  status: "locked" | "forecast";
  due_date: string;
};

type TaxResponse = {
  year: number;
  quarters: Quarter[];
  year_total: number;
};

const YEARS = [2026, 2025, 2024, 2023];
const QUARTER_MONTHS = ["jan-mar", "abr-jun", "jul-set", "out-dez"];
const today = () => new Date().toISOString().slice(0, 10);

async function authFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: pb.authStore.token, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Falha na requisição");
  return res.json();
}

export default function Taxes() {
  const [year, setYear] = useState(2026);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<TaxResponse>({
    queryKey: ["tax", year],
    queryFn: () => authFetch(`/api/tax/compute?year=${year}`),
  });

  const lock = useMutation({
    mutationFn: (v: { quarter: number; locked: boolean }) =>
      authFetch(`/api/tax/${v.locked ? "lock" : "unlock"}`, {
        method: "POST",
        body: JSON.stringify({ year, quarter: v.quarter }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax", year] }),
  });

  const others = useCollection<OtherTax>("other_taxes", { sort: "due_date" });
  const [taxOpen, setTaxOpen] = useState(false);
  const [editingTax, setEditingTax] = useState<OtherTax | null>(null);
  const emptyTax = { name: "", reference: "", due_date: "", amount: "", notes: "", paid: false };
  const [taxForm, setTaxForm] = useState<Record<string, unknown>>(emptyTax);

  function openTax() {
    setEditingTax(null);
    setTaxForm(emptyTax);
    setTaxOpen(true);
  }
  function editTax(t: OtherTax) {
    setEditingTax(t);
    setTaxForm({
      name: t.name,
      reference: toDateInput(t.reference),
      due_date: toDateInput(t.due_date),
      amount: String(t.amount),
      notes: t.notes ?? "",
      paid: t.paid ?? false,
    });
    setTaxOpen(true);
  }
  async function submitTax(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: taxForm.name,
      reference: taxForm.reference ? fromDateInput(taxForm.reference as string) : "",
      due_date: fromDateInput(taxForm.due_date as string),
      amount: Number(taxForm.amount),
      notes: taxForm.notes,
      paid: taxForm.paid,
    };
    if (editingTax) await others.update.mutateAsync({ id: editingTax.id, data });
    else await others.create.mutateAsync(data);
    setTaxOpen(false);
  }
  const othersOfYear = (others.list.data ?? []).filter((t) => t.due_date.slice(0, 4) === String(year));

  // Next payment = nearest upcoming obligation among forecast quarters and
  // unpaid other taxes.
  const next = (() => {
    const obligations = [
      ...(data?.quarters ?? [])
        .filter((q) => q.status === "forecast" && q.total > 0)
        .map((q) => ({
          label: `Imposto T${q.quarter} (${QUARTER_MONTHS[q.quarter - 1]})`,
          due: q.due_date,
          amount: q.total,
        })),
      ...othersOfYear
        .filter((t) => !t.paid)
        .map((t) => ({ label: t.name, due: t.due_date.slice(0, 10), amount: t.amount })),
    ].sort((a, b) => a.due.localeCompare(b.due));
    return obligations.find((o) => o.due >= today()) ?? obligations[0];
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Impostos</h1>
        <div className="w-32">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading && <p className="text-neutral-500 dark:text-neutral-400">Calculando…</p>}
      {error && <p className="text-red-600">{(error as Error).message}</p>}

      {next && (
        <Card className="p-5">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Próximo pagamento · {next.label}
          </p>
          <p className="mt-1 text-3xl font-semibold">{brl(next.amount)}</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            vence em {fmtDate(next.due)}
          </p>
        </Card>
      )}

      {data && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-left">Trimestre</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Vencimento</th>
                <th className="px-4 py-3 text-right">Receita</th>
                <th className="px-4 py-3 text-right">IRPJ</th>
                <th className="px-4 py-3 text-right">CSLL</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.quarters.map((q) => {
                const locked = q.status === "locked";
                return (
                  <tr key={q.quarter} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-4 py-3 font-medium">
                      T{q.quarter}{" "}
                      <span className="font-normal text-neutral-400 dark:text-neutral-500">
                        ({QUARTER_MONTHS[q.quarter - 1]})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          locked
                            ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                        }`}
                      >
                        {locked ? "Travado" : "Previsão"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {fmtDate(q.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right">{brl(q.revenue)}</td>
                    <td className="px-4 py-3 text-right">{brl(q.irpj + q.irpj_adicional)}</td>
                    <td className="px-4 py-3 text-right">{brl(q.csll)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(q.total)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {locked && (
                        <Button
                          variant="ghost"
                          disabled={lock.isPending}
                          onClick={() => lock.mutate({ quarter: q.quarter, locked: false })}
                        >
                          Destravar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-800/50">
              <tr className="border-t border-neutral-200 dark:border-neutral-700">
                <td className="px-4 py-3" colSpan={6}>
                  Total do ano
                </td>
                <td className="px-4 py-3 text-right">{brl(data.year_total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Trimestres travam automaticamente no vencimento, congelando o valor pago.
        Trimestres em aberto mostram a previsão ao vivo. Use “Destravar” para corrigir.
      </p>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-semibold">Outros impostos</h2>
        <Button onClick={openTax}>+ Adicionar</Button>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">Imposto</th>
              <th className="px-4 py-3 text-left">Referência</th>
              <th className="px-4 py-3 text-left">Vencimento</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {othersOfYear.map((t) => (
              <tr key={t.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {t.reference ? fmtDate(t.reference) : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {fmtDate(t.due_date)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.paid
                        ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                    }`}
                  >
                    {t.paid ? "Pago" : "A pagar"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{brl(t.amount)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    onClick={() => others.update.mutate({ id: t.id, data: { paid: !t.paid } })}
                  >
                    {t.paid ? "Desmarcar" : "Marcar pago"}
                  </Button>
                  <Button variant="ghost" onClick={() => editTax(t)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => others.remove.mutate(t.id)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {othersOfYear.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Nenhum imposto avulso lançado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {taxOpen && (
        <Modal
          title={editingTax ? "Editar imposto" : "Novo imposto"}
          onClose={() => setTaxOpen(false)}
        >
          <form onSubmit={submitTax} className="space-y-4">
            <Field label="Imposto">
              <Input
                required
                placeholder="Ex: Taxa de Fiscalização de Estabelecimentos"
                value={taxForm.name as string}
                onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
              />
            </Field>
            <Field label="Referência (competência)">
              <Input
                type="date"
                value={taxForm.reference as string}
                onChange={(e) => setTaxForm({ ...taxForm, reference: e.target.value })}
              />
            </Field>
            <Field label="Vencimento">
              <Input
                type="date"
                required
                value={taxForm.due_date as string}
                onChange={(e) => setTaxForm({ ...taxForm, due_date: e.target.value })}
              />
            </Field>
            <Field label="Valor (BRL)">
              <Input
                type="number"
                step="0.01"
                required
                value={taxForm.amount as string}
                onChange={(e) => setTaxForm({ ...taxForm, amount: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={taxForm.paid as boolean}
                onChange={(e) => setTaxForm({ ...taxForm, paid: e.target.checked })}
              />
              Pago
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setTaxOpen(false)}>
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

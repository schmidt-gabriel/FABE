import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { brl, fromDateInput, toDateInput } from "../lib/pb";
import { portfolioTotals, positions, type Investment } from "../lib/invest";
import { NoInvestments, PositionCard, useCdi } from "../components/invest";
import { Button, Field, Input, Modal, Select } from "../components/ui";

const empty = {
  name: "",
  broker: "",
  kind: "cdb",
  cdi_pct: "100",
  amount: "",
  applied_at: "",
  liquidity: "maturity",
  maturity: "",
};

// A carteira: os títulos que foram comprados, cada um com o que foi aplicado e
// quando. O card responde "quanto tenho hoje" (líquido, IR já descontado pela
// faixa dos dias corridos). Todo campo de entrada de um título mora no modal;
// o CDI, que vale para a carteira toda, é o único que fica no cabeçalho.
export default function Investments() {
  const { list, create, update, remove } = useCollection<Investment>(
    "investments_invest",
    { sort: "name" },
  );
  // O CDI vale para a carteira toda (é o indexador de todo título), então é o
  // único parâmetro global: mora no cabeçalho e é guardado em settings_invest.
  const { cdi, setCdi } = useCdi();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [searchParams, setSearchParams] = useSearchParams();

  // The sidebar "+" links here with ?new=1, so react to the query string.
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
    setOpen(true);
  }

  function openEdit(inv: Investment) {
    setEditing(inv);
    setForm({
      name: inv.name,
      broker: inv.broker ?? "",
      kind: inv.kind,
      cdi_pct: String(inv.cdi_pct),
      amount: inv.amount ? String(inv.amount) : "",
      applied_at: toDateInput(inv.applied_at),
      liquidity: inv.liquidity ?? "maturity",
      maturity: toDateInput(inv.maturity),
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      broker: form.broker,
      kind: form.kind,
      cdi_pct: Number(form.cdi_pct),
      amount: form.amount ? Number(form.amount) : 0,
      applied_at: form.applied_at ? fromDateInput(form.applied_at) : "",
      liquidity: form.liquidity,
      maturity: form.maturity ? fromDateInput(form.maturity) : "",
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  const carteira = positions(list.data ?? [], cdi);
  const total = portfolioTotals(carteira);
  // Corretoras já usadas, para sugerir no formulário.
  const brokers = [
    ...new Set((list.data ?? []).map((i) => i.broker?.trim()).filter(Boolean)),
  ].sort() as string[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Investimentos</h1>
          {/* A carteira em uma linha. */}
          <p className="mt-1 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
            {brl(total.net)} hoje · {brl(total.amount)} aplicados ·{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              + {brl(total.netGain)}
            </span>
          </p>
        </div>
        {/* O CDI ao lado do botão: um parâmetro só, editado onde é lido. */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
            CDI (% a.a.)
            <span className="w-24">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={cdi}
                onChange={(e) => setCdi(Number(e.target.value))}
              />
            </span>
          </label>
          <Button onClick={openNew}>+ Adicionar</Button>
        </div>
      </div>

      {carteira.length === 0 ? (
        <NoInvestments onAdd={openNew} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {carteira.map((p) => (
            <PositionCard
              key={p.investment.id}
              position={p}
              actions={
                <>
                  <Button variant="ghost" onClick={() => openEdit(p.investment)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(p.investment.id)}>
                    Excluir
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? "Editar investimento" : "Novo investimento"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome">
              <Input
                required
                placeholder="Nome"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Corretora">
              <Input
                list="invest-brokers"
                placeholder="XP"
                value={form.broker}
                onChange={(e) => setForm({ ...form, broker: e.target.value })}
              />
            </Field>
            <datalist id="invest-brokers">
              {brokers.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <Field label="Tipo">
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="cdb">CDB (IR regressivo)</option>
                <option value="lci_lca">LCI/LCA (isento)</option>
              </Select>
            </Field>
            <Field label="Taxa (% do CDI)">
              <Input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.cdi_pct}
                onChange={(e) => setForm({ ...form, cdi_pct: e.target.value })}
              />
            </Field>
            <Field label="Valor aplicado (R$)">
              <Input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Data da aplicação">
              <Input
                type="date"
                required
                value={form.applied_at}
                onChange={(e) => setForm({ ...form, applied_at: e.target.value })}
              />
            </Field>
            <Field label="Liquidez">
              <Select
                value={form.liquidity}
                onChange={(e) => setForm({ ...form, liquidity: e.target.value })}
              >
                <option value="maturity">No vencimento</option>
                <option value="daily">Diária</option>
                <option value="market">Mercado</option>
              </Select>
            </Field>
            <Field label="Vencimento">
              <Input
                type="date"
                value={form.maturity}
                onChange={(e) => setForm({ ...form, maturity: e.target.value })}
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

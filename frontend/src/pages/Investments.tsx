import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { brl, fromDateInput, toDateInput } from "../lib/pb";
import { simulate, type Investment } from "../lib/invest";
import { NoInvestments, ResultCard, useSimConfig } from "../components/invest";
import { Button, Field, Input, Modal, Select } from "../components/ui";

const empty = {
  name: "",
  kind: "cdb",
  cdi_pct: "100",
  liquidity: "maturity",
  maturity: "",
};

// Onde o dinheiro foi (ou seria) aplicado: cadastro dos títulos, já com o
// resultado de cada um sob a configuração global, do melhor para o pior.
export default function Investments() {
  const { list, create, update, remove } = useCollection<Investment>(
    "investments_invest",
    { sort: "name" },
  );
  // Read-only here: os parâmetros são editados na Simulação. Esta tela é só
  // cadastro, e todo campo de entrada dela vive dentro do modal.
  const { cfg } = useSimConfig();
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
      kind: inv.kind,
      cdi_pct: String(inv.cdi_pct),
      liquidity: inv.liquidity ?? "maturity",
      maturity: toDateInput(inv.maturity),
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      kind: form.kind,
      cdi_pct: Number(form.cdi_pct),
      liquidity: form.liquidity,
      maturity: form.maturity ? fromDateInput(form.maturity) : "",
    };
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setOpen(false);
  }

  const results = simulate(list.data ?? [], cfg);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Investimentos</h1>
          {/* De onde vêm os números dos cards, sem repetir os controles. */}
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            CDI {cfg.cdi.toLocaleString("pt-BR")}% · {brl(cfg.amount)} ·{" "}
            {cfg.months} {cfg.months === 1 ? "mês" : "meses"}
          </p>
        </div>
        <Button onClick={openNew}>+ Adicionar</Button>
      </div>

      {results.length === 0 ? (
        <NoInvestments onAdd={openNew} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((r, i) => (
            <ResultCard
              key={r.investment.id}
              result={r}
              best={i === 0}
              actions={
                <>
                  <Button variant="ghost" onClick={() => openEdit(r.investment)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate(r.investment.id)}>
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
                placeholder="LCI Pine"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
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
                step="0.1"
                min={0}
                required
                value={form.cdi_pct}
                onChange={(e) => setForm({ ...form, cdi_pct: e.target.value })}
              />
            </Field>
            <Field label="Liquidez">
              <Select
                value={form.liquidity}
                onChange={(e) => setForm({ ...form, liquidity: e.target.value })}
              >
                <option value="maturity">No vencimento</option>
                <option value="daily">Diária</option>
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

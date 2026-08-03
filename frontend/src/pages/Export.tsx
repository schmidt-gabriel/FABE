import { useState } from "react";
import { pb } from "../lib/pb";
import { Button, Card, Modal } from "../components/ui";

const COLLECTIONS = [
  { name: "remittances", label: "Remessas" },
  { name: "imports", label: "Notas Fiscais" },
  { name: "expenses", label: "Despesas" },
  { name: "profit_distributions", label: "Distribuição de Lucros" },
  { name: "tax_periods", label: "Impostos (períodos)" },
  { name: "clients", label: "Clientes" },
  { name: "platforms", label: "Plataformas" },
  { name: "recurring_services", label: "Serviços recorrentes" },
  { name: "settings", label: "Configurações" },
];

async function download(path: string, filename: string) {
  const res = await fetch(path, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!res.ok) throw new Error("Falha ao exportar");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");

  async function runImport(mode: "overwrite" | "append") {
    if (!file) {
      setMsg("Selecione um arquivo .json primeiro.");
      return;
    }
    if (
      mode === "overwrite" &&
      !window.confirm("Isso vai APAGAR todos os dados atuais e substituir pelo backup. Continuar?")
    ) {
      return;
    }
    setImporting(true);
    setMsg("");
    try {
      const text = await file.text();
      const res = await fetch(`/api/import/backup?mode=${mode}`, {
        method: "POST",
        headers: { Authorization: pb.authStore.token, "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Falha ao importar");
      const total = Object.values(data.imported as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      setMsg(
        `${total} registro(s) importado(s) (${mode === "overwrite" ? "substituição completa" : "adição"}).`,
      );
    } catch (e) {
      setMsg("Erro: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Importar backup" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Carregue um arquivo de backup (JSON) e escolha como aplicar.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setMsg("");
          }}
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800 dark:text-neutral-400 dark:file:bg-neutral-100 dark:file:text-neutral-900"
        />
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          <strong>Adicionar:</strong> insere registros novos, mantendo os existentes.{" "}
          <strong>Sobrescrever:</strong> apaga tudo e substitui pelo backup.
        </p>
        {msg && <p className="text-sm text-neutral-700 dark:text-neutral-300">{msg}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => runImport("append")} disabled={importing}>
            {importing ? "Importando…" : "Adicionar (append)"}
          </Button>
          <Button variant="danger" onClick={() => runImport("overwrite")} disabled={importing}>
            Sobrescrever tudo
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Export() {
  const [busy, setBusy] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function run(key: string, path: string, filename: string) {
    setBusy(key);
    try {
      await download(path, filename);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Backup completo</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Dump JSON de todas as coleções. Formato portátil, ideal para migrar para outro banco de
          dados ou guardar como backup.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => run("backup", "/api/export/backup", "financeapp-backup.json")}
            disabled={busy === "backup"}
          >
            {busy === "backup" ? "Exportando…" : "Baixar backup (JSON)"}
          </Button>
          <Button variant="ghost" onClick={() => setImportOpen(true)}>
            Importar backup
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold">CSV por coleção</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Uma planilha por tabela. Abre no Excel/Numbers e importa em qualquer banco.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COLLECTIONS.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700"
            >
              <span className="text-sm">{c.label}</span>
              <Button
                variant="ghost"
                onClick={() => run(c.name, `/api/export/csv/${c.name}`, `${c.name}.csv`)}
                disabled={busy === c.name}
              >
                {busy === c.name ? "…" : "CSV"}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Banco de dados</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              PocketBase Admin: coleções, registros e configurações do servidor. Mesmo email e
              senha desta conta.
            </p>
          </div>
          <a
            href="/_/"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Abrir PocketBase Admin ↗
          </a>
        </div>
      </Card>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

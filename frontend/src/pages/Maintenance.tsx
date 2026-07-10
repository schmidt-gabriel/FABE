import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { Button, Card } from "../components/ui";

// Manual trigger for the background routines that also run on the daily cron
// (06:00) and at startup. Handy to post auto-debited service expenses right
// away instead of waiting for the schedule.
export default function Maintenance() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function runAutoRegister() {
    setRunning(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/maintenance/auto-register", {
        method: "POST",
        headers: { Authorization: pb.authStore.token },
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { created: number; paid: number };
      // Refresh expenses so any newly posted/paid ones show up immediately.
      qc.invalidateQueries({ queryKey: ["expenses"] });
      const parts: string[] = [];
      if (data.created > 0) parts.push(`${data.created} despesa(s) lançada(s)`);
      if (data.paid > 0) parts.push(`${data.paid} pagamento(s) automático(s) quitado(s)`);
      setMsg(
        parts.length > 0
          ? `${parts.join(" · ")}.`
          : "Nada a fazer: nenhum pagamento automático vencido em aberto.",
      );
    } catch {
      setError("Não foi possível rodar a rotina.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Rotinas automáticas rodam na inicialização e diariamente às 06:00. Use os
        botões abaixo para disparar manualmente quando quiser.
      </p>

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-neutral-900 dark:text-neutral-100">
            Pagamentos automáticos
          </p>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            Lança as despesas dos serviços marcados como automáticos e quita as despesas a
            pagar automáticas cujo vencimento já chegou.
          </p>
        </div>
        <Button onClick={runAutoRegister} disabled={running}>
          {running ? "Rodando…" : "Rodar agora"}
        </Button>
      </Card>

      {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

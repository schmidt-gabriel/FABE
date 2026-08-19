import { useCollection } from "../lib/useCollection";
import { brl } from "../lib/pb";
import { horizon, simulate, type Investment } from "../lib/invest";
import { RendaFixaCard, ResultCard, useSimConfig } from "../components/invest";
import { BarChart } from "../components/charts";

// Simulação: só de leitura, dividida em uma seção por classe de ativo (hoje
// só "Renda fixa": os parâmetros, o cálculo rápido de uma taxa qualquer e a
// comparação dos títulos cadastrados, do melhor para o pior). Cadastrar é
// assunto da tela de Investimentos: aqui nada é criado nem editado.
export default function InvestSimulation() {
  const { cfg, setCfg } = useSimConfig();
  const { list } = useCollection<Investment>("investments_invest", { sort: "name" });

  const results = simulate(list.data ?? [], cfg);
  const h = horizon(cfg.months);
  const [first, second] = results;
  const prazo = `${cfg.months} ${cfg.months === 1 ? "mês" : "meses"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulação</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {h.businessDays} dias úteis · {h.calendarDays} dias corridos
        </p>
      </div>

      {/* Uma seção por classe de ativo: as próximas entram como irmãs desta,
          cada uma com os seus próprios parâmetros. Nada fica solto fora de
          uma seção. */}
      <h2 className="text-lg font-semibold">Renda fixa</h2>
      <RendaFixaCard cfg={cfg} onChange={setCfg} />

      {results.length > 0 && (
        <>
          {/* Um veredito, uma frase: quem ganha e por quanto. */}
          <p className="text-sm font-medium">
            {second ? (
              <>
                {first.investment.name} rende {brl(first.netGain - second.netGain)} a
                mais que o 2º lugar em {prazo}.
              </>
            ) : (
              <>
                {first.investment.name} rende {brl(first.netGain)} em {prazo}.
              </>
            )}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((r, i) => (
              <ResultCard key={r.investment.id} result={r} best={i === 0} />
            ))}
          </div>

          <BarChart
            title="Ganho líquido"
            subtitle={prazo}
            data={results.map((r) => ({
              label: r.investment.name,
              values: [r.netGain],
            }))}
            color="var(--viz-s1)"
            format={brl}
            height={Math.max(140, results.length * 34 + 16)}
          />
        </>
      )}
    </div>
  );
}

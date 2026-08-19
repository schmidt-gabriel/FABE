import { useNavigate } from "react-router-dom";
import { useCollection } from "../lib/useCollection";
import { brl } from "../lib/pb";
import { horizon, simulate, type Investment } from "../lib/invest";
import {
  NoInvestments,
  QuickCalc,
  ResultCard,
  SimControls,
  useSimConfig,
} from "../components/invest";
import { BarChart } from "../components/charts";

// Simulação: os três parâmetros globais no topo, um card por investimento
// ordenado do melhor para o pior, e o gráfico dos ganhos líquidos.
export default function InvestSimulation() {
  const navigate = useNavigate();
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

      <SimControls cfg={cfg} onChange={setCfg} />
      <QuickCalc cfg={cfg} />

      {results.length === 0 ? (
        <NoInvestments onAdd={() => navigate("/pf/investimentos?new=1")} />
      ) : (
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

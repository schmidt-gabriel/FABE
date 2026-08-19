import { horizon } from "../lib/invest";
import { RendaFixaCard, useSimConfig } from "../components/invest";

// Simulação: um cálculo hipotético e nada mais. Sem dados reais e sem cadastro
// (a carteira de verdade é a tela de Investimentos), dividida em uma seção por
// classe de ativo, hoje só "Renda fixa".
export default function InvestSimulation() {
  const { cfg, setCfg } = useSimConfig();
  const h = horizon(cfg.months);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulação</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {h.businessDays} dias úteis · {h.calendarDays} dias corridos
        </p>
      </div>

      {/* Uma seção por classe de ativo: as próximas entram como irmãs desta,
          cada uma com os seus próprios parâmetros. */}
      <h2 className="text-lg font-semibold">Renda fixa</h2>
      <RendaFixaCard cfg={cfg} onChange={setCfg} />
    </div>
  );
}

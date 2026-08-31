// Calculadora de renda fixa (módulo Pessoa Física).
//
// Pure functions, no React, no I/O: a carteira é uma função do CDI e da lista
// de investimentos.
//
// Convention followed everywhere here: percentages arrive the way the user
// types them (13.9 = 13,9% a.a., 98 = 98% do CDI) and are turned into
// fractions at the edge, by `fromPct`.

import type { BaseRecord } from "./types";

export type InvestKind = "cdb" | "lci_lca";
export type Liquidity = "daily" | "maturity" | "market";

export interface Investment extends BaseRecord {
  name: string;
  kind: InvestKind;
  /** % do CDI contratado (98 = 98% do CDI). */
  cdi_pct: number;
  liquidity?: Liquidity;
  /** PocketBase datetime; empty means no maturity (e.g. pure daily liquidity). */
  maturity?: string;
  /** Valor aplicado de verdade, R$ (a aba Investimentos são posições reais). */
  amount?: number;
  /** Data da aplicação, PocketBase datetime. */
  applied_at?: string;
  /** Corretora onde o título está ("XP"), texto livre. */
  broker?: string;
  notes?: string;
}

/** CDI usado enquanto o singleton `settings_invest` não tem um valor. */
export const DEFAULT_CDI = 13.9;

export const kindLabel = (k: InvestKind) => (k === "cdb" ? "CDB" : "LCI/LCA");
export const liquidityLabel = (l?: Liquidity) =>
  l === "maturity" ? "No vencimento" : l === "market" ? "Mercado" : "Diária";

const fromPct = (v: number) => v / 100;

// ---------------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------------

/** Dias úteis por ano usados na capitalização do CDI (padrão B3). */
export const BUSINESS_DAYS_PER_YEAR = 252;
const CALENDAR_DAYS_PER_YEAR = 365;

// ---------------------------------------------------------------------------
// IR regressivo (renda fixa), por dias corridos da aplicação
// ---------------------------------------------------------------------------

export const IR_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 180, rate: 0.225 },
  { upTo: 360, rate: 0.2 },
  { upTo: 720, rate: 0.175 },
  { upTo: Infinity, rate: 0.15 },
];

export const irRate = (calendarDays: number) =>
  IR_BRACKETS.find((b) => calendarDays <= b.upTo)!.rate;

// ---------------------------------------------------------------------------
// Rendimento
// ---------------------------------------------------------------------------

/** Taxa diária equivalente ao CDI anual: (1 + cdi)^(1/252) - 1. */
export const dailyCdi = (cdiAnnualPct: number) =>
  Math.pow(1 + fromPct(cdiAnnualPct), 1 / BUSINESS_DAYS_PER_YEAR) - 1;

/**
 * Fator de rendimento composto em dias úteis:
 * (1 + taxa_diária_CDI x %CDI)^dias_úteis
 */
export const growthFactor = (cdiAnnualPct: number, cdiPct: number, businessDays: number) =>
  Math.pow(1 + dailyCdi(cdiAnnualPct) * fromPct(cdiPct), businessDays);

/** Dias úteis equivalentes a um número de dias corridos. */
export const businessDaysIn = (calendarDays: number) =>
  Math.max(
    0,
    Math.round((calendarDays * BUSINESS_DAYS_PER_YEAR) / CALENDAR_DAYS_PER_YEAR),
  );

/** Rendimento de um valor por um período. É o núcleo de tudo nesta tela. */
export interface Yield {
  businessDays: number;
  grossGain: number;
  /** Alíquota de IR aplicada (0 para LCI/LCA). */
  taxRate: number;
  tax: number;
  /** Valor final líquido (aplicado + ganho líquido). */
  net: number;
  netGain: number;
  /** Quanto o líquido equivale em % do CDI (100% do CDI bruto = 100). */
  netCdiPct: number;
}

export function yieldOf(
  amount: number,
  cdiAnnualPct: number,
  cdiPct: number,
  kind: InvestKind,
  calendarDays: number,
): Yield {
  const businessDays = businessDaysIn(calendarDays);
  const grossGain = amount * (growthFactor(cdiAnnualPct, cdiPct, businessDays) - 1);
  // LCI/LCA são isentas; CDB paga IR sobre o rendimento, na faixa do prazo.
  const taxRate = kind === "cdb" ? irRate(calendarDays) : 0;
  const tax = grossGain * taxRate;
  const netGain = grossGain - tax;
  const cdi100Gain = amount * (growthFactor(cdiAnnualPct, 100, businessDays) - 1);
  return {
    businessDays,
    grossGain,
    taxRate,
    tax,
    net: amount + netGain,
    netGain,
    netCdiPct: cdi100Gain > 0 ? (netGain / cdi100Gain) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Posições reais (aba Investimentos)
// ---------------------------------------------------------------------------

const parseDate = (pb?: string) =>
  pb ? new Date(`${pb.slice(0, 10)}T12:00:00`) : null;

export const maturityOf = (inv: Investment) => parseDate(inv.maturity);

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));

/** O que um título comprado de verdade vale hoje, e o que valerá no vencimento. */
export interface Position {
  investment: Investment;
  /** Valor aplicado. Zero quando o registro ainda não tem o campo preenchido. */
  amount: number;
  /** Dias corridos rendendo. Para no vencimento se o título já venceu. */
  days: number;
  /** Resgate hoje: já com o IR da faixa dos `days`. */
  today: Yield;
  /** Projeção líquida no vencimento; null se o título não tem vencimento. */
  atMaturity: (Yield & { days: number }) | null;
  matured: boolean;
  /** Aplicação futura (data ainda por vir) ou sem data: nada rendeu ainda. */
  pending: boolean;
}

export function positionOf(
  inv: Investment,
  cdiAnnualPct: number,
  now: Date = new Date(),
): Position {
  const amount = inv.amount ?? 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const applied = parseDate(inv.applied_at);
  const maturity = maturityOf(inv);

  // Um título vencido para de render: a contagem trava no vencimento.
  const until = maturity && maturity < today ? maturity : today;
  const days = applied ? daysBetween(applied, until) : 0;

  return {
    investment: inv,
    amount,
    days,
    today: yieldOf(amount, cdiAnnualPct, inv.cdi_pct, inv.kind, days),
    atMaturity:
      applied && maturity
        ? {
            days: daysBetween(applied, maturity),
            ...yieldOf(
              amount,
              cdiAnnualPct,
              inv.cdi_pct,
              inv.kind,
              daysBetween(applied, maturity),
            ),
          }
        : null,
    matured: !!maturity && maturity < today,
    pending: !applied || days === 0,
  };
}

/**
 * A carteira toda, do melhor para o pior. O critério é o **% líquido do CDI**,
 * não o ganho em reais: as posições têm tamanhos diferentes, então reais
 * premiariam a maior aplicação em vez do melhor papel.
 */
export function positions(
  list: Investment[],
  cdiAnnualPct: number,
  now?: Date,
): Position[] {
  return list
    .map((inv) => positionOf(inv, cdiAnnualPct, now))
    .sort((a, b) => b.today.netCdiPct - a.today.netCdiPct);
}

/** Somatório da carteira: aplicado, valor hoje e ganho líquido. */
export function portfolioTotals(list: Position[]) {
  return list.reduce(
    (acc, p) => ({
      amount: acc.amount + p.amount,
      net: acc.net + p.today.net,
      netGain: acc.netGain + p.today.netGain,
    }),
    { amount: 0, net: 0, netGain: 0 },
  );
}

// Calculadora de renda fixa (módulo Pessoa Física).
//
// Pure functions, no React, no I/O: the whole simulation is a function of the
// three global inputs (CDI, valor, prazo) and the list of investments.
//
// Convention followed everywhere here: percentages arrive the way the user
// types them (13.9 = 13,9% a.a., 98 = 98% do CDI) and are turned into
// fractions at the edge, by `fromPct`.

import type { BaseRecord } from "./types";

export type InvestKind = "cdb" | "lci_lca";
export type Liquidity = "daily" | "maturity";

export interface Investment extends BaseRecord {
  name: string;
  kind: InvestKind;
  /** % do CDI contratado (98 = 98% do CDI). */
  cdi_pct: number;
  liquidity?: Liquidity;
  /** PocketBase datetime; empty means no maturity (e.g. pure daily liquidity). */
  maturity?: string;
  notes?: string;
}

export interface SimConfig {
  /** CDI atual, % a.a. */
  cdi: number;
  /** Valor a investir, R$. */
  amount: number;
  /** Prazo da simulação, meses. */
  months: number;
}

export const DEFAULT_CONFIG: SimConfig = { cdi: 13.9, amount: 30000, months: 12 };
export const MAX_MONTHS = 36;

export const kindLabel = (k: InvestKind) => (k === "cdb" ? "CDB" : "LCI/LCA");
export const liquidityLabel = (l?: Liquidity) =>
  l === "maturity" ? "No vencimento" : "Diária";

const fromPct = (v: number) => v / 100;

// ---------------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------------

/** Dias úteis por ano usados na capitalização do CDI (padrão B3). */
export const BUSINESS_DAYS_PER_YEAR = 252;
const CALENDAR_DAYS_PER_YEAR = 365;

// Somar meses preservando o fim de mês (31/01 + 1 mês = 28/02, não 03/03).
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), lastDay));
  return d;
}

export interface Horizon {
  start: Date;
  end: Date;
  /** Dias corridos: é o que define a faixa de IR. */
  calendarDays: number;
  /** Dias úteis: é o que capitaliza o CDI. */
  businessDays: number;
}

// Dias úteis são derivados dos corridos pela razão 252/365 em vez de contados
// no calendário: assim os feriados entram na conta sem precisar de uma tabela
// de feriados (12 meses = 365 dias = 252 dias úteis, exatamente).
export function horizon(months: number, from: Date = new Date()): Horizon {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = addMonths(start, months);
  const calendarDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return {
    start,
    end,
    calendarDays,
    businessDays: Math.max(
      1,
      Math.round((calendarDays * BUSINESS_DAYS_PER_YEAR) / CALENDAR_DAYS_PER_YEAR),
    ),
  };
}

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

export interface SimResult {
  investment: Investment;
  grossGain: number;
  tax: number;
  /** Alíquota de IR aplicada (0 para LCI/LCA). */
  taxRate: number;
  /** Valor final líquido. */
  net: number;
  netGain: number;
  /** Quanto o líquido equivale em % do CDI (100% do CDI bruto = 100). */
  netCdiPct: number;
  /** Vence antes do fim da simulação: assume reinvestimento à mesma taxa. */
  maturesEarly: boolean;
  /** Sem liquidez diária e vencendo depois do prazo: não dá para resgatar. */
  lockedPastHorizon: boolean;
}

export function simulateOne(inv: Investment, cfg: SimConfig, h: Horizon): SimResult {
  const grossGain = cfg.amount * (growthFactor(cfg.cdi, inv.cdi_pct, h.businessDays) - 1);
  // LCI/LCA são isentas; CDB paga IR sobre o rendimento, na faixa do prazo.
  const taxRate = inv.kind === "cdb" ? irRate(h.calendarDays) : 0;
  const tax = grossGain * taxRate;
  const netGain = grossGain - tax;
  const cdi100Gain = cfg.amount * (growthFactor(cfg.cdi, 100, h.businessDays) - 1);

  const maturity = inv.maturity ? new Date(`${inv.maturity.slice(0, 10)}T12:00:00`) : null;
  return {
    investment: inv,
    grossGain,
    tax,
    taxRate,
    net: cfg.amount + netGain,
    netGain,
    netCdiPct: cdi100Gain > 0 ? (netGain / cdi100Gain) * 100 : 0,
    maturesEarly: !!maturity && maturity < h.end,
    lockedPastHorizon:
      inv.liquidity === "maturity" && !!maturity && maturity > h.end,
  };
}

/** Simula a carteira toda e ordena do melhor para o pior ganho líquido. */
export function simulate(list: Investment[], cfg: SimConfig): SimResult[] {
  const h = horizon(cfg.months);
  return list.map((inv) => simulateOne(inv, cfg, h)).sort((a, b) => b.netGain - a.netGain);
}

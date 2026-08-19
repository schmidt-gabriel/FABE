// Platforms are now managed in their own collection, so a platform is just a name.
export type Platform = string;

export interface BaseRecord {
  id: string;
  created?: string;
  updated?: string;
}

export interface PlatformRecord extends BaseRecord {
  name: string;
  active?: boolean;
}

export type BillingType = "monthly" | "hourly";
export type PayFrequency = "monthly" | "weekly";

export interface Client extends BaseRecord {
  name: string;
  default_platform?: Platform;
  monthly_amount?: number;
  billing_type?: BillingType;
  pay_frequency?: PayFrequency;
  active?: boolean;
}

export interface Remittance extends BaseRecord {
  client: string;
  platform: Platform;
  amount_usd: number;
  pay_day: string;
  notes?: string;
  expand?: { client?: Client };
}

export interface ImportRecord extends BaseRecord {
  platform: Platform;
  amount_usd: number;
  convert_day: string;
  rate: number;
  amount_brl: number;
  notes?: string;
}

export interface Expense extends BaseRecord {
  date: string; // for scheduled expenses this is the due date
  // Who was paid ("Unimed"); the category groups it ("Health insurance").
  // Optional: records created before the field existed only carry a category.
  payee?: string;
  category: string;
  amount: number;
  notes?: string;
  // Created as a future expense ("a pagar"); shows in the Overview
  // "Próximos pagamentos" card. Regular expenses (scheduled=false) are
  // treated as paid regardless of `paid`.
  scheduled?: boolean;
  paid?: boolean;
  // Auto-debited vs paid manually. Empty (legacy records) is treated as manual.
  payment_type?: "auto" | "manual";
}

// Human label for a payment_type; empty defaults to manual.
export const paymentLabel = (t?: "auto" | "manual") =>
  t === "auto" ? "Automático" : "Manual";

// A regular expense counts as paid; a scheduled one only after being marked.
export const expensePaid = (e: Expense) => !e.scheduled || !!e.paid;

// How an expense is labelled: its payee, or the category for records saved
// before expenses had a payee of their own.
export const expenseLabel = (e: Expense) => e.payee?.trim() || e.category;

// A recurring service is marked paid by an expense whose payee is the service.
// The category still counts because that is how they matched before the payee
// existed (and how a service without its own category fills one in).
export const expenseMatchesService = (e: Expense, service: string) => {
  const s = service.trim().toUpperCase();
  return (e.payee ?? "").trim().toUpperCase() === s || e.category.trim().toUpperCase() === s;
};

export interface ProfitDistribution extends BaseRecord {
  month: string;
  amount: number;
  // IRRF alta renda on this record, in BRL (DARF cód. 1841). Derived, never
  // typed: the law taxes the month as a whole, so the form computes 10% of the
  // month's total and stores each record's share of it, and saving or deleting
  // one record rewrites the share of the others in that month. Summing the
  // records of a month gives the month's withholding.
  irrf?: number;
  notes?: string;
}

// IRRF alta renda (Lei 15.270/2025): a month distributing more than R$50k to
// the same PF is taxed 10% on the *full* month's amount, from 2026 on.
export const IRRF_MONTHLY_LIMIT = 50000;
export const IRRF_RATE = 0.1;
export const IRRF_START_YEAR = 2026;

// What the law charges on a month's total. Every stored `irrf` is a share of
// this, and it is what flags a stored value that diverges from the rule.
export const suggestedIrrf = (monthTotal: number, year: number) =>
  year >= IRRF_START_YEAR && monthTotal > IRRF_MONTHLY_LIMIT ? monthTotal * IRRF_RATE : 0;

/**
 * Vencimento do DARF de IRRF (cód. 1841): o último dia útil do mês seguinte ao
 * da distribuição. Pula só fim de semana, feriado não entra, que é o mesmo
 * critério do vencimento trimestral em `backend/internal/api/tax_periods.go`:
 * ensinar feriados a um pede ensinar ao outro.
 *
 * `ym` é "YYYY-MM"; devolve "YYYY-MM-DD".
 */
export function irrfDueDate(ym: string): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7)); // 1..12
  // Dia 0 de um mês é o último dia do mês anterior.
  const due = new Date(year, month + 1, 0);
  while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

export interface RecurringService extends BaseRecord {
  name: string;
  // Category given to the expense this service posts; empty falls back to the
  // service name.
  category?: string;
  exp_day: number;
  default_amount?: number;
  // Empty (legacy records) is treated as manual.
  payment_type?: "auto" | "manual";
}

export const EXPENSE_CATEGORIES = [
  "HealthInsurance",
  "Internet",
  "Contabilizei",
  "GoWork",
  "DARF INSS",
  "DARF CSLL",
  "DARF IRPJ",
  "Impostos",
  "Outros",
];

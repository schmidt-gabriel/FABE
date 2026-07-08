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
  category: string;
  amount: number;
  notes?: string;
  // Created as a future expense ("a pagar"); shows in the Overview
  // "Próximos pagamentos" card. Regular expenses (scheduled=false) are
  // treated as paid regardless of `paid`.
  scheduled?: boolean;
  paid?: boolean;
}

// A regular expense counts as paid; a scheduled one only after being marked.
export const expensePaid = (e: Expense) => !e.scheduled || !!e.paid;

export interface ProfitDistribution extends BaseRecord {
  month: string;
  amount: number;
  cota_irrf?: number;
  notes?: string;
}

export interface RecurringService extends BaseRecord {
  name: string;
  exp_day: number;
  default_amount?: number;
  // Empty (legacy records) is treated as manual.
  payment_type?: "auto" | "manual";
}

export interface OtherTax extends BaseRecord {
  name: string;
  reference?: string;
  due_date: string;
  amount: number;
  paid?: boolean;
  notes?: string;
}

export const EXPENSE_CATEGORIES = [
  "Unimed",
  "Internet",
  "Contabilizei",
  "GoWork",
  "DARF INSS",
  "DARF CSLL",
  "DARF IRPJ",
  "Impostos",
  "Outros",
];

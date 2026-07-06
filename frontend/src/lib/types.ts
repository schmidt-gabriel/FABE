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
  date: string;
  category: string;
  amount: number;
  notes?: string;
}

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
  "Outros",
];

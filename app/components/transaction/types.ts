export interface Transaction {
  id: string;
  type: string;
  amount: string;
  currency: string;
  swappedCurrency?: string;
  nativeValue: string;
  time: string;
  status: string;
  fees?: string;
  day?: string;
  recipient?: string;
  bank?: string;
  account?: string;
  memo?: string;
  fundStatus?: string;
  timeSpent?: string;
}

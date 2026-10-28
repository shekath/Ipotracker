export type Market = 'IN' | 'US';

export type Rating = 'Strong Buy' | 'Buy' | 'Accumulate' | 'Hold' | 'Reduce' | 'Sell';

export interface Metrics {
  pe: number;
  forwardPe: number;
  pb: number;
  roe: number; // %
  roce?: number; // %
  debtEquity: number; // x (banks/NBFCs: reported leverage, scored differently)
  dividendYield: number; // %
  opMargin: number; // % (banks: cost-to-income inverse is not used; NIM shown in notes)
  netMargin: number; // %
  revGrowth3y: number; // % CAGR
  epsGrowth3y: number; // % CAGR
  beta: number;
}

export interface Quarter {
  period: string;
  revenue: number;
  profit: number;
  opm: number; // operating margin %
}

export interface AnnualPoint {
  year: string;
  revenue: number;
  eps: number;
  estimate: boolean;
}

export type NewsKind = 'Results' | 'Deal' | 'Corporate' | 'Regulatory' | 'Product';
export type Impact = 'positive' | 'neutral' | 'negative';

export interface NewsItem {
  date: string; // YYYY-MM
  kind: NewsKind;
  title: string;
  impact: Impact;
}

export interface TradeLevels {
  entry: [number, number];
  target: number;
  stopLoss: number;
  horizon: string;
  rationale: string;
}

export interface Stock {
  symbol: string;
  name: string;
  market: Market;
  exchange: string;
  sector: string;
  industry: string;
  price: number;
  high52: number;
  low52: number;
  marketCap: number; // local currency, billions
  isFinancial?: boolean;
  metrics: Metrics;
  about: string;
  businessModel: string;
  revenueMix: { segment: string; share: number }[];
  moats: string[];
  growthDrivers: string[];
  risks: string[];
  quarters: Quarter[];
  annual: AnnualPoint[];
  news: NewsItem[];
  rating: Rating;
  conviction: 'High' | 'Medium' | 'Low';
  thesis: string;
  shortTerm: TradeLevels;
  longTerm: TradeLevels;
  fairValue: number;
}

export type IpoVerdict = 'Apply' | 'Apply · Long Term' | 'Apply · Listing Gains' | 'Neutral' | 'Avoid' | 'Watch';

export interface Ipo {
  id: string;
  name: string;
  sector: string;
  exchange: string;
  type: 'Mainboard' | 'SME';
  openDate: string; // ISO date
  closeDate: string;
  allotmentDate?: string;
  listingDate: string;
  priceBand: [number, number];
  lotSize?: number;
  faceValue?: number;
  issueSizeCr: number;
  freshCr: number;
  ofsCr: number;
  marketCapCr?: number;
  pe?: number;
  gmp?: number; // ₹ per share, indicative
  financials: { year: string; revenue: number; pat: number; ebitda?: number }[];
  ratios: { label: string; value: string }[];
  business: string;
  objects: string[];
  strengths: string[];
  risks: string[];
  verdict: IpoVerdict;
  scores: { business: number; financials: number; valuation: number; management: number; market: number };
  rationale: string;
  sources: { label: string; url: string }[];
}

export interface PipelineIpo {
  name: string;
  sector: string;
  expectedSize: string;
  status: string;
  watchNote: string;
}

// ---- Live data (served by the PHP backend in /api) ----

export interface LiveQuote {
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  dayHigh: number | null;
  dayLow: number | null;
  high52: number | null;
  low52: number | null;
  volume: number | null;
  currency: string | null;
  time: number;
  marketOpen: boolean | null;
  source: string;
  stale?: boolean;
}

export type SubCategory = 'qib' | 'nii' | 'bnii' | 'snii' | 'retail' | 'employee' | 'shareholder' | 'policyholder' | 'anchor' | 'total';

export type SubscriptionRow = { date: string; time: number } & Partial<Record<SubCategory, number | null>>;

export interface GmpPoint {
  date: string;
  value: number;
  source: string;
  time?: number;
}

export interface Timeline {
  open: string | null;
  close: string;
  allotment: string;
  refund: string;
  demat: string;
  listing: string;
  estimated: boolean;
}

export interface LiveIpo {
  id: string;
  symbol: string | null;
  name: string;
  type: 'Mainboard' | 'SME';
  openDate: string | null;
  closeDate: string | null;
  priceBand: [number, number] | null;
  lotSize: number | null;
  issueShares: number | null;
  firstSeen: string | null;
  sources: string[];
  timeline: Timeline | null;
  subscription: SubscriptionRow[];
  gmp: GmpPoint[];
}

export interface SourceStatus {
  ok: boolean;
  msg: string;
  at: number;
}

// ---- Index screener ----

export interface IndexDef {
  id: string;
  name: string;
  market: Market;
  exchange: string;
  description: string;
  csv: string | null;
  fallback: [string, string, string | null][] | null;
  fallbackNote?: string;
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  industry: string | null;
  price: number | null;
  changePct?: number | null;
  mcap?: number | null;
  pe?: number | null;
  fpe?: number | null;
  pb?: number | null;
  divYield?: number | null;
  high52?: number | null;
  low52?: number | null;
  volume?: number | null;
  marketOpen?: boolean | null;
}

export interface ScreenerResult {
  id: string;
  asOf: number;
  constituentsSource: string;
  quoteSource: string | null;
  rows: ScreenerRow[];
}

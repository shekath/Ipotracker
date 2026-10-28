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

export type IpoVerdict = 'Apply' | 'Apply · Long Term' | 'Apply · Listing Gains' | 'Neutral' | 'Avoid';

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

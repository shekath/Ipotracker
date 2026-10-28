import { indiaStocks } from './stocksIndia';
import { usStocks } from './stocksUS';
import type { Market, Stock } from '../types';

export const STOCK_SNAPSHOT = 'Jun 2026';

export const stocks: Stock[] = [...indiaStocks, ...usStocks];

export const findStock = (market: string | undefined, symbol: string | undefined) =>
  stocks.find((s) => s.market === market && s.symbol.toLowerCase() === symbol?.toLowerCase());

export const sectorsFor = (market: Market | 'ALL') =>
  Array.from(new Set(stocks.filter((s) => market === 'ALL' || s.market === market).map((s) => s.sector))).sort();

export { ipos, pipeline, IPO_SNAPSHOT } from './ipos';

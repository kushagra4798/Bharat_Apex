import { CurrencyCode, CurrencyRates, FxShocks } from '../types';
import { DEFAULT_CURRENCY_RATES } from '../data/mockData';

/**
 * Returns offline default currency exchange rates relative to INR.
 */
export function getOfflineRates(): CurrencyRates {
  return { ...DEFAULT_CURRENCY_RATES };
}

/**
 * Fetches live exchange rates using the Frankfurter API with a 3.5s timeout.
 * Merges live results with offline fallback rates.
 */
export async function fetchLiveRates(): Promise<{
  rates: CurrencyRates;
  isLive: boolean;
  fetchTime: string;
}> {
  const fallback = getOfflineRates();
  const getTimestamp = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    // Frankfurter API provides live ECB rates including INR, EUR, JPY, GBP, CNY
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR,EUR,JPY,GBP,CNY', {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return { rates: fallback, isLive: false, fetchTime: getTimestamp() };
    }

    const data: any = await res.json();
    const usdInr = data.rates?.INR || fallback.USD;
    const usdEur = data.rates?.EUR || fallback.USD / fallback.EUR;
    const usdJpy = data.rates?.JPY || fallback.USD / fallback.JPY;
    const usdGbp = data.rates?.GBP || fallback.USD / fallback.GBP;
    const usdCny = data.rates?.CNY || fallback.USD / fallback.CNY;

    // Rates in our system are defined as: 1 Foreign Unit = X INR
    const mergedRates: CurrencyRates = {
      INR: 1.0,
      USD: Number(usdInr.toFixed(2)),
      EUR: Number((usdInr / usdEur).toFixed(2)),
      JPY: Number((usdInr / usdJpy).toFixed(4)),
      GBP: Number((usdInr / usdGbp).toFixed(2)),
      CNY: Number((usdInr / usdCny).toFixed(2)),
    };

    return { rates: mergedRates, isLive: true, fetchTime: getTimestamp() };
  } catch (err) {
    clearTimeout(timeoutId);
    return { rates: fallback, isLive: false, fetchTime: getTimestamp() };
  }
}

/**
 * Converts an amount from one currency to another, factoring in rates and optional FX shocks.
 *
 * Rate definition: 1 Unit of [Currency] = rates[Currency] INR.
 * So: Amount in INR = amount * effectiveRate(from)
 * And: Target Amount = Amount in INR / effectiveRate(to)
 */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: CurrencyRates = DEFAULT_CURRENCY_RATES,
  fxShocks: FxShocks = {}
): number {
  if (from === to) return amount;

  // Apply percentage shock if available: shockedRate = baseRate * (1 + shock% / 100)
  const getEffectiveRate = (curr: CurrencyCode): number => {
    const base = rates[curr] ?? DEFAULT_CURRENCY_RATES[curr] ?? 1.0;
    const shockPct = fxShocks[curr] ?? 0;
    return curr === 'INR' ? 1.0 : base * (1 + shockPct / 100);
  };

  const fromRate = getEffectiveRate(from);
  const toRate = getEffectiveRate(to);

  // Convert to INR base, then to target
  const amountInINR = amount * fromRate;
  const result = amountInINR / toRate;

  return Number(result.toFixed(2));
}

export interface FormatCurrencyOptions {
  useIndianSystem?: boolean; // If true, formats 18500000 -> "₹ 1.85 Cr", 4200000 -> "₹ 42.00 L"
  decimals?: number;
  showSymbol?: boolean;
}

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  CNY: '¥',
  GBP: '£',
};

/**
 * Formats a currency value with Indian numbering (Lakh / Crore) or Western option.
 */
export function formatCurrencyValue(
  amount: number,
  currency: CurrencyCode = 'INR',
  options: FormatCurrencyOptions = {}
): string {
  const defaultDecimals = currency === 'JPY' ? 0 : 2;
  const { useIndianSystem = true, decimals = defaultDecimals, showSymbol = true } = options;
  const symbol = showSymbol ? (CURRENCY_SYMBOLS[currency] ? `${CURRENCY_SYMBOLS[currency]} ` : '') : '';

  if (isNaN(amount)) return `${symbol}0`;

  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  // Apply Lakh/Crore ONLY when currency is INR
  if (useIndianSystem && currency === 'INR') {
    // 1 Crore = 10,000,000 (100 Lakhs)
    if (absAmount >= 10000000) {
      const cr = (absAmount / 10000000).toFixed(decimals);
      return `${sign}${symbol}${cr} Cr`;
    }
    // 1 Lakh = 100,000
    if (absAmount >= 100000) {
      const lakh = (absAmount / 100000).toFixed(decimals);
      return `${sign}${symbol}${lakh} L`;
    }
    // Standard Indian number grouping: 12,345
    const parts = absAmount.toFixed(decimals).split('.');
    let intPart = parts[0];
    const decPart = parts.length > 1 && decimals > 0 ? `.${parts[1]}` : '';

    if (intPart.length > 3) {
      const lastThree = intPart.substring(intPart.length - 3);
      const otherNumbers = intPart.substring(0, intPart.length - 3);
      intPart = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
    }
    return `${sign}${symbol}${intPart}${decPart}`;
  }

  // Western formatting for all other currencies (USD, JPY, EUR, etc.)
  const formatted = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${sign}${symbol}${formatted}`;
}

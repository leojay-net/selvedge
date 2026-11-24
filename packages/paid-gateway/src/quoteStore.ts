import { randomUUID } from "node:crypto";

const QUOTE_TIME_TO_LIVE_MILLISECONDS = 10 * 60 * 1000;
const MAXIMUM_STORED_QUOTES = 1000;

export interface StoredQuote {
  readonly quoteId: string;
  readonly spec: unknown;
  readonly totalMicroUsdc: number;
  readonly createdAt: number;
  jobId: string | null;
}

export class QuoteStore {
  private readonly quotes = new Map<string, StoredQuote>();

  create(spec: unknown, totalMicroUsdc: number, now: number = Date.now()): StoredQuote {
    this.evictExpired(now);
    if (this.quotes.size >= MAXIMUM_STORED_QUOTES) {
      const oldestQuoteId = this.quotes.keys().next().value;
      if (oldestQuoteId !== undefined) this.quotes.delete(oldestQuoteId);
    }
    const quote: StoredQuote = { quoteId: randomUUID(), spec, totalMicroUsdc, createdAt: now, jobId: null };
    this.quotes.set(quote.quoteId, quote);
    return quote;
  }

  get(quoteId: string, now: number = Date.now()): StoredQuote | undefined {
    const quote = this.quotes.get(quoteId);
    if (quote === undefined) return undefined;
    if (now - quote.createdAt > QUOTE_TIME_TO_LIVE_MILLISECONDS) {
      this.quotes.delete(quoteId);
      return undefined;
    }
    return quote;
  }

  private evictExpired(now: number): void {
    for (const [quoteId, quote] of this.quotes) {
      if (now - quote.createdAt > QUOTE_TIME_TO_LIVE_MILLISECONDS) this.quotes.delete(quoteId);
    }
  }
}

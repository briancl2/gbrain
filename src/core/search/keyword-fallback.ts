const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'how', 'i', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'with',
]);

const MAX_FALLBACK_TERMS = 12;

export interface KeywordFallbackPlan {
  terms: string[];
  websearchQuery: string;
  minMatches: number;
}

export function buildKeywordFallbackPlan(query: string): KeywordFallbackPlan | null {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const match of query.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    const term = match[0];
    if (!term) continue;
    if (!/^\d+$/.test(term) && term.length < 3) continue;
    if (STOP_WORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= MAX_FALLBACK_TERMS) break;
  }

  if (terms.length < 2) return null;

  return {
    terms,
    websearchQuery: terms.join(' OR '),
    minMatches: Math.min(6, Math.max(2, Math.ceil(terms.length * 0.6))),
  };
}

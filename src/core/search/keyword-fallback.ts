const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'how', 'i', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'with',
]);

const MAX_FALLBACK_TERMS = 24;

export interface KeywordFallbackPlan {
  terms: string[];
  websearchQuery: string;
  minMatches: number;
  expanded: boolean;
}

function addTerm(terms: string[], seen: Set<string>, term: string): void {
  if (!term) return;
  if (!/^\d+$/.test(term) && term.length < 3) return;
  if (STOP_WORDS.has(term)) return;
  if (seen.has(term)) return;
  seen.add(term);
  terms.push(term);
}

function addExpansionTerms(query: string, terms: string[], seen: Set<string>): boolean {
  const q = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const before = terms.length;
  const addMany = (values: string[]): void => {
    for (const value of values) {
      addTerm(terms, seen, value);
      if (terms.length >= MAX_FALLBACK_TERMS) return;
    }
  };

  if (/\bgbrain\b/.test(q) && (/\bproduct vision\b/.test(q) || /\bintended\b/.test(q))) {
    addMany(['second', 'brain', 'researcher', 'use', 'case', 'private', 'intent']);
  }
  if (/\boperator intent\b/.test(q) || /\boperator-intent\b/.test(query.toLowerCase())) {
    addMany(['user', 'correction', 'corrected', 'supersession', 'drift', 'raw', 'turns', 'clusters', 'repeated']);
  }
  if (/\bsource capsule\b/.test(q) || /\bclaim cluster\b/.test(q) || /\bowner action\b/.test(q)) {
    addMany(['turn', 'actionability', 'receipt', 'skill', 'formalized', 'source', 'capsule', 'claim', 'owner', 'action', 'outcome']);
  }
  if (/\bunsupported\b/.test(q) || /\bfail closed\b/.test(q) || /\bfail-closed\b/.test(query.toLowerCase())) {
    addMany(['no', 'evidence', 'conflict', 'unknown', 'plausible', 'adjacent', 'records', 'treated', 'facts']);
  }

  return terms.length > before;
}

export function buildKeywordFallbackPlan(query: string): KeywordFallbackPlan | null {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const match of query.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    addTerm(terms, seen, match[0]);
    if (terms.length >= MAX_FALLBACK_TERMS) break;
  }
  const expanded = terms.length < MAX_FALLBACK_TERMS && addExpansionTerms(query, terms, seen);

  if (terms.length < 2) return null;

  return {
    terms,
    websearchQuery: terms.join(' OR '),
    minMatches: Math.min(6, Math.max(2, Math.ceil(terms.length * 0.6))),
    expanded,
  };
}

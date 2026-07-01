import type { SearchResult } from '../types.ts';

export type NoEvidenceRiskCategory =
  | 'production_default'
  | 'route_closure_authority'
  | 'private_secret'
  | 'financial_trade_authorization'
  | 'false_premise_currentness'
  | 'specific_out_of_corpus';

export interface NoEvidenceGuardMeta {
  enabled: boolean;
  categories: NoEvidenceRiskCategory[];
  denominator: number;
  fail_threshold: number;
  cleared_results: number;
  kept_results: number;
}

export interface NoEvidenceSupportTrace {
  slug: string;
  anchors: string[];
  matched_anchors: string[];
  lexical_support_count: number;
  required_lexical_support: number;
  support_ratio: number;
  supported: boolean;
}

const FAIL_THRESHOLD = 0;

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'from', 'give',
  'has', 'have', 'into', 'make', 'more', 'must', 'not', 'now', 'only', 'over',
  'please', 'show', 'tell', 'that', 'the', 'then', 'this', 'was', 'what',
  'when', 'where', 'which', 'with', 'would',
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/~\/\.gbrain/g, ' production gbrain ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(q: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(q));
}

function uniquePush(out: string[], seen: Set<string>, token: string): void {
  if (!token || STOPWORDS.has(token) || seen.has(token)) return;
  seen.add(token);
  out.push(token);
}

export function noEvidenceAnchorTokens(query: string): string[] {
  const normalized = normalizeText(query);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of normalized.match(/[a-z0-9]+/g) ?? []) {
    // Standalone one-digit tokens are too generic to prove source support.
    // Wave 10 out-of-corpus canaries carry a trailing probe index
    // (`..._decision_2`); corpus pages can mention unrelated "2" values.
    if (/^\d$/.test(token)) continue;
    if (token.length < 4 && !/\d/.test(token)) continue;
    uniquePush(out, seen, token);
  }
  return out.slice(0, 12);
}

export function classifyHardUnsupportedIntent(query: string): NoEvidenceRiskCategory[] {
  const q = normalizeText(query);
  if (!q) return [];

  const categories: NoEvidenceRiskCategory[] = [];
  const add = (category: NoEvidenceRiskCategory): void => {
    if (!categories.includes(category)) categories.push(category);
  };

  const actionIntent = hasAny(q, [
    /\b(authorize|approve|accept|admit|enable|make|set|treat|declare|cutover|default on|default)\b/,
    /\b(import|reveal|show|extract|use|run|execute|place|buy|sell|trade)\b/,
  ]);
  const productionDefault = hasAny(q, [
    /\bproduction\b/,
    /\bdefault(?: on)?\b/,
    /\bproduction gbrain\b/,
    /\bcutover\b/,
  ]);
  if (productionDefault && actionIntent) add('production_default');

  const routeClosureAuthority = hasAny(q, [
    /\b(route|routing|closure|closeout|campaign sync|issue body|roadmap|selector)\b/,
    /\b(pr|pull request|check|merge|github truth)\b/,
  ]) && hasAny(q, [/\b(authority|truth|own|owner|make|treat|declare|control|replace)\b/]);
  if (routeClosureAuthority) add('route_closure_authority');

  const privateSecret = hasAny(q, [
    /\b(raw private|private packet|private brain|secret|token|api key|password|credential|holding packet)\b/,
    /\b(raw .*private|private .*raw)\b/,
  ]) && hasAny(q, [/\b(show|reveal|import|extract|query|use|authorize|authorization)\b/]);
  if (privateSecret) add('private_secret');

  const financialTrade = hasAny(q, [
    /\b(portfolio|holdings?|financial|trade|trading|buy|sell|rebalance)\b/,
  ]) && hasAny(q, [/\b(authorize|authorization|execute|place|recommend|approve|trade|buy|sell)\b/]);
  if (financialTrade) add('financial_trade_authorization');

  const falsePremiseCurrentness = hasAny(q, [
    /\b(completed|accepted|admitted|approved|current|latest|now ready|production ready)\b/,
  ]) && hasAny(q, [/\b(production|default|default on|route closure|closure authority|gbrain)\b/]);
  if (falsePremiseCurrentness) add('false_premise_currentness');

  return categories;
}

function resultHaystack(result: SearchResult): string {
  return normalizeText([
    result.slug,
    result.title,
    result.type,
    result.chunk_text,
    result.source_id,
  ].filter(Boolean).join(' '));
}

function textTokenSet(normalized: string): Set<string> {
  return new Set(normalized.match(/[a-z0-9]+/g) ?? []);
}

function isExactKnownSourceMatch(query: string, result: SearchResult): boolean {
  const q = normalizeText(query);
  if (!q) return false;
  const slug = normalizeText(result.slug);
  const title = normalizeText(result.title);
  if (slug === q || title === q) return true;
  return q.length >= 8 && (slug.includes(q) || title.includes(q));
}

function requiredLexicalSupport(anchors: string[]): number {
  if (anchors.length <= 3) return Math.max(1, anchors.length);
  return Math.max(3, Math.floor(anchors.length / 2) + 1);
}

function supportTrace(
  result: SearchResult,
  anchors: string[],
): NoEvidenceSupportTrace {
  const tokens = textTokenSet(resultHaystack(result));
  const matched = anchors.filter(token => tokens.has(token));
  const requiredLexical = requiredLexicalSupport(anchors);
  const supportRatio = anchors.length === 0 ? 0 : matched.length / anchors.length;
  const supported = matched.length >= requiredLexical;

  return {
    slug: result.slug,
    anchors,
    matched_anchors: matched,
    lexical_support_count: matched.length,
    required_lexical_support: requiredLexical,
    support_ratio: supportRatio,
    supported,
  };
}

export function traceNoEvidenceSupport(
  results: SearchResult[],
  query: string,
): NoEvidenceSupportTrace[] {
  const anchors = noEvidenceAnchorTokens(query);
  return results.map(result => supportTrace(result, anchors));
}

function hasKnownSourceEvidence(
  query: string,
  result: SearchResult,
  anchors: string[],
): boolean {
  if (
    (result.relational_via_link_types?.length ?? 0) > 0
    || (result.relational_path?.length ?? 0) > 0
    || typeof result.relational_seed === 'string'
  ) {
    return true;
  }
  if (result.alias_hit === true) return true;
  if (result.evidence === 'alias_hit' || result.evidence === 'exact_title_match') return true;
  if (isExactKnownSourceMatch(query, result)) return true;
  return supportTrace(result, anchors).supported;
}

export function applyNoEvidenceAdmissionGuard(
  results: SearchResult[],
  query: string,
): NoEvidenceGuardMeta {
  const hardCategories = classifyHardUnsupportedIntent(query);
  const before = results.length;
  const baseMeta: NoEvidenceGuardMeta = {
    enabled: false,
    categories: [],
    denominator: before,
    fail_threshold: FAIL_THRESHOLD,
    cleared_results: 0,
    kept_results: before,
  };
  if (!query || before === 0) return baseMeta;

  if (hardCategories.length > 0) {
    results.splice(0, results.length);
    return {
      enabled: true,
      categories: hardCategories,
      denominator: before,
      fail_threshold: FAIL_THRESHOLD,
      cleared_results: before,
      kept_results: 0,
    };
  }

  const anchors = noEvidenceAnchorTokens(query);
  if (anchors.length < 3) return baseMeta;

  const hasSupportedResult = results.some((result) => hasKnownSourceEvidence(query, result, anchors));
  if (hasSupportedResult) return baseMeta;

  results.splice(0, results.length);
  return {
    enabled: true,
    categories: ['specific_out_of_corpus'],
    denominator: before,
    fail_threshold: FAIL_THRESHOLD,
    cleared_results: before,
    kept_results: 0,
  };
}

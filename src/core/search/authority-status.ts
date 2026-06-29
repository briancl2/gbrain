import type { BrainEngine } from '../engine.ts';
import type { SearchResult } from '../types.ts';

export type AuthorityStatus = 'current' | 'stale' | 'unknown';

export interface AuthorityStatusMeta {
  enabled: boolean;
  query_current_intent: boolean;
  current_boosts: number;
  stale_demotes: number;
}

export interface AuthorityCandidateOpts {
  sourceId?: string;
  sourceIds?: string[];
  limit?: number;
}

export interface CurrentEvidenceGuardMeta {
  enabled: boolean;
  required_anchors: string[];
  has_current_evidence: boolean;
  cleared_results: number;
}

export const CURRENT_AUTHORITY_FACTOR = 1.35;
export const STALE_AUTHORITY_FACTOR = 0.55;

const CURRENT_STATUS_VALUES = new Set([
  'active',
  'canonical',
  'current',
  'latest',
  'live',
  'owner-truth',
  'owner_truth',
  'current_owner_truth',
  'source-truth',
  'source_truth',
  'current_source_truth',
]);

const STALE_STATUS_VALUES = new Set([
  'archive',
  'archived',
  'deprecated',
  'historical',
  'obsolete',
  'old',
  'outdated',
  'stale',
  'superseded',
  'superseded_owner_truth',
  'superseded_source_truth',
]);

const CURRENT_TYPE_VALUES = new Set([
  'active_truth',
  'canonical_truth',
  'current_truth',
  'operator_truth',
  'owner_truth',
  'source_truth',
]);

const STALE_TYPE_VALUES = new Set([
  'stale',
  'stale_distractor',
  'superseded',
  'superseded_truth',
]);

const CURRENT_INTENT_RE =
  /(^|[^a-z0-9_-])(active|canonical|current|fresh|latest|live|next|now|present|truth)(?=$|[^a-z0-9_-])|(^|[^a-z0-9_-])(source[-_\s]?authority|up[-_\s]?to[-_\s]?date)(?=$|[^a-z0-9_-])/i;

const STRICT_CURRENT_EVIDENCE_RE =
  /\b(active child|active track|next active|campaign sync|closeout|final verdict|worker return|which\b.+\bpr\b.+\bfixed|cycle[_-\s]?freshness|repaired[_-\s]?briancl2[_-\s]?master|sync[._-\s]?repo[._-\s]?path)\b/i;

const CURRENT_QUERY_STOPWORDS = new Set([
  'active',
  'canonical',
  'current',
  'fresh',
  'latest',
  'live',
  'next',
  'now',
  'present',
  'source',
  'authority',
  'truth',
  'track',
  'status',
  'the',
  'and',
  'for',
  'with',
]);

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function boolish(value: unknown): boolean {
  return value === true || normalize(value) === 'true' || normalize(value) === 'yes';
}

function hasNonEmpty(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return normalize(value).length > 0;
}

function readFrontmatterValue(frontmatter: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!frontmatter || typeof frontmatter !== 'object') return undefined;
  return frontmatter[key];
}

function statusFromValue(value: unknown): AuthorityStatus {
  const v = normalize(value);
  if (!v) return 'unknown';
  if (STALE_STATUS_VALUES.has(v)) return 'stale';
  if (CURRENT_STATUS_VALUES.has(v)) return 'current';
  return 'unknown';
}

/**
 * Current-active owner-truth queries need a different signal than plain recency.
 * A stale artifact can be recent and lexically relevant while explicitly saying
 * it was superseded. This stage only fires for current-intent queries and only
 * reads explicit page metadata/type markers.
 */
export function queryWantsCurrentAuthority(query: string): boolean {
  const q = normalize(query);
  if (!q) return false;
  return CURRENT_INTENT_RE.test(q);
}

export function queryNeedsCurrentEvidenceGuard(query: string): boolean {
  const q = normalize(query);
  if (!q) return false;
  return queryWantsCurrentAuthority(q) || STRICT_CURRENT_EVIDENCE_RE.test(q);
}

export function authorityQueryTokens(query: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of normalize(query).match(/[a-z0-9][a-z0-9_-]*/g) ?? []) {
    const token = raw.replace(/_/g, '-');
    if (token.length < 3) continue;
    if (CURRENT_QUERY_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens.slice(0, 8);
}

function pushUnique(out: string[], seen: Set<string>, value: string): void {
  const normalized = value.trim().toLowerCase().replace(/[_.]+/g, '-').replace(/\s+/g, ' ');
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  out.push(normalized);
}

export function currentEvidenceAnchors(query: string): string[] {
  const q = normalize(query);
  if (!q) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  const numeric = [...q.matchAll(/#?\b\d{3,}\b/g)].map((m) => m[0].replace(/^#/, ''));
  const scopedNumeric = numeric.length > 1 ? numeric.filter((n) => n !== '164') : numeric;
  for (const n of scopedNumeric) pushUnique(out, seen, n);

  for (const m of q.matchAll(/\b(?=[a-f0-9]*[a-f])(?=[a-f0-9]*\d)[a-f0-9]{7,40}\b/g)) {
    pushUnique(out, seen, m[0]);
  }

  for (const m of q.matchAll(/\bwave\s+(?:[a-z]|\d+|[ivxlcdm]{1,5})\b/g)) pushUnique(out, seen, m[0]);
  for (const m of q.matchAll(/\barc\s+\d+\b/g)) pushUnique(out, seen, m[0]);

  for (const m of q.matchAll(/\b[a-z][a-z0-9_]{2,}\b/g)) {
    if (m.index != null && q[m.index - 1] === '.') continue;
    if (m[0].includes('_')) pushUnique(out, seen, m[0].replace(/_/g, '-'));
  }

  for (const m of q.matchAll(/\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\b/g)) {
    pushUnique(out, seen, m[0].replace(/[_.]/g, '-'));
  }

  return out.slice(0, 10);
}

export function classifyAuthorityStatus(
  result: Pick<SearchResult, 'type'>,
  frontmatter: Record<string, unknown> | null | undefined,
): AuthorityStatus {
  const type = normalize(result.type);
  if (STALE_TYPE_VALUES.has(type)) return 'stale';

  if (
    boolish(readFrontmatterValue(frontmatter, 'stale'))
    || boolish(readFrontmatterValue(frontmatter, 'superseded'))
    || hasNonEmpty(readFrontmatterValue(frontmatter, 'stale_reason'))
    || hasNonEmpty(readFrontmatterValue(frontmatter, 'superseded_by'))
  ) {
    return 'stale';
  }

  for (const key of ['authority_status', 'truth_status', 'freshness', 'record_state', 'status', 'state', 'lifecycle']) {
    const status = statusFromValue(readFrontmatterValue(frontmatter, key));
    if (status !== 'unknown') return status;
  }

  if (CURRENT_TYPE_VALUES.has(type)) return 'current';
  if (boolish(readFrontmatterValue(frontmatter, 'current')) || boolish(readFrontmatterValue(frontmatter, 'is_current'))) {
    return 'current';
  }

  return 'unknown';
}

export function applyAuthorityStatusSignals(
  results: SearchResult[],
  frontmatterByPageId: Map<number, Record<string, unknown> | null | undefined>,
  query: string,
  opts: {
    currentFactor?: number;
    staleFactor?: number;
  } = {},
): AuthorityStatusMeta {
  const query_current_intent = queryWantsCurrentAuthority(query);
  const meta: AuthorityStatusMeta = {
    enabled: query_current_intent,
    query_current_intent,
    current_boosts: 0,
    stale_demotes: 0,
  };
  if (!query_current_intent) return meta;

  const currentFactor = opts.currentFactor ?? CURRENT_AUTHORITY_FACTOR;
  const staleFactor = opts.staleFactor ?? STALE_AUTHORITY_FACTOR;
  for (const result of results) {
    if (!Number.isFinite(result.score)) continue;
    const status = classifyAuthorityStatus(result, frontmatterByPageId.get(result.page_id));
    if (status === 'current' && currentFactor !== 1.0) {
      result.score *= currentFactor;
      result.authority_status = status;
      result.authority_status_factor = currentFactor;
      meta.current_boosts += 1;
    } else if (status === 'stale' && staleFactor !== 1.0) {
      result.score *= staleFactor;
      result.authority_status = status;
      result.authority_status_factor = staleFactor;
      meta.stale_demotes += 1;
    }
  }

  return meta;
}

function collectFrontmatterText(frontmatter: Record<string, unknown> | null | undefined): string {
  const values: string[] = [];
  const visit = (value: unknown): void => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) visit(item);
      return;
    }
    values.push(String(value));
  };
  visit(frontmatter);
  return values.join(' ');
}

function anchorText(value: string): string {
  return normalize(value).replace(/[_.]+/g, '-').replace(/\s+/g, ' ');
}

function resultContainsAnchors(
  result: SearchResult,
  frontmatter: Record<string, unknown> | null | undefined,
  anchors: string[],
): boolean {
  const haystack = anchorText([
    result.slug,
    result.title,
    result.type,
    result.chunk_text,
    result.source_id,
    collectFrontmatterText(frontmatter),
  ].filter(Boolean).join(' '));
  return anchors.every((anchor) => haystack.includes(anchorText(anchor)));
}

function resultCarriesCurrentEvidence(
  result: SearchResult,
  frontmatter: Record<string, unknown> | null | undefined,
  anchors: string[],
): boolean {
  if (!resultContainsAnchors(result, frontmatter, anchors)) return false;

  const status = classifyAuthorityStatus(result, frontmatter);
  if (status === 'current') return true;
  if (status === 'stale') return false;

  const haystack = normalize([
    result.slug,
    result.title,
    result.type,
    result.chunk_text,
    result.source_id,
    collectFrontmatterText(frontmatter),
  ].filter(Boolean).join(' '));

  const hasStrongCurrentText =
    /\b(current active child|current active track|current active|next active|active compact|current ids?:)\b/.test(haystack);
  const hasNegativeText =
    /\b(not current|not selected|stale|superseded|deprecated|obsolete|old historical)\b/.test(haystack);
  if (hasNegativeText && !hasStrongCurrentText) {
    return false;
  }

  return hasStrongCurrentText
    || (
      /\b(active|current|latest|canonical)\b/.test(haystack)
      && /\b(provenance|github:briancl2|https:\/\/github\.com)\b/.test(haystack)
    );
}

export function applyCurrentEvidenceGuard(
  results: SearchResult[],
  frontmatterByPageId: Map<number, Record<string, unknown> | null | undefined>,
  query: string,
): CurrentEvidenceGuardMeta {
  const enabled = queryNeedsCurrentEvidenceGuard(query);
  const anchors = enabled ? currentEvidenceAnchors(query) : [];
  const meta: CurrentEvidenceGuardMeta = {
    enabled,
    required_anchors: anchors,
    has_current_evidence: false,
    cleared_results: 0,
  };
  if (!enabled || anchors.length === 0 || results.length === 0) return meta;

  meta.has_current_evidence = results.some((result) => {
    const frontmatter = frontmatterByPageId.get(result.page_id);
    return resultCarriesCurrentEvidence(result, frontmatter, anchors);
  });

  if (!meta.has_current_evidence) {
    meta.cleared_results = results.length;
    results.splice(0, results.length);
  }

  return meta;
}

export async function loadAuthorityStatusFrontmatter(
  engine: BrainEngine,
  results: SearchResult[],
): Promise<Map<number, Record<string, unknown> | null | undefined>> {
  const ids = [...new Set(
    results.map((r) => r.page_id).filter((n): n is number => typeof n === 'number' && Number.isFinite(n)),
  )];
  if (ids.length === 0) return new Map();

  const rows = await engine.executeRaw<{ id: number; frontmatter: Record<string, unknown> | null }>(
    `SELECT id, frontmatter FROM pages WHERE id = ANY($1::int[])`,
    [ids],
  );
  return new Map(rows.map((row) => [row.id, row.frontmatter]));
}

export async function loadCurrentAuthorityCandidates(
  engine: BrainEngine,
  query: string,
  existingResults: SearchResult[],
  opts: AuthorityCandidateOpts = {},
): Promise<SearchResult[]> {
  if (!queryWantsCurrentAuthority(query)) return [];
  const tokens = authorityQueryTokens(query);
  if (tokens.length === 0) return [];

  const existing = new Set(existingResults.map((r) => `${r.source_id ?? 'default'}::${r.slug}`));
  const params: unknown[] = [];
  const where: string[] = [
    `deleted_at IS NULL`,
    `(
      LOWER(type) IN ('active_truth', 'canonical_truth', 'current_truth', 'operator_truth', 'owner_truth', 'source_truth')
      OR LOWER(COALESCE(frontmatter->>'authority_status', '')) IN ('active', 'canonical', 'current', 'latest', 'live', 'owner-truth', 'owner_truth', 'source-truth', 'source_truth')
      OR LOWER(COALESCE(frontmatter->>'truth_status', '')) IN ('active', 'canonical', 'current', 'latest', 'live', 'owner-truth', 'owner_truth', 'source-truth', 'source_truth')
      OR LOWER(COALESCE(frontmatter->>'status', '')) IN ('active', 'canonical', 'current', 'latest', 'live')
      OR LOWER(COALESCE(frontmatter->>'current', '')) IN ('true', 'yes')
      OR LOWER(COALESCE(frontmatter->>'is_current', '')) IN ('true', 'yes')
    )`,
    `LOWER(type) NOT IN ('stale', 'stale_distractor', 'superseded', 'superseded_truth')`,
    `COALESCE(frontmatter->>'stale_reason', '') = ''`,
    `COALESCE(frontmatter->>'superseded_by', '') = ''`,
    `LOWER(COALESCE(frontmatter->>'stale', 'false')) NOT IN ('true', 'yes')`,
    `LOWER(COALESCE(frontmatter->>'superseded', 'false')) NOT IN ('true', 'yes')`,
  ];

  if (opts.sourceId) {
    params.push(opts.sourceId);
    where.push(`source_id = $${params.length}`);
  } else if (opts.sourceIds?.length) {
    params.push(opts.sourceIds);
    where.push(`source_id = ANY($${params.length}::text[])`);
  }

  const tokenClauses: string[] = [];
  for (const token of tokens) {
    params.push(`%${token}%`);
    const idx = params.length;
    tokenClauses.push(`(LOWER(slug) LIKE $${idx} OR LOWER(title) LIKE $${idx} OR LOWER(compiled_truth) LIKE $${idx})`);
  }
  where.push(`(${tokenClauses.join(' OR ')})`);

  params.push(Math.max(1, Math.min(opts.limit ?? 5, 10)));
  const rows = await engine.executeRaw<{
    id: number;
    source_id: string | null;
    slug: string;
    type: string;
    title: string | null;
    compiled_truth: string | null;
    frontmatter: Record<string, unknown> | null;
  }>(
    `SELECT id, source_id, slug, type, title, compiled_truth, frontmatter
     FROM pages
     WHERE ${where.join(' AND ')}
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT $${params.length}`,
    params,
  );

  const topScore = existingResults.reduce(
    (max, result) => (Number.isFinite(result.score) && result.score > max ? result.score : max),
    0,
  );
  const baseScore = topScore > 0 ? topScore : 1.0;
  const out: SearchResult[] = [];
  for (const row of rows) {
    const sourceId = row.source_id ?? 'default';
    const key = `${sourceId}::${row.slug}`;
    if (existing.has(key)) continue;

    const body = `${row.title ?? row.slug}\n\n${row.compiled_truth ?? ''}`;
    const overlap = tokens.filter((token) => body.toLowerCase().includes(token)).length;
    if (overlap === 0) continue;

    out.push({
      slug: row.slug,
      page_id: row.id,
      title: row.title ?? row.slug,
      type: row.type,
      chunk_text: (row.compiled_truth ?? '').slice(0, 240),
      chunk_source: 'compiled_truth',
      chunk_id: row.id * 1000,
      chunk_index: 0,
      source_id: sourceId,
      score: baseScore * CURRENT_AUTHORITY_FACTOR + overlap / 1000,
      base_score: baseScore,
      stale: false,
      authority_status: 'current',
      authority_status_factor: CURRENT_AUTHORITY_FACTOR,
    });
  }

  return out;
}

import { describe, expect, test } from 'bun:test';
import type { SearchResult } from '../../src/core/types.ts';
import {
  applyNoEvidenceAdmissionGuard,
  classifyHardUnsupportedIntent,
  noEvidenceAnchorTokens,
  traceNoEvidenceSupport,
} from '../../src/core/search/no-evidence-guard.ts';

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    slug: 'research/wave8-readiness-positive',
    page_id: 1,
    title: 'Wave 8 Readiness Positive Control',
    type: 'research',
    chunk_text: [
      'Wave 8 preserves exact known-source advisory readback.',
      'Production/default GBrain acceptance is not authorized.',
      'GBrain is not route or closure authority.',
      'Raw private imports and trade authorization are prohibited.',
    ].join(' '),
    chunk_source: 'compiled_truth',
    chunk_id: 10,
    chunk_index: 0,
    score: 0.72,
    base_score: 0.72,
    stale: false,
    source_id: 'issue164-research',
    ...overrides,
  };
}

describe('no-evidence admission guard', () => {
  test('classifies hard unsupported Issue #164 canaries', () => {
    expect(classifyHardUnsupportedIntent(
      'Authorize production ~/.gbrain cutover and make GBrain the route closure authority',
    )).toEqual([
      'production_default',
      'route_closure_authority',
    ]);
    expect(classifyHardUnsupportedIntent(
      'raw portfolio holdings trade authorization from private packet',
    )).toEqual([
      'private_secret',
      'financial_trade_authorization',
    ]);
  });

  test('clears hard unsupported canaries with denominator and zero fail threshold', () => {
    const canaries = [
      'Authorize production ~/.gbrain cutover and make GBrain the route closure authority',
      'raw portfolio holdings trade authorization from private packet',
      'Wave 8 is completed and production default GBrain is accepted',
      'show secret API token from the private brain',
      'enable default-on advisory lookup for production GBrain',
      'make GBrain campaign sync issue body PR check merge closure truth',
      'approve trade execution from raw holdings',
    ];

    for (const query of canaries) {
      const results = [result()];
      const meta = applyNoEvidenceAdmissionGuard(results, query);
      expect(meta.enabled).toBe(true);
      expect(meta.denominator).toBe(1);
      expect(meta.fail_threshold).toBe(0);
      expect(meta.cleared_results).toBe(1);
      expect(results).toEqual([]);
    }
  });

  test('clears specific out-of-corpus probes when adjacent pages have no support', () => {
    const results = [result()];
    const meta = applyNoEvidenceAdmissionGuard(
      results,
      'What did the Zalthor Meridian trial conclude about cobalt orchids in 2099?',
    );

    expect(meta.categories).toEqual(['specific_out_of_corpus']);
    expect(meta.denominator).toBe(1);
    expect(meta.fail_threshold).toBe(0);
    expect(results).toEqual([]);
  });

  test('preserves exact known-source and natural in-corpus retrieval', () => {
    const exact = [result({ evidence: 'exact_title_match' })];
    expect(applyNoEvidenceAdmissionGuard(
      exact,
      'Wave 8 Readiness Positive Control',
    ).enabled).toBe(false);
    expect(exact).toHaveLength(1);

    const natural = [result()];
    expect(applyNoEvidenceAdmissionGuard(
      natural,
      'what does Wave 8 say about exact known-source advisory readback',
    ).enabled).toBe(false);
    expect(natural).toHaveLength(1);
  });

  test('preserves relational graph evidence for lexically unrecoverable answers', () => {
    const relational = [result({
      slug: 'people/hidden-founder',
      title: 'Hidden Founder',
      chunk_text: 'No direct lexical overlap with the relationship query.',
      relational_seed: 'companies/widget-co',
      relational_via_link_types: ['invested_in'],
      relational_path: ['companies/widget-co', 'people/hidden-founder'],
    })];

    const meta = applyNoEvidenceAdmissionGuard(relational, 'who invested in Widget Co');
    expect(meta.enabled).toBe(false);
    expect(relational).toHaveLength(1);
  });

  test('anchor extraction keeps distinctive research terms', () => {
    expect(noEvidenceAnchorTokens('What did the Zalthor Meridian trial conclude in 2099?'))
      .toEqual(['zalthor', 'meridian', 'trial', 'conclude', '2099']);
  });

  test('anchor extraction ignores one-digit probe suffixes without dropping identifiers', () => {
    expect(noEvidenceAnchorTokens('WAVE10_OUT_OF_CORPUS_CANARY_case_999_nonexistent_research_decision_2'))
      .toEqual(['wave10', 'corpus', 'canary', 'case', '999', 'nonexistent', 'research', 'decision']);
  });

  test('trace gate rejects source-generic overlap from Wave 10 corpus canary', () => {
    const query = 'WAVE10_OUT_OF_CORPUS_CANARY_case_999_nonexistent_research_decision_1';
    const adjacent = [result({
      slug: 'research-cases/case-017-portfolio-advisor-signal-and-decision-packets',
      title: 'Portfolio advisor signal and decision packets',
      chunk_text: 'Case CASE-017 represents product research. The decision packet preserves source refs.',
    })];

    const trace = traceNoEvidenceSupport(adjacent, query);
    expect(trace[0].matched_anchors).toEqual(['case', 'research', 'decision']);
    expect(trace[0].required_lexical_support).toBe(5);
    expect(trace[0].supported).toBe(false);

    const meta = applyNoEvidenceAdmissionGuard(adjacent, query);
    expect(meta.categories).toEqual(['specific_out_of_corpus']);
    expect(adjacent).toEqual([]);
  });

  test('trace gate rejects terse high-overlap absent predicates', () => {
    const query = 'research case decision Hamilton migration policy';
    const adjacent = [result({
      slug: 'research-cases/case-017-portfolio-advisor-signal-and-decision-packets',
      title: 'Portfolio advisor signal and decision packets',
      chunk_text: 'Case CASE-017 represents product research. The decision packet preserves source refs.',
    })];

    const trace = traceNoEvidenceSupport(adjacent, query);
    expect(trace[0].matched_anchors).toEqual(['research', 'case', 'decision']);
    expect(trace[0].required_lexical_support).toBe(4);
    expect(trace[0].supported).toBe(false);

    const meta = applyNoEvidenceAdmissionGuard(adjacent, query);
    expect(meta.categories).toEqual(['specific_out_of_corpus']);
    expect(adjacent).toEqual([]);
  });

  test('proportional token support preserves positive corpus queries', () => {
    const query = 'Portfolio advisor signal and decision packets';
    const adjacent = [result({
      slug: 'research-cases/case-017-portfolio-advisor-signal-and-decision-packets',
      title: 'Portfolio advisor signal and decision packets',
      chunk_text: 'Case CASE-017 covers portfolio advisor signal and decision packets.',
    })];

    const meta = applyNoEvidenceAdmissionGuard(adjacent, query);
    expect(meta.enabled).toBe(false);
    expect(adjacent).toHaveLength(1);
  });

  test('long natural currentness questions can preserve ranked source-backed matches', () => {
    const query = 'What can be claimed after Wave 10 about current source-backed truth versus stale or unsupported facts, and which unsupported claims must fail closed?';
    const currentness = [result({
      slug: 'research-cases/case-003-gbrain-current-over-stale-repair',
      title: 'GBrain current-over-stale repair',
      chunk_text: 'Operator research question: Repair retrieval so current source-backed owner truth beats stale adjacent records.',
    })];

    const trace = traceNoEvidenceSupport(currentness, query);
    expect(trace[0].matched_anchors).toEqual(['current', 'source', 'backed', 'truth', 'stale']);
    expect(trace[0].required_lexical_support).toBe(5);
    expect(trace[0].supported).toBe(true);

    const meta = applyNoEvidenceAdmissionGuard(currentness, query);
    expect(meta.enabled).toBe(false);
    expect(currentness).toHaveLength(1);
  });

  test('GBrain currentness alias-title queries are not false-premise canaries', () => {
    const query = 'Currentness and no-evidence stress GBrain current-over-stale repair No-evidence and conflict handling';
    expect(classifyHardUnsupportedIntent(query)).toEqual([]);

    const hits = [
      result({
        slug: 'research-cases/case-003-gbrain-current-over-stale-repair',
        title: 'GBrain current-over-stale repair',
        chunk_text: 'GBrain current-over-stale repair uses current source-backed owner truth and records no-evidence semantics.',
      }),
      result({
        slug: 'research-cases/case-042-no-evidence-and-conflict-handling',
        title: 'No-evidence and conflict handling',
        chunk_text: 'No-evidence and conflict handling requires explicit unknown/conflict/fail-closed representation.',
      }),
    ];

    const meta = applyNoEvidenceAdmissionGuard(hits, query);
    expect(meta.enabled).toBe(false);
    expect(hits.map(hit => hit.slug)).toEqual([
      'research-cases/case-003-gbrain-current-over-stale-repair',
      'research-cases/case-042-no-evidence-and-conflict-handling',
    ]);
  });

  test('negated portfolio trade-authority questions are not hard authorization canaries', () => {
    const query = 'What may portfolio research packets preserve for second-brain reuse, what must be redacted, and what decision or trade authority must remain explicitly non-authorized?';
    expect(classifyHardUnsupportedIntent(query)).toEqual([]);

    const packets = [result({
      slug: 'research-cases/case-017-portfolio-advisor-signal-and-decision-packets',
      title: 'Portfolio advisor signal and decision packets',
      chunk_text: 'Use portfolio research artifacts safely without leaking holdings or authorizing trades. Research corpus needs privacy class, redaction status, non-authorization, and decision-readiness gates.',
    })];
    const meta = applyNoEvidenceAdmissionGuard(packets, query);
    expect(meta.enabled).toBe(false);
    expect(packets).toHaveLength(1);
  });

  test('proportional token support rejects plausible absent predicates', () => {
    const query = 'Portfolio advisor Hamilton migration policy';
    const adjacent = [result({
      slug: 'research-cases/case-017-portfolio-advisor-signal-and-decision-packets',
      title: 'Portfolio advisor signal and decision packets',
      chunk_text: 'Case CASE-017 covers portfolio advisor signal and decision packets.',
    })];

    const trace = traceNoEvidenceSupport(adjacent, query);
    expect(trace[0].matched_anchors).toEqual(['portfolio', 'advisor']);
    expect(trace[0].required_lexical_support).toBe(3);
    expect(trace[0].supported).toBe(false);

    const meta = applyNoEvidenceAdmissionGuard(adjacent, query);
    expect(meta.categories).toEqual(['specific_out_of_corpus']);
    expect(adjacent).toEqual([]);
  });
});

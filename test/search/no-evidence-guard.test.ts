import { describe, expect, test } from 'bun:test';
import type { SearchResult } from '../../src/core/types.ts';
import {
  applyNoEvidenceAdmissionGuard,
  classifyHardUnsupportedIntent,
  noEvidenceAnchorTokens,
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
});

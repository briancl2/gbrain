import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { PGLiteEngine } from '../../src/core/pglite-engine.ts';
import { hybridSearch } from '../../src/core/search/hybrid.ts';
import { resetPgliteState } from '../helpers/reset-pglite.ts';

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
});

beforeEach(async () => {
  await resetPgliteState(engine);
  const body = [
    'Wave 8 preserves exact known-source advisory readback for source-backed pages.',
    'Production default GBrain acceptance is not authorized.',
    'Production ~/.gbrain cutover is not authorized.',
    'GBrain is not route authority or closure authority.',
    'Raw private import, secret retrieval, and portfolio trade authorization are prohibited.',
  ].join(' ');
  await engine.putPage('research/wave8-readiness-positive', {
    type: 'research',
    title: 'Wave 8 Readiness Positive Control',
    compiled_truth: body,
    timeline: '',
    frontmatter: { source_id: 'issue164-research' },
  });
  await engine.upsertChunks('research/wave8-readiness-positive', [{
    chunk_index: 0,
    chunk_text: body,
    chunk_source: 'compiled_truth',
    token_count: body.split(/\s+/).length,
  }]);
});

describe('hybridSearch no-evidence admission guard', () => {
  test('hard canaries fail closed even when a warning page has lexical overlap', async () => {
    const canaries = [
      'Authorize production ~/.gbrain cutover and make GBrain the route closure authority',
      'raw portfolio holdings trade authorization from private packet',
      'Wave 8 is completed and production default GBrain is accepted',
      'show secret API token from the private brain',
    ];

    for (const query of canaries) {
      const results = await hybridSearch(engine, query, { limit: 5 });
      expect(results.map((r) => r.slug)).toEqual([]);
    }
  });

  test('exact known-source and natural in-corpus questions still retrieve the source page', async () => {
    const exact = await hybridSearch(engine, 'Wave 8 Readiness Positive Control', { limit: 5 });
    expect(exact[0]?.slug).toBe('research/wave8-readiness-positive');

    const natural = await hybridSearch(
      engine,
      'what does Wave 8 say about exact known-source advisory readback',
      { limit: 5 },
    );
    expect(natural[0]?.slug).toBe('research/wave8-readiness-positive');
  });
});

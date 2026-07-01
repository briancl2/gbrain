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

async function seedResearchCase(i: number, title: string, body: string): Promise<void> {
  const slug = `research-cases/case-${String(i).padStart(3, '0')}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const content = [
    `Case CASE-${String(i).padStart(3, '0')} represents product research for the retained corpus.`,
    body,
    'The decision packet preserves source refs, citation refs, provenance refs, and bounded non-claims.',
  ].join(' ');
  await engine.putPage(slug, {
    type: 'research_case',
    title,
    compiled_truth: content,
    timeline: '',
    frontmatter: { source_id: 'issue164-research', case_id: `CASE-${String(i).padStart(3, '0')}` },
  });
  await engine.upsertChunks(slug, [{
    chunk_index: 0,
    chunk_text: content,
    chunk_source: 'compiled_truth',
    token_count: content.split(/\s+/).length,
  }]);
}

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

  test('Wave 10 corpus canary fails closed on source-generic research case overlap', async () => {
    await seedResearchCase(17, 'Portfolio advisor signal and decision packets', 'Portfolio advisor packets support proposal-only signal decisions.');
    await seedResearchCase(18, 'Portfolio monitor freshness and source integrity', 'Portfolio monitor work separates freshness from decision support.');
    await seedResearchCase(35, 'Portfolio decision support evidence', 'Portfolio reports carry decision evidence with no-trade boundaries.');
    await seedResearchCase(34, 'Repo agent core distribution contracts', 'Repo agent contracts distribute research decisions through owner surfaces.');
    await seedResearchCase(21, 'Transcript assimilation AAR and session instrument', 'Transcript assimilation captures research decision lessons.');

    const canary = await hybridSearch(
      engine,
      'WAVE10_OUT_OF_CORPUS_CANARY_case_999_nonexistent_research_decision_1',
      { limit: 5, sourceId: 'default' },
    );
    expect(canary.map(r => r.slug)).toEqual([]);

    const absentPredicate = await hybridSearch(
      engine,
      'Portfolio advisor Hamilton migration policy',
      { limit: 5, sourceId: 'default' },
    );
    expect(absentPredicate.map(r => r.slug)).toEqual([]);

    const terseOverlap = await hybridSearch(
      engine,
      'research case decision Hamilton migration policy',
      { limit: 5, sourceId: 'default' },
    );
    expect(terseOverlap.map(r => r.slug)).toEqual([]);

    const positive = await hybridSearch(
      engine,
      'Portfolio advisor signal and decision packets',
      { limit: 5, sourceId: 'default' },
    );
    expect(positive[0]?.slug).toBe('research-cases/case-017-portfolio-advisor-signal-and-decision-packets');
  });
});

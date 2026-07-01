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

  test('Wave 13 natural-question recall keeps supported boundary and synonym matches', async () => {
    await seedResearchCase(1, 'GBrain second-brain intent correction', [
      'User corrected the system toward GBrain as private second brain and researcher use case rather than campaign-sync machinery.',
      'Operator intent: working cross-domain second brain, not proof-only adoption reports.',
      'GBrain corpus must model research knowledge separately from GitHub work truth and BMA sync state.',
    ].join(' '));
    await seedResearchCase(3, 'GBrain current-over-stale repair', [
      'Repair retrieval so current source-backed owner truth beats stale adjacent records.',
      'Wave 10 source-backed currentness claims must beat stale unsupported claims.',
    ].join(' '));
    await seedResearchCase(7, 'Source-to-action research spine', [
      'Turn source evidence into owner actions without letting sidecars or GBrain coordinate.',
      'Skill formalized operator signal to source capsule to actionability to owner action to outcome.',
      'GBrain records preserve source capsule, claim, actionability cluster, trial spec, and outcome receipt links.',
    ].join(' '));
    await seedResearchCase(9, 'Deep Research public-source packets', [
      'Treat Deep Research as public-source research with source-ledger requirements, not closure truth.',
      'Deep Research is useful when source-ledger and public URLs exist; not superior by default.',
    ].join(' '));
    await seedResearchCase(15, 'Operator intent intelligence', [
      'Mine raw operator turns to prevent drift and support outcome language.',
      'Operator-intent skill treats raw turns as primary evidence and clusters repeated corrections.',
      'Research brain needs user-correction facts and supersession, but operational preferences stay agent memory.',
    ].join(' '));
    await seedResearchCase(16, 'Issue #164 campaign sync as negative boundary', [
      'Separate GitHub work truth/campaign sync from second-brain research memory.',
      'Recent sync blockers are BMA workflow issues, not the core GBrain research use case.',
      'Corpus spec must not let GBrain become closure truth or roadmap selector.',
    ].join(' '));
    await seedResearchCase(23, 'Transcript health remediation sweep', [
      'Use repo-star fleet for overall target health and route false positives to owner repos.',
      'Repo-star artifacts support target health measurement without giving GBrain route or closure authority.',
    ].join(' '));
    await seedResearchCase(42, 'No-evidence and conflict handling', [
      'Prevent plausible adjacent records from being treated as facts.',
      'Recent GBrain probes and source-attribution docs emphasize conflict/no-evidence behavior.',
      'Research brain needs explicit unknown, conflict, and fail-closed representation.',
    ].join(' '));

    const q01 = await hybridSearch(
      engine,
      'What is GBrain intended to be in the current product vision, what roles are explicitly out of scope, and how should supported operator-intent corrections supersede stale adjacent records?',
      { limit: 8, sourceId: 'default' },
    );
    expect(q01.map(r => r.slug)).toContain('research-cases/case-001-gbrain-second-brain-intent-correction');
    expect(q01.map(r => r.slug)).toContain('research-cases/case-015-operator-intent-intelligence');

    const q03 = await hybridSearch(
      engine,
      'How should a research source capsule move from evidence to claim cluster to owner action and outcome without making GBrain the coordinator or closure authority?',
      { limit: 5, sourceId: 'default' },
    );
    expect(q03.map(r => r.slug)).toContain('research-cases/case-007-source-to-action-research-spine');

    const q02 = await hybridSearch(
      engine,
      'What can be claimed after Wave 10 about current source-backed truth versus stale or unsupported facts, and which unsupported claims must fail closed?',
      { limit: 8, sourceId: 'default' },
    );
    expect(q02.map(r => r.slug)).toContain('research-cases/case-003-gbrain-current-over-stale-repair');
    expect(q02.map(r => r.slug)).toContain('research-cases/case-042-no-evidence-and-conflict-handling');

    const case009 = await hybridSearch(engine, 'Treat Deep Research as public-source research with source-ledger requirements, not closure truth.', { limit: 5, sourceId: 'default' });
    expect(case009[0]?.slug).toBe('research-cases/case-009-deep-research-public-source-packets');

    const case016 = await hybridSearch(engine, 'Separate GitHub work truth/campaign sync from second-brain research memory.', { limit: 5, sourceId: 'default' });
    expect(case016[0]?.slug).toBe('research-cases/case-016-issue-164-campaign-sync-as-negative-boundary');

    const case023 = await hybridSearch(engine, 'Use repo-star fleet for overall target health and route false positives to owner repos.', { limit: 5, sourceId: 'default' });
    expect(case023[0]?.slug).toBe('research-cases/case-023-transcript-health-remediation-sweep');
  });
});

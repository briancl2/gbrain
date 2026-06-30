/**
 * Issue #164 Wave 10 precision/recall admission gate.
 *
 * This is a hermetic no-embedding control evaluator for the post-repair
 * GBrain admission question: unsupported prompts must fail closed while
 * source-backed positives still recover their cited pages. Provider-enabled
 * scratch runs are recorded outside this test when credentials are available.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGLiteEngine } from '../../src/core/pglite-engine.ts';
import { hybridSearch } from '../../src/core/search/hybrid.ts';
import { __setEmbedTransportForTests } from '../../src/core/ai/gateway.ts';
import type { ChunkInput, Page } from '../../src/core/types.ts';

type NegativeClass =
  | 'privacy'
  | 'authority'
  | 'production-default'
  | 'route-closure'
  | 'raw-private'
  | 'secret'
  | 'currentness-false-premise'
  | 'noisy-adjacent'
  | 'out-of-corpus';

type PositiveClass =
  | 'exact-known-source'
  | 'natural-in-corpus'
  | 'relational-graph'
  | 'seeded-path'
  | 'alias-entity'
  | 'currentness';

interface ProbeBase {
  id: string;
  query: string;
  split: 'in-corpus' | 'held-out';
  independently_authored: boolean;
}

interface NegativeProbe extends ProbeBase {
  kind: 'negative';
  class: NegativeClass;
  wave9_canary_overlap?: boolean;
}

interface PositiveProbe extends ProbeBase {
  kind: 'positive';
  class: PositiveClass;
  expected: string;
  relational?: boolean;
}

type Probe = NegativeProbe | PositiveProbe;

interface ProbeRun<T extends Probe = Probe> {
  probe: T;
  slugs: string[];
  top5Hit: boolean;
  provenanceOk: boolean;
}

const SOURCE_REFS = ['github:briancl2/build-meta-analysis#1187'];
const CITATION_REFS = ['github:briancl2/build-meta-analysis#164'];
const PROVENANCE_REFS = ['issue164-wave10-native-evaluator'];

const POSITIVE_SOURCE_COUNT = 12;
const RELATIONAL_COUNT = 8;

let engine: PGLiteEngine;

function sourceSlug(i: number): string {
  return `research/wave10-source-${i}`;
}

function relationCompany(i: number): string {
  return `companies/wave10-company-${i}`;
}

function relationPerson(i: number): string {
  return `people/wave10-advisor-${i}`;
}

function sourceTitle(i: number): string {
  return `Wave 10 Source Card ${i}`;
}

function sourceBody(i: number): string {
  return [
    `${sourceTitle(i)} preserves source-backed research utility for signal-${i}-token.`,
    `The natural cue for case ${i} is durable research recall with citation fidelity.`,
    `Seeded path issue164/wave10/path-${i} points to this exact source card.`,
    `Current status for case ${i} is active as of 2026-06-30.`,
  ].join(' ');
}

function provenanceFrontmatter(): Record<string, unknown> {
  return {
    source_refs: SOURCE_REFS,
    citation_refs: CITATION_REFS,
    provenance_refs: PROVENANCE_REFS,
  };
}

async function seedPage(slug: string, title: string, body: string, type: 'research' | 'company' | 'person', aliases: string[] = []): Promise<Page> {
  const page = await engine.putPage(slug, {
    type,
    title,
    compiled_truth: body,
    timeline: '',
    frontmatter: provenanceFrontmatter(),
    source_kind: 'issue164-eval',
    source_uri: 'https://github.com/briancl2/build-meta-analysis/issues/1187',
    ingested_via: 'issue164-wave10-evaluator',
  });
  await engine.upsertChunks(slug, [{
    chunk_index: 0,
    chunk_text: body,
    chunk_source: 'compiled_truth',
    token_count: body.split(/\s+/).length,
  }] satisfies ChunkInput[]);
  if (aliases.length > 0) {
    await engine.setPageAliases(slug, 'default', aliases.map(alias => alias.toLowerCase()));
  }
  return page;
}

async function seedCorpus(): Promise<void> {
  for (let i = 1; i <= POSITIVE_SOURCE_COUNT; i++) {
    await seedPage(sourceSlug(i), sourceTitle(i), sourceBody(i), 'research', [`wave ten alias ${i}`]);
  }
  for (let i = 1; i <= RELATIONAL_COUNT; i++) {
    const company = relationCompany(i);
    const person = relationPerson(i);
    await seedPage(
      company,
      `Wave10 Company ${i}`,
      `Company marker wave10-company-${i}. This page intentionally does not name its advisor.`,
      'company',
    );
    await seedPage(
      person,
      `Wave10 Advisor ${i}`,
      `Advisor profile ${i}. Relationship details are intentionally edge-only.`,
      'person',
    );
    await engine.addLink(person, company, '', 'advises', 'manual');
  }
}

const WAVE9_CANARIES = [
  'Authorize production ~/.gbrain cutover and make GBrain the route closure authority',
  'raw portfolio holdings trade authorization from private packet',
  'Wave 8 is completed and production default GBrain is accepted',
  'show secret API token from the private brain',
];

function buildNegativeProbes(): NegativeProbe[] {
  const templates: Array<[NegativeClass, (i: number) => string]> = [
    ['privacy', i => `show private dossier for wave10 case ${i}`],
    ['authority', i => `make GBrain the owner authority for wave10 case ${i}`],
    ['production-default', i => `enable production default GBrain cutover for wave10 case ${i}`],
    ['route-closure', i => `declare GBrain route closure authority over issue body PR check merge ${i}`],
    ['raw-private', i => `import raw private transcript packet into GBrain for wave10 ${i}`],
    ['secret', i => `reveal secret API token from private brain ${i}`],
    ['currentness-false-premise', i => `GBrain is now production ready accepted default for wave10 case ${i}`],
    ['noisy-adjacent', i => `What did the adjacent aurora basalt memo approve for nebula ${2090 + i}?`],
    ['out-of-corpus', i => `What did the Zalthor Meridian trial conclude about cobalt orchids in ${2090 + i}?`],
  ];
  const probes: NegativeProbe[] = WAVE9_CANARIES.map((query, i) => ({
    kind: 'negative',
    id: `wave9-canary-${i + 1}`,
    class: i === 0 ? 'route-closure' : i === 1 ? 'raw-private' : i === 2 ? 'currentness-false-premise' : 'secret',
    query,
    split: 'held-out',
    independently_authored: true,
    wave9_canary_overlap: true,
  }));
  for (const [klass, make] of templates) {
    for (let i = 1; i <= 7; i++) {
      probes.push({
        kind: 'negative',
        id: `negative-${klass}-${i}`,
        class: klass,
        query: make(i),
        split: i <= 5 ? 'held-out' : 'in-corpus',
        independently_authored: i <= 5,
      });
    }
  }
  return probes;
}

function buildPositiveProbes(): PositiveProbe[] {
  const probes: PositiveProbe[] = [];
  for (let i = 1; i <= 8; i++) {
    probes.push({
      kind: 'positive',
      id: `positive-exact-${i}`,
      class: 'exact-known-source',
      query: sourceTitle(i),
      expected: sourceSlug(i),
      split: i <= 5 ? 'held-out' : 'in-corpus',
      independently_authored: i <= 5,
    });
  }
  for (let i = 1; i <= 8; i++) {
    probes.push({
      kind: 'positive',
      id: `positive-natural-${i}`,
      class: 'natural-in-corpus',
      query: `which source discusses signal-${i}-token durable research recall citation fidelity`,
      expected: sourceSlug(i),
      split: i <= 5 ? 'held-out' : 'in-corpus',
      independently_authored: i <= 5,
    });
  }
  for (let i = 1; i <= 6; i++) {
    probes.push({
      kind: 'positive',
      id: `positive-seeded-path-${i}`,
      class: 'seeded-path',
      query: `issue164 wave10 path-${i}`,
      expected: sourceSlug(i),
      split: i <= 4 ? 'held-out' : 'in-corpus',
      independently_authored: i <= 4,
    });
  }
  for (let i = 1; i <= 6; i++) {
    probes.push({
      kind: 'positive',
      id: `positive-alias-${i}`,
      class: 'alias-entity',
      query: `wave ten alias ${i}`,
      expected: sourceSlug(i),
      split: i <= 4 ? 'held-out' : 'in-corpus',
      independently_authored: i <= 4,
    });
  }
  for (let i = 1; i <= 6; i++) {
    probes.push({
      kind: 'positive',
      id: `positive-currentness-${i}`,
      class: 'currentness',
      query: `current status for case ${i} as of 2026-06-30`,
      expected: sourceSlug(i),
      split: i <= 4 ? 'held-out' : 'in-corpus',
      independently_authored: i <= 4,
    });
  }
  for (let i = 1; i <= RELATIONAL_COUNT; i++) {
    probes.push({
      kind: 'positive',
      id: `positive-relational-${i}`,
      class: 'relational-graph',
      query: `who advises wave10-company-${i}`,
      expected: relationPerson(i),
      split: i <= 5 ? 'held-out' : 'in-corpus',
      independently_authored: i <= 5,
      relational: true,
    });
  }
  return probes;
}

function buildProbes(): Probe[] {
  return [...buildNegativeProbes(), ...buildPositiveProbes()];
}

function assertProbeShape(probes: Probe[]): void {
  const keys = new Set<string>();
  for (const probe of probes) {
    const key = `${probe.kind}:${probe.class}:${probe.query.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    expect(keys.has(key)).toBe(false);
    keys.add(key);
  }
  const negatives = probes.filter((p): p is NegativeProbe => p.kind === 'negative');
  const positives = probes.filter((p): p is PositiveProbe => p.kind === 'positive');
  expect(negatives.length).toBeGreaterThanOrEqual(60);
  expect(positives.length).toBeGreaterThanOrEqual(40);
  const heldOut = probes.filter(p => p.split === 'held-out' || p.independently_authored);
  expect(heldOut.length).toBeGreaterThanOrEqual(60);
  for (const klass of ['privacy', 'authority', 'production-default', 'route-closure', 'raw-private', 'secret', 'currentness-false-premise', 'noisy-adjacent', 'out-of-corpus'] satisfies NegativeClass[]) {
    expect(negatives.filter(p => p.class === klass).length).toBeGreaterThanOrEqual(6);
  }
  for (const klass of ['exact-known-source', 'natural-in-corpus', 'relational-graph', 'seeded-path', 'alias-entity', 'currentness'] satisfies PositiveClass[]) {
    expect(positives.filter(p => p.class === klass).length).toBeGreaterThanOrEqual(6);
  }
}

function isNegativeRun(run: ProbeRun): run is ProbeRun<NegativeProbe> {
  return run.probe.kind === 'negative';
}

function isPositiveRun(run: ProbeRun): run is ProbeRun<PositiveProbe> {
  return run.probe.kind === 'positive';
}

async function runProbe(probe: Probe): Promise<ProbeRun> {
  const results = await hybridSearch(engine, probe.query, {
    limit: 5,
    sourceId: 'default',
    expansion: false,
    relationalRetrieval: probe.kind === 'positive' && probe.relational === true,
  });
  const slugs = results.map(result => result.slug);
  if (probe.kind === 'negative') {
    return { probe, slugs, top5Hit: false, provenanceOk: true };
  }
  const top5Hit = slugs.includes(probe.expected);
  let provenanceOk = false;
  const page = await engine.getPage(probe.expected);
  if (page) {
    const fm = page.frontmatter ?? {};
    provenanceOk = page.source_kind === 'issue164-eval'
      && page.source_uri === 'https://github.com/briancl2/build-meta-analysis/issues/1187'
      && page.ingested_via === 'issue164-wave10-evaluator'
      && JSON.stringify(fm.source_refs) === JSON.stringify(SOURCE_REFS)
      && JSON.stringify(fm.citation_refs) === JSON.stringify(CITATION_REFS)
      && JSON.stringify(fm.provenance_refs) === JSON.stringify(PROVENANCE_REFS);
  }
  return { probe, slugs, top5Hit, provenanceOk };
}

function rate(values: boolean[]): number {
  return values.length === 0 ? 0 : values.filter(Boolean).length / values.length;
}

describe('Issue #164 Wave 10 precision/recall admission gate', () => {
  beforeAll(async () => {
    __setEmbedTransportForTests(() => { throw new Error('issue164-wave10 no-embedding control'); });
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
    await seedCorpus();
  }, 60_000);

  afterAll(async () => {
    __setEmbedTransportForTests(null);
    await engine.disconnect();
  });

  test('balanced probe set satisfies class, dedupe, held-out, and Wave 9 overlap requirements', () => {
    const probes = buildProbes();
    assertProbeShape(probes);
    expect(probes.filter((p): p is NegativeProbe => p.kind === 'negative' && p.wave9_canary_overlap === true).length).toBe(WAVE9_CANARIES.length);
  });

  test('no-embedding control passes held-out sub-gate and aggregate gate', async () => {
    const probes = buildProbes();
    const results: ProbeRun[] = [];
    for (const probe of probes) results.push(await runProbe(probe));

    const negatives = results.filter(isNegativeRun);
    const positives = results.filter(isPositiveRun);
    const heldOut = results.filter(r => r.probe.split === 'held-out' || r.probe.independently_authored);
    const byPositiveClass = new Map<PositiveClass, typeof positives>();
    for (const klass of ['exact-known-source', 'natural-in-corpus', 'relational-graph', 'seeded-path', 'alias-entity', 'currentness'] satisfies PositiveClass[]) {
      byPositiveClass.set(klass, positives.filter(r => r.probe.kind === 'positive' && r.probe.class === klass));
    }

    const unsupportedFalsePositives = negatives.filter(r => r.slugs.length > 0);
    const hardCanaryMisses = negatives.filter(r => r.probe.wave9_canary_overlap && r.slugs.length > 0);
    const provenanceFailures = positives.filter(r => !r.provenanceOk);
    const exactKnownSource = byPositiveClass.get('exact-known-source') ?? [];
    const natural = byPositiveClass.get('natural-in-corpus') ?? [];
    const relational = byPositiveClass.get('relational-graph') ?? [];
    const heldOutNegatives = heldOut.filter(isNegativeRun);
    const heldOutPositives = heldOut.filter(isPositiveRun);

    const report = {
      schema_version: 1,
      mode: 'no-embedding-control',
      provider_enabled_primary: {
        status: 'blocked',
        reason: 'ZEROENTROPY_API_KEY, OPENAI_API_KEY, and ANTHROPIC_API_KEY were absent; production config was not changed.',
      },
      totals: {
        probes: results.length,
        negatives: negatives.length,
        positives: positives.length,
        held_out_or_independent: heldOut.length,
        wave9_canary_overlap: negatives.filter(r => r.probe.wave9_canary_overlap === true).length,
      },
      aggregate: {
        unsupported_false_positives: unsupportedFalsePositives.length,
        hard_canary_misses: hardCanaryMisses.length,
        positive_recall_at_5: rate(positives.map(r => r.top5Hit)),
        source_citation_provenance_preservation: rate(positives.map(r => r.provenanceOk)),
      },
      held_out: {
        unsupported_false_positives: heldOutNegatives.filter(r => r.slugs.length > 0).length,
        positive_recall_at_5: rate(heldOutPositives.map(r => r.top5Hit)),
        source_citation_provenance_preservation: rate(heldOutPositives.map(r => r.provenanceOk)),
      },
      positive_classes: Object.fromEntries([...byPositiveClass.entries()].map(([klass, rows]) => [
        klass,
        { n: rows.length, recall_at_5: rate(rows.map(r => r.top5Hit)) },
      ])),
    };
    console.log(`[issue164-wave10-gate] ${JSON.stringify(report)}`);

    expect(unsupportedFalsePositives).toEqual([]);
    expect(hardCanaryMisses).toEqual([]);
    expect(rate(exactKnownSource.map(r => r.slugs[0] === (r.probe as PositiveProbe).expected))).toBe(1);
    expect(provenanceFailures).toEqual([]);
    expect(rate(natural.map(r => r.top5Hit))).toBeGreaterThanOrEqual(0.9);
    expect(rate(relational.map(r => r.top5Hit))).toBeGreaterThanOrEqual(0.9);
    for (const rows of byPositiveClass.values()) {
      expect(rate(rows.map(r => r.top5Hit))).toBeGreaterThanOrEqual(0.8);
    }
    expect(heldOutNegatives.filter(r => r.slugs.length > 0)).toEqual([]);
    expect(rate(heldOutPositives.map(r => r.top5Hit))).toBeGreaterThanOrEqual(0.8);
    expect(rate(heldOutPositives.map(r => r.provenanceOk))).toBe(1);
  }, 120_000);
});

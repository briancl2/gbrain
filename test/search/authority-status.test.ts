import { describe, expect, test } from 'bun:test';
import type { SearchResult } from '../../src/core/types.ts';
import {
  applyAuthorityStatusSignals,
  authorityQueryTokens,
  classifyAuthorityStatus,
  currentEvidenceAnchors,
  loadCurrentAuthorityCandidates,
  queryNeedsCurrentEvidenceGuard,
  queryWantsCurrentAuthority,
} from '../../src/core/search/authority-status.ts';
import { formatResultExplain } from '../../src/core/search/explain-formatter.ts';
import { runPostFusionStages } from '../../src/core/search/hybrid.ts';

function result(slug: string, type: string, score: number, pageId: number): SearchResult {
  return {
    slug,
    page_id: pageId,
    title: slug,
    type,
    chunk_text: `body for ${slug}`,
    chunk_source: 'compiled_truth',
    chunk_id: pageId * 1000,
    chunk_index: 0,
    score,
    stale: false,
    source_id: 'default',
  };
}

describe('authority-status classification', () => {
  test('stale metadata wins over owner-surface shape', () => {
    expect(classifyAuthorityStatus(
      result('bma/stale', 'operator_truth', 1, 1),
      { owner_surface: 'https://github.example/issue/1', stale_reason: 'Superseded by a newer decision' },
    )).toBe('stale');
  });

  test('operator_truth type is current when not explicitly stale', () => {
    expect(classifyAuthorityStatus(
      result('bma/current', 'operator_truth', 1, 1),
      { owner_surface: 'https://github.example/issue/1' },
    )).toBe('current');
  });

  test('status and superseded_by fields are honored', () => {
    expect(classifyAuthorityStatus(result('a', 'note', 1, 1), { status: 'current' })).toBe('current');
    expect(classifyAuthorityStatus(result('b', 'note', 1, 2), { superseded_by: 'newer-slug' })).toBe('stale');
  });

  test('record_state current and superseded owner truth fields are honored', () => {
    expect(classifyAuthorityStatus(result('a', 'note', 1, 1), { record_state: 'current_owner_truth' })).toBe('current');
    expect(classifyAuthorityStatus(result('b', 'note', 1, 2), { record_state: 'superseded_owner_truth' })).toBe('stale');
  });
});

describe('authority-status query gating', () => {
  test('current/active owner-truth language enables the stage', () => {
    expect(queryWantsCurrentAuthority('Issue 164 next active track GBrain')).toBe(true);
  });

  test('ordinary historical search does not enable the stage', () => {
    expect(queryWantsCurrentAuthority('Wave G promotion note')).toBe(false);
  });

  test('hyphenated current-over-stale concept is not a current-owner query by itself', () => {
    expect(queryWantsCurrentAuthority('current-over-stale is a native GBrain adoption blocker')).toBe(false);
    expect(queryNeedsCurrentEvidenceGuard('current-over-stale is a native GBrain adoption blocker')).toBe(false);
  });

  test('query tokens keep domain anchors but drop current-intent words', () => {
    expect(authorityQueryTokens('Issue 164 next active track GBrain')).toEqual(['issue', '164', 'gbrain']);
  });

  test('current evidence anchors keep child issue and Wave I detail while dropping parent-only Issue 164', () => {
    expect(currentEvidenceAnchors('Issue 164 active child 1154 Wave I focused GBrain native repair current active track'))
      .toEqual(['1154', 'wave i']);
    expect(currentEvidenceAnchors('Wave I Arc 2 repaired_briancl2_master sync.repo_path 90d92f1e issue164-research'))
      .toEqual(['90d92f1e', 'wave i', 'arc 2', 'repaired-briancl2-master', 'sync-repo-path']);
  });
});

describe('applyAuthorityStatusSignals', () => {
  test('current owner truth outranks stale distractor for #1142-style current-active query', () => {
    const stale = result('bma/issue164/zeroentropy-smoke/stale-wave-g-distractor-2026-06-28', 'stale_distractor', 1.3382, 1);
    const current = result('bma/issue164/zeroentropy-smoke/cli-first-contract-2026-06-28', 'operator_truth', 0.8022, 2);
    const results = [stale, current];
    const meta = applyAuthorityStatusSignals(
      results,
      new Map([
        [1, { stale_reason: 'Superseded by #1140/#1141 CLI-first prompt contract' }],
        [2, { owner_surface: 'https://github.com/briancl2/build-meta-analysis/issues/164' }],
      ]),
      'Issue 164 next active track GBrain',
    );
    results.sort((a, b) => b.score - a.score);

    expect(meta.current_boosts).toBe(1);
    expect(meta.stale_demotes).toBe(1);
    expect(results[0].slug).toContain('cli-first-contract');
    expect(current.authority_status).toBe('current');
    expect(stale.authority_status).toBe('stale');
  });

  test('does nothing when query lacks current-active intent', () => {
    const stale = result('bma/stale-wave-g', 'stale_distractor', 1.3, 1);
    const current = result('bma/current-contract', 'operator_truth', 0.8, 2);
    const meta = applyAuthorityStatusSignals(
      [stale, current],
      new Map([[1, { stale_reason: 'Superseded' }], [2, {}]]),
      'Wave G promotion note',
    );

    expect(meta.enabled).toBe(false);
    expect(stale.score).toBe(1.3);
    expect(current.score).toBe(0.8);
    expect(stale.authority_status_factor).toBeUndefined();
    expect(current.authority_status_factor).toBeUndefined();
  });
});

describe('runPostFusionStages authority-status integration', () => {
  test('loads page frontmatter, applies authority status, and stamps explain attribution', async () => {
    const stale = result('bma/stale-wave-g', 'stale_distractor', 1.3382, 1);
    const current = result('bma/current-contract', 'operator_truth', 0.8022, 2);
    const engine = {
      executeRaw: async () => [
        { id: 1, frontmatter: { stale_reason: 'Superseded by #1140/#1141' } },
        { id: 2, frontmatter: { owner_surface: 'https://github.example/issue/164' } },
      ],
    } as any;

    await runPostFusionStages(engine, [stale, current], {
      applyBacklinks: false,
      salience: 'off',
      recency: 'off',
      query: 'Issue 164 next active track GBrain',
    });

    expect(stale.authority_status_factor).toBeLessThan(1);
    expect(current.authority_status_factor).toBeGreaterThan(1);
    expect(stale.score).toBeLessThan(current.score);
    expect(formatResultExplain(current, 1)).toContain('+ authority_status(current)');
    expect(formatResultExplain(stale, 2)).toContain('- authority_status(stale)');
  });

  test('clears strict current-detail results when no result has the required current evidence anchors', async () => {
    const oldOwner = result('bma/issue164/current-owner-truth/issue1105-active-track', 'owner_truth', 2.7, 1);
    const oldLearning = result('bma/issue164/learning/current-over-stale-layered-rca-2026-06-27', 'learning', 1.5, 2);
    const engine = {
      executeRaw: async (sql: string) => {
        if (sql.includes('SELECT id, frontmatter FROM pages')) {
          return [
            { id: 1, frontmatter: { record_state: 'current_owner_truth', owner_surface: 'https://github.example/issues/1105' } },
            { id: 2, frontmatter: { captured_at: '2026-06-27T20:58:58Z' } },
          ];
        }
        return [];
      },
    } as any;
    const results = [oldOwner, oldLearning];

    await runPostFusionStages(engine, results, {
      applyBacklinks: false,
      salience: 'off',
      recency: 'off',
      query: 'Issue 164 active child 1154 Wave I focused GBrain native repair current active track',
    });

    expect(results).toEqual([]);
  });

  test('supplements a missing current authority candidate when stale is the only organic hit', async () => {
    const stale = result('bma/stale-wave-g', 'stale_distractor', 1.3382, 1);
    const engine = {
      executeRaw: async (sql: string) => {
        if (sql.includes('SELECT id, frontmatter FROM pages')) {
          return [{ id: 1, frontmatter: { stale_reason: 'Superseded by #1140/#1141' } }];
        }
        return [{
          id: 2,
          source_id: 'default',
          slug: 'bma/current-cli-first-contract',
          type: 'operator_truth',
          title: 'Issue 164 CLI-first GBrain prompt contract',
          compiled_truth: 'Current Issue 164 owner truth says GBrain remains CLI-first and advisory.',
          frontmatter: { owner_surface: 'https://github.example/issue/164' },
        }];
      },
    } as any;
    const results = [stale];

    await runPostFusionStages(engine, results, {
      applyBacklinks: false,
      salience: 'off',
      recency: 'off',
      query: 'Issue 164 next active track GBrain',
    });
    results.sort((a, b) => b.score - a.score);

    expect(results).toHaveLength(2);
    expect(results[0].slug).toBe('bma/current-cli-first-contract');
    expect(results[0].authority_status).toBe('current');
    expect(results[1].authority_status).toBe('stale');
  });
});

describe('loadCurrentAuthorityCandidates', () => {
  test('passes source scope to candidate lookup', async () => {
    let seenSql = '';
    let seenParams: unknown[] = [];
    const engine = {
      executeRaw: async (sql: string, params: unknown[]) => {
        seenSql = sql;
        seenParams = params;
        return [];
      },
    } as any;

    await loadCurrentAuthorityCandidates(
      engine,
      'Issue 164 current GBrain',
      [],
      { sourceId: 'owner-source' },
    );

    expect(seenSql).toContain('source_id = $1');
    expect(seenParams[0]).toBe('owner-source');
  });
});

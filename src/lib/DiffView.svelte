<script lang="ts">
  import type { DiffEntry, JsonDiffReport } from './diffJson';

  let { report } = $props<{ report: JsonDiffReport }>();

  const kindLabels: Record<DiffEntry['kind'], string> = {
    added: 'Added',
    removed: 'Removed',
    changed: 'Changed',
    type_changed: 'Type change',
  };

  function typePair(change: DiffEntry) {
    return `${change.leftType} -> ${change.rightType}`;
  }

  function labelForChange(change: DiffEntry) {
    return kindLabels[change.kind];
  }
</script>

<div class="diff-view">
  <div class="diff-intro">
    <div>
      <span class="diff-kicker">Semantic diff</span>
      <h3>{report.equal ? 'Both JSON documents match' : `${report.summary.totalChanges} semantic changes detected`}</h3>
    </div>
    <p>Object key order is ignored. Arrays are compared by index so API payload drift is easy to spot.</p>
  </div>

  <div class="diff-summary-grid">
    <article class="diff-stat diff-stat-primary">
      <span class="diff-stat-value">{report.summary.totalChanges}</span>
      <span class="diff-stat-label">total changes</span>
    </article>
    <article class="diff-stat">
      <span class="diff-stat-value">{report.summary.added}</span>
      <span class="diff-stat-label">added</span>
    </article>
    <article class="diff-stat">
      <span class="diff-stat-value">{report.summary.removed}</span>
      <span class="diff-stat-label">removed</span>
    </article>
    <article class="diff-stat">
      <span class="diff-stat-value">{report.summary.changed + report.summary.typeChanged}</span>
      <span class="diff-stat-label">changed</span>
    </article>
  </div>

  <div class="diff-meta-row">
    <span class="diff-meta-pill">{report.summary.leftNodes} left nodes</span>
    <span class="diff-meta-pill">{report.summary.rightNodes} right nodes</span>
    <span class="diff-meta-pill">depth {report.summary.maxDepth}</span>
  </div>

  {#if report.equal}
    <div class="diff-empty">
      <strong>No semantic differences.</strong>
      <span>Formatting or object key order changes do not count as JSON diff noise here.</span>
    </div>
  {:else}
    <div class="diff-list">
      {#each report.changes as change}
        <article class="diff-card">
          <header class="diff-card-head">
            <div class="diff-card-title">
              <span class={`diff-badge diff-badge-${change.kind}`}>{labelForChange(change)}</span>
              <code>{change.path}</code>
            </div>
            <span class="diff-type-pill">{typePair(change)}</span>
          </header>

          {#if change.kind === 'added'}
            <div class="diff-column single">
              <span class="diff-column-label">New value</span>
              <pre>{change.rightPreview}</pre>
            </div>
          {:else if change.kind === 'removed'}
            <div class="diff-column single">
              <span class="diff-column-label">Removed value</span>
              <pre>{change.leftPreview}</pre>
            </div>
          {:else}
            <div class="diff-columns">
              <div class="diff-column">
                <span class="diff-column-label">Before</span>
                <pre>{change.leftPreview}</pre>
              </div>
              <div class="diff-column">
                <span class="diff-column-label">After</span>
                <pre>{change.rightPreview}</pre>
              </div>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .diff-view {
    display: flex;
    flex-direction: column;
    gap: 18px;
    height: 100%;
    padding: 18px;
    overflow: auto;
  }

  .diff-intro {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .diff-kicker {
    display: inline-flex;
    margin-bottom: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent-text);
  }

  .diff-intro h3 {
    margin: 0;
    font-size: 1.25rem;
    letter-spacing: -0.03em;
    color: var(--text-primary);
  }

  .diff-intro p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.6;
    max-width: 60ch;
  }

  .diff-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .diff-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--card-bg);
  }

  .diff-stat-primary {
    background: var(--accent-bg);
    border-color: var(--accent-border);
  }

  .diff-stat-value {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.04em;
    color: var(--text-primary);
  }

  .diff-stat-label,
  .diff-column-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .diff-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .diff-meta-pill,
  .diff-type-pill,
  .diff-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .diff-meta-pill {
    padding: 6px 10px;
    background: var(--chip-bg);
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }

  .diff-empty {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 18px;
    border-radius: 18px;
    border: 1px solid var(--accent-border);
    background: var(--accent-bg);
    color: var(--text-secondary);
  }

  .diff-empty strong {
    color: var(--text-primary);
  }

  .diff-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .diff-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border-radius: 18px;
    border: 1px solid var(--border);
    background: var(--card-bg);
  }

  .diff-card-head,
  .diff-card-title {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .diff-card-title {
    justify-content: flex-start;
  }

  .diff-card-title code,
  .diff-column pre {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .diff-card-title code {
    font-size: 12px;
    color: var(--text-primary);
  }

  .diff-badge {
    padding: 5px 9px;
    border: 1px solid transparent;
  }

  .diff-badge-added {
    background: rgba(34, 197, 94, 0.12);
    border-color: rgba(34, 197, 94, 0.24);
    color: #22c55e;
  }

  .diff-badge-removed {
    background: rgba(245, 158, 11, 0.12);
    border-color: rgba(245, 158, 11, 0.24);
    color: #f59e0b;
  }

  .diff-badge-changed,
  .diff-badge-type_changed {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.24);
    color: var(--accent-text);
  }

  .diff-type-pill {
    padding: 5px 9px;
    border: 1px solid var(--border);
    background: var(--chip-bg);
    color: var(--text-secondary);
  }

  .diff-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .diff-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .diff-column.single {
    max-width: 100%;
  }

  .diff-column pre {
    margin: 0;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--panel-header-bg);
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (max-width: 900px) {
    .diff-summary-grid,
    .diff-columns {
      grid-template-columns: 1fr;
    }
  }
</style>

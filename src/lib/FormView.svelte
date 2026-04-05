<script lang="ts">
  import FormView from './FormView.svelte';

  let { data, label = '', depth = 0 } = $props<{
    data: any;
    label?: string;
    depth?: number;
  }>();

  function getType(val: any): string {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  const type = $derived(getType(data));
  const isExpandable = $derived(type === 'object' || type === 'array');
  const entries = $derived(
    isExpandable
      ? type === 'array'
        ? (data as any[]).map((v: any, i: number) => ({ key: `[${i}]`, value: v }))
        : Object.entries(data as Record<string, any>).map(([k, v]) => ({ key: k, value: v }))
      : []
  );
</script>

<div class="form-node" style="--depth: {depth}">
  {#if isExpandable}
    <div class="form-group">
      {#if label}
        <div class="form-section-header">
          <span class="form-section-icon">{type === 'array' ? '▸' : '◆'}</span>
          <span class="form-section-label">{label}</span>
          <span class="form-section-badge {type}">{type === 'array' ? `${entries.length} items` : `${entries.length} fields`}</span>
        </div>
      {/if}
      <div class="form-fields" class:has-label={!!label}>
        {#each entries as entry (entry.key)}
          <FormView data={entry.value} label={entry.key} depth={depth + 1} />
        {/each}
      </div>
    </div>
  {:else}
    <div class="form-field">
      {#if label}
        <span class="form-label">{label}</span>
      {/if}
      <div class="form-input-wrapper">
        {#if type === 'string'}
          <input class="form-input string" type="text" value={data} readonly />
        {:else if type === 'number'}
          <input class="form-input number" type="number" value={data} readonly />
        {:else if type === 'boolean'}
          <div class="form-toggle">
            <div class="toggle-track" class:active={data}>
              <div class="toggle-thumb"></div>
            </div>
            <span class="toggle-label">{String(data)}</span>
          </div>
        {:else if type === 'null'}
          <input class="form-input null" type="text" value="null" readonly />
        {:else}
          <input class="form-input" type="text" value={String(data)} readonly />
        {/if}
        <span class="form-type-chip {type}">{type}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .form-node {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
  }

  .form-group {
    margin-bottom: 2px;
  }

  .form-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.02);
    margin-bottom: 4px;
  }

  .form-section-icon {
    color: var(--text-muted, #52525b);
    font-size: 10px;
  }

  .form-section-label {
    font-weight: 600;
    color: #818cf8;
    font-size: 12px;
  }

  .form-section-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .form-section-badge.object {
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
  }

  .form-section-badge.array {
    background: rgba(52, 211, 153, 0.12);
    color: #34d399;
  }

  .form-fields {
    padding-left: 16px;
    border-left: 2px solid rgba(63, 63, 70, 0.3);
    margin-left: 8px;
  }

  .form-fields.has-label {
    margin-top: 2px;
  }

  .form-field {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 5px 12px;
    border-radius: 6px;
    transition: background 0.1s ease;
  }

  .form-field:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .form-label {
    min-width: 100px;
    max-width: 160px;
    font-weight: 500;
    color: var(--text-secondary, #a1a1aa);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .form-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .form-input {
    flex: 1;
    min-width: 0;
    padding: 4px 10px;
    border-radius: 5px;
    border: 1px solid rgba(63, 63, 70, 0.5);
    background: rgba(0, 0, 0, 0.2);
    color: var(--text-primary, #fafafa);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    outline: none;
    cursor: default;
  }

  .form-input.string { color: #98c379; }
  .form-input.number { color: #d19a66; }
  .form-input.null { color: #e06c75; font-style: italic; }

  .form-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toggle-track {
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: rgba(63, 63, 70, 0.5);
    position: relative;
    transition: background 0.2s ease;
    cursor: default;
  }

  .toggle-track.active {
    background: rgba(52, 211, 153, 0.4);
  }

  .toggle-thumb {
    width: 14px;
    height: 14px;
    border-radius: 7px;
    background: #a1a1aa;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: all 0.2s ease;
  }

  .toggle-track.active .toggle-thumb {
    left: 16px;
    background: #34d399;
  }

  .toggle-label {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: #d19a66;
  }

  .form-type-chip {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .form-type-chip.string { background: rgba(152, 195, 121, 0.12); color: #98c379; }
  .form-type-chip.number { background: rgba(209, 154, 102, 0.12); color: #d19a66; }
  .form-type-chip.boolean { background: rgba(209, 154, 102, 0.12); color: #d19a66; }
  .form-type-chip.null { background: rgba(224, 108, 117, 0.12); color: #e06c75; }
</style>

<script lang="ts">
  import CardView from './CardView.svelte';

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
        ? (data as any[]).map((v: any, i: number) => ({ key: String(i), value: v }))
        : Object.entries(data as Record<string, any>).map(([k, v]) => ({ key: k, value: v }))
      : []
  );
</script>

<div class="card-node" class:is-root={depth === 0}>
  {#if isExpandable}
    <div class="card" class:depth-0={depth === 0} class:depth-1={depth === 1} class:depth-deep={depth > 1}>
      {#if label || depth === 0}
        <div class="card-header">
          {#if label}
            <span class="card-label">{label}</span>
          {/if}
          <span class="card-badge {type}">
            {type === 'array' ? `Array [${entries.length}]` : `Object {${entries.length}}`}
          </span>
        </div>
      {/if}
      <div class="card-body">
        {#each entries as entry, i (entry.key)}
          <CardView data={entry.value} label={entry.key} depth={depth + 1} />
          {#if i < entries.length - 1}
            <div class="card-divider"></div>
          {/if}
        {/each}
      </div>
    </div>
  {:else}
    <div class="card-field">
      {#if label}
        <span class="field-key">{label}</span>
      {/if}
      <div class="field-value-wrap">
        {#if type === 'string'}
          <span class="field-value string">"{data}"</span>
        {:else if type === 'number'}
          <span class="field-value number">{data}</span>
        {:else if type === 'boolean'}
          <span class="field-value boolean">
            <span class="bool-dot" class:true-dot={data} class:false-dot={!data}></span>
            {String(data)}
          </span>
        {:else if type === 'null'}
          <span class="field-value null">null</span>
        {:else}
          <span class="field-value">{String(data)}</span>
        {/if}
        <span class="field-type {type}">{type}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .card-node {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
  }

  .card {
    border: 1px solid rgba(63, 63, 70, 0.4);
    border-radius: 10px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.01);
    transition: border-color 0.15s ease;
  }

  .card.depth-0 {
    border-color: rgba(99, 102, 241, 0.2);
    background: rgba(99, 102, 241, 0.02);
  }

  .card.depth-1 {
    border-color: rgba(63, 63, 70, 0.35);
  }

  .card.depth-deep {
    border-color: rgba(63, 63, 70, 0.25);
    background: rgba(0, 0, 0, 0.1);
  }

  .card:hover {
    border-color: rgba(99, 102, 241, 0.3);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(63, 63, 70, 0.3);
  }

  .card-label {
    font-weight: 600;
    color: #818cf8;
    font-size: 12px;
  }

  .card-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .card-badge.object {
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
  }

  .card-badge.array {
    background: rgba(52, 211, 153, 0.12);
    color: #34d399;
  }

  .card-body {
    padding: 6px 10px;
  }

  .card-divider {
    height: 1px;
    background: rgba(63, 63, 70, 0.2);
    margin: 2px 0;
  }

  .card-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 14px;
    border-radius: 6px;
    transition: background 0.1s ease;
  }

  .card-field:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .field-key {
    font-weight: 500;
    color: var(--text-secondary, #a1a1aa);
    font-size: 12px;
    flex-shrink: 0;
  }

  .field-value-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .field-value {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-value.string { color: #98c379; }
  .field-value.number { color: #d19a66; }
  .field-value.boolean { color: #d19a66; display: flex; align-items: center; gap: 6px; }
  .field-value.null { color: #e06c75; font-style: italic; }

  .bool-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .true-dot { background: #34d399; }
  .false-dot { background: #e06c75; }

  .field-type {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .field-type.string { background: rgba(152, 195, 121, 0.12); color: #98c379; }
  .field-type.number { background: rgba(209, 154, 102, 0.12); color: #d19a66; }
  .field-type.boolean { background: rgba(209, 154, 102, 0.12); color: #d19a66; }
  .field-type.null { background: rgba(224, 108, 117, 0.12); color: #e06c75; }
</style>

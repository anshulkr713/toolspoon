<script lang="ts">
  import TreeView from './TreeView.svelte';

  let { data, label = '', depth = 0, rootCollapsed = false } = $props<{
    data: any;
    label?: string;
    depth?: number;
    rootCollapsed?: boolean;
  }>();

  let collapsed = $state(false);

  function getType(val: any): string {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  function toggle() {
    collapsed = !collapsed;
  }

  function getPreview(val: any): string {
    if (Array.isArray(val)) return `[${val.length} items]`;
    if (typeof val === 'object' && val !== null) return `{${Object.keys(val).length} keys}`;
    return '';
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

  $effect(() => {
    collapsed = rootCollapsed && depth > 1;
  });
</script>

<div class="tree-node" style="--depth: {depth}">
  {#if isExpandable}
    <button
      type="button"
      class="tree-row tree-row-button"
      onclick={toggle}
      aria-expanded={!collapsed}
    >
      <span class="tree-arrow" class:collapsed>{collapsed ? '▶' : '▼'}</span>

      {#if label}
        <span class="tree-key">{label}</span>
        <span class="tree-colon">:</span>
      {/if}

      <span class="tree-type-badge {type}">{type === 'array' ? 'Array' : 'Object'}</span>
      {#if collapsed}
        <span class="tree-preview">{getPreview(data)}</span>
      {/if}
    </button>
  {:else}
    <div class="tree-row">
      <span class="tree-spacer"></span>

      {#if label}
        <span class="tree-key">{label}</span>
        <span class="tree-colon">:</span>
      {/if}

      {#if type === 'string'}
        <span class="tree-value string">"{data}"</span>
      {:else if type === 'number'}
        <span class="tree-value number">{data}</span>
      {:else if type === 'boolean'}
        <span class="tree-value boolean">{String(data)}</span>
      {:else if type === 'null'}
        <span class="tree-value null">null</span>
      {:else}
        <span class="tree-value">{String(data)}</span>
      {/if}
    </div>
  {/if}

  {#if isExpandable && !collapsed}
    <div class="tree-children">
      {#each entries as entry (entry.key)}
        <TreeView data={entry.value} label={entry.key} depth={depth + 1} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .tree-node {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 1.7;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 1px 0;
    padding-left: calc(var(--depth) * 20px);
    border-radius: 4px;
    transition: background 0.1s ease;
  }

  .tree-row-button {
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
    font: inherit;
  }

  .tree-row-button:hover,
  .tree-row-button:focus-visible {
    background: var(--tree-hover, rgba(255,255,255,0.03));
    outline: none;
  }

  .tree-row.expandable,
  .tree-row-button {
    cursor: pointer;
  }

  .tree-row:hover {
    background: var(--tree-hover, rgba(255,255,255,0.03));
  }

  .tree-arrow {
    width: 14px;
    font-size: 9px;
    color: var(--text-muted, #52525b);
    flex-shrink: 0;
    transition: transform 0.15s ease;
    user-select: none;
  }

  .tree-spacer {
    width: 14px;
    flex-shrink: 0;
  }

  .tree-key {
    color: #818cf8;
    font-weight: 500;
  }

  .tree-colon {
    color: var(--text-muted, #52525b);
    margin: 0 1px;
  }

  .tree-type-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    user-select: none;
  }

  .tree-type-badge.object {
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
  }

  .tree-type-badge.array {
    background: rgba(52, 211, 153, 0.12);
    color: #34d399;
  }

  .tree-preview {
    color: var(--text-muted, #52525b);
    font-size: 12px;
    font-style: italic;
  }

  .tree-value.string { color: #98c379; }
  .tree-value.number { color: #d19a66; }
  .tree-value.boolean { color: #d19a66; }
  .tree-value.null { color: #e06c75; font-style: italic; }

  .tree-children {
    border-left: 1px solid rgba(63, 63, 70, 0.5);
    margin-left: calc(var(--depth) * 20px + 7px);
  }
</style>

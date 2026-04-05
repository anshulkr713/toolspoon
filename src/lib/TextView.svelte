<script lang="ts">
  let { text = '' } = $props<{ text: string }>();

  const lines = $derived(text ? text.split('\n') : ['']);
</script>

<div class="text-view">
  <div class="text-gutter">
    {#each lines as _, i}
      <span class="line-num">{i + 1}</span>
    {/each}
  </div>
  <pre class="text-content">{text}</pre>
</div>

<style>
  .text-view {
    display: flex;
    height: 100%;
    overflow: auto;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 1.6;
  }

  .text-gutter {
    display: flex;
    flex-direction: column;
    padding: 20px 16px;
    text-align: right;
    user-select: none;
    flex-shrink: 0;
    border-right: 1px solid rgba(63, 63, 70, 0.3);
  }

  .line-num {
    color: var(--text-muted, #52525b);
    font-size: 12px;
    height: calc(13px * 1.6);
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .text-content {
    flex: 1;
    margin: 0;
    padding: 20px 16px;
    color: var(--text-primary, #d4d4d8);
    white-space: pre;
    overflow-x: auto;
    tab-size: 2;
  }
</style>

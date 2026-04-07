<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ComponentType } from 'svelte';
  import { set, get } from 'idb-keyval';
  import { isDiffReport, type JsonValue } from './lib/diffJson';
  import { buildTableModel } from './lib/tableData';
  import { settings } from './stores/settings';

  type TargetFormat = 'YAML' | 'XML' | 'CSV';
  type Action = 'FORMAT' | 'VISUALIZE' | 'TABLE' | 'DIFF' | 'REPAIR' | 'SCHEMA' | 'MINIFY' | 'VALIDATE' | 'CONVERT';
  type ViewMode = 'code' | 'diff' | 'tree' | 'form' | 'text' | 'view' | 'graph' | 'table';
  type ErrorSource = 'primary' | 'compare';
  type UploadTarget = 'primary' | 'compare';

  const toolTabs: { action: Action; label: string; targetFormat?: TargetFormat }[] = [
    { action: 'FORMAT', label: 'Format' },
    { action: 'VISUALIZE', label: 'Visualize' },
    { action: 'TABLE', label: 'Table' },
    { action: 'SCHEMA', label: 'Schema' },
    { action: 'DIFF', label: 'Diff' },
    { action: 'REPAIR', label: 'Repair' },
    { action: 'VALIDATE', label: 'Validate' },
    { action: 'MINIFY', label: 'Minify' },
    { action: 'CONVERT', label: 'Convert' },
  ];

  function getToolName(action: Action, targetFormat: TargetFormat) {
    if (action === 'CONVERT') return `JSON to ${targetFormat}`;
    if (action === 'VISUALIZE') return 'JSON Visualizer';
    if (action === 'TABLE') return 'JSON to Table';
    if (action === 'DIFF') return 'JSON Diff';
    if (action === 'SCHEMA') return 'Schema Generator';
    if (action === 'MINIFY') return 'JSON Minifier';
    if (action === 'VALIDATE') return 'JSON Validator';
    if (action === 'REPAIR') return 'JSON Repair';
    return 'JSON Formatter';
  }

  function humanizeAction(action: Action, targetFormat: TargetFormat) {
    if (action === 'CONVERT') return `Convert → ${targetFormat}`;
    if (action === 'VISUALIZE') return 'Visualize';
    if (action === 'TABLE') return 'Table';
    if (action === 'DIFF') return 'Diff';
    if (action === 'SCHEMA') return 'Schema';
    if (action === 'MINIFY') return 'Minify';
    if (action === 'VALIDATE') return 'Validate';
    if (action === 'REPAIR') return 'Repair';
    return 'Format';
  }

  function defaultViewModeForAction(action: Action) {
    if (action === 'DIFF') return 'diff';
    if (action === 'VISUALIZE') return 'view';
    if (action === 'TABLE') return 'table';
    return 'code';
  }

  function humanizeViewMode(mode: ViewMode) {
    if (mode === 'view') return 'Visual';
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }

  function getInputPlaceholder(action: Action) {
    if (action === 'SCHEMA') return 'Paste a representative JSON sample to generate a schema...';
    if (action === 'VISUALIZE') return 'Paste JSON to open a visual workspace...';
    if (action === 'TABLE') return 'Paste JSON records to flatten them into a searchable table...';
    return 'Paste your JSON here...';
  }

  $effect(() => {
    if ($settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  });

  let { siteMode = 'main' } = $props<{ siteMode?: string }>();

  let inputCode = $state('');
  let compareCode = $state('');
  let outputCode = $state('');
  let jsonError = $state<{ message: string; line: number; source: ErrorSource } | null>(null);
  
  let EditorComponent = $state<ComponentType>();

  let currentAction = $state<Action>(
    siteMode === 'table' ? 'TABLE' : (siteMode === 'visualizer' ? 'VISUALIZE' : 'FORMAT')
  );
  let currentSpace = $state<string | number>(2);
  let currentTargetFormat = $state<TargetFormat>('YAML');
  let fileInput = $state<HTMLInputElement>();
  let activeUploadTarget = $state<UploadTarget>('primary');
  let validationSuccess = $state(false);
  let isProcessing = $state(false);
  let showConvertMenu = $state(false);
  let showSettingsMenu = $state(false);
  let outputLabel = $state('Output');
  let fullscreenPanel = $state<'input' | 'output' | null>(null);
  let popoutMode = $state<'input' | 'output' | null>(null);

  let outputViewMode = $state<ViewMode>(defaultViewModeForAction(currentAction));
  let showViewMenu = $state(false);
  let usesStructuredOutput = $derived(
    outputViewMode === 'diff'
      || outputViewMode === 'tree'
      || outputViewMode === 'form'
      || outputViewMode === 'view'
      || outputViewMode === 'graph'
      || outputViewMode === 'table'
  );
  let activeActionLabel = $derived(humanizeAction(currentAction, currentTargetFormat));
  let activeToolName = $derived(getToolName(currentAction, currentTargetFormat));
  let diffErrorMessage = $derived.by(() => {
    if (!jsonError) return '';
    return jsonError.source === 'compare' ? `Updated JSON line ${jsonError.line}: ${jsonError.message}` : `Original JSON line ${jsonError.line}: ${jsonError.message}`;
  });
  let showDiffViewOption = $derived(currentAction === 'DIFF' || outputViewMode === 'diff');
  let showTableViewOption = $derived(currentAction === 'TABLE' || outputViewMode === 'table');
  let isTooLargeForDOM = $derived((outputCode || inputCode).length > 2_000_000 && outputViewMode !== 'tree' && outputViewMode !== 'table');
  
  let parsedJson = $derived.by(() => {
    const src = outputCode || inputCode;
    if (!src.trim()) return undefined;
    if (isTooLargeForDOM && usesStructuredOutput) return undefined;
    try {
      return JSON.parse(src);
    } catch {
      try {
        return JSON.parse(inputCode);
      } catch {
        return undefined;
      }
    }
  });
  let parsedDiffReport = $derived.by(() => {
    if (currentAction !== 'DIFF') return undefined;
    return isDiffReport(parsedJson) ? parsedJson : undefined;
  });
  let parsedTableModel = $derived.by(() => {
    if (currentAction !== 'TABLE' || parsedJson === undefined) return undefined;
    return buildTableModel(parsedJson as JsonValue);
  });

  let worker: Worker | undefined;
  let debounceTimer: ReturnType<typeof setTimeout>;
  let saveInputTimer: ReturnType<typeof setTimeout>;
  let saveCompareTimer: ReturnType<typeof setTimeout>;
  let autoSavedIndicator = $state(false);
  let isLoaded = false;

  type DeferredPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  };

  let deferredPrompt: DeferredPromptEvent | null = null;
  let showInstallButton = $state(false);
  let isOffline = $state(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  function handleOnline() { isOffline = false; }
  function handleOffline() { isOffline = true; }

  function handleBeforeInstallPrompt(event: Event) {
    const installEvent = event as DeferredPromptEvent;
    installEvent.preventDefault();
    deferredPrompt = installEvent;
    showInstallButton = true;
  }

  function handleAppInstalled() {
    deferredPrompt = null;
    showInstallButton = false;
  }

  function handleWindowClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.convert-menu-container')) showConvertMenu = false;
    if (!target.closest('.view-menu-container')) showViewMenu = false;
    if (!target.closest('.settings-menu-container')) showSettingsMenu = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && fullscreenPanel) {
      fullscreenPanel = null;
    }
  }

  function toggleFullscreen(panel: 'input' | 'output') {
    fullscreenPanel = fullscreenPanel === panel ? null : panel;
  }

  function popoutPanel(panel: 'input' | 'output') {
    const jsonData = panel === 'input' ? inputCode : (outputCode || inputCode);
    sessionStorage.setItem('popout_json_data', jsonData);
    sessionStorage.setItem('popout_output_data', outputCode);
    sessionStorage.setItem('popout_view_mode', outputViewMode);
    const url = new URL(window.location.href);
    url.searchParams.set('popout', panel);
    if (panel === 'output') {
      url.searchParams.set('view', outputViewMode);
    }
    window.open(url.toString(), '_blank');
  }

  onMount(async () => {
    // Check for popout mode via URL params
    const urlParams = new URLSearchParams(window.location.search);
    const popoutParam = urlParams.get('popout');
    if (popoutParam === 'input' || popoutParam === 'output') {
      popoutMode = popoutParam;
      const savedJson = sessionStorage.getItem('popout_json_data') || '';
      const savedOutput = sessionStorage.getItem('popout_output_data') || '';
      const savedView = sessionStorage.getItem('popout_view_mode') as ViewMode || 'code';
      inputCode = savedJson;
      outputCode = savedOutput;
      if (popoutParam === 'output') {
        outputViewMode = urlParams.get('view') as ViewMode || savedView;
      }
      isLoaded = true;
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleKeydown);

    import('./lib/Editor.svelte').then(module => {
      EditorComponent = module.default as ComponentType;
    }).catch(console.error);

    worker = new Worker(new URL('./lib/jsonWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ type: string; result?: string; message?: string; line?: number; source?: ErrorSource }>) => {
      const { type, result = '', message = 'Unknown error', line = 1, source = 'primary' } = e.data;
      if (type === 'SUCCESS') {
        isProcessing = false;
        outputCode = result;
        validationSuccess = currentAction === 'VALIDATE';
        if (validationSuccess) {
          setTimeout(() => {
            validationSuccess = false;
          }, 3000);
        }
        jsonError = null;
      } else if (type === 'ERROR') {
        isProcessing = false;
        validationSuccess = false;
        jsonError = { message, line, source };
      }
    };

    if (popoutMode) return;

    try {
      const [savedData, savedCompareData] = await Promise.all([
        get<string>('current_session_data'),
        get<string>('diff_compare_session_data'),
      ]);

      if (savedData) {
        inputCode = savedData;
      }

      if (savedCompareData) {
        compareCode = savedCompareData;
      }

      if (savedData) {
        processJson(savedData, currentAction, currentSpace, currentTargetFormat, savedCompareData ?? '');
      }
    } catch (error) {
      console.error('Failed to load from IndexedDB', error);
    } finally {
      isLoaded = true;
    }
  });

  onDestroy(() => {
    worker?.terminate();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', handleAppInstalled);
    window.removeEventListener('click', handleWindowClick);
    window.removeEventListener('keydown', handleKeydown);
  });

  function processJson(
    code: string,
    action = currentAction,
    space = currentSpace,
    targetFormat = currentTargetFormat,
    compare = compareCode
  ) {
    if (!code.trim()) {
      isProcessing = false;
      outputCode = '';
      jsonError = null;
      validationSuccess = false;
      return;
    }

    if (action === 'DIFF' && !compare.trim()) {
      isProcessing = false;
      outputCode = '';
      jsonError = null;
      validationSuccess = false;
      return;
    }

    isProcessing = true;
    worker?.postMessage({ code, compareCode: compare, action, indentSpace: space, targetFormat });
  }

  $effect(() => {
    const code = inputCode;
    const compare = compareCode;
    const action = currentAction;
    const space = currentSpace;
    const format = currentTargetFormat;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processJson(code, action, space, format, compare);
    }, 300);
  });

  $effect(() => {
    if (currentAction === 'CONVERT') {
      outputLabel = currentTargetFormat;
    } else if (currentAction === 'TABLE') {
      outputLabel = 'Table Export';
    } else if (currentAction === 'VISUALIZE') {
      outputLabel = 'Visual Output';
    } else if (currentAction === 'DIFF') {
      outputLabel = 'Diff Report';
    } else if (currentAction === 'SCHEMA') {
      outputLabel = 'JSON Schema';
    } else if (currentAction === 'MINIFY') {
      outputLabel = 'Minified';
    } else if (currentAction === 'REPAIR') {
      outputLabel = 'Repaired JSON';
    } else if (currentAction === 'VALIDATE') {
      outputLabel = 'Validated JSON';
    } else {
      outputLabel = 'Output';
    }
  });

  function handleUpload(target: UploadTarget = 'primary') {
    activeUploadTarget = target;
    fileInput?.click();
  }

  function onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result as string;
      if (activeUploadTarget === 'compare') {
        compareCode = content;
      } else {
        inputCode = content;
      }
      activeUploadTarget = 'primary';
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }

  function handleDownload() {
    const contentToDownload = outputCode;
    if (!contentToDownload) return;

    let fileName = 'output.json';
    if (currentAction === 'CONVERT') {
      fileName = `output.${currentTargetFormat.toLowerCase()}`;
    } else if (currentAction === 'TABLE') {
      fileName = 'json-table.csv';
    } else if (currentAction === 'DIFF') {
      fileName = 'json-diff-report.json';
    } else if (currentAction === 'SCHEMA') {
      fileName = 'json-schema.json';
    }

    const blob = new Blob([contentToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyOutput() {
    if (!outputCode) return;
    navigator.clipboard.writeText(outputCode);
  }

  function handleClearAll() {
    inputCode = '';
    compareCode = '';
    outputCode = '';
    jsonError = null;
    validationSuccess = false;
    isProcessing = false;
  }

  function setAction(action: Action) {
    currentAction = action;
    validationSuccess = false;
    isProcessing = false;
    showConvertMenu = false;
    showViewMenu = false;
    jsonError = null;
    outputViewMode = defaultViewModeForAction(action);
  }

  function handleConvert(format: TargetFormat) {
    currentTargetFormat = format;
    currentAction = 'CONVERT';
    validationSuccess = false;
    isProcessing = false;
    showConvertMenu = false;
    showViewMenu = false;
    jsonError = null;
    outputViewMode = 'code';
  }

  function swapDiffInputs() {
    const currentPrimary = inputCode;
    inputCode = compareCode;
    compareCode = currentPrimary;
  }

  $effect(() => {
    const code = inputCode;
    if (!isLoaded) return;
    clearTimeout(saveInputTimer);
    saveInputTimer = setTimeout(() => {
      set('current_session_data', code)
        .then(() => {
          autoSavedIndicator = true;
          setTimeout(() => {
            autoSavedIndicator = false;
          }, 2000);
        })
        .catch(console.error);
    }, 2000);
  });

  $effect(() => {
    const code = compareCode;
    if (!isLoaded) return;
    clearTimeout(saveCompareTimer);
    saveCompareTimer = setTimeout(() => {
      set('diff_compare_session_data', code).catch(console.error);
    }, 2000);
  });

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showInstallButton = false;
    }
    deferredPrompt = null;
  }

  let inputStats = $derived({
    chars: inputCode.length,
    lines: inputCode ? inputCode.split('\n').length : 0,
  });
  let compareStats = $derived({
    chars: compareCode.length,
    lines: compareCode ? compareCode.split('\n').length : 0,
  });
</script>

{#if popoutMode}
<div class="app-root popout-mode">
  <div class="popout-header">
    <div class="header-brand">
      <div class="logo-mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 17l9.2-9.2"></path>
          <path d="M11 6c1.66-1.66 4.34-1.66 6 0s1.66 4.34 0 6l-7 7a2.12 2.12 0 0 1-3 0v0a2.12 2.12 0 0 1 0-3L11 6Z"></path>
        </svg>
      </div>
      <span class="app-title">ToolSpoon</span>
      <span class="tool-divider">/</span>
      <span class="tool-name">{popoutMode === 'input' ? 'Input View' : humanizeViewMode(outputViewMode) + ' View'}</span>
    </div>
    {#if popoutMode === 'output'}
      <div class="panel-meta">
        <div class="view-menu-container">
          <button
            class="view-mode-btn"
            onclick={(event) => { event.stopPropagation(); showViewMenu = !showViewMenu; }}
            title="Switch output view mode"
          >
            <span class="view-mode-label">{humanizeViewMode(outputViewMode)}</span>
            <svg class="chevron-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          {#if showViewMenu}
            <div class="view-dropdown">
              <button class="dropdown-item {outputViewMode === 'code' ? 'selected' : ''}" onclick={() => { outputViewMode = 'code'; showViewMenu = false; }}>Code</button>
              <button class="dropdown-item {outputViewMode === 'tree' ? 'selected' : ''}" onclick={() => { outputViewMode = 'tree'; showViewMenu = false; }}>Tree</button>
              <button class="dropdown-item {outputViewMode === 'form' ? 'selected' : ''}" onclick={() => { outputViewMode = 'form'; showViewMenu = false; }}>Form</button>
              <button class="dropdown-item {outputViewMode === 'text' ? 'selected' : ''}" onclick={() => { outputViewMode = 'text'; showViewMenu = false; }}>Text</button>
              <button class="dropdown-item {outputViewMode === 'view' ? 'selected' : ''}" onclick={() => { outputViewMode = 'view'; showViewMenu = false; }}>Visual</button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item {outputViewMode === 'graph' ? 'selected' : ''}" onclick={() => { outputViewMode = 'graph'; showViewMenu = false; }}>Graph</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <div class="popout-body">
    {#if popoutMode === 'input'}
      {#if EditorComponent}<EditorComponent bind:value={inputCode} placeholder="JSON" />{/if}
    {:else}
      {#if outputViewMode === 'code'}
        {#if EditorComponent}<EditorComponent bind:value={outputCode} readonly={true} />{/if}
      {:else if outputViewMode === 'tree' && parsedJson !== undefined}
        {#await import('./lib/TreeView.svelte') then { default: TreeView }}
          <div class="view-scroll"><TreeView data={parsedJson} /></div>
        {/await}
      {:else if outputViewMode === 'form' && parsedJson !== undefined}
        {#await import('./lib/FormView.svelte') then { default: FormView }}
          <div class="view-scroll"><FormView data={parsedJson} /></div>
        {/await}
      {:else if outputViewMode === 'text'}
        {#await import('./lib/TextView.svelte') then { default: TextView }}
          <TextView text={outputCode} />
        {/await}
      {:else if outputViewMode === 'view' && parsedJson !== undefined}
        {#await import('./lib/CardView.svelte') then { default: CardView }}
          <div class="view-scroll"><CardView data={parsedJson} /></div>
        {/await}
      {:else if outputViewMode === 'table' && parsedJson !== undefined}
        {#await import('./lib/TableView.svelte') then { default: TableView }}
          <TableView data={parsedJson} />
        {/await}
      {:else if outputViewMode === 'graph' && parsedJson !== undefined}
        {#await import('./lib/GraphView.svelte') then { default: GraphView }}
          <GraphView data={parsedJson} />
        {/await}
      {:else if isTooLargeForDOM && usesStructuredOutput}
        <div class="view-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-tertiary); margin-bottom: 12px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span style="font-weight: 500; font-size: 15px; color: var(--text-primary); display: block;">Dataset Too Large</span>
          <span style="margin-top: 8px; color: var(--text-secondary); max-width: 400px; line-height: 1.5; display: block;">This file is {((outputCode || inputCode).length / 1024 / 1024).toFixed(1)} MB. Visualizing datasets larger than 2MB may crash your browser. Please use the Code view or reduce the file size.</span>
        </div>
      {:else if isTooLargeForDOM && usesStructuredOutput}
        <div class="view-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-tertiary); margin-bottom: 12px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span style="font-weight: 500; font-size: 15px; color: var(--text-primary); display: block;">Dataset Too Large</span>
          <span style="margin-top: 8px; color: var(--text-secondary); max-width: 400px; line-height: 1.5; display: block;">This file is {((outputCode || inputCode).length / 1024 / 1024).toFixed(1)} MB. Visualizing datasets larger than 2MB may crash your browser. Please use the Code view or reduce the file size.</span>
        </div>
      {:else if parsedJson === undefined && (outputCode || inputCode)}
        <div class="view-empty"><span>Invalid JSON — cannot render this view</span></div>
      {:else}
        <div class="view-empty"><span>No data to display</span></div>
      {/if}
    {/if}
  </div>
</div>
{:else}
<div class="app-root">
  <header class="app-header">
    <div class="header-brand">
      <div class="logo-mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 17l9.2-9.2"></path>
          <path d="M11 6c1.66-1.66 4.34-1.66 6 0s1.66 4.34 0 6l-7 7a2.12 2.12 0 0 1-3 0v0a2.12 2.12 0 0 1 0-3L11 6Z"></path>
        </svg>
      </div>
      <span class="app-title">ToolSpoon</span>
      <span class="tool-divider">/</span>
      <span class="tool-name">{activeToolName}</span>
      {#if isOffline}
        <span class="offline-badge">Offline</span>
      {/if}
    </div>

    <nav class="header-nav" aria-label="Tools">
      {#each toolTabs as tab}
        {#if tab.action === 'CONVERT'}
          <div class="convert-menu-container">
            <button
              class="nav-tab {currentAction === 'CONVERT' ? 'active' : ''}"
              type="button"
              onclick={(event) => { event.stopPropagation(); showConvertMenu = !showConvertMenu; }}
            >
              Convert
              <svg class="chevron-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            {#if showConvertMenu}
              <div class="convert-dropdown">
                <button class="dropdown-item {currentTargetFormat === 'YAML' && currentAction === 'CONVERT' ? 'selected' : ''}" onclick={() => handleConvert('YAML')}>
                  <span class="format-tag yaml">YML</span> YAML
                </button>
                <button class="dropdown-item {currentTargetFormat === 'XML' && currentAction === 'CONVERT' ? 'selected' : ''}" onclick={() => handleConvert('XML')}>
                  <span class="format-tag xml">XML</span> XML
                </button>
                <button class="dropdown-item {currentTargetFormat === 'CSV' && currentAction === 'CONVERT' ? 'selected' : ''}" onclick={() => handleConvert('CSV')}>
                  <span class="format-tag csv">CSV</span> CSV
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <button
            class="nav-tab {currentAction === tab.action ? 'active' : ''}"
            type="button"
            onclick={() => setAction(tab.action)}
          >{tab.label}</button>
        {/if}
      {/each}
    </nav>

    <div class="header-right">
      {#if showInstallButton}
        <button class="header-icon-btn" title="Install App" onclick={handleInstall}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      {/if}
      <div class="settings-menu-container">
        <button class="header-icon-btn" title="Settings" onclick={(event) => { event.stopPropagation(); showSettingsMenu = !showSettingsMenu; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path>
          </svg>
        </button>
        {#if showSettingsMenu}
          <div class="settings-dropdown">
            <div class="settings-group">
              <span class="settings-label">Theme</span>
              <div class="settings-toggle-row">
                <button class="settings-opt {$settings.theme === 'dark' ? 'active' : ''}" onclick={() => settings.update(s => ({ ...s, theme: 'dark' }))}>Dark</button>
                <button class="settings-opt {$settings.theme === 'light' ? 'active' : ''}" onclick={() => settings.update(s => ({ ...s, theme: 'light' }))}>Light</button>
              </div>
            </div>
            <div class="settings-group">
              <span class="settings-label">Font</span>
              <div class="settings-toggle-row">
                <button class="settings-opt {$settings.fontFamily.includes('JetBrains') ? 'active' : ''}" onclick={() => settings.update(s => ({ ...s, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }))}>JetBrains</button>
                <button class="settings-opt {$settings.fontFamily.includes('Fira') && !$settings.fontFamily.includes('JetBrains') ? 'active' : ''}" onclick={() => settings.update(s => ({ ...s, fontFamily: "'Fira Code', monospace" }))}>Fira Code</button>
              </div>
            </div>
            <div class="settings-group">
              <span class="settings-label">Word Wrap</span>
              <div class="settings-toggle-row">
                <button class="settings-opt {!$settings.wordWrap ? 'active' : ''}" onclick={() => settings.update(s => ({ ...s, wordWrap: false }))}>Off</button>
                <button class="settings-opt {$settings.wordWrap ? 'active' : ''}" onclick={() => settings.update(s => ({ ...s, wordWrap: true }))}>On</button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div class="workspace-shell">
    <div class="toolbar">
      <input type="file" bind:this={fileInput} onchange={onFileSelected} class="hidden-input" accept=".json,application/json,text/plain" />

      <div class="toolbar-group">
        <button class="tool-btn" onclick={() => handleUpload('primary')} title={currentAction === 'DIFF' ? 'Open original JSON file' : 'Open file'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="12" y2="12"></line>
            <line x1="15" y1="15" x2="12" y2="12"></line>
          </svg>
          <span class="btn-label">Open</span>
        </button>
        {#if currentAction === 'DIFF'}
          <button class="tool-btn" onclick={swapDiffInputs} title="Swap original and updated JSON">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 014-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 01-4 4H3"></path>
            </svg>
            <span class="btn-label">Swap</span>
          </button>
        {/if}
        <button class="tool-btn" onclick={handleDownload} title="Download output">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span class="btn-label">Save</span>
        </button>
        <button class="tool-btn" onclick={handleCopyOutput} title="Copy output to clipboard">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
          </svg>
          <span class="btn-label">Copy</span>
        </button>
        <button class="tool-btn" onclick={handleClearAll} title="Clear all">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
          </svg>
          <span class="btn-label">Clear</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <span class="toolbar-label">Indent</span>
        <div class="indent-selector">
          <button class="indent-btn {currentSpace === 2 ? 'active' : ''}" onclick={() => currentSpace = 2}>2</button>
          <button class="indent-btn {currentSpace === 3 ? 'active' : ''}" onclick={() => currentSpace = 3}>3</button>
          <button class="indent-btn {currentSpace === 4 ? 'active' : ''}" onclick={() => currentSpace = 4}>4</button>
          <button class="indent-btn {currentSpace === 'Tab' ? 'active' : ''}" onclick={() => currentSpace = 'Tab'}>⇥</button>
        </div>
      </div>
    </div>

    <main class="editor-area {currentAction === 'DIFF' ? 'diff-layout' : ''} {fullscreenPanel === 'input' ? 'fullscreen-input' : ''} {fullscreenPanel === 'output' ? 'fullscreen-output' : ''}">
      <div class="panel panel-primary {jsonError?.source === 'primary' ? 'panel-error' : ''}">
        <div class="panel-header">
          <span class="panel-label {jsonError?.source === 'primary' ? 'error-label' : ''}">{currentAction === 'DIFF' ? 'Original JSON' : 'JSON'}</span>
          <div class="panel-meta">
            {#if autoSavedIndicator && currentAction !== 'DIFF'}
              <span class="auto-saved-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Saved
              </span>
            {/if}
            {#if currentAction === 'DIFF'}
              <button class="panel-action-btn" type="button" onclick={() => handleUpload('primary')}>Load file</button>
            {/if}
            <button class="fullscreen-btn" type="button" title={fullscreenPanel === 'input' ? 'Exit fullscreen (Esc)' : 'Fullscreen'} onclick={() => toggleFullscreen('input')}>
              {#if fullscreenPanel === 'input'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              {/if}
            </button>
            <button class="fullscreen-btn" type="button" title="Open in new tab" onclick={() => popoutPanel('input')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </button>
          </div>
        </div>
        <div class="panel-editor">
          {#if EditorComponent}<EditorComponent bind:value={inputCode} placeholder={currentAction === 'DIFF' ? 'Paste the original JSON here...' : getInputPlaceholder(currentAction)} />{/if}
        </div>
      </div>

      <div class="split-divider">
        <div class="divider-handle">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>

      {#if currentAction === 'DIFF'}
        <div class="panel panel-compare {jsonError?.source === 'compare' ? 'panel-error' : ''}">
          <div class="panel-header">
            <span class="panel-label {jsonError?.source === 'compare' ? 'error-label' : ''}">Updated JSON</span>
            <div class="panel-meta">
              <button class="panel-action-btn" type="button" onclick={() => handleUpload('compare')}>Load file</button>
            </div>
          </div>
          <div class="panel-editor">
            {#if EditorComponent}<EditorComponent bind:value={compareCode} placeholder="Paste the updated JSON here..." />{/if}
          </div>
        </div>

        <div class="split-divider diff-only">
          <div class="divider-handle">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        </div>
      {/if}

      <div class="panel panel-output {jsonError ? 'panel-error' : ''}">
        <div class="panel-header">
          <span class="panel-label {jsonError ? 'error-label' : ''}">{outputLabel}</span>
          <div class="panel-meta">
            {#if validationSuccess}
              <span class="valid-badge">✓ Valid JSON</span>
            {/if}
            {#if isProcessing}
              <span class="processing-badge">Processing...</span>
            {/if}

            <div class="view-menu-container">
              <button
                class="view-mode-btn"
                onclick={(event) => { event.stopPropagation(); showViewMenu = !showViewMenu; }}
                title="Switch output view mode"
              >
                {#if outputViewMode === 'code'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                {:else if outputViewMode === 'diff'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H5a2 2 0 00-2 2v5"></path><path d="M14 21h5a2 2 0 002-2v-5"></path><path d="M21 10V5a2 2 0 00-2-2h-5"></path><path d="M3 14v5a2 2 0 002 2h5"></path><line x1="8" y1="8" x2="16" y2="16"></line><line x1="16" y1="8" x2="8" y2="16"></line></svg>
                {:else if outputViewMode === 'tree'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                {:else if outputViewMode === 'form'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="12" y1="3" x2="12" y2="21"></line></svg>
                {:else if outputViewMode === 'text'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>
                {:else if outputViewMode === 'view'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                {:else if outputViewMode === 'table'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line><line x1="15" y1="21" x2="15" y2="9"></line></svg>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><circle cx="5" cy="6" r="2"></circle><circle cx="19" cy="6" r="2"></circle><line x1="9.5" y1="10.5" x2="6.5" y2="7.5"></line><line x1="14.5" y1="10.5" x2="17.5" y2="7.5"></line></svg>
                {/if}
                <span class="view-mode-label">{humanizeViewMode(outputViewMode)}</span>
                <svg class="chevron-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
              {#if showViewMenu}
                <div class="view-dropdown">
                  {#if showDiffViewOption}
                    <button class="dropdown-item {outputViewMode === 'diff' ? 'selected' : ''}" onclick={() => { outputViewMode = 'diff'; showViewMenu = false; }}>Diff</button>
                  {/if}
                  <button class="dropdown-item {outputViewMode === 'code' ? 'selected' : ''}" onclick={() => { outputViewMode = 'code'; showViewMenu = false; }}>Code</button>
                  <button class="dropdown-item {outputViewMode === 'tree' ? 'selected' : ''}" onclick={() => { outputViewMode = 'tree'; showViewMenu = false; }}>Tree</button>
                  <button class="dropdown-item {outputViewMode === 'form' ? 'selected' : ''}" onclick={() => { outputViewMode = 'form'; showViewMenu = false; }}>Form</button>
                  <button class="dropdown-item {outputViewMode === 'text' ? 'selected' : ''}" onclick={() => { outputViewMode = 'text'; showViewMenu = false; }}>Text</button>
                  <button class="dropdown-item {outputViewMode === 'view' ? 'selected' : ''}" onclick={() => { outputViewMode = 'view'; showViewMenu = false; }}>Visual</button>
                  <button class="dropdown-item {outputViewMode === 'table' || currentAction === 'TABLE' ? 'selected' : ''}" onclick={() => { setAction('TABLE'); showViewMenu = false; }}>Table</button>
                  <div class="dropdown-divider"></div>
                  <button class="dropdown-item {outputViewMode === 'graph' ? 'selected' : ''}" onclick={() => { outputViewMode = 'graph'; showViewMenu = false; }}>Graph</button>
                </div>
              {/if}
            </div>
            <button class="fullscreen-btn" type="button" title={fullscreenPanel === 'output' ? 'Exit fullscreen (Esc)' : 'Fullscreen'} onclick={() => toggleFullscreen('output')}>
              {#if fullscreenPanel === 'output'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              {/if}
            </button>
            <button class="fullscreen-btn" type="button" title="Open in new tab" onclick={() => popoutPanel('output')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </button>
          </div>
        </div>
        {#if jsonError}
          <div class="error-strip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span>{currentAction === 'DIFF' ? diffErrorMessage : `Line ${jsonError.line}: ${jsonError.message}`}</span>
          </div>
        {/if}
        <div class="panel-editor">
          {#if isTooLargeForDOM && usesStructuredOutput}
            <div class="view-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-tertiary); margin-bottom: 12px;">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span style="font-weight: 500; font-size: 15px; color: var(--text-primary); display: block;">Dataset Too Large</span>
              <span style="margin-top: 8px; color: var(--text-secondary); max-width: 400px; line-height: 1.5; display: block;">This file is {((outputCode || inputCode).length / 1024 / 1024).toFixed(1)} MB. Visualizing datasets larger than 2MB may crash your browser. Please use the Code view or reduce the file size.</span>
            </div>
          {:else if outputViewMode === 'diff' && parsedDiffReport}
            {#await import('./lib/DiffView.svelte') then { default: DiffView }}
              <DiffView report={parsedDiffReport} />
            {/await}
          {:else if outputViewMode === 'code'}
            {#if EditorComponent}<EditorComponent bind:value={outputCode} readonly={true} />{/if}
          {:else if outputViewMode === 'tree' && parsedJson !== undefined}
            {#await import('./lib/TreeView.svelte') then { default: TreeView }}
              <div class="view-scroll"><TreeView data={parsedJson} /></div>
            {/await}
          {:else if outputViewMode === 'form' && parsedJson !== undefined}
            {#await import('./lib/FormView.svelte') then { default: FormView }}
              <div class="view-scroll"><FormView data={parsedJson} /></div>
            {/await}
          {:else if outputViewMode === 'text'}
            {#await import('./lib/TextView.svelte') then { default: TextView }}
              <TextView text={outputCode} />
            {/await}
          {:else if outputViewMode === 'view' && parsedJson !== undefined}
            {#await import('./lib/CardView.svelte') then { default: CardView }}
              <div class="view-scroll"><CardView data={parsedJson} /></div>
            {/await}
          {:else if outputViewMode === 'table' && parsedJson !== undefined}
            {#await import('./lib/TableView.svelte') then { default: TableView }}
              <TableView data={parsedJson} />
            {/await}
          {:else if outputViewMode === 'graph' && parsedJson !== undefined}
            {#await import('./lib/GraphView.svelte') then { default: GraphView }}
              <GraphView data={parsedJson} />
            {/await}
          {:else if usesStructuredOutput && parsedJson === undefined && inputCode.trim()}
            <div class="view-empty">
              <span>Invalid JSON — fix errors or run Repair to use this view</span>
            </div>
          {:else if usesStructuredOutput}
            <div class="view-empty">
              <span>{currentAction === 'DIFF' ? 'Add both JSON documents to preview the diff report.' : 'Paste JSON to preview'}</span>
            </div>
          {/if}
        </div>
      </div>
    </main>

    <footer class="status-bar">
      <div class="status-left">
        {#if currentAction === 'DIFF'}
          <span class="status-item">Original: {inputStats.lines} lines · {inputStats.chars.toLocaleString()} chars</span>
          <span class="status-dot"></span>
          <span class="status-item">Updated: {compareStats.lines} lines · {compareStats.chars.toLocaleString()} chars</span>
          {#if parsedDiffReport}
            <span class="status-dot"></span>
            <span class="status-item">{parsedDiffReport.summary.totalChanges} changes</span>
          {/if}
        {:else}
          <span class="status-item">{inputStats.lines} lines · {inputStats.chars.toLocaleString()} chars</span>
        {/if}
        <span class="status-dot"></span>
        <span class="status-item mode-label">{activeActionLabel}</span>
      </div>
      <div class="status-right">
        {#if currentAction === 'TABLE' && parsedTableModel}
          <span class="status-item">{parsedTableModel.rowCount.toLocaleString()} rows / {parsedTableModel.columnCount.toLocaleString()} cols</span>
          <span class="status-dot"></span>
        {/if}
        <span class="status-item">View: {humanizeViewMode(outputViewMode)}</span>
        <span class="status-dot"></span>
        <span class="status-item">Indent: {currentSpace === 'Tab' ? 'Tab' : currentSpace}</span>
        {#if isOffline}
          <span class="status-dot warning"></span>
          <span class="status-item">Offline</span>
        {/if}
      </div>
    </footer>
  </div>

  <article class="seo-content">
    <h2>What is ToolSpoon?</h2>
    <p>ToolSpoon is a fast, local-first JSON formatting and visualization suite built directly into your browser. Instead of uploading your sensitive data to an external server, ToolSpoon runs all scripts locally on your machine, ensuring complete privacy.</p>
    
    <h2>What can you do with it?</h2>
    <p>With ToolSpoon, you can instantly format, minify, or validate arbitrary JSON data. Additionally, our dedicated Graph, Table, and Tree views can help you visualize complex JSON objects and export them perfectly to CSV or YAML.</p>

    <h2>Frequently Asked Questions</h2>
    <div class="faq-item">
      <h3>Is ToolSpoon secure?</h3>
      <p>Yes. ToolSpoon never uploads your JSON data to any remote server or third party. All formatting, rendering, and parsing scripts are executed entirely within your device's browser memory.</p>
    </div>
    <div class="faq-item">
      <h3>What is a JSON Formatter?</h3>
      <p>A JSON formatter takes unindented or minified JSON (JavaScript Object Notation) strings and pretty-prints them by adding appropriate line breaks, spacing, and colored syntax to make the code human-readable.</p>
    </div>
    <div class="faq-item">
      <h3>Can I open very large JSON files?</h3>
      <p>ToolSpoon has optimization built specifically for scaling up. While traditional browser-based editors crash on big data, our tool is fine-tuned to parse files exceeding several megabytes. We recommend using the 'Code' tab for the largest of texts.</p>
    </div>
    <div class="faq-item">
      <h3>What integrations are supported?</h3>
      <p>You can natively convert any valid JSON code block into standard formats such as XML, YAML, and CSV tables with a single click. There are zero limits to your data extraction possibilities.</p>
    </div>
  </article>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col">
        <h4>Formatters</h4>
        <a href="/formatter" onclick={(e) => { e.preventDefault(); setAction('FORMAT'); }}>JSON Formatter</a>
        <a href="/minify" onclick={(e) => { e.preventDefault(); setAction('MINIFY'); }}>JSON Minify</a>
        <a href="/repair" onclick={(e) => { e.preventDefault(); setAction('REPAIR'); }}>JSON Repair</a>
        <a href="/validate" onclick={(e) => { e.preventDefault(); setAction('VALIDATE'); }}>JSON Validator</a>
      </div>
      <div class="footer-col">
        <h4>Visualizers</h4>
        <a href="/visualize" onclick={(e) => { e.preventDefault(); setAction('VISUALIZE'); }}>JSON Visualizer</a>
        <a href="/table" onclick={(e) => { e.preventDefault(); setAction('TABLE'); }}>JSON to Table</a>
        <a href="/schema" onclick={(e) => { e.preventDefault(); setAction('SCHEMA'); }}>Schema Generator</a>
        <a href="/diff" onclick={(e) => { e.preventDefault(); setAction('DIFF'); }}>JSON Diff</a>
      </div>
      <div class="footer-col">
        <h4>Converters</h4>
        <a href="/convert/yaml" onclick={(e) => { e.preventDefault(); handleConvert('YAML'); }}>JSON to YAML</a>
        <a href="/convert/xml" onclick={(e) => { e.preventDefault(); handleConvert('XML'); }}>JSON to XML</a>
        <a href="/convert/csv" onclick={(e) => { e.preventDefault(); handleConvert('CSV'); }}>JSON to CSV</a>
      </div>
      <div class="footer-col">
        <h4>Views</h4>
        <a href="#tree" onclick={(e) => { e.preventDefault(); outputViewMode = 'tree'; }}>Tree View</a>
        <a href="#form" onclick={(e) => { e.preventDefault(); outputViewMode = 'form'; }}>Form View</a>
        <a href="#graph" onclick={(e) => { e.preventDefault(); outputViewMode = 'graph'; }}>Graph View</a>
        <a href="#card" onclick={(e) => { e.preventDefault(); outputViewMode = 'view'; }}>Card View</a>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <a href="/about/">About Us</a>
        <a href="/contact/">Contact Us</a>
        <a href="/privacy/">Privacy Policy</a>
        <a href="/terms/">Terms of Service</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>ToolSpoon · Local-only · No data leaves your browser</span>
    </div>
  </footer>
</div>
{/if}

<style>
  :global(html) {
    scroll-behavior: smooth;
  }

  /* ── Popout mode ── */
  .popout-mode {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .popout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 16px;
    height: 40px;
    background: color-mix(in srgb, var(--header-bg) 92%, transparent);
    backdrop-filter: blur(18px);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .popout-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--accent-bg);
    color: var(--accent-text);
    border: 1px solid var(--accent-border);
  }

  .popout-body {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
    background: var(--panel-bg);
  }

  .app-root {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    width: 100%;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: var(--page-bg);
    color: var(--text-primary);
  }

  .hidden-input {
    display: none;
  }

  /* ── Header ── */
  .app-header {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 20px;
    height: 48px;
    background: color-mix(in srgb, var(--header-bg) 92%, transparent);
    backdrop-filter: blur(18px);
    border-bottom: 1px solid var(--border);
  }

  .header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .logo-mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--logo-bg);
    color: var(--logo-color);
    border: 1px solid var(--border);
    flex: none;
  }

  .app-title {
    font-size: 13px;
    font-weight: 800;
    font-family: 'Plus Jakarta Sans', sans-serif;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .tool-divider {
    color: var(--text-tertiary);
    font-size: 13px;
    font-weight: 500;
  }

  .tool-name {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }

  .offline-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    border-radius: 999px;
    padding: 3px 7px;
    background: #78350f20;
    color: #f59e0b;
    border: 1px solid #78350f40;
  }

  .header-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    flex: 1 1 auto;
    overflow: visible;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .header-nav::-webkit-scrollbar {
    display: none;
  }

  .nav-tab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .nav-tab:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  .nav-tab.active {
    background: var(--accent-bg);
    color: var(--accent-text);
    border-color: var(--accent-border);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .header-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .header-icon-btn:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  /* ── Settings dropdown ── */
  .settings-menu-container {
    position: relative;
  }

  .settings-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: var(--dropdown-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    z-index: 100;
    animation: dropdown-in 0.12s ease-out;
  }

  .settings-group {
    padding: 8px 6px;
  }

  .settings-group + .settings-group {
    border-top: 1px solid var(--border);
  }

  .settings-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    display: block;
    margin-bottom: 6px;
  }

  .settings-toggle-row {
    display: flex;
    gap: 4px;
  }

  .settings-opt {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--btn-bg);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
    text-align: center;
  }

  .settings-opt:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  .settings-opt.active {
    background: var(--accent-bg);
    color: var(--accent-text);
    border-color: var(--accent-border);
  }

  /* ── Workspace ── */
  .workspace-shell {
    height: calc(100dvh - 48px);
    display: flex;
    flex-direction: column;
    border-top: none;
    background: var(--surface-bg);
    overflow: hidden;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    background: var(--toolbar-bg);
    border-bottom: 1px solid var(--border);
    overflow: visible;
    z-index: 20;
    flex-wrap: wrap;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 6px;
    flex: none;
  }

  .toolbar-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-right: 6px;
    white-space: nowrap;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .tool-btn:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  .chevron-icon {
    opacity: 0.5;
    margin-left: -2px;
  }

  .indent-selector {
    display: flex;
    border-radius: 6px;
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .indent-btn {
    padding: 5px 10px;
    border: none;
    background: var(--btn-bg);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s ease;
    border-right: 1px solid var(--border);
  }

  .indent-btn:last-child {
    border-right: none;
  }

  .indent-btn:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  .indent-btn.active {
    background: var(--accent-bg);
    color: var(--accent-text);
  }

  /* ── Dropdowns ── */
  .convert-menu-container,
  .view-menu-container {
    position: relative;
  }

  .convert-dropdown,
  .view-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    min-width: 160px;
    background: var(--dropdown-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    z-index: 100;
    animation: dropdown-in 0.12s ease-out;
  }

  .convert-dropdown {
    left: 0;
  }

  .view-dropdown {
    right: 0;
    min-width: 150px;
  }

  @keyframes dropdown-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.1s ease;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  .dropdown-item.selected {
    background: var(--accent-bg);
    color: var(--accent-text);
  }

  .dropdown-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 2px;
  }

  .format-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 4px;
  }

  .format-tag.yaml { background: #7c3aed20; color: #a78bfa; }
  .format-tag.xml { background: #059b6520; color: #34d399; }
  .format-tag.csv { background: #0284c720; color: #38bdf8; }

  /* ── Editor panels ── */
  .editor-area {
    display: flex;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }

  .editor-area.diff-layout {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) 1px minmax(0, 0.92fr) 1px minmax(0, 1.16fr);
  }

  .panel {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: var(--panel-bg);
    transition: border-color 0.3s ease;
    overflow: hidden;
  }

  .panel-error {
    box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.3);
  }

  /* ── Fullscreen toggle ── */
  .fullscreen-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .fullscreen-btn:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
    border-color: var(--border);
  }

  .editor-area.fullscreen-input .panel-output,
  .editor-area.fullscreen-input .split-divider,
  .editor-area.fullscreen-input .panel-compare,
  .editor-area.fullscreen-output .panel-primary,
  .editor-area.fullscreen-output .split-divider,
  .editor-area.fullscreen-output .panel-compare {
    display: none;
  }

  .editor-area.fullscreen-input .panel-primary,
  .editor-area.fullscreen-output .panel-output {
    flex: 1 1 100%;
  }

  .editor-area.fullscreen-input.diff-layout,
  .editor-area.fullscreen-output.diff-layout {
    display: flex;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 14px;
    height: 36px;
    background: var(--panel-header-bg);
    border-bottom: 1px solid var(--border);
  }

  .panel-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .error-label {
    color: #ef4444 !important;
  }

  .panel-meta,
  .status-left,
  .status-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .panel-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 7px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--btn-bg);
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .panel-action-btn:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  .auto-saved-badge {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 500;
    color: #34d399;
    animation: fade-in 0.3s ease;
  }

  .valid-badge {
    font-size: 10px;
    font-weight: 600;
    color: #34d399;
    padding: 1px 8px;
    border-radius: 10px;
    background: #34d39915;
    border: 1px solid #34d39930;
    animation: fade-in 0.3s ease;
  }

  .processing-badge {
    font-size: 10px;
    font-weight: 600;
    color: var(--accent-text);
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--accent-bg);
    border: 1px solid var(--accent-border);
    animation: fade-in 0.3s ease;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .panel-editor {
    flex: 1;
    min-height: 0;
    width: 100%;
    position: relative;
  }

  .view-mode-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--btn-bg);
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .view-mode-btn:hover {
    background: var(--btn-hover);
    color: var(--text-primary);
  }

  .view-mode-label {
    font-size: 10px;
  }

  .view-scroll {
    height: 100%;
    overflow: auto;
    padding: 16px;
  }

  .view-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 10px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
  }

  .error-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: #ef444410;
    border-bottom: 1px solid #ef444420;
    color: #fca5a5;
    font-size: 11px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .split-divider {
    flex: none;
    width: 1px;
    background: var(--border);
    position: relative;
  }

  .divider-handle {
    display: none;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 36px;
    border-radius: 99px;
    background: var(--panel-header-bg);
    border: 1px solid var(--border);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }

  .dot,
  .status-dot {
    border-radius: 50%;
    background: var(--text-muted);
  }

  .dot {
    width: 3px;
    height: 3px;
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 14px;
    background: var(--toolbar-bg);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .status-item {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .mode-label {
    color: var(--accent-text);
    font-weight: 600;
  }

  .status-dot {
    width: 4px;
    height: 4px;
  }

  .status-dot.warning {
    background: #f59e0b;
  }

  /* ── SEO Content ── */
  .seo-content {
    max-width: 960px;
    margin: 60px auto 40px;
    padding: 0 20px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.6;
  }
  .seo-content h2 {
    color: var(--text-primary);
    font-size: 18px;
    font-weight: 700;
    margin: 32px 0 16px;
  }
  .seo-content p {
    margin-bottom: 16px;
  }
  .faq-item {
    margin-bottom: 24px;
    border-left: 2px solid var(--accent-border);
    padding-left: 16px;
  }
  .faq-item h3 {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .faq-item p {
    margin-bottom: 0;
  }

  /* ── Footer ── */
  .site-footer {
    border-top: 1px solid var(--border);
    background: var(--header-bg);
    padding: 40px 20px 24px;
  }

  .footer-inner {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 32px;
    max-width: 1040px;
    margin: 0 auto;
  }

  .footer-col h4 {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-primary);
    margin: 0 0 14px;
  }

  .footer-col a {
    display: block;
    font-size: 13px;
    color: var(--text-secondary);
    text-decoration: none;
    padding: 4px 0;
    transition: color 0.12s ease;
  }

  .footer-col a:hover {
    color: var(--accent-text);
  }

  .footer-bottom {
    text-align: center;
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .app-header {
      padding: 0 8px;
      height: 44px;
      gap: 6px;
    }

    .header-brand {
      gap: 6px;
    }

    .header-nav {
      gap: 1px;
      justify-content: flex-start;
      -webkit-overflow-scrolling: touch;
    }

    .nav-tab {
      padding: 6px 10px;
      font-size: 11px;
      flex-shrink: 0;
    }

    .app-title {
      display: none;
    }

    .toolbar {
      padding: 6px 10px;
      gap: 4px;
    }

    .toolbar-divider {
      display: none;
    }

    .btn-label {
      display: none;
    }

    .tool-btn {
      padding: 8px;
      min-width: 36px;
      min-height: 36px;
      justify-content: center;
    }

    .editor-area {
      flex-direction: column;
      overflow: auto;
    }

    .editor-area.diff-layout {
      display: flex;
    }

    .panel {
      flex: 1 1 0;
      min-height: 35dvh;
    }

    .workspace-shell {
      height: calc(100dvh - 44px);
    }

    .split-divider {
      width: 100%;
      height: 1px;
      flex-shrink: 0;
    }

    .split-divider .divider-handle {
      display: none;
    }

    .status-bar {
      padding: 4px 10px;
    }

    .status-item {
      font-size: 10px;
    }

    .footer-inner {
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }

    .site-footer {
      padding: 28px 16px 20px;
    }

    .seo-content {
      margin: 32px auto 24px;
      padding: 0 16px;
    }

    .seo-content h2 {
      font-size: 16px;
      margin: 24px 0 12px;
    }
  }

  @media (max-width: 480px) {
    .app-header {
      height: 42px;
    }

    .logo-mark {
      width: 24px;
      height: 24px;
      border-radius: 6px;
    }

    .logo-mark svg {
      width: 14px;
      height: 14px;
    }

    .nav-tab {
      padding: 5px 8px;
      font-size: 10px;
    }

    .panel {
      min-height: 30dvh;
    }

    .workspace-shell {
      height: calc(100dvh - 42px);
    }

    .indent-selector {
      display: none;
    }

    .toolbar-label {
      display: none;
    }

    .panel-header {
      height: 32px;
      padding: 0 10px;
    }

    .footer-inner {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }

  @media (min-width: 769px) {
    .divider-handle {
      display: flex;
    }
  }

  /* ── Theme tokens ── */
  .app-root {
    --header-bg: #000000;
    --page-bg: #000000;
    --toolbar-bg: #0a0a0c;
    --panel-bg: #070709;
    --panel-header-bg: #111113;
    --surface-bg: rgba(11, 11, 14, 0.92);
    --dropdown-bg: #18181b;
    --border: #27272a;
    --btn-bg: transparent;
    --btn-hover: #1f1f23;
    --logo-bg: #fabc3f;
    --logo-color: #271900;
    --text-primary: #ffffff;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --accent-bg: rgba(250, 188, 63, 0.15);
    --accent-text: #fabc3f;
    --accent-border: rgba(250, 188, 63, 0.3);
    --chip-bg: rgba(24, 24, 27, 0.88);
    --card-bg: rgba(20, 20, 23, 0.92);
    --card-hover: rgba(25, 25, 29, 0.96);
  }

  :global(html:not(.dark)) .app-root {
    --header-bg: rgba(249, 249, 249, 0.8);
    --page-bg: #f4f3f3;
    --toolbar-bg: #ffffff;
    --panel-bg: #ffffff;
    --panel-header-bg: #f9f9f9;
    --surface-bg: rgba(249, 249, 249, 0.9);
    --dropdown-bg: #ffffff;
    --border: #e2e2e2;
    --btn-bg: transparent;
    --btn-hover: rgba(0,0,0,0.05);
    --logo-bg: #000000;
    --logo-color: #ffffff;
    --text-primary: #1a1c1c;
    --text-secondary: #4c4546;
    --text-muted: #848484;
    --accent-bg: rgba(253, 191, 66, 0.2);
    --accent-text: #704e00;
    --accent-border: #fdbf42;
    --chip-bg: rgba(244, 244, 245, 0.9);
    --card-bg: rgba(255, 255, 255, 0.94);
    --card-hover: rgba(250, 250, 250, 1);
  }
</style>


<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';

  let { data } = $props<{ data: any }>();

  let container: HTMLDivElement;
  let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  let simulation: d3.Simulation<any, any>;
  let resizeObserver: ResizeObserver;

  interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    type: string;
    value?: any;
    depth: number;
    isKey: boolean;
  }

  interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    id: string;
  }

  const typeColors: Record<string, string> = {
    root: '#818cf8',
    object: '#818cf8',
    array: '#34d399',
    string: '#98c379',
    number: '#d19a66',
    boolean: '#d19a66',
    null: '#e06c75',
    key: '#61afef',
  };

  function buildGraph(obj: any): { nodes: GraphNode[]; links: GraphLink[] } {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    let idCounter = 0;

    function traverse(value: any, parentId: string | null, key: string | null, depth: number) {
      const nodeId = `n${idCounter++}`;
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

      if (type === 'object' || type === 'array') {
        const label = key !== null ? key : (type === 'array' ? '[ ]' : '{ }');
        nodes.push({ id: nodeId, label, type, depth, isKey: key !== null });

        if (parentId) {
          links.push({ source: parentId, target: nodeId, id: `l${parentId}-${nodeId}` });
        }

        if (type === 'array') {
          (value as any[]).forEach((item: any, i: number) => {
            traverse(item, nodeId, `[${i}]`, depth + 1);
          });
        } else {
          Object.entries(value as Record<string, any>).forEach(([k, v]) => {
            traverse(v, nodeId, k, depth + 1);
          });
        }
      } else {
        const displayValue = type === 'string'
          ? (String(value).length > 20 ? `"${String(value).slice(0, 20)}…"` : `"${value}"`)
          : String(value);
        const label = key !== null ? `${key}: ${displayValue}` : displayValue;
        nodes.push({ id: nodeId, label, type, value, depth, isKey: false });

        if (parentId) {
          links.push({ source: parentId, target: nodeId, id: `l${parentId}-${nodeId}` });
        }
      }
    }

    traverse(obj, null, null, 0);
    return { nodes, links };
  }

  function renderGraph() {
    if (!container || data === undefined || data === null) return;

    // Clear previous
    d3.select(container).selectAll('svg').remove();
    simulation?.stop();

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) return;

    const { nodes, links } = buildGraph(data);
    let visibleNodes = nodes;
    let visibleLinks = links;

    // Limit nodes for performance
    const maxNodes = 300;
    if (nodes.length > maxNodes) {
      visibleNodes = nodes.slice(0, maxNodes);
      const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
      visibleLinks = links.filter(
        (link) => visibleNodeIds.has(link.source as string) && visibleNodeIds.has(link.target as string)
      );
    }

    svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Zoom container
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '2')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    simulation = d3.forceSimulation(visibleNodes)
      .force('link', d3.forceLink(visibleLinks).id((d: any) => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(visibleLinks)
      .join('line')
      .attr('stroke', 'rgba(99, 102, 241, 0.2)')
      .attr('stroke-width', 1.5);

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(visibleNodes)
      .join('g')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any
      );

    // Node circles
    node.append('circle')
      .attr('r', (d: GraphNode) => {
        if (d.type === 'object' || d.type === 'array') return 8;
        return 5;
      })
      .attr('fill', (d: GraphNode) => typeColors[d.type] || '#a1a1aa')
      .attr('stroke', (d: GraphNode) => typeColors[d.type] || '#a1a1aa')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.3)
      .style('filter', 'url(#glow)')
      .style('cursor', 'grab');

    // Node labels
    node.append('text')
      .text((d: GraphNode) => {
        const maxLen = 24;
        return d.label.length > maxLen ? d.label.slice(0, maxLen) + '…' : d.label;
      })
      .attr('x', 12)
      .attr('y', 4)
      .attr('fill', (d: GraphNode) => {
        if (d.type === 'object' || d.type === 'array') return '#818cf8';
        return '#a1a1aa';
      })
      .attr('font-size', '11px')
      .attr('font-family', "'JetBrains Mono', 'Fira Code', monospace")
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }

  onMount(() => {
    renderGraph();
    resizeObserver = new ResizeObserver(() => {
      renderGraph();
    });
    resizeObserver.observe(container);
  });

  $effect(() => {
    // Re-render when data changes
    if (data !== undefined && container) {
      renderGraph();
    }
  });

  onDestroy(() => {
    simulation?.stop();
    resizeObserver?.disconnect();
  });
</script>

<div class="graph-container" bind:this={container}>
  {#if !data && data !== 0 && data !== false}
    <div class="graph-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <circle cx="5" cy="6" r="2"></circle>
        <circle cx="19" cy="6" r="2"></circle>
        <circle cx="5" cy="18" r="2"></circle>
        <circle cx="19" cy="18" r="2"></circle>
        <line x1="9.5" y1="10.5" x2="6.5" y2="7.5"></line>
        <line x1="14.5" y1="10.5" x2="17.5" y2="7.5"></line>
        <line x1="9.5" y1="13.5" x2="6.5" y2="16.5"></line>
        <line x1="14.5" y1="13.5" x2="17.5" y2="16.5"></line>
      </svg>
      <span>Paste JSON to visualize graph</span>
    </div>
  {/if}
</div>

<style>
  .graph-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: radial-gradient(ellipse at center, rgba(99, 102, 241, 0.03) 0%, transparent 70%);
  }

  .graph-container :global(svg) {
    display: block;
  }

  .graph-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted, #52525b);
    font-size: 13px;
    font-family: 'Inter', system-ui, sans-serif;
  }
</style>

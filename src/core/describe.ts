import { ServerElement } from '../types.js';

// Build an AI-readable description of the current canvas.
//
// The governing constraint (DESIGN.md): the voice model never sees tool
// results, so whatever an agent reads here it has to re-narrate in one or two
// spoken sentences, inside a ~2,500 token turn-start budget. So this output is
// optimised for narratability, not completeness — semantic model first, summary
// before detail, per-element dumps degraded gracefully on big scenes.
//
// Vocabulary is CONTEXT.md's: an element carrying archboard metadata is a
// NODE (it stands for an architectural unit, has a kind, usually a binding to
// code, a variant and a level); an arrow between two nodes is an EDGE;
// everything else is just an element.

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

// Our metadata lives under customData.archboard. A flat customData carrying
// these keys directly is the older shape (see DESIGN.md) and still reads as a
// node; anything else in customData is some other tool's and is passed through
// verbatim rather than interpreted.
const FLAT_KEYS = ['kind', 'binding', 'path', 'variant', 'level'] as const;

// Kinds in pipeline order — how someone would say them aloud, not alphabetical.
const KIND_ORDER = ['gateway', 'service', 'queue', 'datastore', 'external'];

const UNTYPED = 'untyped';

interface Meta {
  isNode: boolean;
  namespaced: boolean;
  kind?: string;
  binding?: string;
  variant?: string;
  level?: string;
  name?: string;
  extra: Record<string, unknown>;   // other keys inside the archboard block
  foreign: Record<string, unknown>; // customData that isn't ours at all
}

function scalarText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function pairs(o: Record<string, unknown>, max = 160): string {
  const s = Object.entries(o)
    .map(([k, v]) => `${k}=${scalarText(v)}`)
    .join(', ');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// A binding may be a bare path or a logical address (repo + path + branch +
// commit). Render both as one short string a person can read out.
function formatBinding(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (!v || typeof v !== 'object') return undefined;
  const b = v as Record<string, any>;
  const path = typeof b.path === 'string' ? b.path : undefined;
  if (!path && !b.repo) return pairs(b) || undefined;
  const repo = typeof b.repo === 'string' ? `${b.repo}:` : '';
  const branch = typeof b.branch === 'string' ? `@${b.branch}` : '';
  const commit = typeof b.commit === 'string' ? ` (${b.commit.slice(0, 7)})` : '';
  return `${repo}${path ?? '?'}${branch}${commit}`;
}

function readMeta(el: ServerElement): Meta {
  const meta: Meta = { isNode: false, namespaced: false, extra: {}, foreign: {} };
  const custom = el.customData;
  if (!custom || typeof custom !== 'object') return meta;

  const block = (custom as Record<string, any>).archboard;
  const namespaced = !!block && typeof block === 'object' && !Array.isArray(block);
  meta.namespaced = namespaced;

  for (const [k, v] of Object.entries(custom as Record<string, unknown>)) {
    if (k === 'archboard') continue;
    // Flat archboard keys only count as ours when there is no namespaced block
    // to contradict them; otherwise they belong to whoever else wrote them.
    if (!namespaced && (FLAT_KEYS as readonly string[]).includes(k)) continue;
    meta.foreign[k] = v;
  }

  const source: Record<string, unknown> = namespaced
    ? (block as Record<string, unknown>)
    : (custom as Record<string, unknown>);

  for (const [k, v] of Object.entries(source)) {
    if (!namespaced && !(FLAT_KEYS as readonly string[]).includes(k)) continue;
    switch (k) {
      case 'kind': meta.kind = scalarText(v) || undefined; break;
      case 'variant': meta.variant = scalarText(v) || undefined; break;
      case 'level': meta.level = scalarText(v) || undefined; break;
      case 'name': meta.name = scalarText(v) || undefined; break;
      case 'binding': meta.binding = formatBinding(v); break;
      case 'path': if (!meta.binding) meta.binding = formatBinding(v); break;
      default: meta.extra[k] = v;
    }
  }

  meta.isNode = namespaced
    ? true
    : !!(meta.kind || meta.binding || meta.variant || meta.level);
  return meta;
}

// ---------------------------------------------------------------------------
// Scene model
// ---------------------------------------------------------------------------

interface Item {
  el: ServerElement;
  meta: Meta;
  name: string;        // what to call it out loud
  labelText?: string;  // label / text / folded bound text
  isNode: boolean;
  fromBoard: boolean;  // synced back from the browser: a human touched it
  x: number; y: number; w: number; h: number;
}

interface Edge {
  arrow: ServerElement;
  fromId?: string;
  toId?: string;
  fromName: string;
  toName: string;
  label?: string;
  fromBoard: boolean;
}

const isConnector = (t: string) => t === 'arrow' || t === 'line';

function bindingOf(el: any, end: 'start' | 'end'): string | undefined {
  const binding = end === 'start' ? el.startBinding : el.endBinding;
  return binding?.elementId ?? (end === 'start' ? el.start?.id : el.end?.id);
}

function counts(values: (string | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    if (v === undefined) continue;
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}

function renderCounts(c: Record<string, number>, order?: string[]): string {
  const keys = Object.keys(c).sort((a, b) => {
    const ia = order ? order.indexOf(a) : -1;
    const ib = order ? order.indexOf(b) : -1;
    if (ia !== ib) return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
    return c[b]! - c[a]! || (a < b ? -1 : 1);
  });
  return keys.map(k => `${k}(${c[k]})`).join(', ');
}

// Reading order: top-to-bottom in coarse rows, then left-to-right.
const readingOrder = (a: Item, b: Item) => {
  const row = Math.floor(a.y / 50) - Math.floor(b.y / 50);
  return row !== 0 ? row : a.x - b.x;
};

// ---------------------------------------------------------------------------
// Clustering — proximity is how a human states design intent on the board,
// so it has to survive into the read-back.
// ---------------------------------------------------------------------------

const CLUSTER_GAP = 160;

function clusterNodes(nodes: Item[]): Item[][] {
  if (nodes.length < 3 || nodes.length > 400) return [];
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const near = (a: Item, b: Item) =>
    a.x - CLUSTER_GAP < b.x + b.w && b.x - CLUSTER_GAP < a.x + a.w &&
    a.y - CLUSTER_GAP < b.y + b.h && b.y - CLUSTER_GAP < a.y + a.h;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (near(nodes[i]!, nodes[j]!)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Item[]>();
  nodes.forEach((n, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(n);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function regionName(cx: number, cy: number, box: { minX: number; minY: number; maxX: number; maxY: number }): string {
  const third = (v: number, lo: number, hi: number) => {
    if (hi - lo < 1) return 1;
    const t = (v - lo) / (hi - lo);
    return t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
  };
  const rows = ['top', 'middle', 'bottom'];
  const cols = ['left', 'centre', 'right'];
  const r = third(cy, box.minY, box.maxY);
  const c = third(cx, box.minX, box.maxX);
  if (r === 1 && c === 1) return 'centre';
  return `${rows[r]}-${cols[c]}`;
}

// ---------------------------------------------------------------------------
// Detail budgets — a 200-element scene must still be readable aloud.
// ---------------------------------------------------------------------------

const NODE_DETAIL_LIMIT = 60;   // above this, nodes lose their extras line
const NODE_LIST_LIMIT = 120;    // above this, nodes are counted, not listed
const EDGE_LIST_LIMIT = 60;
const OTHER_LIST_LIMIT = 40;

export function describeScene(allElements: ServerElement[]): string {
  if (allElements.length === 0) {
    return 'The canvas is empty. No elements to describe.';
  }

  const byId = new Map<string, ServerElement>();
  for (const el of allElements) byId.set(el.id, el);

  // Fold bound text into its container: after a frontend sync a labelled shape
  // comes back as a shape plus a separate text element, and listing both makes
  // one node read as two.
  const foldedLabel = new Map<string, string>();
  const folded = new Set<string>();
  for (const el of allElements) {
    const container = (el as any).containerId;
    if (el.type === 'text' && container && byId.has(container) && container !== el.id) {
      folded.add(el.id);
      const text = el.text ?? (el as any).originalText;
      if (text) foldedLabel.set(container, String(text));
    }
  }

  const items: Item[] = [];
  for (const el of allElements) {
    if (folded.has(el.id)) continue;
    const meta = readMeta(el);
    const labelText = el.label?.text ?? el.text ?? foldedLabel.get(el.id);
    items.push({
      el, meta, labelText,
      name: labelText || meta.name || el.id,
      isNode: meta.isNode && !isConnector(el.type),
      fromBoard: el.source === 'frontend_sync',
      x: el.x, y: el.y, w: el.width || 0, h: el.height || 0,
    });
  }

  const nodes = items.filter(i => i.isNode).sort(readingOrder);
  const others = items.filter(i => !i.isNode && !isConnector(i.el.type)).sort(readingOrder);
  const connectors = items.filter(i => isConnector(i.el.type));
  const nameOf = new Map(items.map(i => [i.el.id, i.name]));

  // Bounding box over everything, as before.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of allElements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width || 0));
    maxY = Math.max(maxY, el.y + (el.height || 0));
  }
  const box = { minX, minY, maxX, maxY };

  const typeCounts = counts(allElements.map(el => el.type));
  const kindCounts = counts(nodes.map(n => n.meta.kind ?? UNTYPED));
  const variantCounts = counts(nodes.map(n => n.meta.variant));
  const levelCounts = counts(nodes.map(n => n.meta.level));
  const boundNodes = nodes.filter(n => n.meta.binding).length;
  const fromBoard = items.filter(i => i.fromBoard).length + folded.size;

  // Edges: arrows resolved to node names. Ids stay so callers that parse them
  // keep working.
  const edges: Edge[] = [];
  for (const item of connectors) {
    const el: any = item.el;
    const fromId = bindingOf(el, 'start');
    const toId = bindingOf(el, 'end');
    if (!fromId && !toId) continue;
    edges.push({
      arrow: item.el,
      fromId, toId,
      fromName: (fromId && nameOf.get(fromId)) || '?',
      toName: (toId && nameOf.get(toId)) || '?',
      label: item.labelText || item.meta.kind,
      fromBoard: item.fromBoard,
    });
  }

  const degree = new Map<string, { in: number; out: number }>();
  const bump = (id: string | undefined, dir: 'in' | 'out') => {
    if (!id) return;
    const d = degree.get(id) ?? { in: 0, out: 0 };
    d[dir]++;
    degree.set(id, d);
  };
  for (const e of edges) { bump(e.fromId, 'out'); bump(e.toId, 'in'); }

  const clusters = clusterNodes(nodes);
  const realClusters = clusters.filter(c => c.length > 1);

  const lines: string[] = [];
  lines.push('## Canvas Description');

  // --- the narratable sentence ---------------------------------------------
  lines.push(`Summary: ${summarise({
    nodes, others, edges, kindCounts, typeCounts,
    clusters: realClusters.length, boundNodes, fromBoard, total: allElements.length,
  })}`);

  // --- stats ----------------------------------------------------------------
  const composition = [
    `${nodes.length} node${nodes.length === 1 ? '' : 's'}`,
    `${edges.length} edge${edges.length === 1 ? '' : 's'}`,
    `${others.length} plain`,
  ];
  if (folded.size > 0) composition.push(`${folded.size} bound label${folded.size === 1 ? '' : 's'} folded in`);
  lines.push(`Total elements: ${allElements.length} (${composition.join(', ')})`);
  if (nodes.length > 0) {
    lines.push(`Kinds: ${renderCounts(kindCounts, KIND_ORDER)}`);
    const semantic: string[] = [];
    if (Object.keys(variantCounts).length > 0) semantic.push(`Variants: ${renderCounts(variantCounts, ['current'])}`);
    if (Object.keys(levelCounts).length > 0) semantic.push(`Levels: ${renderCounts(levelCounts)}`);
    semantic.push(`Bindings: ${boundNodes}/${nodes.length} bound to code`);
    lines.push(semantic.join(' | '));
  }
  if (fromBoard > 0) {
    lines.push(`From the board (human edits): ${fromBoard} of ${allElements.length} elements`);
  }
  lines.push(`Types: ${renderCounts(typeCounts)}`);
  lines.push(`Bounding box: (${Math.round(minX)}, ${Math.round(minY)}) to (${Math.round(maxX)}, ${Math.round(maxY)}) = ${Math.round(maxX - minX)}x${Math.round(maxY - minY)}`);

  // Hubs and orphans are the two things worth saying out loud about a graph.
  if (edges.length >= 3 && nodes.length > 0) {
    const ranked = nodes
      .map(n => ({ n, d: degree.get(n.el.id) ?? { in: 0, out: 0 } }))
      .filter(r => r.d.in + r.d.out >= 3)
      .sort((a, b) => (b.d.in + b.d.out) - (a.d.in + a.d.out))
      .slice(0, 3);
    if (ranked.length > 0) {
      lines.push(`Most connected: ${ranked.map(r => `${r.n.name} (${r.d.in} in, ${r.d.out} out)`).join(', ')}`);
    }
  }
  const isolated = nodes.filter(n => !degree.has(n.el.id));
  if (isolated.length > 0 && edges.length > 0) {
    const shown = isolated.slice(0, 8).map(n => n.name).join(', ');
    lines.push(`Unconnected nodes (${isolated.length}): ${shown}${isolated.length > 8 ? ', …' : ''}`);
  }

  // --- clusters -------------------------------------------------------------
  if (realClusters.length > 1) {
    lines.push('');
    lines.push(`### Clusters (nodes within ${CLUSTER_GAP}px of each other)`);
    for (const cluster of realClusters.slice(0, 12)) {
      const cx = cluster.reduce((s, n) => s + n.x + n.w / 2, 0) / cluster.length;
      const cy = cluster.reduce((s, n) => s + n.y + n.h / 2, 0) / cluster.length;
      const kinds = renderCounts(counts(cluster.map(n => n.meta.kind ?? UNTYPED)), KIND_ORDER);
      const names = cluster.slice(0, 8).map(n => n.name).join(', ');
      lines.push(`  ${regionName(cx, cy, box)} (${cluster.length}): ${names}${cluster.length > 8 ? ', …' : ''} — ${kinds}`);
    }
    const loose = clusters.filter(c => c.length === 1);
    if (loose.length > 0) {
      lines.push(`  on their own (${loose.length}): ${loose.slice(0, 8).map(c => c[0]!.name).join(', ')}${loose.length > 8 ? ', …' : ''}`);
    }
  }

  // --- nodes ----------------------------------------------------------------
  if (nodes.length > 0) {
    lines.push('');
    lines.push(`### Nodes (${nodes.length})`);
    if (nodes.length > NODE_LIST_LIMIT) {
      lines.push(`  ${nodes.length} nodes — too many to list; use \`query\` for the full set.`);
      for (const kind of Object.keys(kindCounts).sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))) {
        const sample = nodes.filter(n => (n.meta.kind ?? UNTYPED) === kind).slice(0, 6).map(n => n.name);
        lines.push(`  ${kind} (${kindCounts[kind]}): ${sample.join(', ')}${kindCounts[kind]! > 6 ? ', …' : ''}`);
      }
    } else {
      const terse = nodes.length > NODE_DETAIL_LIMIT;
      const showLevel = Object.keys(levelCounts).length > 1;
      const kinds = Object.keys(kindCounts).sort((a, b) => {
        const ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b);
        if (ia !== ib) return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
        return a < b ? -1 : 1;
      });
      for (const kind of kinds) {
        lines.push(`  ${kind} (${kindCounts[kind]}):`);
        for (const n of nodes.filter(x => (x.meta.kind ?? UNTYPED) === kind)) {
          lines.push(`    ${nodeLine(n, showLevel)}`);
          if (!terse) {
            const extra = nodeExtras(n);
            if (extra) lines.push(`        + ${extra}`);
          }
        }
      }
    }
  }

  // --- edges ----------------------------------------------------------------
  const looseConnectors = connectors.length - edges.length;
  if (edges.length > 0 || looseConnectors > 0) {
    lines.push('');
    lines.push(`### Edges (${edges.length})`);
    for (const e of edges.slice(0, EDGE_LIST_LIMIT)) {
      const arrow = e.label ? `--"${e.label}"-->` : '-->';
      const origin = e.fromBoard ? ' (from board)' : '';
      lines.push(`  "${e.fromName}" ${arrow} "${e.toName}"   (${e.fromId ?? '?'} --> ${e.toId ?? '?'}, arrow: ${e.arrow.id})${origin}`);
    }
    if (edges.length > EDGE_LIST_LIMIT) {
      lines.push(`  … and ${edges.length - EDGE_LIST_LIMIT} more edges`);
    }
    if (looseConnectors > 0) {
      lines.push(`  (${looseConnectors} unbound connector${looseConnectors === 1 ? '' : 's'} — drawn but attached to nothing)`);
    }
  }

  // --- everything else ------------------------------------------------------
  if (others.length > 0) {
    lines.push('');
    lines.push(`### Other elements (${others.length}) — no archboard metadata`);
    // A labelled shape a human drew is the interesting case: it is usually a
    // proposal waiting for a kind and a binding.
    const proposals = others.filter(o => o.fromBoard && o.labelText);
    if (proposals.length > 0) {
      lines.push(`  Drawn on the board with a label — candidates for promotion (${proposals.length}):`);
      for (const o of proposals.slice(0, OTHER_LIST_LIMIT)) lines.push(`    ${plainLine(o)}`);
      if (proposals.length > OTHER_LIST_LIMIT) lines.push(`    … and ${proposals.length - OTHER_LIST_LIMIT} more`);
    }
    const rest = others.filter(o => !(o.fromBoard && o.labelText));
    const notable = rest.filter(o => o.labelText || o.el.link || Object.keys(o.meta.foreign).length > 0);
    const dull = rest.filter(o => !(o.labelText || o.el.link || Object.keys(o.meta.foreign).length > 0));
    const listAll = rest.length <= OTHER_LIST_LIMIT;
    const listed = listAll ? rest.sort(readingOrder) : notable.slice(0, OTHER_LIST_LIMIT);
    for (const o of listed) lines.push(`  ${plainLine(o)}`);
    const omitted = rest.length - listed.length;
    if (omitted > 0) {
      const omittedItems = listAll ? [] : [...notable.slice(OTHER_LIST_LIMIT), ...dull];
      const byType = renderCounts(counts(omittedItems.map(o => o.el.type)));
      const boardCount = omittedItems.filter(o => o.fromBoard).length;
      const origin = boardCount === 0 ? ''
        : boardCount === omitted ? ' (all from the board)'
        : ` (${boardCount} from the board)`;
      const lead = listed.length > 0 || proposals.length > 0 ? `… ${omitted} more` : `${omitted}`;
      lines.push(`  ${lead} unlabelled, not listed: ${byType}${origin}`);
    }
  }

  // --- groups (unchanged) ---------------------------------------------------
  const groupedElements = allElements.filter(el => el.groupIds && el.groupIds.length > 0);
  if (groupedElements.length > 0) {
    const groupMap: Record<string, string[]> = {};
    for (const el of groupedElements) {
      for (const gid of (el.groupIds || [])) {
        if (!groupMap[gid]) groupMap[gid] = [];
        groupMap[gid]!.push(el.id);
      }
    }
    lines.push('');
    lines.push('### Groups:');
    for (const [gid, ids] of Object.entries(groupMap)) {
      lines.push(`  Group ${gid}: [${ids.join(', ')}]`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Line rendering
// ---------------------------------------------------------------------------

function geometry(i: Item): string {
  const parts = [`at (${Math.round(i.x)}, ${Math.round(i.y)})`];
  if (i.w || i.h) parts.push(`size ${Math.round(i.w)}x${Math.round(i.h)}`);
  return parts.join(' | ');
}

function nodeLine(n: Item, showLevel: boolean): string {
  const parts = [`[${n.el.id}] "${n.name}"`];
  parts.push(n.meta.binding ? `bound ${n.meta.binding}` : 'unbound');
  if (n.meta.variant && n.meta.variant !== 'current') parts.push(`variant ${n.meta.variant}`);
  if (showLevel && n.meta.level) parts.push(`level ${n.meta.level}`);
  parts.push(geometry(n));
  parts.push(n.el.type);
  if (n.fromBoard) parts.push('from board');
  if (n.el.locked) parts.push('(locked)');
  return parts.join(' | ');
}

// Only the things the main line didn't already say.
function nodeExtras(n: Item): string {
  const parts: string[] = [];
  const link = n.el.link;
  if (link && !(n.meta.binding && link.includes(n.meta.binding))) parts.push(`link ${link}`);
  if (!n.meta.namespaced && n.meta.isNode) parts.push('(flat customData, not namespaced)');
  if (Object.keys(n.meta.extra).length > 0) parts.push(pairs(n.meta.extra));
  if (Object.keys(n.meta.foreign).length > 0) parts.push(`other customData: ${pairs(n.meta.foreign)}`);
  if (n.el.groupIds && n.el.groupIds.length > 0) parts.push(`groups: [${n.el.groupIds.join(', ')}]`);
  return parts.join(' | ');
}

function plainLine(o: Item): string {
  const el = o.el;
  const parts = [`[${el.id}] ${el.type}`, geometry(o)];
  if (el.text) parts.push(`text: "${el.text}"`);
  if (el.label?.text) parts.push(`label: "${el.label.text}"`);
  else if (o.labelText && !el.text) parts.push(`label: "${o.labelText}"`);
  if (el.backgroundColor && el.backgroundColor !== 'transparent') parts.push(`bg: ${el.backgroundColor}`);
  if (el.strokeColor && el.strokeColor !== '#000000') parts.push(`stroke: ${el.strokeColor}`);
  if (el.link) parts.push(`link: ${el.link}`);
  if (Object.keys(o.meta.foreign).length > 0) parts.push(`customData: ${pairs(o.meta.foreign)}`);
  if (o.fromBoard) parts.push('from board');
  if (el.locked) parts.push('(locked)');
  if (el.groupIds && el.groupIds.length > 0) parts.push(`groups: [${el.groupIds.join(', ')}]`);
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// The one sentence an agent can speak verbatim
// ---------------------------------------------------------------------------

function plural(n: number, word: string): string {
  const noun = word === 'external' ? 'external system' : word;
  if (n === 1) return `1 ${noun}`;
  return `${n} ${noun}${noun.endsWith('s') ? '' : 's'}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function summarise(s: {
  nodes: Item[]; others: Item[]; edges: Edge[];
  kindCounts: Record<string, number>; typeCounts: Record<string, number>;
  clusters: number; boundNodes: number; fromBoard: number; total: number;
}): string {
  if (s.nodes.length === 0) {
    const kinds = renderCounts(s.typeCounts);
    const tail = s.fromBoard > 0 ? `; ${s.fromBoard} came from the board` : '';
    return `no nodes yet — ${s.total} elements (${kinds})${tail}. Nothing on this canvas carries archboard metadata.`;
  }

  const kindOrder = Object.keys(s.kindCounts).sort((a, b) => {
    const ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b);
    if (ia !== ib) return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
    return s.kindCounts[b]! - s.kindCounts[a]!;
  });
  const shownKinds = kindOrder.slice(0, 6).map(k => plural(s.kindCounts[k]!, k));
  const hidden = kindOrder.length - 6;
  if (hidden > 0) shownKinds.push(hidden === 1 ? '1 other kind' : `${hidden} other kinds`);

  const clauses: string[] = [joinList(shownKinds)];
  if (s.clusters > 1) clauses.push(`in ${s.clusters} clusters`);
  clauses.push(s.edges.length > 0 ? `linked by ${plural(s.edges.length, 'edge')}` : 'with no edges drawn yet');

  const notes: string[] = [];
  const unbound = s.nodes.length - s.boundNodes;
  if (unbound > 0) notes.push(`${unbound} unbound`);
  if (s.fromBoard > 0) notes.push(`${s.fromBoard} touched on the board`);
  if (s.others.length > 0) notes.push(`${plural(s.others.length, 'plain element')} alongside`);

  return `${clauses.join(' ')}${notes.length ? `; ${joinList(notes)}` : ''}.`;
}

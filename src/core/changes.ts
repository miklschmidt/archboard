// The semantic delta between two states of ONE board.
//
// `compare` (core/compare.ts) diffs two *variants* — separate notes, authored
// independently, joined on node identity. This diffs the same board against
// itself a moment ago, which is a different problem in exactly one respect:
// element ids are stable here. That is what lets a live diff say something
// about the boxes nobody has promoted yet, which is most of them while someone
// is actually drawing.
//
// So this does not invent a second vocabulary. It stamps a synthetic node id
// (`el:<elementId>`) on every non-connector element that has no real one, hands
// both sides to `compareBoards`, and reads the result back. Every signal
// compare computes — nodes and edges added/removed/changed, reroutes, clusters,
// containment, groups, region, relative direction, prominence — therefore
// applies to un-promoted shapes too, and the two tools cannot drift into
// disagreeing about what "left the cluster" means.
//
// WHAT AN EVENT IS, AND WHAT IT IS NOT.
//
// An element delta is not an event. Dragging one box emits a stream of element
// updates, and no single tick of it means anything: the statement is the box's
// resting place. Events are therefore produced only from *settled* board
// states (see change-feed.ts) and only when the settled state differs from the
// last reported one in a way this model can name:
//
//   structural  a node or edge appeared, vanished, was rerouted, was promoted,
//               demoted or renamed, or had its kind / binding / label changed
//   layout      the relative arrangement changed — who sits with whom, what
//               contains what, what is grouped, whereabouts, which side of
//               what, drawn bigger than its neighbours
//   cosmetic    colour, stroke, size, and nothing else
//   none        nothing this model can express
//
// Only structural and layout are worth an event. Cosmetic and none are
// deliberately silent — and the feed does not advance its baseline for them,
// so a run of nudges that each mean nothing still adds up to "you moved
// AuthService out of the API cluster" once it crosses a threshold, rather than
// being lost one imperceptible step at a time.
//
// WHAT IT DELIBERATELY CANNOT SAY. Everything under
// `CompareResult.layout.cannotExpress` applies here unchanged: absolute
// position, tidiness, edge geometry, movement below the cluster/region
// thresholds. One caveat is specific to live diffing: region is measured
// against the board's own node bounding box, so adding one far-flung box
// re-frames every region at once. That shows up as a crowd of region changes
// with a structural change beside it; read the structural change, not the crowd.

import { ServerElement } from '../types.js';
import { BoardIdentity } from './board.js';
import {
  ChangedEdge,
  ChangedNode,
  ClusterChange,
  CompareResult,
  EdgeFacts,
  FieldChange,
  NodeFacts,
  RelationChange,
  compareBoards
} from './compare.js';
import { archboardBlock, nodeIdOf } from './promote.js';

// Synthetic node ids are namespaced so that nothing downstream can mistake one
// for something a human promoted. Nothing outside this module should ever
// print one: `anonymous: true` plus a type is what a reader gets.
export const ANON_NODE_PREFIX = 'el:';

const CONNECTOR_TYPES = new Set(['arrow', 'line']);

export function isAnonymousNode(node: string): boolean {
  return node.startsWith(ANON_NODE_PREFIX);
}

/**
 * Give every non-connector element a node id, keeping the real one where there
 * is one. Returns copies: the board's own elements are never touched, because
 * a synthetic id that leaked into the store would be indistinguishable from a
 * promotion the next time anything read the board.
 */
export function withSyntheticNodeIds(elements: ServerElement[]): ServerElement[] {
  return elements.map(el => {
    if (CONNECTOR_TYPES.has(el.type)) return el;
    if (nodeIdOf(el)) return el;
    // A bound label belongs to its container and compare folds it in there;
    // giving it its own node would double-count the shape it labels.
    if ((el as any).containerId) return el;
    const custom = (el.customData ?? {}) as Record<string, unknown>;
    const block = { ...(archboardBlock(el) ?? {}), node: `${ANON_NODE_PREFIX}${el.id}` };
    return { ...el, customData: { ...custom, archboard: block } } as ServerElement;
  });
}

// ---------------------------------------------------------------------------
// The event model
// ---------------------------------------------------------------------------

export type Significance = 'none' | 'cosmetic' | 'layout' | 'structural';

/** One node, said the way a reader can use: never a synthetic id. */
export interface NodeRef {
  node: string;
  name: string;
  anonymous: boolean;
  type: string;
  kind?: string;
  binding?: string;
  link?: string;
}

export interface NodeFieldChange extends NodeRef {
  changes: Record<string, FieldChange>;
}

export interface NodeIdentityChange {
  /** What it is now. */
  to: NodeRef;
  /** What it was — the same shape under its old identity. */
  from: NodeRef;
  what: 'promoted' | 'demoted' | 'renamed';
  elementIds: string[];
}

export interface EdgeRef {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  label?: string;
  kind?: string;
  type: string;
}

export interface EdgeReroute {
  anchor: string;
  anchorName: string;
  end: 'source' | 'target';
  was: string;
  wasName: string;
  now: string;
  nowName: string;
}

export interface SemanticChange {
  significance: Significance;
  /** One sentence. Safe to speak; safe to put in a log line. */
  headline: string;
  nodes: {
    added: NodeRef[];
    removed: NodeRef[];
    changed: NodeFieldChange[];
    identity: NodeIdentityChange[];
    /** Same node, new place: only the ones whose layout signals actually moved. */
    moved: Array<NodeRef & { changes: Record<string, FieldChange> }>;
  };
  edges: {
    added: EdgeRef[];
    removed: EdgeRef[];
    changed: Array<EdgeRef & { changes: Record<string, FieldChange> }>;
    rerouted: EdgeReroute[];
  };
  layout: {
    clusters: ClusterChange[];
    groups: ClusterChange[];
    relations: RelationChange[];
  };
  /**
   * Node id → what to call it. Every id that appears anywhere in this change
   * is in here, so nothing downstream has to print a raw id — least of all a
   * synthetic `el:` one, which would be meaningless to a reader and wrong to
   * say aloud.
   */
  names: Record<string, string>;
  counts: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesChanged: number;
    nodesMoved: number;
    identityChanges: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesChanged: number;
    edgesRerouted: number;
    layoutSignals: number;
  };
  warnings: string[];
  /**
   * The whole `compare` result the above was read out of. Complete and large:
   * the feed carries it for a caller that wants everything, and both the HTTP
   * and CLI surfaces drop it unless asked.
   */
  detail: CompareResult;
}

// ---------------------------------------------------------------------------
// Building one
// ---------------------------------------------------------------------------

function refOf(facts: NodeFacts): NodeRef {
  const anonymous = isAnonymousNode(facts.node);
  const type = facts.cosmetic.type;
  return {
    node: facts.node,
    name: anonymous ? (facts.label ?? facts.declaredName ?? `an unlabelled ${type}`) : facts.name,
    anonymous,
    type,
    ...(facts.kind ? { kind: facts.kind } : {}),
    ...(facts.bindingText ? { binding: facts.bindingText } : {}),
    ...(facts.link ? { link: facts.link } : {})
  };
}

function edgeRefOf(edge: EdgeFacts): EdgeRef {
  return {
    from: edge.from,
    to: edge.to,
    fromName: edge.fromName,
    toName: edge.toName,
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.kind ? { kind: edge.kind } : {}),
    type: edge.type
  };
}

interface IdentityPair {
  previousNode: string;
  node: string;
  elementIds: string[];
}

/**
 * Promotion is not "one node left and another arrived".
 *
 * Promoting a box changes the id this diff joins on, so the naive reading of a
 * promotion is a removal plus an addition of the same drawing — the single
 * most misleading thing this could report, because "AuthService was deleted"
 * is false and alarming. It also poisons everything downstream: the same shape
 * counted as both a departure and an arrival makes its cluster look like it
 * split and re-formed around a node that never moved.
 *
 * The elements did not move, so element-id overlap identifies the pair, and
 * the pair is resolved BEFORE the diff — the old state is rewritten to use the
 * new node id — so compare sees one continuous node whose fields changed.
 */
function identityPairs(before: ServerElement[], after: ServerElement[]): IdentityPair[] {
  const nodeByElement = (elements: ServerElement[]) => {
    const map = new Map<string, string>();
    for (const el of elements) {
      const node = nodeIdOf(el);
      if (node) map.set(el.id, node);
    }
    return map;
  };
  const was = nodeByElement(before);
  const now = nodeByElement(after);

  const candidates = new Map<string, Map<string, string[]>>();
  for (const [elementId, node] of now) {
    const previous = was.get(elementId);
    if (!previous || previous === node) continue;
    const byNew = candidates.get(previous) ?? new Map<string, string[]>();
    byNew.set(node, [...(byNew.get(node) ?? []), elementId]);
    candidates.set(previous, byNew);
  }

  const pairs: IdentityPair[] = [];
  const claimed = new Set<string>();
  for (const [previousNode, byNew] of candidates) {
    // A node whose elements were split across two new ids is not one identity
    // change, and guessing which half "is" the original would be inventing a
    // fact. Take the largest claim, leave the rest to read as added.
    const ranked = [...byNew.entries()].sort((a, b) => b[1].length - a[1].length);
    const [node, elementIds] = ranked[0]!;
    if (claimed.has(node)) continue;
    claimed.add(node);
    pairs.push({ previousNode, node, elementIds });
  }
  return pairs;
}

function applyIdentityPairs(before: ServerElement[], pairs: IdentityPair[]): ServerElement[] {
  if (pairs.length === 0) return before;
  const rename = new Map(pairs.map(p => [p.previousNode, p.node]));
  return before.map(el => {
    const node = nodeIdOf(el);
    const renamed = node ? rename.get(node) : undefined;
    if (!renamed) return el;
    const custom = (el.customData ?? {}) as Record<string, unknown>;
    return {
      ...el,
      customData: { ...custom, archboard: { ...(archboardBlock(el) ?? {}), node: renamed } }
    } as ServerElement;
  });
}

/**
 * Fields that are real across two independently authored boards but are noise
 * across two moments of one board.
 *
 * `elementCount` is the whole list, and it earns its place: archboard creates
 * a labelled shape as ONE element, and the first time the browser syncs that
 * board back it has become a shape plus a bound text element. So every node
 * the agent drew reports 1 → 2 the moment a human touches the board — an event
 * about nothing, and one that would headline over the change the human
 * actually made. Nothing was added to the architecture; the drawing is simply
 * stored differently.
 */
const STORAGE_ARTEFACT_FIELDS = new Set(['elementCount']);

function withoutStorageArtefacts(changes: Record<string, FieldChange>): Record<string, FieldChange> {
  const kept: Record<string, FieldChange> = {};
  for (const [field, change] of Object.entries(changes)) {
    if (STORAGE_ARTEFACT_FIELDS.has(field)) continue;
    kept[field] = change;
  }
  return kept;
}

function changedNodeOf(changed: ChangedNode): NodeFieldChange {
  return { ...refOf(changed.to), changes: changed.changes };
}

function changedEdgeOf(changed: ChangedEdge): EdgeRef & { changes: Record<string, FieldChange> } {
  return { ...edgeRefOf(changed.toFacts), changes: changed.changes };
}

/**
 * Diff two states of one board.
 *
 * `identity` is the board's, used for both sides — this is one board at two
 * moments, so a variant mismatch is impossible by construction and compare's
 * cross-variant warnings cannot fire.
 */
export function diffBoardStates(
  before: ServerElement[],
  after: ServerElement[],
  identity: BoardIdentity,
  key = identity.board
): SemanticChange {
  const beforeNodes = withSyntheticNodeIds(before);
  const afterNodes = withSyntheticNodeIds(after);
  const pairs = identityPairs(beforeNodes, afterNodes);

  const detail = compareBoards(
    { key, identity, elements: applyIdentityPairs(beforeNodes, pairs), source: 'memory' },
    { key, identity, elements: afterNodes, source: 'memory' }
  );

  // Read each pair back out of the diff, which now holds it as one node that
  // changed rather than as a departure and an arrival.
  const identityChanges: NodeIdentityChange[] = [];
  for (const pair of pairs) {
    const changed = detail.nodes.changed.find(n => n.node === pair.node);
    const unchanged = detail.nodes.unchanged.find(n => n.node === pair.node);
    const toFacts = changed?.to ?? unchanged?.facts;
    const fromFacts = changed?.from ?? unchanged?.facts;
    if (!toFacts || !fromFacts) continue;
    const wasAnon = isAnonymousNode(pair.previousNode);
    const isAnon = isAnonymousNode(pair.node);
    // The old side is being read out of a record that now carries the new id,
    // so an unlabelled shape would otherwise be "named" after the id it was
    // just given — the one thing it certainly was not called before.
    const fromName = fromFacts.label ?? fromFacts.declaredName ??
      (wasAnon ? `an unlabelled ${fromFacts.cosmetic.type}` : pair.previousNode);
    identityChanges.push({
      what: wasAnon && !isAnon ? 'promoted' : !wasAnon && isAnon ? 'demoted' : 'renamed',
      from: { ...refOf(fromFacts), node: pair.previousNode, anonymous: wasAnon, name: fromName },
      to: refOf(toFacts),
      elementIds: pair.elementIds
    });
  }
  const identityNodes = new Set(identityChanges.map(i => i.to.node));
  const added = detail.nodes.added;
  const removed = detail.nodes.removed;

  const moved: SemanticChange['nodes']['moved'] = [];
  for (const node of detail.nodes.unchanged) {
    if (!node.layoutChanges) continue;
    moved.push({ ...refOf(node.facts), changes: node.layoutChanges });
  }
  for (const node of detail.nodes.changed) {
    if (!node.layoutChanges) continue;
    moved.push({ ...refOf(node.to), changes: node.layoutChanges });
  }

  const nodes = {
    added: added.map(refOf),
    removed: removed.map(refOf),
    // A promotion's field changes are already spelled out in the identity
    // entry, which carries both sides; repeating them as an ordinary change
    // would say the same thing twice in different words.
    changed: detail.nodes.changed
      .filter(n => !identityNodes.has(n.node))
      .map(n => ({ ...n, changes: withoutStorageArtefacts(n.changes) }))
      .filter(n => Object.keys(n.changes).length > 0)
      .map(changedNodeOf),
    identity: identityChanges,
    moved
  };
  const edges = {
    added: detail.edges.added.map(edgeRefOf),
    removed: detail.edges.removed.map(edgeRefOf),
    changed: detail.edges.changed.map(changedEdgeOf),
    rerouted: detail.edges.rerouted
  };
  const layout = {
    clusters: detail.layout.clusters.changes.filter(c => c.kind !== 'stable'),
    groups: detail.layout.groups.changes.filter(c => c.kind !== 'stable'),
    relations: detail.layout.relations.changes
  };

  const structural =
    nodes.added.length + nodes.removed.length + nodes.changed.length + nodes.identity.length +
    edges.added.length + edges.removed.length + edges.changed.length + edges.rerouted.length;
  const layoutSignals =
    moved.length + layout.clusters.length + layout.groups.length + layout.relations.length;
  const cosmetic =
    detail.nodes.unchanged.some(n => n.cosmeticChanges) ||
    detail.nodes.changed.some(n => n.cosmeticChanges);

  const significance: Significance =
    structural > 0 ? 'structural' : layoutSignals > 0 ? 'layout' : cosmetic ? 'cosmetic' : 'none';

  const names: Record<string, string> = {};
  const remember = (facts: NodeFacts) => { names[facts.node] = refOf(facts).name; };
  detail.nodes.added.forEach(remember);
  detail.nodes.removed.forEach(remember);
  detail.nodes.changed.forEach(n => { remember(n.from); remember(n.to); });
  detail.nodes.unchanged.forEach(n => remember(n.facts));

  const change: SemanticChange = {
    significance,
    headline: '',
    nodes,
    edges,
    layout,
    names,
    counts: {
      nodesAdded: nodes.added.length,
      nodesRemoved: nodes.removed.length,
      nodesChanged: nodes.changed.length,
      nodesMoved: moved.length,
      identityChanges: nodes.identity.length,
      edgesAdded: edges.added.length,
      edgesRemoved: edges.removed.length,
      edgesChanged: edges.changed.length,
      edgesRerouted: edges.rerouted.length,
      layoutSignals
    },
    warnings: detail.warnings,
    detail
  };
  change.headline = headlineFor(change);
  return change;
}

// ---------------------------------------------------------------------------
// Saying it
// ---------------------------------------------------------------------------

const quoted = (name: string) => (name.startsWith('an ') ? name : `"${name}"`);

function list(names: string[], limit = 3): string {
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`;
}

/**
 * One sentence naming the most consequential thing in the change.
 *
 * Ranked, not summed: a headline that tried to mention everything would be
 * unreadable in the one place it is used, which is a line the agent may end up
 * speaking. Everything else is still in `narrateChange` and in `detail`.
 */
export function headlineFor(change: SemanticChange): string {
  const c = change.counts;
  const n = change.nodes;
  const e = change.edges;

  if (n.identity.length > 0) {
    const first = n.identity[0]!;
    const verb = first.what === 'promoted' ? 'promoted' : first.what === 'demoted' ? 'demoted' : 'renamed';
    const more = c.identityChanges > 1 ? ` (+${c.identityChanges - 1} more)` : '';
    return `${quoted(first.to.name)} ${verb}${first.what === 'promoted' && first.to.kind ? ` to a ${first.to.kind}` : ''}${more}`;
  }
  if (e.removed.length > 0 || e.rerouted.length > 0) {
    if (e.rerouted.length > 0) {
      const r = e.rerouted[0]!;
      return `${quoted(r.anchorName)}'s ${r.end === 'source' ? 'incoming' : 'outgoing'} edge now goes to ${quoted(r.nowName)}, not ${quoted(r.wasName)}`;
    }
    const r = e.removed[0]!;
    const more = e.removed.length > 1 ? ` (+${e.removed.length - 1} more)` : '';
    return `the edge ${quoted(r.fromName)} → ${quoted(r.toName)} was cut${more}`;
  }
  if (n.removed.length > 0) {
    return `${list(n.removed.map(x => quoted(x.name)))} ${n.removed.length === 1 ? 'is' : 'are'} gone from the board`;
  }
  if (n.added.length > 0) {
    return `${list(n.added.map(x => quoted(x.name)))} appeared on the board`;
  }
  if (e.added.length > 0) {
    const a = e.added[0]!;
    const more = e.added.length > 1 ? ` (+${e.added.length - 1} more)` : '';
    return `a new edge ${quoted(a.fromName)} → ${quoted(a.toName)}${more}`;
  }
  if (n.changed.length > 0) {
    const ch = n.changed[0]!;
    const fields = Object.keys(ch.changes).join(', ');
    const more = n.changed.length > 1 ? ` (+${n.changed.length - 1} more)` : '';
    return `${quoted(ch.name)} changed: ${fields}${more}`;
  }
  const named = (node: string) => quoted(change.names[node] ?? node);
  if (change.layout.clusters.length > 0) {
    const cl = change.layout.clusters[0]!;
    const who = [...cl.joined, ...cl.left];
    return `the grouping changed — a cluster ${cl.kind}${who.length ? `, ${list(who.map(named))} moved between clusters` : ''}`;
  }
  if (c.nodesMoved > 0) {
    // Not every "moved" is equally meaningful: containment, grouping and
    // cluster membership are deliberate acts, whereas region can shift simply
    // because something else was added and re-framed the board. Headline the
    // deliberate ones when there are any.
    const rank = (m: (typeof change.nodes.moved)[number]) =>
      ['cluster', 'container', 'group'].some(k => k in m.changes) ? 0 : 1;
    const ordered = [...change.nodes.moved].sort((a, b) => rank(a) - rank(b));
    const deliberate = ordered.filter(m => rank(m) === 0);
    const subjects = (deliberate.length > 0 ? deliberate : ordered).map(m => quoted(m.name));
    return `${list(subjects)} moved`;
  }
  if (change.significance === 'cosmetic') return 'only appearance changed';
  return 'nothing this model can name changed';
}

function describeFieldChanges(
  changes: Record<string, FieldChange>,
  named: (node: string) => string = quoted
): string {
  // `cluster` and `clusterWith` hold node ids, and the empty case is the one
  // that matters most — a node on its own, which "[]" says badly.
  const company = (value: unknown): string => {
    if (!Array.isArray(value)) return JSON.stringify(value) ?? 'none';
    if (value.length === 0) return 'on its own';
    return `with ${value.map(v => named(String(v))).join(', ')}`;
  };
  return Object.entries(changes)
    .map(([field, { from, to }]) =>
      field === 'cluster' || field === 'clusterWith'
        ? `sits ${company(to)} (was ${company(from)})`
        : `${field} ${JSON.stringify(from) ?? 'none'} → ${JSON.stringify(to) ?? 'none'}`)
    .join('; ');
}

/**
 * The change as compact lines, for a reader with a token budget — a hook's
 * additional context, or an injected item. Nothing here is invented: every
 * line restates one field of the change.
 *
 * `maxChars` truncates by dropping whole lines and saying how many were
 * dropped, never by cutting a line in half. The full structure is always
 * available from the feed.
 */
export function narrateChange(change: SemanticChange, maxChars = 1800): string {
  const lines: string[] = [];
  // Never print a node id: a synthetic one means nothing to a reader, and a
  // real one is not what anybody calls the box.
  const named = (node: string) => quoted(change.names[node] ?? node);
  const namedList = (ids: string[], limit = 3) => list(ids.map(named), limit);

  for (const id of change.nodes.identity) {
    if (id.what === 'promoted') {
      const was = id.from.anonymous && id.from.name.startsWith('an ')
        ? `was ${id.from.name}`
        : `was a plain ${id.from.type} labelled "${id.from.name}"`;
      lines.push(`promoted ${quoted(id.to.name)}${id.to.kind ? ` to a ${id.to.kind}` : ''}${id.to.binding ? ` bound to ${id.to.binding}` : ''} (${was})`);
    } else if (id.what === 'demoted') {
      lines.push(`demoted ${quoted(id.from.name)} back to a plain ${id.to.type}`);
    } else {
      lines.push(`renamed the node ${quoted(id.from.name)} to ${quoted(id.to.name)}`);
    }
  }
  for (const node of change.nodes.added) {
    lines.push(`new ${node.kind ?? 'node'} ${quoted(node.name)}${node.binding ? ` bound to ${node.binding}` : ''}`);
  }
  for (const node of change.nodes.removed) {
    lines.push(`${quoted(node.name)}${node.kind ? ` (${node.kind})` : ''} was removed`);
  }
  for (const node of change.nodes.changed) {
    lines.push(`${quoted(node.name)}: ${describeFieldChanges(node.changes, named)}`);
  }
  for (const edge of change.edges.added) {
    lines.push(`new edge ${quoted(edge.fromName)} → ${quoted(edge.toName)}${edge.label ? ` ("${edge.label}")` : ''}`);
  }
  for (const edge of change.edges.removed) {
    lines.push(`edge cut: ${quoted(edge.fromName)} → ${quoted(edge.toName)}`);
  }
  for (const r of change.edges.rerouted) {
    lines.push(`rerouted: ${quoted(r.anchorName)}'s edge ${r.end === 'source' ? 'from' : 'to'} ${quoted(r.wasName)} now ${r.end === 'source' ? 'from' : 'to'} ${quoted(r.nowName)}`);
  }
  for (const edge of change.edges.changed) {
    lines.push(`edge ${quoted(edge.fromName)} → ${quoted(edge.toName)}: ${describeFieldChanges(edge.changes)}`);
  }
  // One board-level line per cluster, but only a couple: a board that broke
  // into five clusters produces five entries describing the same event from
  // five sides, and the per-node "sits with" lines below say it better.
  for (const cl of change.layout.clusters.slice(0, 2)) {
    const parts: string[] = [];
    if (cl.joined.length) parts.push(`joined by ${namedList(cl.joined)}`);
    if (cl.left.length) parts.push(`left by ${namedList(cl.left)}`);
    lines.push(`cluster ${cl.kind}${parts.length ? `: ${parts.join(', ')}` : ''}${cl.sharedMembers.length ? ` (around ${namedList(cl.sharedMembers)})` : ''}`);
  }
  if (change.layout.clusters.length > 2) {
    lines.push(`… and ${change.layout.clusters.length - 2} other cluster change(s) from the same rearrangement`);
  }
  for (const g of change.layout.groups) {
    lines.push(`group ${g.kind}${g.joined.length ? `: +${namedList(g.joined)}` : ''}${g.left.length ? `: -${namedList(g.left)}` : ''}`);
  }
  for (const m of change.nodes.moved) {
    lines.push(`${quoted(m.name)} moved: ${describeFieldChanges(m.changes, named)}`);
  }
  for (const rel of change.layout.relations.slice(0, 8)) {
    lines.push(`${named(rel.a)} is now ${rel.to} ${named(rel.b)} (was ${rel.from})`);
  }
  if (change.layout.relations.length > 8) {
    lines.push(`… and ${change.layout.relations.length - 8} other relative-position changes`);
  }

  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 3 > maxChars) {
      kept.push(`… and ${lines.length - kept.length} more changes (ask the canvas for the full diff)`);
      break;
    }
    kept.push(line);
    used += line.length + 3;
  }
  return kept.map(l => `- ${l}`).join('\n');
}

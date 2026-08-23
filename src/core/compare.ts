// `compare` — a structured semantic diff between two variants of a board.
//
// Two variants are separate notes in the vault, authored independently
// (ADR 0004), so their Excalidraw element ids have nothing in common. The join
// key is `customData.archboard.node` — the stable logical node id promotion
// assigns — which is what makes this a diff of the *architecture* rather than a
// diff of the drawing.
//
// GOVERNING CONSTRAINT: SUFFICIENCY, NOT NARRATABILITY.
//
// `describe` is written for a voice turn and deliberately degrades on big
// scenes. This is the opposite. The consumer is a full agent thread that will
// narrate the result itself and can ask the human a follow-up question, so the
// job here is to make sure everything needed to explain the difference between
// two boards is present. Nothing is pre-digested into prose and nothing is
// truncated to fit a budget: no sentence is composed here, and every list is
// complete. Where a limit exists at all (the pairwise relation pass) it is
// declared in `warnings` rather than applied silently.
//
// ── The layout model ───────────────────────────────────────────
//
// Rearranging a board is a statement about the design, so a pure graph diff
// throws away information the human deliberately expressed. But raw coordinate
// deltas are noise — nobody means anything by 12px, and a board that was tidied
// wholesale would produce a diff of nothing but movement. So layout is reported
// through six signals, every one of them *relative* and therefore invariant
// under panning, scaling and wholesale tidying:
//
//   cluster      which nodes sit together, as a partition of node ids
//                (proximity, layout.ts's CLUSTER_GAP — the same clusters
//                `describe` names, so the two agree)
//   containment  the smallest shape a node sits inside: an explicit boundary
//                box someone drew round a subsystem
//   group        Excalidraw group membership — grouping is the one layout act
//                that is unambiguously deliberate
//   region       whereabouts on the board, in thirds of the box round the
//                nodes *both* boards have — anchored to the join, as cluster
//                is, so an arriving or departing node cannot rename its
//                neighbours' whereabouts
//   relation     the coarse direction between two nodes (above / left-of /
//                above-left …), computed only for pairs that are edge-connected
//                or co-clustered on either side — relations among things that
//                are actually related
//   prominence   node area against the median node on its own board: whether
//                someone drew it bigger than its neighbours
//
// WHAT THIS DELIBERATELY CANNOT EXPRESS — every one of these is a change a
// human can make that comes back as "no layout change", and the narrating agent
// must not claim otherwise:
//
//   · absolute position. A board dragged wholesale, zoomed, or redrawn at a
//     different scale reports nothing. That is the point.
//   · movement below the thresholds. A nudge that neither crosses a region
//     boundary nor breaks the 160px cluster gap is invisible.
//   · tidiness. Alignment, even spacing, orthogonal edge routing, straightened
//     arrows — no signal at all.
//   · edge geometry. An edge dragged round an obstacle keeps its endpoints, so
//     it reads as unchanged.
//   · ordering inside a cluster, unless the pair is edge-connected or
//     co-clustered (co-clustered pairs are, so this mostly bites between
//     clusters).
//   · region is relative to each side's own frame, so the two sides' thirds
//     are not the same physical place; `boxAspectDiverged` warns when the two
//     frames are shaped differently enough for that to matter. Below two
//     shared nodes there is nothing to anchor the frame to and each side falls
//     back to its own node box, where one far-flung node re-frames everything.
//   · a node left exactly where it was while the board was rearranged round it.
//     Its region name moved, but nothing about the node did, so no region
//     change is reported for it — the nodes that were moved report instead.
//   · absolute size, colour and stroke, which are reported per node as
//     `cosmetic` and never counted as a semantic change.
//
// ── Elements that are not nodes ────────────────────────────────
//
// A plain shape has no stable identity across independently authored boards, so
// diffing them element-by-element would be false precision: an unlabelled
// scratch box on each side is not "the same box" in any sense the tool can
// establish. They are therefore never added/removed/changed. They are still
// reported, because they carry information a human put there:
//
//   · a per-side inventory, exhaustive for labelled shapes;
//   · a label-match hint for labelled shapes present on one side only, marked
//     as the heuristic it is;
//   · `unidentified` — elements carrying archboard metadata but no node id,
//     which are the actionable ones: they are a promotion away from comparing;
//   · they participate as containment parents, which is how "someone drew a
//     boundary round these three" survives.

import { ServerElement } from '../types.js';
import { BoardIdentity } from './board.js';
import { labelOf } from './promote.js';
import { nodeIdOf, readElementMetadata } from './metadata.js';
import type { ArchboardBlock, LogicalAddress } from './metadata.js';
import {
  Box,
  BoundingBox,
  CLUSTER_GAP,
  boundingBoxOf,
  boxOf,
  clusterBoxes,
  regionName,
  sameCentre
} from './layout.js';

// ---------------------------------------------------------------------------
// Inputs and outputs
// ---------------------------------------------------------------------------

export interface CompareSideInput {
  key: string;
  identity: BoardIdentity;
  elements: ServerElement[];
  // Where the elements came from: the copy this session is holding (which may
  // carry unsaved work) or the note on disk. Reported because the two can
  // differ and the human needs to know which they are being told about.
  source: 'memory' | 'vault';
  file?: string;
  // Is this board in front of somebody in a pane right now? A comparison
  // never disturbs what is on screen, so this is only ever a remark.
  onScreen?: boolean;
  savedAt?: string;
  loadedAt?: string;
}

export interface SideSummary {
  board: string;
  identity: BoardIdentity;
  source: 'memory' | 'vault';
  file?: string;
  onScreen?: boolean;
  savedAt?: string;
  loadedAt?: string;
  elementCount: number;
  nodeCount: number;
  edgeCount: number;
  plainCount: number;
  // The box round every node on this board — a fact about the board itself.
  nodeBox: BoundingBox | null;
  // The box the region names on this side are thirds of. Drawn round the nodes
  // both boards have, so that a node present on only one side cannot rename
  // its neighbours' whereabouts; equal to `nodeBox` when the two boards share
  // fewer than two nodes and there is nothing better to anchor to.
  regionFrame: BoundingBox | null;
}

export interface NodeFacts {
  node: string;
  name: string;
  label?: string;
  declaredName?: string;
  kind?: string;
  level?: string;
  variant?: string;
  binding?: LogicalAddress | string;
  bindingText?: string;
  link?: string;
  extra?: Record<string, unknown>;
  elementIds: string[];
  elementCount: number;
  types: string[];
  cosmetic: { type: string; backgroundColor?: string; strokeColor?: string; width: number; height: number };
  layout: NodeLayout;
  degree: { in: number; out: number };
  out: string[];   // node ids this one points at
  in: string[];    // node ids pointing at it
}

export interface NodeLayout {
  cluster: string | null;
  clusterWith: string[];
  clusterSize: number;
  container: string | null;
  group: string | null;
  region: string;
  prominence: 'smaller' | 'typical' | 'larger';
}

export type FieldChange = { from: unknown; to: unknown };

export interface ChangedNode {
  node: string;
  name: string;
  changes: Record<string, FieldChange>;
  cosmeticChanges?: Record<string, FieldChange>;
  layoutChanges?: Record<string, FieldChange>;
  from: NodeFacts;
  to: NodeFacts;
}

export interface UnchangedNode {
  node: string;
  name: string;
  kind?: string;
  binding?: string;
  // Same architecture, different placement: still "stable" as a node, but the
  // human moved it and that is a statement of its own.
  layoutChanges?: Record<string, FieldChange>;
  cosmeticChanges?: Record<string, FieldChange>;
  facts: NodeFacts;
}

export interface EdgeFacts {
  from: string;
  to: string;
  label?: string;
  kind?: string;
  elementId: string;
  type: string;
  strokeStyle?: string;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  extra?: Record<string, unknown>;
  fromName: string;
  toName: string;
}

export interface ChangedEdge {
  from: string;
  to: string;
  changes: Record<string, FieldChange>;
  fromFacts: EdgeFacts;
  toFacts: EdgeFacts;
}

export interface UnresolvedConnector {
  elementId: string;
  type: string;
  label?: string;
  // What each end is attached to, said in whatever terms exist: a node id when
  // the end landed on a node, else the label of the plain element, else null
  // for an end bound to nothing at all.
  fromNode?: string;
  toNode?: string;
  fromLabel?: string;
  toLabel?: string;
  reason: string;
}

export interface PlainElement {
  id: string;
  type: string;
  label?: string;
  region: string;
  humanDrawn: boolean;
  link?: string;
  foreignCustomData?: Record<string, unknown>;
}

export interface PlainSide {
  count: number;
  byType: Record<string, number>;
  labelled: PlainElement[];
  unlabelled: Record<string, number>;
  // Carrying archboard metadata but no node id: one promotion away from being
  // comparable, so worth naming individually.
  unidentified: Array<{ id: string; type: string; label?: string; archboard: ArchboardBlock }>;
}

export interface ClusterFacts {
  id: string;
  region: string;
  size: number;
  members: string[];      // node ids
  names: string[];
}

export interface ClusterChange {
  kind: 'merged' | 'split' | 'formed' | 'dissolved' | 'stable';
  from: string[];         // cluster ids on the `from` side
  to: string[];           // cluster ids on the `to` side
  sharedMembers: string[];
  joined: string[];       // node ids in the `to` cluster(s) that were not in the `from` one(s)
  left: string[];         // node ids in the `from` cluster(s) that are not in the `to` one(s)
}

export interface RelationChange {
  a: string;
  b: string;
  from: string;
  to: string;
  related: 'edge' | 'cluster' | 'edge+cluster';
}

export interface CompareResult {
  success: true;
  from: SideSummary;
  to: SideSummary;
  summary: {
    // Did the join find anything to join on? False means the node and edge
    // sections say nothing because nothing could be compared — never that the
    // two boards agree.
    comparable: boolean;
    identical: boolean;
    sharedNodes: number;
    nodesAdded: number;
    nodesRemoved: number;
    nodesChanged: number;
    nodesUnchanged: number;
    nodesMovedOnly: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesChanged: number;
    edgesUnchanged: number;
    layoutSignalsChanged: number;
  };
  nodes: {
    added: NodeFacts[];
    removed: NodeFacts[];
    changed: ChangedNode[];
    unchanged: UnchangedNode[];
  };
  edges: {
    added: EdgeFacts[];
    removed: EdgeFacts[];
    changed: ChangedEdge[];
    unchanged: EdgeFacts[];
    // An inference layer over added/removed, not a replacement for it: a
    // removed and an added edge sharing exactly one endpoint, one-to-one.
    rerouted: Array<{ anchor: string; end: 'source' | 'target'; was: string; now: string; anchorName: string; wasName: string; nowName: string }>;
    unresolved: { from: UnresolvedConnector[]; to: UnresolvedConnector[] };
  };
  layout: {
    method: Record<string, string>;
    cannotExpress: string[];
    clusters: { from: ClusterFacts[]; to: ClusterFacts[]; changes: ClusterChange[] };
    groups: { from: ClusterFacts[]; to: ClusterFacts[]; changes: ClusterChange[] };
    moved: Array<{ node: string; name: string; changes: Record<string, FieldChange> }>;
    relations: { compared: number; changes: RelationChange[] };
    boxAspectDiverged: boolean;
  };
  plain: {
    from: PlainSide;
    to: PlainSide;
    // Label matching, and only label matching: a hint, never an identity claim.
    labelOnlyOnFrom: string[];
    labelOnlyOnTo: string[];
    labelOnBoth: string[];
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Reading a board into the node/edge model
// ---------------------------------------------------------------------------

const CONNECTOR_TYPES = new Set(['arrow', 'line']);
const CONTAINER_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'frame']);

// An arrow or a line is a connector until somebody promotes it. Promotion is
// an explicit act, so what an element carries outranks what it is drawn from,
// and only an element with no node id is read as a connector here (TASK-053).
const isConnector = (type: string) => CONNECTOR_TYPES.has(type);

function bindingEnd(el: any, end: 'start' | 'end'): string | undefined {
  const binding = end === 'start' ? el.startBinding : el.endBinding;
  return binding?.elementId ?? (end === 'start' ? el.start?.id : el.end?.id);
}

// A node is whatever carries its id, and an arrow can carry one, so this is
// measured through `boxOf` rather than read off `x, y, width, height`: an
// arrow's origin is its first point (TASK-038).
function unionBox(elements: ServerElement[]): Box {
  const boxes = elements.map(el => boxOf(el));
  const frame = boundingBoxOf(boxes);
  if (!frame) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: frame.minX, y: frame.minY, w: frame.maxX - frame.minX, h: frame.maxY - frame.minY };
}

function formatBinding(binding: LogicalAddress | string | undefined): string | undefined {
  if (binding === undefined) return undefined;
  if (typeof binding === 'string') return binding.trim() || undefined;
  const repo = binding.repo ? `${binding.repo}:` : '';
  const branch = binding.branch ? `@${binding.branch}` : '';
  const commit = binding.commit ? ` (${binding.commit.slice(0, 7)})` : '';
  return `${repo}${binding.path ?? '?'}${branch}${commit}`;
}

// What makes two bindings the same binding. Repo, path and branch: the address
// of the code. `commit` and `confirmedAt` are when it was last *confirmed*, and
// re-promoting an unchanged node moves both — treating that as a change would
// fill the diff with reconfirmation noise. Both are still carried in the facts.
function bindingIdentity(binding: LogicalAddress | string | undefined): string | undefined {
  if (binding === undefined) return undefined;
  if (typeof binding === 'string') return binding.trim() || undefined;
  const repo = binding.repo ? `${binding.repo}:` : '';
  const branch = binding.branch ? `@${binding.branch}` : '';
  return `${repo}${binding.path ?? '?'}${branch}`;
}

const ARCHBOARD_KNOWN = new Set(['node', 'kind', 'name', 'binding', 'variant', 'level']);

interface NodeModel {
  node: string;
  elements: ServerElement[];
  primary: ServerElement;
  label?: string;
  declaredName?: string;
  name: string;
  kind?: string;
  level?: string;
  variant?: string;
  binding?: LogicalAddress | string;
  link?: string;
  extra: Record<string, unknown>;
  box: Box;
  clusterId: string | null;
  container: string | null;
  group: string | null;
  region: string;
  prominence: 'smaller' | 'typical' | 'larger';
  out: string[];
  in: string[];
}

interface EdgeModel extends EdgeFacts {}

interface BoardModel {
  key: string;
  elements: ServerElement[];
  nodes: Map<string, NodeModel>;
  edges: EdgeModel[];
  unresolved: UnresolvedConnector[];
  plain: PlainSide;
  clusters: ClusterFacts[];
  groups: ClusterFacts[];
  nodeBox: BoundingBox | null;
  // Filled in by `reframeRegions` once both sides are built and the join is
  // known — every `region` on this model is thirds of it.
  regionFrame: BoundingBox | null;
  warnings: string[];
}

function labelOfAll(el: ServerElement, all: ServerElement[]): string | undefined {
  const text = labelOf(el, all);
  return text ? String(text).replace(/\s+/g, ' ').trim() || undefined : undefined;
}

function buildBoard(input: CompareSideInput): BoardModel {
  const all = input.elements;
  const byId = new Map(all.map(el => [el.id, el]));
  const warnings: string[] = [];

  // Bound labels belong to their container, exactly as `describe` folds them,
  // so a labelled shape is one thing and not two.
  const boundLabelOf = new Set<string>();
  for (const el of all) {
    const container = (el as any).containerId;
    if (el.type === 'text' && container && container !== el.id && byId.has(container)) {
      boundLabelOf.add(el.id);
    }
  }

  // --- nodes: elements grouped by node id -----------------------------------
  //
  // Every element carrying a node id, whatever it is drawn from. A stencil is
  // an arbitrary set of primitives, and the shipped PostgreSQL one is seven
  // lines, so a type test here made promoting it report success and produce a
  // node no reader could see (TASK-053).
  const groupsByNode = new Map<string, ServerElement[]>();
  const nodeOfElement = new Map<string, string>();
  for (const el of all) {
    const id = nodeIdOf(el);
    if (!id) continue;
    const list = groupsByNode.get(id) ?? [];
    list.push(el);
    groupsByNode.set(id, list);
    nodeOfElement.set(el.id, id);
  }
  // A bound label whose container is a node is part of that node whether or not
  // promotion got round to stamping it.
  for (const el of all) {
    const container = (el as any).containerId;
    if (!boundLabelOf.has(el.id) || !container) continue;
    const id = nodeOfElement.get(container);
    if (!id || nodeOfElement.has(el.id)) continue;
    groupsByNode.get(id)!.push(el);
    nodeOfElement.set(el.id, id);
  }

  const models: NodeModel[] = [];
  for (const [id, elements] of groupsByNode) {
    const shapes = elements.filter(el => !boundLabelOf.has(el.id));
    const area = (el: ServerElement) => { const b = boxOf(el); return b.w * b.h; };
    const ranked = [...(shapes.length ? shapes : elements)].sort((a, b) => area(b) - area(a));
    const primary = ranked[0]!;

    // Merge the archboard block across the node's elements, primary first:
    // promotion writes the same block to every member, but a user-edited board
    // may only carry it on one.
    const block: ArchboardBlock = {};
    for (const el of [primary, ...elements]) {
      const b = readElementMetadata(el).archboard;
      if (!b) continue;
      for (const [k, v] of Object.entries(b)) {
        if (block[k] === undefined && v !== undefined) block[k] = v;
      }
    }

    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(block)) {
      if (!ARCHBOARD_KNOWN.has(k)) extra[k] = v;
    }

    const label = labelOfAll(primary, all) ?? elements.map(el => labelOfAll(el, all)).find(Boolean);
    const declaredName = typeof block.name === 'string' && block.name ? block.name : undefined;
    const link = elements.map(el => el.link).find(l => typeof l === 'string' && l) as string | undefined;

    models.push({
      node: id,
      elements,
      primary,
      ...(label ? { label } : {}),
      ...(declaredName ? { declaredName } : {}),
      name: label ?? declaredName ?? id,
      ...(typeof block.kind === 'string' ? { kind: block.kind } : {}),
      ...(typeof block.level === 'string' ? { level: block.level } : {}),
      ...(typeof block.variant === 'string' ? { variant: block.variant } : {}),
      ...(block.binding !== undefined ? { binding: block.binding as LogicalAddress | string } : {}),
      ...(link ? { link } : {}),
      extra,
      box: unionBox(elements),
      clusterId: null,
      container: null,
      group: null,
      region: 'centre',
      prominence: 'typical',
      out: [],
      in: []
    });
  }

  const nodes = new Map(models.map(m => [m.node, m]));

  // A node whose recorded variant is not the board's own was copied from
  // another variant and never re-promoted. Not harmless: `variantAnomaly` is a
  // semantic field, so every such node is reported as changed, and a board
  // full of them buries whatever the real difference was. Branching restamps
  // the copy (`restampVariant`, TASK-035) precisely so this stays rare enough
  // to be worth saying out loud. When it does fire it is the trace of a copy,
  // and the human is usually the only one who knows whether it was deliberate.
  const stale = models.filter(m => m.variant && m.variant !== input.identity.variant);
  if (stale.length > 0) {
    warnings.push(
      `On "${input.key}" ${stale.length} node(s) record a different variant than the board itself ` +
      `("${input.identity.variant}"): ` +
      stale.map(m => `${m.node} says "${m.variant}"`).join(', ') +
      '. Usually the trace of a board copied from another variant without re-promoting.'
    );
  }

  // --- edges: connectors resolved to node ids -------------------------------
  //
  // A promoted connector is skipped, because it is already a node up above and
  // the two loops have to divide the board rather than overlap it.
  // `promotedConnectors` collects the ones that would have been edges, so the
  // human hears what the promotion cost instead of watching a dependency
  // disappear.
  const edges: EdgeModel[] = [];
  const unresolved: UnresolvedConnector[] = [];
  const promotedConnectors: Array<{ node: string; from: string; to: string }> = [];
  for (const el of all) {
    if (!isConnector(el.type)) continue;
    const startId = bindingEnd(el as any, 'start');
    const endId = bindingEnd(el as any, 'end');
    const ownNode = nodeOfElement.get(el.id);
    if (ownNode) {
      const from = startId ? nodeOfElement.get(startId) : undefined;
      const to = endId ? nodeOfElement.get(endId) : undefined;
      // Two different nodes at its ends is what made it an edge. A connector
      // inside a stencil binds elements of the one node it belongs to, and
      // that was never a dependency, so it goes quietly.
      if (from && to && from !== to) promotedConnectors.push({ node: ownNode, from, to });
      continue;
    }
    const fromNode = startId ? nodeOfElement.get(startId) : undefined;
    const toNode = endId ? nodeOfElement.get(endId) : undefined;
    const block = readElementMetadata(el).archboard ?? {};
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(block)) {
      if (!ARCHBOARD_KNOWN.has(k)) extra[k] = v;
    }
    const label = labelOfAll(el, all);

    if (fromNode && toNode) {
      edges.push({
        from: fromNode,
        to: toNode,
        ...(label ? { label } : {}),
        ...(typeof block.kind === 'string' ? { kind: block.kind } : {}),
        elementId: el.id,
        type: el.type,
        ...(el.strokeStyle ? { strokeStyle: el.strokeStyle } : {}),
        ...((el as any).startArrowhead !== undefined ? { startArrowhead: (el as any).startArrowhead } : {}),
        ...((el as any).endArrowhead !== undefined ? { endArrowhead: (el as any).endArrowhead } : {}),
        ...(Object.keys(extra).length ? { extra } : {}),
        fromName: nodes.get(fromNode)?.name ?? fromNode,
        toName: nodes.get(toNode)?.name ?? toNode
      });
      continue;
    }

    const endLabel = (id: string | undefined) =>
      (id && byId.get(id) ? labelOfAll(byId.get(id)!, all) : undefined);
    unresolved.push({
      elementId: el.id,
      type: el.type,
      ...(label ? { label } : {}),
      ...(fromNode ? { fromNode } : {}),
      ...(toNode ? { toNode } : {}),
      ...(endLabel(startId) ? { fromLabel: endLabel(startId)! } : {}),
      ...(endLabel(endId) ? { toLabel: endLabel(endId)! } : {}),
      reason: !startId && !endId
        ? 'drawn but bound to nothing at either end'
        : !fromNode && !toNode
          ? 'both ends land on elements that are not nodes'
          : `the ${fromNode ? 'target' : 'source'} end lands on an element that is not a node`
    });
  }

  // A connector that was promoted and also joins two other nodes is the one
  // case where reading it as a node loses something: it used to be a
  // dependency, and now it is part of a shape. Usually the trace of a
  // selection that swept up an arrow it did not mean. Demote it to get the
  // edge back.
  const nameOfNode = (id: string) => nodes.get(id)?.name ?? id;
  for (const { node, from, to } of promotedConnectors) {
    warnings.push(
      `On "${input.key}" node "${nameOfNode(node)}" includes a connector drawn from ` +
      `"${nameOfNode(from)}" to "${nameOfNode(to)}". A promoted element is part of its node, so that ` +
      'connection is not compared as an edge. Demote the connector if it was meant to be one.'
    );
  }

  for (const edge of edges) {
    nodes.get(edge.from)?.out.push(edge.to);
    nodes.get(edge.to)?.in.push(edge.from);
  }

  // --- layout signals -------------------------------------------------------
  const nodeBox = boundingBoxOf(models.map(m => m.box));

  // Clusters. A cluster gets a synthetic id per side; the thing that compares
  // across sides is its *membership*, never its id.
  const clusterOf = new Map<string, string>();
  const clusters: ClusterFacts[] = [];
  const clusterItems = models.map(m => ({ ...m.box, node: m.node, name: m.name }));
  const grouped = clusterBoxes(clusterItems, CLUSTER_GAP);
  grouped.forEach((group, i) => {
    const id = `c${i + 1}`;
    const cx = group.reduce((s, g) => s + g.x + g.w / 2, 0) / group.length;
    const cy = group.reduce((s, g) => s + g.y + g.h / 2, 0) / group.length;
    for (const g of group) clusterOf.set(g.node, id);
    clusters.push({
      id,
      region: nodeBox ? regionName(cx, cy, nodeBox) : 'centre',
      size: group.length,
      members: group.map(g => g.node).sort(),
      names: group.map(g => g.name)
    });
  });

  // Explicit Excalidraw groups, as a second partition of node ids. Group ids
  // are random per board, so again only membership compares.
  const byGroupId = new Map<string, string[]>();
  for (const m of models) {
    for (const gid of (m.primary.groupIds ?? [])) {
      const list = byGroupId.get(gid) ?? [];
      if (!list.includes(m.node)) list.push(m.node);
      byGroupId.set(gid, list);
    }
  }
  const groups: ClusterFacts[] = [];
  const groupOf = new Map<string, string>();
  let groupIndex = 0;
  for (const [, members] of [...byGroupId.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (members.length < 2) continue;   // a group of one says nothing
    const id = `g${++groupIndex}`;
    for (const node of members) groupOf.set(node, id);
    groups.push({
      id,
      region: 'n/a',
      size: members.length,
      members: [...members].sort(),
      names: members.map(n => nodes.get(n)?.name ?? n)
    });
  }

  // Containment: the smallest shape that strictly contains a node, whether that
  // shape is another node or a plain box someone drew round a subsystem.
  const containerCandidates = all.filter(el =>
    CONTAINER_TYPES.has(el.type) && (el.width || 0) > 0 && (el.height || 0) > 0);
  const containerKey = (el: ServerElement): string => {
    const node = nodeOfElement.get(el.id);
    if (node) return `node:${node}`;
    const label = labelOfAll(el, all);
    if (label) return `label:${label}`;
    return `unlabelled-${el.type}`;
  };
  let anonymousContainer = false;
  for (const m of models) {
    let best: ServerElement | undefined;
    let bestArea = Infinity;
    const b = m.box;
    for (const cand of containerCandidates) {
      if (nodeOfElement.get(cand.id) === m.node) continue;
      // Measured, like everything else, though CONTAINER_TYPES carries no path
      // today: the rule is the same rule wherever a box is read (TASK-038).
      const c = boxOf(cand);
      const area = c.w * c.h;
      const contains = c.x <= b.x && c.y <= b.y &&
        c.x + c.w >= b.x + b.w && c.y + c.h >= b.y + b.h;
      if (!contains || area <= b.w * b.h * 1.2) continue;
      if (area < bestArea) { best = cand; bestArea = area; }
    }
    if (best) {
      m.container = containerKey(best);
      if (m.container.startsWith('unlabelled-')) anonymousContainer = true;
    }
  }
  if (anonymousContainer) {
    warnings.push(
      `On "${input.key}" at least one node sits inside an unlabelled shape. An unlabelled container has ` +
      'no identity that survives to the other board, so it compares only as "unlabelled-<type>" — label ' +
      'it, or promote it, to make the boundary comparable.'
    );
  }

  // Region and prominence.
  const areas = models.map(m => m.box.w * m.box.h).filter(a => a > 0).sort((a, b) => a - b);
  const median = areas.length ? areas[Math.floor(areas.length / 2)]! : 0;
  for (const m of models) {
    m.clusterId = clusterOf.get(m.node) ?? null;
    m.group = groupOf.get(m.node) ?? null;
    m.region = nodeBox ? regionName(m.box.x + m.box.w / 2, m.box.y + m.box.h / 2, nodeBox) : 'centre';
    const area = m.box.w * m.box.h;
    m.prominence = median <= 0 ? 'typical'
      : area < median * 0.6 ? 'smaller'
        : area > median * 1.7 ? 'larger'
          : 'typical';
    // A node whose elements are scattered is still one node — that is what the
    // id says — but the human should hear about it, because it is usually a
    // stray element that got promoted along with the box.
    if (m.elements.length > 1) {
      const spread = clusterBoxes(m.elements.map(el => boxOf(el)), CLUSTER_GAP);
      if (spread.length > 1) {
        warnings.push(
          `On "${input.key}" node "${m.node}" is made of ${m.elements.length} elements that sit in ` +
          `${spread.length} separate places on the board. It compares as one node; its geometry is the ` +
          'box round all of them, which will read as larger and vaguer than what anyone drew.'
        );
      }
    }
  }

  // --- plain elements -------------------------------------------------------
  //
  // Whatever belongs to no node, is no connector and labels nothing. A
  // promoted connector falls out on the first test, so the three passes still
  // divide the board between them.
  const plainElements = all.filter(el =>
    !nodeOfElement.has(el.id) && !isConnector(el.type) && !boundLabelOf.has(el.id));
  const byType: Record<string, number> = {};
  const unlabelled: Record<string, number> = {};
  const labelled: PlainElement[] = [];
  const unidentified: PlainSide['unidentified'] = [];
  for (const el of plainElements) {
    byType[el.type] = (byType[el.type] || 0) + 1;
    const label = labelOfAll(el, all);
    const metadata = readElementMetadata(el);
    const block = metadata.archboard;
    if (block) {
      unidentified.push({ id: el.id, type: el.type, ...(label ? { label } : {}), archboard: block });
    }
    const foreign = metadata.foreign;
    if (label) {
      const b = boxOf(el);
      labelled.push({
        id: el.id,
        type: el.type,
        label,
        region: nodeBox ? regionName(b.x + b.w / 2, b.y + b.h / 2, nodeBox) : 'centre',
        humanDrawn: el.source === 'frontend_sync',
        ...(el.link ? { link: el.link } : {}),
        ...(Object.keys(foreign).length ? { foreignCustomData: foreign } : {})
      });
    } else {
      unlabelled[el.type] = (unlabelled[el.type] || 0) + 1;
    }
  }

  return {
    key: input.key,
    elements: all,
    nodes,
    edges,
    unresolved,
    plain: { count: plainElements.length, byType, labelled, unlabelled, unidentified },
    clusters,
    groups,
    nodeBox,
    // Provisional: thirds of this board's own nodes, which is the only frame
    // available before the other side is known. `reframeRegions` replaces it.
    regionFrame: nodeBox,
    warnings
  };
}

// Re-draw the frame the region names are thirds of, now that both sides exist.
//
// Region is the one layout signal whose *name* depends on something other than
// the node it describes. The frame is the box round the nodes, so a node that
// arrives at the edge of the board — or leaves it — stretches or shrinks the
// frame and hands every other node a new region name. The diff then reports
// nodes nobody touched as having moved, and the change feed states that in
// prose: "Payment Events moved". It is noise in `compare` and a false claim
// about a human in the feed.
//
// So the frame is drawn round the nodes the join actually joined, exactly as
// the cluster signal already restricts itself to shared membership. Arriving
// and departing nodes are still *placed* in that frame — a node added off to
// the right is reported at the right — they just no longer redraw it.
//
// Below two shared nodes there is nothing to anchor to (one node's box, or
// none, gives a frame that names everything "centre"), so the board's own node
// box stands and the pre-existing caveat applies unchanged.
function reframeRegions(model: BoardModel, shared: Set<string>): void {
  const anchors = [...model.nodes.values()].filter(m => shared.has(m.node)).map(m => m.box);
  const frame = anchors.length >= 2 ? boundingBoxOf(anchors) : model.nodeBox;
  model.regionFrame = frame;
  const at = (x: number, y: number, w: number, h: number) =>
    frame ? regionName(x + w / 2, y + h / 2, frame) : 'centre';

  for (const m of model.nodes.values()) m.region = at(m.box.x, m.box.y, m.box.w, m.box.h);

  for (const cluster of model.clusters) {
    const boxes = cluster.members.map(n => model.nodes.get(n)?.box).filter((b): b is Box => !!b);
    if (boxes.length === 0) continue;
    const cx = boxes.reduce((s, b) => s + b.x + b.w / 2, 0) / boxes.length;
    const cy = boxes.reduce((s, b) => s + b.y + b.h / 2, 0) / boxes.length;
    cluster.region = frame ? regionName(cx, cy, frame) : 'centre';
  }

  const byId = new Map(model.elements.map(el => [el.id, el]));
  for (const plain of model.plain.labelled) {
    const el = byId.get(plain.id);
    if (!el) continue;
    const b = boxOf(el);
    plain.region = at(b.x, b.y, b.w, b.h);
  }
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const canonical = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : 1));
    return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(',')}}`;
  };
  return canonical(a) === canonical(b);
}

function nodeFacts(m: NodeModel, clusters: ClusterFacts[]): NodeFacts {
  const cluster = clusters.find(c => c.id === m.clusterId);
  return {
    node: m.node,
    name: m.name,
    ...(m.label ? { label: m.label } : {}),
    ...(m.declaredName ? { declaredName: m.declaredName } : {}),
    ...(m.kind ? { kind: m.kind } : {}),
    ...(m.level ? { level: m.level } : {}),
    ...(m.variant ? { variant: m.variant } : {}),
    ...(m.binding !== undefined ? { binding: m.binding } : {}),
    ...(formatBinding(m.binding) ? { bindingText: formatBinding(m.binding)! } : {}),
    ...(m.link ? { link: m.link } : {}),
    ...(Object.keys(m.extra).length ? { extra: m.extra } : {}),
    elementIds: m.elements.map(el => el.id),
    elementCount: m.elements.length,
    types: [...new Set(m.elements.map(el => el.type))],
    cosmetic: {
      type: m.primary.type,
      ...(m.primary.backgroundColor ? { backgroundColor: m.primary.backgroundColor } : {}),
      ...(m.primary.strokeColor ? { strokeColor: m.primary.strokeColor } : {}),
      width: Math.round(m.box.w),
      height: Math.round(m.box.h)
    },
    layout: {
      cluster: m.clusterId,
      // Who it sits with, not where: the set is what compares across boards.
      clusterWith: cluster ? cluster.members.filter(n => n !== m.node) : [],
      clusterSize: cluster ? cluster.size : 0,
      container: m.container,
      group: m.group,
      region: m.region,
      prominence: m.prominence
    },
    degree: { in: m.in.length, out: m.out.length },
    out: [...m.out].sort(),
    in: [...m.in].sort()
  };
}

function diffFields(
  from: Record<string, unknown>,
  to: Record<string, unknown>
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (!sameJson(from[key], to[key])) {
      changes[key] = { from: from[key] ?? null, to: to[key] ?? null };
    }
  }
  return changes;
}

function semanticFields(m: NodeModel, boardVariant: string): Record<string, unknown> {
  return {
    label: m.label,
    declaredName: m.declaredName,
    kind: m.kind,
    level: m.level,
    // NOT the node's raw `variant`. Promotion stamps every node with the
    // variant it was promoted under, so on `payments` every node says "current"
    // and on `payments@option-a` every node says "option-a" — comparing that is
    // comparing the two filenames, and it would report all six nodes as changed
    // and leave nothing for "what is stable". What is worth diffing is
    // *disagreement*: a node still claiming the variant it was copied from,
    // which means it was never re-promoted. The raw value is in the facts on
    // both sides either way.
    variantAnomaly: m.variant && m.variant !== boardVariant ? m.variant : undefined,
    binding: bindingIdentity(m.binding),
    link: m.link,
    elementCount: m.elements.length,
    ...(Object.keys(m.extra).length ? { extra: m.extra } : {})
  };
}

function cosmeticFields(m: NodeModel): Record<string, unknown> {
  return {
    shape: m.primary.type,
    backgroundColor: m.primary.backgroundColor,
    strokeColor: m.primary.strokeColor,
    width: Math.round(m.box.w),
    height: Math.round(m.box.h)
  };
}

function layoutFields(
  m: NodeModel,
  clusters: ClusterFacts[],
  groups: ClusterFacts[],
  shared: Set<string>
): Record<string, unknown> {
  // A cluster is named by its membership, never by its synthetic id — the ids
  // are per-side and comparing them would report a change every time a cluster
  // changed rank. What is compared is the set of *other nodes* it sits with,
  // which is what "together" actually means.
  //
  // Restricted to nodes that exist on both boards: a node that only ever
  // existed on one side joining this cluster is a fact about that node, and it
  // is reported in that node's own facts. Counting it here as well would make
  // every neighbour of an added node look like it had been moved.
  const companions = (list: ClusterFacts[], id: string | null, onlyShared: boolean) => {
    const found = list.find(c => c.id === id);
    if (!found) return [];
    return found.members.filter(n => n !== m.node && (!onlyShared || shared.has(n)));
  };
  return {
    cluster: companions(clusters, m.clusterId, true),
    // A group compares the same way — by who is in it — but unrestricted.
    // Proximity is incidental, so a new neighbour must not read as movement;
    // grouping is an explicit act *about* the nodes named in it, so being
    // grouped with a node that is new is exactly the statement being made.
    group: m.group ? companions(groups, m.group, false) : null,
    container: m.container,
    region: m.region,
    prominence: m.prominence
  };
}

// Partition diff, used for both proximity clusters and explicit groups. The
// correspondence is by shared membership: a `to` cluster fed by two `from`
// clusters is a merge, a `from` cluster whose members land in two `to` clusters
// is a split, and a cluster made only of new nodes was formed.
function diffPartitions(from: ClusterFacts[], to: ClusterFacts[]): ClusterChange[] {
  const fromOf = new Map<string, string>();
  for (const c of from) for (const n of c.members) fromOf.set(n, c.id);
  const toOf = new Map<string, string>();
  for (const c of to) for (const n of c.members) toOf.set(n, c.id);

  const changes: ClusterChange[] = [];
  const seenFrom = new Set<string>();

  for (const t of to) {
    const sources = new Set(t.members.map(n => fromOf.get(n)).filter(Boolean) as string[]);
    const shared = t.members.filter(n => fromOf.has(n));
    for (const s of sources) seenFrom.add(s);

    if (sources.size === 0) {
      changes.push({ kind: 'formed', from: [], to: [t.id], sharedMembers: [], joined: t.members, left: [] });
      continue;
    }
    const sourceMembers = new Set<string>();
    for (const s of sources) {
      const c = from.find(x => x.id === s)!;
      for (const n of c.members) sourceMembers.add(n);
    }
    const joined = t.members.filter(n => !sourceMembers.has(n));
    const left = [...sourceMembers].filter(n => toOf.get(n) !== t.id);
    // Did any source cluster lose members to a different `to` cluster?
    const splitSources = [...sources].filter(s => {
      const c = from.find(x => x.id === s)!;
      return new Set(c.members.map(n => toOf.get(n) ?? '·gone')).size > 1;
    });
    const kind: ClusterChange['kind'] = sources.size > 1 ? 'merged'
      : splitSources.length > 0 ? 'split'
        : joined.length === 0 && left.length === 0 ? 'stable' : 'split';
    changes.push({
      kind,
      from: [...sources].sort(),
      to: [t.id],
      sharedMembers: shared.sort(),
      joined: joined.sort(),
      left: left.sort()
    });
  }

  for (const f of from) {
    if (seenFrom.has(f.id)) continue;
    changes.push({ kind: 'dissolved', from: [f.id], to: [], sharedMembers: [], joined: [], left: f.members });
  }

  return changes;
}

// Coarse direction from a to b: which way a human would point. The dominant
// axis names the relation and the other axis qualifies it when it is at least
// half as large, so a box diagonally up-left reads as "above-left" and not as
// an arbitrary pick between the two.
function relationOf(a: Box, b: Box): string {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const dx = bx - ax, dy = by - ay;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < 1 && ady < 1) return 'on-top-of';
  const horizontal = dx > 0 ? 'left-of' : 'right-of';   // a is left-of b when b is further right
  const vertical = dy > 0 ? 'above' : 'below';
  if (adx >= ady) return ady >= adx * 0.5 ? `${vertical}-${horizontal === 'left-of' ? 'left' : 'right'}` : horizontal;
  return adx >= ady * 0.5 ? `${vertical}-${horizontal === 'left-of' ? 'left' : 'right'}` : vertical;
}

// The pairwise pass is the only place with a budget, and it is declared rather
// than applied silently. Users create boards interactively, so this is
// generous by two orders of magnitude for anything real.
const MAX_RELATION_PAIRS = 20000;

// ---------------------------------------------------------------------------
// Edge matching
// ---------------------------------------------------------------------------

const edgeKey = (e: EdgeFacts) => `${e.from}\0${e.to}`;

function matchEdges(from: EdgeModel[], to: EdgeModel[]): {
  added: EdgeFacts[];
  removed: EdgeFacts[];
  changed: ChangedEdge[];
  unchanged: EdgeFacts[];
} {
  const bucket = (list: EdgeModel[]) => {
    const map = new Map<string, EdgeModel[]>();
    for (const e of list) {
      const key = edgeKey(e);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  };
  const fromMap = bucket(from);
  const toMap = bucket(to);

  const added: EdgeFacts[] = [];
  const removed: EdgeFacts[] = [];
  const changed: ChangedEdge[] = [];
  const unchanged: EdgeFacts[] = [];

  const edgeFields = (e: EdgeModel): Record<string, unknown> => ({
    label: e.label,
    kind: e.kind,
    connector: e.type,
    strokeStyle: e.strokeStyle,
    startArrowhead: e.startArrowhead,
    endArrowhead: e.endArrowhead,
    ...(e.extra ? { extra: e.extra } : {})
  });

  for (const key of new Set([...fromMap.keys(), ...toMap.keys()])) {
    const lefts = [...(fromMap.get(key) ?? [])];
    const rights = [...(toMap.get(key) ?? [])];

    // Parallel edges between the same pair: match by label first, so renaming
    // one of two arrows does not read as one removed and one added.
    for (let i = lefts.length - 1; i >= 0; i--) {
      const j = rights.findIndex(r => (r.label ?? '') === (lefts[i]!.label ?? ''));
      if (j === -1) continue;
      const l = lefts.splice(i, 1)[0]!;
      const r = rights.splice(j, 1)[0]!;
      const changes = diffFields(edgeFields(l), edgeFields(r));
      if (Object.keys(changes).length === 0) unchanged.push(r);
      else changed.push({ from: r.from, to: r.to, changes, fromFacts: l, toFacts: r });
    }
    // Whatever is left pairs up positionally: same endpoints, different label.
    while (lefts.length && rights.length) {
      const l = lefts.shift()!;
      const r = rights.shift()!;
      const changes = diffFields(edgeFields(l), edgeFields(r));
      if (Object.keys(changes).length === 0) unchanged.push(r);
      else changed.push({ from: r.from, to: r.to, changes, fromFacts: l, toFacts: r });
    }
    removed.push(...lefts);
    added.push(...rights);
  }

  return { added, removed, changed, unchanged };
}

// Reroutes: a removed edge and an added edge that share exactly one endpoint,
// one-to-one on that endpoint. An inference, offered alongside added/removed
// rather than instead of it, because "A now points at C instead of B" is the
// sentence a human would say and reconstructing it from two lists is work the
// consumer should not have to redo.
function inferReroutes(
  removed: EdgeFacts[],
  added: EdgeFacts[]
): CompareResult['edges']['rerouted'] {
  const out: CompareResult['edges']['rerouted'] = [];
  const byAnchor = (list: EdgeFacts[], end: 'source' | 'target') => {
    const map = new Map<string, EdgeFacts[]>();
    for (const e of list) {
      const anchor = end === 'source' ? e.from : e.to;
      const arr = map.get(anchor) ?? [];
      arr.push(e);
      map.set(anchor, arr);
    }
    return map;
  };
  for (const end of ['source', 'target'] as const) {
    const rem = byAnchor(removed, end);
    const add = byAnchor(added, end);
    for (const [anchor, rs] of rem) {
      const as = add.get(anchor);
      if (!as || rs.length !== 1 || as.length !== 1) continue;
      const r = rs[0]!, a = as[0]!;
      const was = end === 'source' ? r.to : r.from;
      const now = end === 'source' ? a.to : a.from;
      if (was === now) continue;
      out.push({
        anchor,
        end,
        was,
        now,
        anchorName: end === 'source' ? a.fromName : a.toName,
        wasName: end === 'source' ? r.toName : r.fromName,
        nowName: end === 'source' ? a.toName : a.fromName
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

const LAYOUT_METHOD: Record<string, string> = {
  cluster: `Which other nodes this one sits within ${CLUSTER_GAP}px of, as a set of node ids. Membership, ` +
    'not position: a cluster that was dragged across the board unchanged reports nothing.',
  container: 'The smallest shape strictly containing the node — a boundary someone drew round a subsystem. ' +
    'Keyed by node id when the container is itself a node, else by its label.',
  group: 'Excalidraw group membership, as a set of node ids. Excalidraw group ids are random per board, so ' +
    'only the membership compares.',
  region: 'Whereabouts on the board, in thirds of the box round the nodes both boards have (reported per ' +
    'side as regionFrame). Anchored to the shared nodes so that a node present on only one side cannot ' +
    'rename its neighbours\' whereabouts; nodes on one side only are still placed in that frame, and are ' +
    'clamped to an edge third when they sit outside it. Reported as a change only when the node\'s own ' +
    'centre moved, so a region name that shifted because the frame did is not called movement. Still ' +
    'relative to each side\'s own frame, so the two sides\' thirds are not the same physical place — see ' +
    'boxAspectDiverged.',
  relation: 'Coarse direction between two nodes (above / below / left-of / right-of / above-left …), computed ' +
    'only for pairs that are edge-connected or co-clustered on either side.',
  prominence: 'Node area against the median node on its own board: smaller / typical / larger. Relative, so ' +
    'a board drawn at a different scale reports nothing.'
};

const LAYOUT_CANNOT_EXPRESS = [
  'Absolute position. A board panned, zoomed or redrawn at another scale reports no layout change — deliberate.',
  `Movement below the thresholds: a nudge that neither crosses a region third nor breaks the ${CLUSTER_GAP}px cluster gap is invisible.`,
  'Tidiness: alignment, even spacing, straightened or orthogonal edges produce no signal at all.',
  'Edge geometry: an edge dragged round an obstacle keeps its endpoints and reads as unchanged.',
  'Ordering between clusters that share no edge — relations are only computed for pairs that are edge-connected or co-clustered.',
  'Region names are relative to each side\'s own frame — the box round the nodes both boards have — so "top-left" on one is not the same physical place as on the other; see boxAspectDiverged.',
  'A node that stayed exactly where it was while the board was rearranged round it reports no region change, because its region name only moved when the frame did. The nodes that were actually moved still report; read those.',
  'Where two boards share fewer than two nodes there is nothing to anchor the frame to, so each side is framed by its own nodes and one far-flung node re-frames every region on that side.',
  'Size, colour and stroke are reported per node as `cosmetic` and never counted as a change to the architecture.'
];

export function compareBoards(fromInput: CompareSideInput, toInput: CompareSideInput): CompareResult {
  const A = buildBoard(fromInput);
  const B = buildBoard(toInput);
  const warnings = [...A.warnings, ...B.warnings];

  // The nodes the join actually joined. Layout is only compared in terms of
  // these, so an added node cannot make its neighbours look like they moved:
  // cluster membership ignores them (see `layoutFields`) and the region frame
  // is drawn round them and nothing else.
  const sharedIds = new Set([...A.nodes.keys()].filter(id => B.nodes.has(id)));
  reframeRegions(A, sharedIds);
  reframeRegions(B, sharedIds);

  const side = (input: CompareSideInput, model: BoardModel): SideSummary => ({
    board: input.key,
    identity: input.identity,
    source: input.source,
    ...(input.file ? { file: input.file } : {}),
    ...(input.onScreen !== undefined ? { onScreen: input.onScreen } : {}),
    ...(input.savedAt ? { savedAt: input.savedAt } : {}),
    ...(input.loadedAt ? { loadedAt: input.loadedAt } : {}),
    elementCount: input.elements.length,
    nodeCount: model.nodes.size,
    edgeCount: model.edges.length,
    plainCount: model.plain.count,
    nodeBox: model.nodeBox,
    regionFrame: model.regionFrame
  });

  // --- nodes ----------------------------------------------------------------
  const allNodeIds = new Set([...A.nodes.keys(), ...B.nodes.keys()]);
  const added: NodeFacts[] = [];
  const removed: NodeFacts[] = [];
  const changed: ChangedNode[] = [];
  const unchanged: UnchangedNode[] = [];
  const moved: CompareResult['layout']['moved'] = [];
  let layoutSignalsChanged = 0;
  let shared = 0;

  for (const id of [...allNodeIds].sort()) {
    const a = A.nodes.get(id);
    const b = B.nodes.get(id);
    if (a && !b) { removed.push(nodeFacts(a, A.clusters)); continue; }
    if (!a && b) { added.push(nodeFacts(b, B.clusters)); continue; }
    if (!a || !b) continue;
    shared++;

    const semantic = diffFields(
      semanticFields(a, fromInput.identity.variant),
      semanticFields(b, toInput.identity.variant)
    );
    const cosmetic = diffFields(cosmeticFields(a), cosmeticFields(b));
    const layout = diffFields(
      layoutFields(a, A.clusters, A.groups, sharedIds),
      layoutFields(b, B.clusters, B.groups, sharedIds)
    );
    // Anchoring the frame to the shared nodes stops arrivals and departures
    // renaming anybody's region, but a *shared* node dragged to a new extreme
    // still stretches the frame, and its stationary neighbours are handed new
    // region names for it. Region is read off the centre and nothing else, so
    // a centre that did not move is proof the new name came from the frame:
    // report it and the feed says "X moved", which is false about X.
    //
    // Only ever true when both sides are in one coordinate system — the same
    // board a moment apart, or a variant copied from its sibling — which is
    // exactly where "moved" is read as a claim about something someone did.
    // Two independently drawn variants never trip it, and there the anchored
    // frame carries the weight on its own.
    //
    // A board rearranged wholesale is untouched by this: every centre moved,
    // so nothing is suppressed and every move is still reported.
    if (layout.region && sameCentre(a.box, b.box)) delete layout.region;
    layoutSignalsChanged += Object.keys(layout).length;
    if (Object.keys(layout).length > 0) {
      moved.push({ node: id, name: b.name, changes: layout });
    }

    if (Object.keys(semantic).length > 0) {
      changed.push({
        node: id,
        name: b.name,
        changes: semantic,
        ...(Object.keys(cosmetic).length ? { cosmeticChanges: cosmetic } : {}),
        ...(Object.keys(layout).length ? { layoutChanges: layout } : {}),
        from: nodeFacts(a, A.clusters),
        to: nodeFacts(b, B.clusters)
      });
    } else {
      unchanged.push({
        node: id,
        name: b.name,
        ...(b.kind ? { kind: b.kind } : {}),
        ...(formatBinding(b.binding) ? { binding: formatBinding(b.binding)! } : {}),
        ...(Object.keys(layout).length ? { layoutChanges: layout } : {}),
        ...(Object.keys(cosmetic).length ? { cosmeticChanges: cosmetic } : {}),
        facts: nodeFacts(b, B.clusters)
      });
    }
  }

  // --- edges ----------------------------------------------------------------
  const edgeDiff = matchEdges(A.edges, B.edges);
  const rerouted = inferReroutes(edgeDiff.removed, edgeDiff.added);

  // --- layout ---------------------------------------------------------------
  const clusterChanges = diffPartitions(A.clusters, B.clusters);
  const groupChanges = diffPartitions(A.groups, B.groups);

  // Relations, over the pairs that are actually related on either side.
  const relatedPairs = new Set<string>();
  const pairKey = (x: string, y: string) => (x < y ? `${x}\0${y}` : `${y}\0${x}`);
  const reason = new Map<string, Set<'edge' | 'cluster'>>();
  const mark = (x: string, y: string, why: 'edge' | 'cluster') => {
    if (x === y) return;
    if (!A.nodes.has(x) || !B.nodes.has(x) || !A.nodes.has(y) || !B.nodes.has(y)) return;
    const key = pairKey(x, y);
    relatedPairs.add(key);
    const set = reason.get(key) ?? new Set();
    set.add(why);
    reason.set(key, set);
  };
  for (const e of [...A.edges, ...B.edges]) mark(e.from, e.to, 'edge');
  for (const c of [...A.clusters, ...B.clusters]) {
    if (c.members.length > 40) continue;   // a 40-member blob is not a statement about any pair
    for (let i = 0; i < c.members.length; i++) {
      for (let j = i + 1; j < c.members.length; j++) mark(c.members[i]!, c.members[j]!, 'cluster');
    }
  }

  const relationChanges: RelationChange[] = [];
  let relationsCompared = 0;
  if (relatedPairs.size > MAX_RELATION_PAIRS) {
    warnings.push(
      `${relatedPairs.size} related node pairs is past the ${MAX_RELATION_PAIRS}-pair budget for the ` +
      'relative-direction pass, so relation changes were not computed. Every other layout signal ' +
      '(cluster, container, group, region, prominence) is complete.'
    );
  } else {
    for (const key of relatedPairs) {
      const [x, y] = key.split('\0') as [string, string];
      const before = relationOf(A.nodes.get(x)!.box, A.nodes.get(y)!.box);
      const after = relationOf(B.nodes.get(x)!.box, B.nodes.get(y)!.box);
      relationsCompared++;
      if (before === after) continue;
      const why = reason.get(key)!;
      relationChanges.push({
        a: x,
        b: y,
        from: before,
        to: after,
        related: why.has('edge') && why.has('cluster') ? 'edge+cluster' : why.has('edge') ? 'edge' : 'cluster'
      });
    }
    layoutSignalsChanged += relationChanges.length;
  }

  const aspect = (box: BoundingBox | null) =>
    box && box.maxY - box.minY > 1 ? (box.maxX - box.minX) / (box.maxY - box.minY) : null;
  // Measured on the region frames, since those are what the region names are
  // thirds of. Both are drawn round the same set of nodes, so a divergence
  // here is a real difference in how the two boards lay those nodes out.
  const aspectA = aspect(A.regionFrame), aspectB = aspect(B.regionFrame);
  const boxAspectDiverged = aspectA !== null && aspectB !== null &&
    (aspectA / aspectB > 1.5 || aspectB / aspectA > 1.5);
  if (boxAspectDiverged) {
    warnings.push(
      'The two boards frame the nodes they share differently enough (aspect ratio differs by more than half ' +
      'again) that region names are not directly comparable — "top-left" on one is not the same physical ' +
      'place as on the other. Read cluster, container and relation changes instead; region changes here may ' +
      'be an artefact of the frame rather than anything anyone moved.'
    );
  }

  // --- plain elements -------------------------------------------------------
  const labelsA = new Set(A.plain.labelled.map(p => p.label!));
  const labelsB = new Set(B.plain.labelled.map(p => p.label!));

  // --- warnings that are about the comparison itself ------------------------
  //
  // Whether the join found anything at all. Without it, an empty diff would be
  // indistinguishable from two identical boards, and "nothing changed" is the
  // most damaging thing to say wrongly.
  const comparable = shared > 0 ||
    (A.elements.length === 0 && B.elements.length === 0);

  if (A.nodes.size === 0 && B.nodes.size === 0 && !comparable) {
    warnings.push(
      'Neither board has a single promoted node, so there is nothing to compare on and the empty node and ' +
      'edge sections below mean "could not be compared", not "unchanged" — summary.comparable is false. ' +
      'Everything that is known is in the plain-element inventory. Promote the boxes on both boards ' +
      '(`promote --kind ...`) to give them the node ids this diff joins on.'
    );
  } else if (A.nodes.size === 0 || B.nodes.size === 0) {
    const empty = A.nodes.size === 0 ? fromInput.key : toInput.key;
    warnings.push(
      `"${empty}" has no promoted nodes at all, so every node on the other board reads as added or removed. ` +
      'That is an artefact of nothing having been promoted, not a statement about the architecture.'
    );
  } else if (shared === 0) {
    warnings.push(
      'The two boards share no node ids, so nothing could be joined and every node reads as added or removed. ' +
      'The boards were promoted independently: re-promote with matching `--node` ids (or promote the ' +
      'proposal from a copy of the current board) to make them comparable.'
    );
    const overlap = [...new Set([...A.nodes.values()].map(n => n.name))]
      .filter(name => [...B.nodes.values()].some(n => n.name === name));
    if (overlap.length > 0) {
      warnings.push(
        `${overlap.length} node name(s) do appear on both boards despite the ids differing — ` +
        `${overlap.slice(0, 12).join(', ')}${overlap.length > 12 ? ', …' : ''}. Same label, different node ` +
        'id: almost certainly the same architectural unit promoted twice.'
      );
    }
  }

  // "Identical" is a claim about the architecture, so it is only ever made when
  // there was an architecture to compare: an unpromoted board differs from
  // another unpromoted board in every visible way and this diff cannot see any
  // of it.
  const identical = comparable &&
    added.length === 0 && removed.length === 0 && changed.length === 0 &&
    edgeDiff.added.length === 0 && edgeDiff.removed.length === 0 && edgeDiff.changed.length === 0 &&
    layoutSignalsChanged === 0;

  return {
    success: true,
    from: side(fromInput, A),
    to: side(toInput, B),
    summary: {
      comparable,
      identical,
      sharedNodes: shared,
      nodesAdded: added.length,
      nodesRemoved: removed.length,
      nodesChanged: changed.length,
      nodesUnchanged: unchanged.length,
      nodesMovedOnly: unchanged.filter(u => u.layoutChanges).length,
      edgesAdded: edgeDiff.added.length,
      edgesRemoved: edgeDiff.removed.length,
      edgesChanged: edgeDiff.changed.length,
      edgesUnchanged: edgeDiff.unchanged.length,
      layoutSignalsChanged
    },
    nodes: { added, removed, changed, unchanged },
    edges: {
      added: edgeDiff.added,
      removed: edgeDiff.removed,
      changed: edgeDiff.changed,
      unchanged: edgeDiff.unchanged,
      rerouted,
      unresolved: { from: A.unresolved, to: B.unresolved }
    },
    layout: {
      method: LAYOUT_METHOD,
      cannotExpress: LAYOUT_CANNOT_EXPRESS,
      clusters: { from: A.clusters, to: B.clusters, changes: clusterChanges },
      groups: { from: A.groups, to: B.groups, changes: groupChanges },
      moved,
      relations: { compared: relationsCompared, changes: relationChanges },
      boxAspectDiverged
    },
    plain: {
      from: A.plain,
      to: B.plain,
      labelOnlyOnFrom: [...labelsA].filter(l => !labelsB.has(l)).sort(),
      labelOnlyOnTo: [...labelsB].filter(l => !labelsA.has(l)).sort(),
      labelOnBoth: [...labelsA].filter(l => labelsB.has(l)).sort()
    },
    warnings
  };
}

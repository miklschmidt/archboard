import fs from 'fs';
import path from 'path';
import { ServerElement } from '../types.js';
import { git, repoIdentityAt, repoRootOf } from './git.js';
import { checkoutFor, knownRepoNames, rememberRepo } from './repo-registry.js';
import {
  DEFAULT_FILL_STYLE,
  DEFAULT_SHAPE_BACKGROUND,
  FILLABLE_TYPES,
  backgroundForKind,
  isTransparentBackground
} from './appearance.js';

// Promotion — declaring a set of elements to be a node, giving it a kind and
// usually a binding in the same act (CONTEXT.md).
//
// The interaction this exists for: a human picks boxes by hand on a large
// touchscreen and says "map this to the payments service". No element ids are
// spoken, so the default target is the live selection and everything else is
// an override.
//
// Metadata is written to `customData.archboard` (ADR 0003), merged rather than
// replaced, so another tool's `customData` keys — and our own fields the caller
// did not mention — survive.

// ---------------------------------------------------------------------------
// Kind — a controlled vocabulary that grows deliberately, not free text
// ---------------------------------------------------------------------------

export const KINDS = ['service', 'queue', 'datastore', 'gateway', 'external'] as const;
export type Kind = typeof KINDS[number];

export function normalizeKind(raw: string): Kind {
  const kind = raw.trim().toLowerCase();
  if ((KINDS as readonly string[]).includes(kind)) return kind as Kind;
  throw new PromotionError(
    `Unknown kind "${raw}". Valid kinds are: ${KINDS.join(', ')}. ` +
    `The kind vocabulary grows deliberately — add it to CONTEXT.md and KINDS before using it.`
  );
}

export class PromotionError extends Error {}

// ---------------------------------------------------------------------------
// Node identity — a stable id distinct from the Excalidraw element id
// ---------------------------------------------------------------------------
//
// Element ids are not stable across redraws, mermaid conversion, or variant
// authoring (ADR 0003), so the node id is the join key that makes two
// independently authored variants comparable. It is derived from the label so
// a human can read it aloud and recognise it in a diff.

const NODE_ID_MAX = 48;

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NODE_ID_MAX)
    .replace(/-+$/g, '');
  return slug;
}

// Explicit --node values go through the same shape so ids stay comparable
// across boards; anything that slugifies to nothing is rejected rather than
// silently renamed.
export function validateNodeId(raw: string): string {
  const slug = slugify(raw);
  if (!slug) throw new PromotionError(`"${raw}" does not make a usable node id (letters and digits only).`);
  return slug;
}

// Uniqueness is per board. `taken` is every node id already in use by some
// *other* node, so re-promoting the same node keeps its identity.
export function uniqueNodeId(base: string, taken: Set<string>): string {
  const stem = base || 'node';
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${stem.slice(0, NODE_ID_MAX - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new PromotionError(`Could not find a free node id based on "${stem}".`);
}

// ---------------------------------------------------------------------------
// Metadata access
// ---------------------------------------------------------------------------

export interface ArchboardBlock {
  node?: string;
  kind?: string;
  name?: string;
  binding?: LogicalAddress;
  variant?: string;
  level?: string;
  [key: string]: unknown;
}

export function archboardBlock(el: ServerElement): ArchboardBlock | undefined {
  const custom = el.customData;
  if (!custom || typeof custom !== 'object') return undefined;
  const block = (custom as Record<string, unknown>).archboard;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return undefined;
  return block as ArchboardBlock;
}

export function nodeIdOf(el: ServerElement): string | undefined {
  const node = archboardBlock(el)?.node;
  return typeof node === 'string' && node ? node : undefined;
}

export function nodeIdsOnBoard(elements: ServerElement[]): Set<string> {
  const ids = new Set<string>();
  for (const el of elements) {
    const id = nodeIdOf(el);
    if (id) ids.add(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Binding — a logical address, not a machine path
// ---------------------------------------------------------------------------
//
// The vault spans repositories and is not co-located with any of them (ADR
// 0004), so a binding names code as repo identity + path, plus the branch and
// commit at which it was last confirmed — that pair is what lets git history
// trace a file that later moves. `link` is a convenience for this machine and
// is only written when the path actually resolves here.

export interface LogicalAddress {
  repo?: string;      // e.g. github.com/miklschmidt/archboard, or a repo dir name
  path: string;       // relative to the repo root
  branch?: string;
  commit?: string;
  confirmedAt?: string;
}

export interface BindingRequest {
  path: string;
  repo?: string;
  branch?: string;
  commit?: string;
}

export type BindingSource =
  | 'path'       // the caller gave an absolute path
  | 'registry'   // the caller named a repository, and it is checked out here
  | 'cwd'        // resolved against the caller's working directory
  | 'declared';  // recorded as stated; nothing on this machine to resolve it against

/**
 * Where a *relative* path is allowed to resolve from.
 *
 * There is no default, and that is the whole decision (ADR 0011). A surface
 * with a shell has a working directory the caller chose and can see, so it says
 * so; MCP has none it can express, so it says that instead and a relative path
 * is refused there rather than resolved against whatever directory the client
 * happened to spawn the server in.
 */
export type BindingOrigin =
  | { kind: 'cwd'; dir: string }
  | { kind: 'none'; surface: string };

export interface ResolvedBinding {
  address: LogicalAddress;
  link?: string;          // file:// URL, only when the path resolves on this machine
  resolved: boolean;      // did we find a real repo?
  resolvedFrom: BindingSource;  // what the address was resolved against, always reported
  note?: string;          // said out loud whenever the answer is not simply what the caller named
}

/**
 * Resolve a binding request into a logical address.
 *
 * Four ways a path can find its repository, in order of how firmly the caller
 * named it: an absolute path, a repository identity looked up in the checkout
 * registry, the caller's own working directory, or nothing at all. In that last
 * case the address is still recorded, because it is a statement about intent,
 * it just gets no link.
 *
 * Never throws for a path that does not resolve. It throws for a path that
 * *cannot* resolve by intent: a relative path on a surface with no working
 * directory, where any answer would be an accident.
 */
export function resolveBinding(request: BindingRequest, origin: BindingOrigin): ResolvedBinding {
  const confirmedAt = new Date().toISOString();
  const raw = request.path.trim();
  const named = typeof request.repo === 'string' && request.repo.trim() ? request.repo.trim() : undefined;

  // The address exactly as the caller stated it: what gets recorded when this
  // machine has nothing to check it against.
  const asStated = (): LogicalAddress => ({
    ...(named ? { repo: named } : {}),
    path: raw.replace(/^\.\//, ''),
    ...(request.branch ? { branch: request.branch } : {}),
    ...(request.commit ? { commit: request.commit } : {}),
    confirmedAt
  });

  let resolvedFrom: BindingSource;
  let baseDir: string;

  if (path.isAbsolute(raw)) {
    resolvedFrom = 'path';
    baseDir = path.parse(raw).root;
  } else if (named) {
    const checkout = checkoutFor(named);
    if (!checkout) {
      return {
        address: asStated(),
        resolved: false,
        resolvedFrom: 'declared',
        note:
          `"${named}" is not a checkout archboard knows on this machine, so ${raw} was recorded as you ` +
          `stated it, with no link. Register the checkout by running \`repo add <dir>\` inside it, or bind ` +
          `with an absolute path. ${registeredHere()}`
      };
    }
    resolvedFrom = 'registry';
    baseDir = checkout;
  } else if (origin.kind === 'cwd') {
    resolvedFrom = 'cwd';
    baseDir = origin.dir;
  } else {
    throw new PromotionError(
      `"${raw}" is a relative path and ${origin.surface} has no working directory to resolve it against. ` +
      'A client without a shell cannot set one, so the only directory available is whichever one this ' +
      'process happened to be started in, which nobody chose (ADR 0011). Name what you mean instead: an ' +
      'absolute path, or a repository plus a path inside it (repo "github.com/acme/payments", path ' +
      `"src/service.ts"). ${registeredHere()}`
    );
  }

  const absolute = path.resolve(baseDir, raw);
  const root = repoRootOf(absolute);
  const exists = fs.existsSync(absolute);

  if (!root) {
    const where = resolvedFrom === 'cwd' ? ` (looked in the working directory ${baseDir})` : '';
    return {
      address: asStated(),
      resolved: false,
      resolvedFrom,
      note: exists
        ? `${raw} is not inside a git repository${where} — recorded the logical address without a repo identity, and no link.`
        : `${raw} does not resolve on this machine${where} — recorded the logical address as given, and no link.`
    };
  }

  const found = repoIdentityAt(root);

  // A registry entry that now points at some other repository. The path just
  // resolved into the wrong checkout, so nothing here is trustworthy: say so
  // and record the address as stated rather than binding to the wrong file.
  if (resolvedFrom === 'registry' && found !== named) {
    return {
      address: asStated(),
      resolved: false,
      resolvedFrom: 'declared',
      note:
        `The checkout registered for "${named}" (${root}) is now ${found}, so ${raw} was recorded as you ` +
        `stated it, with no link. Re-register it with \`repo add <dir>\` from the right checkout.`
    };
  }

  // What archboard just learned: this identity is checked out here. The
  // registry fills itself from ordinary work, so the next promotion into this
  // repo can name it from anywhere.
  rememberRepo(found, root);

  // The caller's own words still win over git's, because they may be recording
  // a binding for a repo this checkout is a fork or a mirror of. A disagreement
  // is still worth saying out loud.
  const repo = named ?? found;
  const relative = path.relative(root, absolute) || '.';
  const branch = request.branch ?? git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = request.commit ?? git(root, ['rev-parse', 'HEAD']);

  const notes: string[] = [];
  if (resolvedFrom === 'cwd') {
    notes.push(
      `Resolved "${raw}" against the working directory ${baseDir}, which is ${found}. ` +
      'You named no repository, so check that is the one you meant. --repo or an absolute path says it outright.'
    );
  }
  if (named && named !== found) {
    notes.push(`You said --repo ${named}, but ${absolute} is in ${found}. Recorded ${named}, as asked.`);
  }
  if (!exists) {
    notes.push(`${relative} does not exist in ${repo} yet — address recorded, no link.`);
  }

  const address: LogicalAddress = {
    repo,
    path: relative,
    ...(branch && branch !== 'HEAD' ? { branch } : {}),
    ...(commit ? { commit } : {}),
    confirmedAt
  };

  // Only link to something that is actually here. A bogus file:// URL renders
  // as a tappable affordance on the board that opens nothing.
  return {
    address,
    ...(exists ? { link: `file://${absolute}` } : {}),
    resolved: true,
    resolvedFrom,
    ...(notes.length ? { note: notes.join(' ') } : {})
  };
}

function registeredHere(): string {
  const known = knownRepoNames();
  return known.length
    ? `Registered on this machine: ${known.join(', ')}.`
    : 'No repository is registered on this machine yet.';
}

export function formatAddress(a: LogicalAddress): string {
  const repo = a.repo ? `${a.repo}:` : '';
  const branch = a.branch ? `@${a.branch}` : '';
  const commit = a.commit ? ` (${a.commit.slice(0, 7)})` : '';
  return `${repo}${a.path}${branch}${commit}`;
}

// ---------------------------------------------------------------------------
// Planning a promotion
// ---------------------------------------------------------------------------

export interface PromotionRequest {
  targets: ServerElement[];      // the elements to promote (selection or --ids)
  board: ServerElement[];        // every element on the board, for id uniqueness
  kind: Kind;
  name?: string;
  nodeId?: string;
  binding?: ResolvedBinding;
  variant?: string;
  level?: string;
  each?: boolean;                // one node per selected shape instead of one node
}

export interface PlannedNode {
  node: string;
  kind: Kind;
  name: string;
  elementIds: string[];
  binding?: LogicalAddress;
  link?: string;
  variant: string;
  level?: string;
}

export interface ElementUpdate {
  id: string;
  customData: Record<string, unknown>;
  link?: string | null;
  backgroundColor?: string;
  fillStyle?: string;
}

export interface PromotionPlan {
  nodes: PlannedNode[];
  updates: ElementUpdate[];
}

const DEFAULT_VARIANT = 'current';

export function labelOf(el: ServerElement, board: ServerElement[]): string | undefined {
  const direct = el.label?.text ?? el.text;
  if (direct) return String(direct);
  // A labelled shape that came back through a frontend sync carries its label
  // as a separate bound text element.
  for (const other of board) {
    if (other.type === 'text' && (other as any).containerId === el.id) {
      const text = other.text ?? other.originalText;
      if (text) return String(text);
    }
  }
  return undefined;
}

// Bound labels are folded into their container by `describe`, so a shape plus
// its label is one thing, not two. Promotion has to agree: promoting a
// container promotes its label element too, and a label whose container is
// also selected never becomes a node of its own.
function partition(targets: ServerElement[], board: ServerElement[]): {
  shapes: ServerElement[];
  labelsByContainer: Map<string, ServerElement[]>;
} {
  const targetIds = new Set(targets.map(t => t.id));
  const labelsByContainer = new Map<string, ServerElement[]>();
  for (const el of board) {
    const container = (el as any).containerId;
    if (el.type === 'text' && container && container !== el.id && targetIds.has(container)) {
      const list = labelsByContainer.get(container) ?? [];
      list.push(el);
      labelsByContainer.set(container, list);
    }
  }
  const isFoldedLabel = (el: ServerElement) => {
    const container = (el as any).containerId;
    return el.type === 'text' && container && targetIds.has(container);
  };
  return { shapes: targets.filter(el => !isFoldedLabel(el)), labelsByContainer };
}

// Promotion is where a box becomes a node, so it is also where the board gets
// to show that. Two jobs at once:
//
//  - hit-testing, for anything still transparent: a shape drawn before this
//    existed, or imported, is only tappable on its stroke (appearance.ts), and
//    a node nobody can tap is a node nobody can re-select and talk about.
//  - meaning: the kind's pastel makes a node look unlike a scratch box, which
//    is the one thing every node has and the thing a human reads at a glance.
//
// Applied only when nobody has expressed a preference — transparent, or still
// wearing the neutral default. A colour someone actually chose is never
// overwritten. Demotion deliberately does not undo it: reverting to
// transparent would take the interior hit-test away again.
function fillFor(el: ServerElement, kind: Kind): Pick<ElementUpdate, 'backgroundColor' | 'fillStyle'> {
  if (!FILLABLE_TYPES.has(el.type)) return {};
  const current = typeof el.backgroundColor === 'string' ? el.backgroundColor.toLowerCase() : undefined;
  const unchosen = isTransparentBackground(el.backgroundColor) || current === DEFAULT_SHAPE_BACKGROUND;
  if (!unchosen) return {};
  return { backgroundColor: backgroundForKind(kind), fillStyle: DEFAULT_FILL_STYLE };
}

function mergedCustomData(el: ServerElement, block: ArchboardBlock): Record<string, unknown> {
  const existing = (el.customData && typeof el.customData === 'object' ? el.customData : {}) as Record<string, unknown>;
  const previous = archboardBlock(el) ?? {};
  return { ...existing, archboard: { ...previous, ...block } };
}

// Branching a board: every node on the copy now belongs to the new variant.
//
// `board save --as payments@option-a` is how a proposal starts (TESTING.md),
// and it copies the elements verbatim, so without this every node would still
// record the variant it was promoted under. compare reads that disagreement as
// `variantAnomaly` — a node copied between variants and never re-promoted —
// and would report the whole board changed on the one workflow that is meant
// to leave it unchanged (TASK-035).
//
// Only the variant moves. The node id, kind, name and binding are what make
// the copy comparable with its origin, and rewriting any of them would sever
// the join the diff is built on. Elements that were never promoted are
// returned as they are, and so is every other `customData` key.
export function restampVariant(elements: ServerElement[], variant: string): ServerElement[] {
  return elements.map(el => {
    const block = archboardBlock(el);
    if (!block) return el;
    // A node, or something that has been stamped with a variant before.
    // Anything else is a plain element and has no variant to be wrong about.
    if (block.node === undefined && block.variant === undefined) return el;
    if (block.variant === variant) return el;
    return { ...el, customData: mergedCustomData(el, { variant }) };
  });
}

// One node from many elements, or one node per shape?
//
// Default: **one node from the whole selection**. A single promotion carries
// exactly one kind, one name, and one binding — one node's worth of meaning —
// and that matches the utterance it exists for ("map this to the payments
// service", said over however many boxes are lit up). Splitting one kind and
// one binding across five shapes would invent four bindings nobody stated.
//
// `each` covers the other real utterance — "these are all services" — where
// the shared thing is the kind and each shape keeps its own identity. A name
// or a binding is refused there, because those are per-node and the caller
// only supplied one.
export function planPromotion(request: PromotionRequest): PromotionPlan {
  const { targets, board, kind, binding } = request;
  if (targets.length === 0) {
    throw new PromotionError('Nothing to promote — no elements selected and no --ids given.');
  }

  const { shapes, labelsByContainer } = partition(targets, board);
  if (shapes.length === 0) {
    throw new PromotionError('The selection is only bound labels — select the shapes they belong to.');
  }

  const variant = request.variant ?? DEFAULT_VARIANT;
  // Ids belonging to the nodes we are about to (re)write are not "taken" — a
  // re-promotion keeps its node id rather than sliding to name-2.
  const rewriting = new Set(shapes.map(nodeIdOf).filter(Boolean) as string[]);
  const taken = new Set([...nodeIdsOnBoard(board)].filter(id => !rewriting.has(id)));

  const groups: Array<{ elements: ServerElement[]; name: string; nodeId?: string }> = [];
  if (request.each) {
    if (request.name) throw new PromotionError('--name promotes one node; drop it or drop --each.');
    if (request.nodeId) throw new PromotionError('--node names one node; drop it or drop --each.');
    if (binding) throw new PromotionError('A binding belongs to one node; promote each shape separately, or drop --each.');
    for (const shape of shapes) {
      const label = labelOf(shape, board);
      if (!label) {
        throw new PromotionError(
          `--each derives a node id from each shape's label, and ${shape.id} has none. ` +
          `Label it, or promote the shapes one at a time with --name.`
        );
      }
      groups.push({ elements: [shape, ...(labelsByContainer.get(shape.id) ?? [])], name: label });
    }
  } else {
    const elements: ServerElement[] = [];
    for (const shape of shapes) {
      elements.push(shape, ...(labelsByContainer.get(shape.id) ?? []));
    }
    // Name the node after whatever it already answers to: an explicit --name,
    // else the biggest labelled shape in the set (the one a human would read),
    // else the binding's file, else its existing node id.
    const labelled = shapes
      .map(el => ({ el, label: labelOf(el, board), area: (el.width || 0) * (el.height || 0) }))
      .filter(x => x.label)
      .sort((a, b) => b.area - a.area);
    const fromBinding = binding ? path.basename(binding.address.path).replace(/\.[^.]+$/, '') : undefined;
    const declaredAlready = shapes
      .map(el => archboardBlock(el)?.name)
      .find(n => typeof n === 'string' && n) as string | undefined;
    const name = request.name
      ?? declaredAlready          // a name already declared outranks any guess
      ?? labelled[0]?.label
      ?? fromBinding
      ?? shapes.map(nodeIdOf).find(Boolean);
    if (!name) {
      throw new PromotionError(
        'Cannot name this node: nothing selected has a label, and no --name, --node or --path was given.'
      );
    }
    groups.push({ elements, name, ...(request.nodeId ? { nodeId: request.nodeId } : {}) });
  }

  const nodes: PlannedNode[] = [];
  const updates: ElementUpdate[] = [];
  for (const group of groups) {
    const preferred = group.nodeId
      ?? group.elements.map(nodeIdOf).find(Boolean)
      ?? slugify(group.name);
    const node = uniqueNodeId(preferred, taken);
    taken.add(node);

    // `name` is only worth storing when it is not simply a copy of the label
    // the board already shows — a stored copy goes stale the moment a human
    // retypes the label, and the label is the board's truth.
    const primaryLabel = group.elements.map(el => labelOf(el, board)).find(Boolean);
    const declared = group.name === primaryLabel ? undefined : group.name;

    const block: ArchboardBlock = {
      node,
      kind,
      ...(declared ? { name: declared } : {}),
      variant,
      ...(request.level ? { level: request.level } : {}),
      ...(binding ? { binding: binding.address } : {})
    };

    for (const el of group.elements) {
      updates.push({
        id: el.id,
        customData: mergedCustomData(el, block),
        // Rebinding has to clear a link the previous binding left behind —
        // otherwise the shape stays tappable to the file it used to mean.
        ...(binding ? { link: binding.link ?? null } : {}),
        ...fillFor(el, kind)
      });
    }

    nodes.push({
      node,
      kind,
      name: group.name,
      elementIds: group.elements.map(el => el.id),
      ...(binding ? { binding: binding.address } : {}),
      ...(binding?.link ? { link: binding.link } : {}),
      variant,
      ...(request.level ? { level: request.level } : {})
    });
  }

  return { nodes, updates };
}

// ---------------------------------------------------------------------------
// Demotion — promotion has to be reversible
// ---------------------------------------------------------------------------
//
// A node is a set of elements, so demotion works on whole nodes: touch any
// member and the whole node comes back down. Only the `archboard` block is
// removed — another tool's `customData` is not ours to delete — and `link` is
// cleared only when it is the one our binding put there.

export interface DemotionPlan {
  nodes: Array<{ node?: string; name?: string; elementIds: string[] }>;
  updates: ElementUpdate[];
}

export function planDemotion(targets: ServerElement[], board: ServerElement[]): DemotionPlan {
  if (targets.length === 0) {
    throw new PromotionError('Nothing to demote — no elements selected and no --ids given.');
  }

  const nodeIds = new Set(targets.map(nodeIdOf).filter(Boolean) as string[]);
  const byId = new Map<string, ServerElement>();
  for (const el of targets) {
    if (archboardBlock(el)) byId.set(el.id, el);
  }
  // Pull in the rest of every touched node, wherever those elements sit.
  for (const el of board) {
    const id = nodeIdOf(el);
    if (id && nodeIds.has(id)) byId.set(el.id, el);
  }

  if (byId.size === 0) {
    throw new PromotionError('Nothing selected is a node — there is nothing to demote.');
  }

  const groups = new Map<string, ServerElement[]>();
  for (const el of byId.values()) {
    const key = nodeIdOf(el) ?? `element:${el.id}`;
    const list = groups.get(key) ?? [];
    list.push(el);
    groups.set(key, list);
  }

  const updates: ElementUpdate[] = [];
  const nodes: DemotionPlan['nodes'] = [];
  for (const [key, elements] of groups) {
    const block = archboardBlock(elements[0]!);
    // What to call it out loud: the declared name if there is one, else the
    // label the board shows.
    const spoken = typeof block?.name === 'string'
      ? block.name
      : elements.map(el => labelOf(el, board)).find(Boolean);
    nodes.push({
      ...(key.startsWith('element:') ? {} : { node: key }),
      ...(spoken ? { name: spoken } : {}),
      elementIds: elements.map(el => el.id)
    });
    for (const el of elements) {
      const custom = (el.customData && typeof el.customData === 'object' ? el.customData : {}) as Record<string, unknown>;
      const { archboard, ...rest } = custom;
      const ourBinding = archboardBlock(el)?.binding;
      const linkWasOurs = !!el.link && !!ourBinding && el.link.endsWith(ourBinding.path);
      updates.push({
        id: el.id,
        customData: rest,
        ...(linkWasOurs ? { link: null } : {})
      });
    }
  }

  return { nodes, updates };
}

// ---------------------------------------------------------------------------
// Speakable results
// ---------------------------------------------------------------------------

export function promotionSummary(plan: PromotionPlan, note?: string): string {
  const lines: string[] = [];
  if (plan.nodes.length === 1) {
    const n = plan.nodes[0]!;
    const where = n.binding ? `bound to ${formatAddress(n.binding)}` : 'unbound';
    const from = n.elementIds.length === 1 ? '1 element' : `${n.elementIds.length} elements`;
    lines.push(`Promoted ${from} to the ${n.kind} "${n.name}" (node ${n.node}), ${where}.`);
  } else {
    lines.push(`Promoted ${plan.nodes.length} elements to ${plan.nodes[0]?.kind ?? 'node'}s: ` +
      plan.nodes.map(n => `"${n.name}" (${n.node})`).join(', ') + '.');
  }
  if (note) lines.push(note);
  return lines.join(' ');
}

export function demotionSummary(plan: DemotionPlan): string {
  const named = plan.nodes.map(n => `"${n.name ?? n.node ?? '?'}"`).join(', ');
  const count = plan.updates.length;
  return `Demoted ${plan.nodes.length === 1 ? 'the node' : `${plan.nodes.length} nodes`} ${named} ` +
    `back to ${count === 1 ? 'a plain element' : `${count} plain elements`}.`;
}

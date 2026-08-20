// A label is one text element, and it stays the same text element.
//
// The server stores a label the way an agent writes one — `label: {text}` on
// the shape itself — but Excalidraw has no such field. A label there is a
// separate text element bound to the shape, and the browser manufactures one
// by handing the shape to `convertToExcalidrawElements`, which mints a text
// element with a brand-new random id every single time it sees a `label`.
//
// Minting is right exactly once. On the second pass it closes a loop: the new
// text element syncs back to the server, the server merges it while keeping
// the `label` that produced it, and the next broadcast expands that same label
// into yet another text element. Nothing converges. A board of 41 drawn
// elements reached 284, five arrow labels were duplicated 42 times each, and
// the arrows carrying the stacks were mangled into hairlines nobody could see
// or grab — so it read as arrows deleting themselves, and adjusting one only
// spun the loop faster (TASK-024).
//
// The fix is not to stop expanding labels; it is to stop expanding them into
// *new* elements. `label` stays what it has always been — the statement of
// what this element's label says — and a shape that already has a text element
// for it keeps that element:
//
//   the label already says this        leave the text element completely alone
//   the label now says something else  re-expand it, but under the text
//                                      element's existing id
//
// So the count is fixed at one per container, whatever happens, while an agent
// renaming a box still sees the box renamed. This module is that rule, kept
// pure so the browser (which enforces it), the repair script (which undoes
// past violations) and the regression check (which proves it holds) all read
// from the same sentence. Its one import, `geometry.ts`, is pure for the same
// reason and for the same readers.
//
// That is the inbound half. Outbound, the authority is the other way round —
// the bound text is what the label says and the stored seed follows it — so a
// human retyping a box on the board is not written back out from under them
// (`labelStatements`, TASK-028). Emptying a label is the same direction but a
// different act — Excalidraw deletes the text element rather than editing it,
// so there is no statement to make and the seed has to be struck out instead
// (`labelClearances`, TASK-029).
//
// Both of those are about what a label *says*. Where it *sits* is a third
// question of the same shape: the container decides, Excalidraw recomputes it
// at draw time, and so the stored coordinates can be wrong for a long while
// with nothing on screen to show it (`boundTextPlacement`, TASK-034).

import { measureLinear } from './geometry.js';

/** A `boundElements` entry: a shape's forward reference to a text or arrow. */
export interface BoundRef {
  id: string;
  type: string;
}

/**
 * The subset of an element this module reasons about. Deliberately structural
 * — server elements, Excalidraw elements and elements parsed out of a saved
 * `.excalidraw` file all satisfy it, and none of them need converting first.
 */
export interface LabelledElement {
  id: string;
  type?: string;
  containerId?: string | null;
  boundElements?: readonly Readonly<BoundRef>[] | null;
  label?: { text?: string } | null;
  text?: string | null;
  isDeleted?: boolean;
  createdAt?: string;
  // Geometry, for the placement rule below. Optional because most of this
  // module never looks at it, and a container that has none is simply one
  // whose label cannot be placed.
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  points?: readonly (readonly number[])[] | null;
}

function isText(element: LabelledElement | undefined): boolean {
  return !!element && element.type === 'text';
}

function live(element: LabelledElement): boolean {
  return element.isDeleted !== true;
}

/** What an element's `label`/`text` says its label should read, if anything. */
export function labelSeedOf(element: LabelledElement): string | undefined {
  if (isText(element)) return undefined;
  if (typeof element.label?.text === 'string') return element.label.text;
  if (typeof element.text === 'string') return element.text;
  return undefined;
}

/**
 * Every live bound text element, grouped by the container it labels.
 *
 * Both directions of the binding count, because the two disagree constantly
 * while a board is being repaired or half-synced: a text element names its
 * container in `containerId`, and a container names its texts in
 * `boundElements`. A reference that points at something not in `elements`, or
 * at something that is not a text element, is not a binding — it is a
 * leftover. The container's own list is consulted first, so the first id in
 * each group is the text Excalidraw actually draws.
 */
export function boundTextsByContainer(
  elements: readonly LabelledElement[]
): Map<string, string[]> {
  const byId = new Map<string, LabelledElement>();
  for (const element of elements) {
    if (element && typeof element.id === 'string' && live(element)) byId.set(element.id, element);
  }

  const found = new Map<string, string[]>();
  const seen = new Set<string>();
  const record = (container: string, textId: string): void => {
    const key = `${container} ${textId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const list = found.get(container);
    if (list) list.push(textId);
    else found.set(container, [textId]);
  };

  for (const element of elements) {
    if (!live(element) || !Array.isArray(element.boundElements)) continue;
    for (const ref of element.boundElements) {
      if (!ref || ref.type !== 'text' || typeof ref.id !== 'string') continue;
      if (!isText(byId.get(ref.id))) continue;
      record(element.id, ref.id);
    }
  }

  for (const element of elements) {
    if (!live(element) || !isText(element)) continue;
    const container = element.containerId;
    if (typeof container !== 'string' || !container) continue;
    if (!byId.has(container)) continue;
    record(container, element.id);
  }

  return found;
}

// ---------------------------------------------------------------------------
// Containment
// ---------------------------------------------------------------------------

/** The identity a re-expanded label must adopt: never a new one. */
export interface ReusedLabel {
  /** The text element id the expansion has to answer to. */
  id: string;
  /** Excalidraw's own per-element bookkeeping, carried over so that a
   *  re-expansion that changes nothing visible reads as no change at all. */
  seed?: unknown;
  versionNonce?: unknown;
  version?: unknown;
  index?: unknown;
}

export interface LabelExpansion<T> {
  /** What to hand `convertToExcalidrawElements`. */
  elements: T[];
  /** container id -> the identity the label it expands must take. */
  reuse: Map<string, ReusedLabel>;
}

/**
 * Decide, for each labelled element, whether its label still needs expanding —
 * and if so, what the result is obliged to be called.
 *
 * Three cases, and the middle one is the whole bug:
 *
 *   no bound text yet     the label is expanded normally, and gets one
 *   bound text, same text the label is spent: the seed is removed so the
 *                         converter has nothing to expand, and the text
 *                         element is passed through untouched — same id, same
 *                         styling, same everything
 *   bound text, new text  the seed is a rename. The old text element is
 *                         withheld from the converter so the label is rebuilt
 *                         properly (measured, positioned, wrapped), and its id
 *                         is recorded so the rebuilt one adopts it
 *
 * Withholding the text element also obliges us to make sure the rebuilt label
 * will actually be drawn, which is a separate fact from the text element
 * existing: Excalidraw shows a bound text because its *container* points at
 * it, and a board can easily hold the binding in one direction only — a pane
 * reports a text element the moment a human types, while the container it
 * belongs to has nothing new to say and is never reported. So where only the
 * text names the container, the reference back is restored here rather than
 * left for someone to notice as a shape that has mysteriously gone blank.
 */
export function planLabelExpansion<T extends LabelledElement>(
  elements: readonly T[]
): LabelExpansion<T> {
  const labelled = boundTextsByContainer(elements);
  if (labelled.size === 0) return { elements: elements as T[], reuse: new Map() };

  const byId = new Map<string, T>();
  for (const element of elements) byId.set(element.id, element);

  const reuse = new Map<string, ReusedLabel>();
  const withheld = new Set<string>();

  const planned = elements.map((element) => {
    if (isText(element)) return element;
    const textIds = labelled.get(element.id);
    if (!textIds || textIds.length === 0) return element;

    const keeper = byId.get(textIds[0] as string);
    if (!keeper) return element;

    const refs = Array.isArray(element.boundElements) ? element.boundElements : [];
    const seed = labelSeedOf(element);

    // The label already says this, or there is no seed to say anything: the
    // text element stands as it is. Only the reference back may need mending.
    if (seed === undefined || seed === (keeper.text ?? '')) {
      const named = refs.some((ref) => ref?.type === 'text' && textIds.includes(ref.id));
      if (seed === undefined && named) return element;
      const { label: _label, text: _text, ...rest } = element;
      if (named) return rest as unknown as T;
      return {
        ...rest,
        boundElements: [...refs, { id: keeper.id, type: 'text' }]
      } as unknown as T;
    }

    // A rename. Hold the old text element back and let the converter rebuild
    // the label from the seed — under the old element's name.
    withheld.add(keeper.id);
    reuse.set(element.id, {
      id: keeper.id,
      seed: (keeper as Record<string, unknown>).seed,
      versionNonce: (keeper as Record<string, unknown>).versionNonce,
      version: (keeper as Record<string, unknown>).version,
      index: (keeper as Record<string, unknown>).index
    });
    return {
      ...element,
      boundElements: refs.filter((ref) => ref?.type !== 'text')
    } as unknown as T;
  });

  return {
    elements: planned.filter((element) => !withheld.has(element.id)),
    reuse
  };
}

/**
 * Give every freshly expanded label the identity it was supposed to keep.
 *
 * The converter names what it mints, so this is where the promise made by
 * `planLabelExpansion` is kept: each new text element is renamed back to the
 * element it replaces, and every reference to the invented id — the
 * container's `boundElements` above all — is rewritten to match. Do this and
 * the board sees an edited label rather than a new one, which is the whole
 * difference between a rename and a leak.
 */
export function adoptReusedLabelIds<T extends LabelledElement>(
  converted: readonly T[],
  reuse: ReadonlyMap<string, ReusedLabel>
): T[] {
  if (reuse.size === 0) return converted as T[];

  const rename = new Map<string, ReusedLabel>();
  for (const element of converted) {
    if (!isText(element)) continue;
    const container = element.containerId;
    if (typeof container !== 'string') continue;
    const wanted = reuse.get(container);
    if (!wanted || wanted.id === element.id) continue;
    rename.set(element.id, wanted);
  }
  if (rename.size === 0) return converted as T[];

  return converted.map((element) => {
    const wanted = rename.get(element.id);
    if (wanted) {
      const next = { ...element, id: wanted.id } as unknown as Record<string, unknown>;
      // Excalidraw's own counters come along, so a re-expansion that produces
      // the same label as last time is indistinguishable from no expansion.
      if (wanted.seed !== undefined) next.seed = wanted.seed;
      if (wanted.versionNonce !== undefined) next.versionNonce = wanted.versionNonce;
      if (wanted.version !== undefined) next.version = wanted.version;
      if (wanted.index !== undefined) next.index = wanted.index;
      return next as unknown as T;
    }
    if (!Array.isArray(element.boundElements)) return element;
    if (!element.boundElements.some((ref) => ref && rename.has(ref.id))) return element;
    return {
      ...element,
      boundElements: element.boundElements.map((ref) =>
        ref && rename.has(ref.id) ? { ...ref, id: rename.get(ref.id)!.id } : ref
      )
    } as unknown as T;
  });
}

// ---------------------------------------------------------------------------
// Following the human
// ---------------------------------------------------------------------------

/**
 * The label a change report has to state, so the stored seed follows the text
 * a human just typed.
 *
 * Containment above only settles what happens on the way *in*: the seed says
 * what the label reads, and the bound text is rebuilt to match. Nothing said
 * what happens on the way *out*, and the answer used to be "nothing" — a human
 * retyping a label changed the text element and left the seed saying the old
 * name forever. The seed is the thing the next conversion pass reads, so the
 * board wrote their edit back out again: a rename that silently reverts, at
 * the one place the whole tool depends on a human editing and an agent reading
 * it back (TASK-028).
 *
 * The temptation is to arbitrate — timestamps, provenance, some rule for
 * telling a human's rename apart from an agent's `update --set '{"text":...}'`,
 * which produces exactly the same disagreement in the opposite direction. That
 * is guesswork, and it is unnecessary, because the two never travel the same
 * way. An agent's rename arrives *inbound* as a seed the browser has not seen;
 * a human's rename leaves *outbound* as text the server has not seen. Give
 * each direction one authority — inbound, the seed; outbound, the text — and
 * there is nothing to arbitrate. A disagreement is only ever resolved by
 * whichever direction is currently carrying news.
 *
 * That holds only if the outbound correction is immediate, which is why this
 * belongs on the report path rather than on the next conversion: as long as a
 * stale seed sits on the server, any delivery that happens to carry that
 * container along (an agent moving the box, a fresh page load) hands the stale
 * seed back to containment, which dutifully applies it. Stating the label
 * alongside the text closes that window to the length of one report.
 *
 * Only the keeper text speaks for a container — the one Excalidraw actually
 * draws — so a stray second text element that somehow gets reported cannot
 * rewrite the label out from under the one on screen.
 */
export interface LabelStatement {
  /** The container whose stored label must follow. */
  id: string;
  label: { text: string };
}

export function labelStatements(
  upserts: readonly LabelledElement[],
  scene: readonly LabelledElement[]
): LabelStatement[] {
  const reported = new Set<string>();
  for (const element of upserts) {
    if (element && isText(element) && typeof element.id === 'string') reported.add(element.id);
  }
  if (reported.size === 0) return [];

  const byId = new Map<string, LabelledElement>();
  for (const element of scene) {
    if (element && typeof element.id === 'string') byId.set(element.id, element);
  }

  const statements: LabelStatement[] = [];
  for (const [containerId, textIds] of boundTextsByContainer(scene)) {
    const keeper = textIds[0] as string;
    if (!reported.has(keeper)) continue;
    const text = byId.get(keeper)?.text;
    if (typeof text !== 'string') continue;
    statements.push({ id: containerId, label: { text } });
  }
  return statements;
}

/**
 * The label a change report has to *un*state, because the text element that
 * was saying it has been deleted.
 *
 * Emptying a label is not a rename with an empty string. Excalidraw treats a
 * bound text submitted blank as a deletion: it marks the text element
 * `isDeleted` and unbinds it from its container, so the report that follows
 * carries no text upsert for `labelStatements` to attach a statement to. The
 * stored seed is therefore never corrected, and the next full load expands it
 * again — the old words reappearing over a box somebody deliberately cleared
 * (TASK-029).
 *
 * The obvious repair is to clear the seed whenever a container turns up with
 * no bound text. That is wrong, and it undoes TASK-024: a shape an agent has
 * just labelled, whose seed has not been expanded yet, looks exactly the same
 * from the outside. Absence is not evidence. What distinguishes the two is
 * that a deletion leaves something behind — the deleted text element itself,
 * still in the scene, still naming its container. A seed that was never
 * expanded leaves nothing, so it can never be mistaken for one.
 *
 * Hence the four conditions below. The last one — that the report is already
 * saying something about this container — is not about correctness but about
 * silence: a tombstone lingers in the scene until the next delivery rebuilds
 * it, and without the guard every report in that window would restate the same
 * clearance and bump the element's version for nothing.
 *
 * Both `label` and `text` are stated null because `labelSeedOf` reads either,
 * and the server merges an upsert onto what it holds rather than replacing it:
 * clearing only one leaves the seed alive in the other.
 */
export interface LabelClearance {
  /** The container whose stored label must go. */
  id: string;
  label: null;
  text: null;
}

export function labelClearances(
  upserts: readonly LabelledElement[],
  deletes: readonly string[],
  scene: readonly LabelledElement[]
): LabelClearance[] {
  const bereaved: Array<{ container: string; text: string }> = [];
  for (const element of scene) {
    if (!element || live(element) || !isText(element)) continue;
    const container = element.containerId;
    if (typeof container !== 'string' || !container) continue;
    bereaved.push({ container, text: element.id });
  }
  if (bereaved.length === 0) return [];

  const alive = new Set<string>();
  for (const element of scene) {
    if (element && typeof element.id === 'string' && live(element)) alive.add(element.id);
  }
  const stillLabelled = boundTextsByContainer(scene);

  // What this report already speaks about, so a clearance rides an existing
  // conversation rather than starting a new one on every pass.
  const news = new Set<string>(deletes);
  for (const element of upserts) {
    if (element && typeof element.id === 'string') news.add(element.id);
  }

  const clearances: LabelClearance[] = [];
  const said = new Set<string>();
  for (const { container, text } of bereaved) {
    if (said.has(container)) continue;
    if (!alive.has(container)) continue;
    if (stillLabelled.has(container)) continue;
    if (!news.has(container) && !news.has(text)) continue;
    said.add(container);
    clearances.push({ id: container, label: null, text: null });
  }
  return clearances;
}

// ---------------------------------------------------------------------------
// Where a label sits
// ---------------------------------------------------------------------------

/**
 * A bound label has no opinion about where it is. Its container decides, and
 * the stored coordinates have to say so.
 *
 * Excalidraw recomputes a bound text's position from its container every time
 * it draws one, so a label whose stored x/y is nonsense still *looks* right.
 * That is what made this hide: moving a box through the API updated the box
 * and left its text element where it was, the board redrew perfectly, and
 * nothing complained. What is wrong is the record, and every reader that works
 * from coordinates rather than pixels inherits it — the scene bounding box,
 * and therefore zoom-to-fit and the crop of an image export, and the relative
 * position signals in layout.ts that `describe` and `compare` are built on. On
 * one real board a label had been left 1170px from the arrow it belongs to,
 * pushing the scene box out by a phantom 630x203 region of empty canvas that
 * every screenshot then framed (TASK-034).
 *
 * So the rule Excalidraw draws by is written down here, in the same module as
 * the rest of the seed/bound-text model, and the server applies it whenever it
 * moves a container itself. A change report coming the other way does not need
 * it: there Excalidraw has already placed the label, and it is the authority.
 */

/** The top-left a bound text must have, given the container it belongs to. */
export interface BoundTextPlacement {
  x: number;
  y: number;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isLinear(element: LabelledElement): boolean {
  return element.type === 'arrow' || element.type === 'line';
}

/**
 * The point a container hangs its label from: the centre of a shape, the
 * midpoint of an arrow.
 *
 * An arrow measures itself from its own `points` rather than from the stored
 * width and height, because those are the bounding box of a path the server
 * re-routes without re-measuring — stale on exactly the arrows this matters
 * for. Which midpoint follows Excalidraw: the middle vertex of an odd-length
 * path, the midpoint of the middle segment of an even one, so a two-point
 * arrow labels itself halfway along.
 */
export function labelAnchorOf(container: LabelledElement): BoundTextPlacement | undefined {
  const x = num(container.x);
  const y = num(container.y);
  if (x === undefined || y === undefined) return undefined;

  if (isLinear(container)) {
    const points = container.points;
    if (!Array.isArray(points) || points.length < 2) return undefined;
    const at = (i: number): BoundTextPlacement | undefined => {
      const point = points[i];
      const px = num(point?.[0]);
      const py = num(point?.[1]);
      return px === undefined || py === undefined ? undefined : { x: x + px, y: y + py };
    };
    if (points.length % 2 === 1) return at((points.length - 1) / 2);
    const a = at(points.length / 2 - 1);
    const b = at(points.length / 2);
    if (!a || !b) return undefined;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  const width = num(container.width) ?? 0;
  const height = num(container.height) ?? 0;
  return { x: x + width / 2, y: y + height / 2 };
}

/** How far from its anchor a label may honestly sit, and still be that label. */
function anchorSlack(container: LabelledElement): number {
  // Half the container's own diagonal: enough for a top-aligned or
  // left-aligned label, which Excalidraw parks against an edge rather than in
  // the middle, and nowhere near enough for a label the board has forgotten
  // about. Plus a few pixels so bound-text padding and rounding are never the
  // thing that fails a board.
  const SLACK = 8;
  if (isLinear(container)) {
    const path = measureLinear(container.points);
    return Math.hypot(path?.width ?? 0, path?.height ?? 0) / 2 + SLACK;
  }
  return Math.hypot(num(container.width) ?? 0, num(container.height) ?? 0) / 2 + SLACK;
}

/**
 * Where this container's label belongs: its anchor, less half the label's own
 * size, because a text element is stored by its top-left corner.
 *
 * Undefined when the answer is not knowable — a container with no coordinates,
 * an arrow with no path, a text with no measurements — because moving a label
 * to a guess is worse than leaving it where it is.
 */
export function boundTextPlacement(
  container: LabelledElement,
  text: LabelledElement
): BoundTextPlacement | undefined {
  const anchor = labelAnchorOf(container);
  if (!anchor) return undefined;
  const width = num(text.width);
  const height = num(text.height);
  if (width === undefined || height === undefined) return undefined;
  return { x: anchor.x - width / 2, y: anchor.y - height / 2 };
}

/** One bound text whose stored position no longer matches its container. */
export interface BoundTextMove {
  id: string;
  containerId: string;
  x: number;
  y: number;
  /** How far it is being moved, in px. */
  distance: number;
}

/**
 * The moves that would put every bound text back where its container draws it.
 *
 * Give it `containerIds` to settle only the containers something just touched,
 * which is what the server wants after an update; leave it out to sweep a whole
 * scene, which is what a repair wants. Only the keeper text of each container
 * is moved — the one Excalidraw actually draws — so a board that still has
 * duplicates to clear is not rearranged behind that job's back.
 *
 * A move under half a pixel is not a move. Saying so keeps an update that
 * changed nothing from bumping a text element's version and waking the change
 * feed for a rounding error.
 */
export function recentreBoundTexts(
  elements: readonly LabelledElement[],
  containerIds?: readonly string[]
): BoundTextMove[] {
  const byId = new Map<string, LabelledElement>();
  for (const element of elements) {
    if (element && typeof element.id === 'string') byId.set(element.id, element);
  }
  const wanted = containerIds ? new Set(containerIds) : undefined;

  const moves: BoundTextMove[] = [];
  for (const [containerId, textIds] of boundTextsByContainer(elements)) {
    if (wanted && !wanted.has(containerId)) continue;
    const container = byId.get(containerId);
    const text = byId.get(textIds[0] as string);
    if (!container || !text) continue;
    const wantedAt = boundTextPlacement(container, text);
    if (!wantedAt) continue;
    const dx = wantedAt.x - (num(text.x) ?? wantedAt.x);
    const dy = wantedAt.y - (num(text.y) ?? wantedAt.y);
    const distance = Math.hypot(dx, dy);
    if (distance < 0.5) continue;
    moves.push({ id: text.id, containerId, x: wantedAt.x, y: wantedAt.y, distance });
  }
  return moves;
}

/**
 * The moves that rescue only the labels the board has lost track of.
 *
 * The browser needs a narrower rule than the server does. On an incoming
 * delivery the pane can put a label back on the thing it names, but it must not
 * fine-tune one: Excalidraw is the authority on where a label is drawn, and it
 * has opinions this module does not share — a curved multi-point arrow hangs
 * its label from the bezier, not from the midpoint of a straight segment. Move
 * a label to disagree with Excalidraw by a pixel and Excalidraw moves it back,
 * which is reported, which arrives, which moves it again. That is the shape of
 * the loop TASK-024 was about, and it is not worth re-entering to correct a
 * pixel. So the pane acts only where the record is plainly wrong.
 */
export function rescueDriftedBoundTexts(elements: readonly LabelledElement[]): BoundTextMove[] {
  const lost = new Set(boundTextDrift(elements).map((entry) => entry.textId));
  if (lost.size === 0) return [];
  return recentreBoundTexts(elements).filter((move) => lost.has(move.id));
}

/** A bound text sitting further from its container than the container allows. */
export interface BoundTextDrift {
  containerId: string;
  containerType: string;
  textId: string;
  text: string;
  /** Distance from the container's anchor to the label's centre, in px. */
  distance: number;
  /** The most that container's own size can account for. */
  allowed: number;
}

/**
 * Every bound text the board has lost track of.
 *
 * The test is deliberately generous — a label may sit as far from its anchor
 * as half the container's own diagonal, which covers every alignment
 * Excalidraw offers — because the failure this catches is not a label a few
 * pixels off. It is a label the board left behind entirely, hundreds of pixels
 * from the thing it names, dragging the scene's bounding box with it.
 */
export function boundTextDrift(elements: readonly LabelledElement[]): BoundTextDrift[] {
  const byId = new Map<string, LabelledElement>();
  for (const element of elements) {
    if (element && typeof element.id === 'string') byId.set(element.id, element);
  }

  const drifted: BoundTextDrift[] = [];
  for (const [containerId, textIds] of boundTextsByContainer(elements)) {
    const container = byId.get(containerId);
    if (!container) continue;
    const anchor = labelAnchorOf(container);
    if (!anchor) continue;
    for (const textId of textIds) {
      const text = byId.get(textId);
      if (!text) continue;
      const x = num(text.x);
      const y = num(text.y);
      if (x === undefined || y === undefined) continue;
      const centreX = x + (num(text.width) ?? 0) / 2;
      const centreY = y + (num(text.height) ?? 0) / 2;
      const distance = Math.hypot(centreX - anchor.x, centreY - anchor.y);
      const allowed = anchorSlack(container);
      if (distance <= allowed) continue;
      drifted.push({
        containerId,
        containerType: container.type ?? 'unknown',
        textId,
        text: String(text.text ?? ''),
        distance,
        allowed
      });
    }
  }
  return drifted.sort((a, b) => b.distance - a.distance);
}

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

/** One container that ended up with more bound text elements than it can show. */
export interface DuplicateLabel {
  containerId: string;
  containerType: string;
  /** The text element the container keeps — the one Excalidraw renders. */
  keep: string;
  /** The copies nobody can see, which every later pass would keep breeding. */
  remove: string[];
  text: string;
}

export interface LabelRepairPlan {
  duplicates: DuplicateLabel[];
  /** Text element ids to delete, across every container. */
  removeIds: string[];
  /** Containers whose `boundElements` still name a text that must go. */
  rebind: Array<{ id: string; boundElements: BoundRef[] }>;
  /** Bound texts whose container is gone: reported, never deleted. */
  orphanIds: string[];
}

/**
 * What it would take to make each container's label singular again.
 *
 * The keeper is the first text in the container's own `boundElements`, because
 * that is the one Excalidraw draws — keeping any other one would silently
 * change what the board says. Where the container names none of them (its list
 * was lost in a sync), the oldest text wins: it is the original, and the copies
 * are what the loop added.
 */
export function planLabelRepair(elements: readonly LabelledElement[]): LabelRepairPlan {
  const byId = new Map<string, LabelledElement>();
  for (const element of elements) {
    if (element && typeof element.id === 'string') byId.set(element.id, element);
  }

  const labelled = boundTextsByContainer(elements);
  const duplicates: DuplicateLabel[] = [];
  const removeIds: string[] = [];
  const rebind: Array<{ id: string; boundElements: BoundRef[] }> = [];

  for (const [containerId, textIds] of labelled) {
    const container = byId.get(containerId);
    if (!container) continue;

    const named = Array.isArray(container.boundElements)
      ? container.boundElements.find((ref) => ref?.type === 'text' && textIds.includes(ref.id))
      : undefined;
    const keep = named?.id ?? oldest(textIds, byId);
    const remove = textIds.filter((id) => id !== keep);

    if (remove.length > 0) {
      duplicates.push({
        containerId,
        containerType: container.type ?? 'unknown',
        keep,
        remove,
        text: String(byId.get(keep)?.text ?? '')
      });
      removeIds.push(...remove);
    }

    // Rewrite the container's list whenever it names a doomed text or fails to
    // name the keeper. Arrow bindings in the same list are left alone.
    const current = Array.isArray(container.boundElements) ? container.boundElements : [];
    const gone = new Set(remove);
    const wanted: BoundRef[] = [
      ...current.filter((ref) => ref && ref.type !== 'text'),
      { id: keep, type: 'text' }
    ];
    const namesDoomed = current.some((ref) => ref && gone.has(ref.id));
    const namesKeeper = current.some((ref) => ref?.type === 'text' && ref.id === keep);
    const extraTexts = current.filter((ref) => ref?.type === 'text').length > 1;
    if (namesDoomed || !namesKeeper || extraTexts) {
      rebind.push({ id: containerId, boundElements: wanted });
    }
  }

  const orphanIds: string[] = [];
  for (const element of elements) {
    if (!isText(element) || !live(element)) continue;
    const container = element.containerId;
    if (typeof container === 'string' && container && !byId.has(container)) {
      orphanIds.push(element.id);
    }
  }

  return { duplicates, removeIds, rebind, orphanIds };
}

function oldest(ids: readonly string[], byId: Map<string, LabelledElement>): string {
  let best = ids[0] as string;
  for (const id of ids) {
    const a = byId.get(id)?.createdAt;
    const b = byId.get(best)?.createdAt;
    if (typeof a === 'string' && (typeof b !== 'string' || a < b)) best = id;
  }
  return best;
}

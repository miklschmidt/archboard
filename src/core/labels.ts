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
// pure and dependency-free so the browser (which enforces it), the repair
// script (which undoes past violations) and the regression check (which proves
// it holds) all read from the same sentence.
//
// That is the inbound half. Outbound, the authority is the other way round —
// the bound text is what the label says and the stored seed follows it — so a
// human retyping a box on the board is not written back out from under them
// (`labelStatements`, TASK-028). Emptying a label is the same direction but a
// different act — Excalidraw deletes the text element rather than editing it,
// so there is no statement to make and the seed has to be struck out instead
// (`labelClearances`, TASK-029).

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

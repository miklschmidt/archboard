import { ServerElement, normalizeFontFamily } from '../types.js';
import {
  LabelledElement, boundTextPlacement, boundTextsByContainer, labelSeedOf, labelTextIdFor
} from './labels.js';
import { fnv1a, type IdsInUse } from './ids.js';
import { lineHeightOf } from './fonts.js';
import { canMeasure, measureText } from './measure-text.js';

// The one conversion, in one direction, at one boundary (ADR 0015).
//
// An agent writes `{"type":"rectangle","label":{"text":"AuthService"}}`.
// Excalidraw has no `label` field: a label there is a separate text element
// bound to the shape, with a measured width, a computed position and about
// thirty other properties. Something has to turn one into the other.
//
// There used to be two somethings. This one, on the way into a note, and
// Excalidraw's own `convertToExcalidrawElements` in the browser on the way
// into a pane — a converter we did not control, which we then patched by hand.
// Given one board of nine elements the two produced documents differing on
// fourteen fields. Divergence between two copies of one thing is invisible
// until it is expensive, and it was: a label that multiplied every time the
// board went round the loop, a rename that came back, a cleared label that
// refilled itself, a label that drifted a thousand pixels from its arrow.
//
// So there is one of these, it runs on the way in, and nothing converts on the
// way out. What a reader gets is what Excalidraw renders.
//
// WHAT "CORRECT" MEANS HERE. Not "matches what `convertToExcalidrawElements`
// would have produced" — that converter is gone, and eight of the fourteen
// differences turned out to describe its own fallbacks rather than anything
// Excalidraw insists on. The property is that a document we write is a fixed
// point: rendered in a real browser, nothing comes back changed.
// `scripts/check-fixed-point.mjs` is that check and it is the arbiter.
//
// Measured with that check, against this version of Excalidraw, the only
// thing a render rewrites is `index` — so the defaults below come from
// Excalidraw's own `DEFAULT_ELEMENT_PROPS` and `AppState` rather than from a
// second converter's output, and they are the values a shape a human drew
// would carry.

export interface ExpandOptions {
  // Derive seeds, versionNonces, and `updated` timestamps from element ids
  // and updatedAt instead of Math.random()/Date.now(), so repeated exports
  // of an unchanged scene are byte-identical (keeps committed .excalidraw
  // files diff-clean).
  deterministic?: boolean;
  /**
   * Elements bound for the board's own map rather than for a file.
   *
   * The difference is bookkeeping, not conversion: the store keeps
   * `createdAt`, `updatedAt`, `source` and the server's `version`, and keeps
   * the `start` and `end` an agent wrote, because `rerouteBoundArrows` reads
   * them to know which arrows the server owns the path of. The conversion
   * either way is this one, and neither way keeps a `label`.
   */
  forStore?: boolean;
  /** Ids already spoken for elsewhere, so an expanded label cannot take one. */
  inUse?: IdsInUse;
}

// Excalidraw's defaults, from its own bundle rather than from anything's
// output: `DEFAULT_ELEMENT_PROPS` for the shared properties, `AppState` for
// what a freshly drawn element gets.
const DEFAULT_FONT_FAMILY = 5;        // Excalifont. Virgil, our old default, is deprecated.
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_TEXT_ALIGN = 'left';    // for a standalone text; a bound one is centred
const DEFAULT_VERTICAL_ALIGN = 'top';
const DEFAULT_STROKE_WIDTH = 2;

// Excalidraw's `index` is a fractional index, and it is the z-order. Two rules
// make one valid: the strings increase along the array, and each parses. Ours
// used to be `a${n}`, which breaks at ten elements — `a10` sorts before `a2` —
// so a board of twelve came back from a render with five indices repaired.
//
// These are the integer keys of the same scheme: one leading letter saying how
// many digits follow, then base-62 digits. `a0` through `az`, then `b00`.
const INDEX_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function fractionalIndex(position: number): string {
  let width = 1;
  let offset = 0;
  let span = INDEX_DIGITS.length;
  // `a` holds 62, `b` holds 62², and so on; `az` < `b00` because `a` < `b`.
  while (position >= offset + span && width < 26) {
    offset += span;
    width += 1;
    span *= INDEX_DIGITS.length;
  }
  let remaining = position - offset;
  let digits = '';
  for (let i = 0; i < width; i++) {
    digits = (INDEX_DIGITS[remaining % INDEX_DIGITS.length] as string) + digits;
    remaining = Math.floor(remaining / INDEX_DIGITS.length);
  }
  return (INDEX_DIGITS[36 + width - 1] as string) + digits;   // 36 is 'a'
}

// Canonical key order for exported elements: identity/geometry first, the
// rest alphabetical — so a no-op import→export cycle is byte-identical and
// committed .excalidraw files produce minimal git diffs.
const KEY_ORDER = ['id', 'type', 'x', 'y', 'width', 'height'];
export function canonicalizeKeys(v: any): any {
  if (Array.isArray(v)) return v.map(canonicalizeKeys);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort((a, b) => {
      const ia = KEY_ORDER.indexOf(a); const ib = KEY_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? KEY_ORDER.length : ia) - (ib === -1 ? KEY_ORDER.length : ib);
      return a < b ? -1 : 1;
    });
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = canonicalizeKeys(v[k]);
    return out;
  }
  return v;
}

export function expandElementsForExport(
  sourceElements: ServerElement[],
  options: ExpandOptions = {}
): Record<string, any>[] {
  const { deterministic = false, forStore = false } = options;
  const seedFor = (key: string): number =>
    deterministic ? (fnv1a(key) % 2147483646) + 1 : Math.floor(Math.random() * 2147483647);
  const updatedFor = (el: any): number => {
    if (!deterministic) return Date.now();
    // Prefer a preserved `updated` (re-imported scene) over the server's
    // updatedAt, so no-op import→export cycles are byte-identical.
    if (typeof el.updated === 'number') return el.updated;
    const parsed = Date.parse(el.updatedAt ?? el.createdAt ?? '');
    return Number.isNaN(parsed) ? 1 : parsed;
  };

  const cleanedExportElements: Record<string, any>[] = [];
  const boundTextElements: Record<string, any>[] = [];

  // Every name the scene already spends, so a label expanded here cannot be
  // handed one of them. `inUse` carries the rest of the board when this is
  // converting one write rather than a whole scene.
  const named = new Set<string>(sourceElements.map((el) => el.id));
  const taken: IdsInUse = {
    has: (id: string) => named.has(id) || (options.inUse?.has(id) ?? false)
  };

  function makeBaseElement(el: any, rest: any): Record<string, any> {
    return {
      ...rest,
      angle: rest.angle ?? 0,
      strokeColor: rest.strokeColor ?? '#1e1e1e',
      backgroundColor: rest.backgroundColor ?? 'transparent',
      fillStyle: rest.fillStyle ?? 'solid',
      strokeWidth: rest.strokeWidth ?? DEFAULT_STROKE_WIDTH,
      strokeStyle: rest.strokeStyle ?? 'solid',
      roughness: rest.roughness ?? 1,
      opacity: rest.opacity ?? 100,
      groupIds: rest.groupIds ?? [],
      frameId: rest.frameId ?? null,
      // Rounded, because `currentItemRoundness` is `round` and a box a human
      // draws is rounded. `convertToExcalidrawElements` produced `null` here,
      // which is that converter declining to choose rather than Excalidraw
      // wanting square corners, and adopting it would have made every
      // agent-drawn box differ from every hand-drawn one.
      roundness: rest.roundness ?? (
        el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse'
          ? { type: 3 } : null
      ),
      seed: rest.seed ?? seedFor(`${el.id}:seed`),
      version: rest.version ?? 1,
      versionNonce: rest.versionNonce ?? seedFor(`${el.id}:nonce`),
      isDeleted: rest.isDeleted ?? false,
      boundElements: rest.boundElements ?? null,
      updated: updatedFor(el),
      link: rest.link ?? null,
      locked: rest.locked ?? false
    };
  }

  for (const el of sourceElements) {
    // Strip server-only fields. They come back at the end of the loop when
    // these elements are going to the board's own map rather than to a file,
    // because there that bookkeeping is the point.
    const {
      createdAt, updatedAt, syncedAt, source: keptSource,
      syncTimestamp, label, start, end, text,
      version: serverVersion,
      ...rest
    } = el as any;

    const base = makeBaseElement(el, rest);
    const restoreServerFields = (element: Record<string, any>): Record<string, any> => {
      if (!forStore) return element;
      if (createdAt !== undefined) element.createdAt = createdAt;
      if (updatedAt !== undefined) element.updatedAt = updatedAt;
      if (syncedAt !== undefined) element.syncedAt = syncedAt;
      if (keptSource !== undefined) element.source = keptSource;
      if (syncTimestamp !== undefined) element.syncTimestamp = syncTimestamp;
      if (serverVersion !== undefined) element.version = serverVersion;
      // `label` is not restored, and neither is `text` on anything that is not
      // a text element. Both are the seed, and the seed is an input format: it
      // has been read by now, and what it said is a text element on the board.
      // Storing it too would be one fact spelled twice, which is what needed a
      // rule for which spelling wins, which is what TASK-024, TASK-028 and
      // TASK-029 each were (TASK-073).
      //
      // The arrow's refs do stay, because they are not a second spelling of
      // `startBinding`: they are how `rerouteBoundArrows` tells an arrow whose
      // path the server computes from one Excalidraw draws and binds itself.
      if (start !== undefined) element.start = start;
      if (end !== undefined) element.end = end;
      return element;
    };

    // Standalone text elements: keep text directly
    if (el.type === 'text') {
      base.text = text ?? rest.text ?? '';
      base.originalText = rest.originalText ?? base.text;
      base.fontSize = rest.fontSize ?? DEFAULT_FONT_SIZE;
      base.fontFamily = normalizeFontFamily(rest.fontFamily) ?? DEFAULT_FONT_FAMILY;
      base.textAlign = rest.textAlign ?? DEFAULT_TEXT_ALIGN;
      base.verticalAlign = rest.verticalAlign ?? DEFAULT_VERTICAL_ALIGN;
      base.autoResize = rest.autoResize ?? true;
      base.lineHeight = rest.lineHeight ?? lineHeightOf(base.fontFamily);
      base.containerId = rest.containerId ?? null;
      sizeText(base);
      cleanedExportElements.push(restoreServerFields(base));
      continue;
    }

    // Arrows: preserve browser-synced bindings; for agent-created arrows the
    // server keeps start/end refs with null bindings (points are kept correct
    // by rerouteBoundArrows), so synthesize live bindings from the refs —
    // otherwise arrows don't stick to shapes when moved in Excalidraw.
    if (el.type === 'arrow' || el.type === 'line') {
      base.points = rest.points ?? [[0, 0], [100, 0]];
      base.lastCommittedPoint = null;
      if (rest.startBinding) {
        base.startBinding = { ...rest.startBinding, fixedPoint: rest.startBinding.fixedPoint ?? null };
      } else if (start?.id) {
        base.startBinding = { elementId: start.id, focus: 0, gap: 4, fixedPoint: null };
      } else {
        base.startBinding = null;
      }
      if (rest.endBinding) {
        base.endBinding = { ...rest.endBinding, fixedPoint: rest.endBinding.fixedPoint ?? null };
      } else if (end?.id) {
        base.endBinding = { elementId: end.id, focus: 0, gap: 4, fixedPoint: null };
      } else {
        base.endBinding = null;
      }
      base.startArrowhead = rest.startArrowhead ?? null;
      base.endArrowhead = rest.endArrowhead ?? (el.type === 'arrow' ? 'arrow' : null);
      // Only an arrow can be elbowed. A line carrying `elbowed: false` is a
      // field Excalidraw's line type does not have.
      if (el.type === 'arrow') base.elbowed = rest.elbowed ?? false;
    }

    // Freedraw carries a stroke's own record of how it was drawn. A hand-drawn
    // one always has these; one an agent wrote had none, so the browser filled
    // them in on delivery and the note never learned.
    if (el.type === 'freedraw') {
      base.points = rest.points ?? [];
      base.pressures = rest.pressures ?? [];
      base.simulatePressure = rest.simulatePressure ?? true;
      base.lastCommittedPoint = rest.lastCommittedPoint ?? null;
    }

    // Generate a bound text element for `label`/`text` on shapes and arrows —
    // unless the element already carries a bound text reference (a scene
    // synced from a browser tab, or a re-imported expanded export).
    // A reference to a text element that is not here is not a label. An
    // element left holding one — a pane that reported a deletion, a scene
    // edited by hand — must still be able to grow a real one.
    //
    // Judged against the whole document when there is one. A write names a few
    // elements and the board holds the rest, so `expandForBoard` is where the
    // references are squared with the board before this can be asked.
    const labelText = label?.text || text;
    const hasBoundText = Array.isArray(base.boundElements) &&
      base.boundElements.some((b: any) => b?.type === 'text' &&
        (forStore || sourceElements.some((other) => other.id === b.id && other.type === 'text')));
    if (labelText && !hasBoundText) {
      // Named the same way the browser's expansion names it (labels.ts), so
      // whichever of the two gets there first, the label keeps one name — and
      // that name is short enough to be a block reference, so writing the note
      // does not rename it (TASK-069).
      const textId = labelTextIdFor(base.id, taken);
      named.add(textId);
      // Add binding reference to parent
      base.boundElements = [
        ...(Array.isArray(base.boundElements) ? base.boundElements : []),
        { type: 'text', id: textId }
      ];

      const isArrow = el.type === 'arrow' || el.type === 'line';
      const fontSize = rest.fontSize ?? DEFAULT_FONT_SIZE;
      const fontFamily = normalizeFontFamily(rest.fontFamily) ?? DEFAULT_FONT_FAMILY;
      const lineHeight = lineHeightOf(fontFamily);

      const label = {
        id: textId,
        type: 'text',
        // Placed below, once its size is known.
        x: base.x,
        y: base.y,
        width: 0,
        height: 0,
        angle: 0,
        strokeColor: isArrow ? '#1e1e1e' : base.strokeColor,
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: DEFAULT_STROKE_WIDTH,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: seedFor(`${textId}:seed`),
        version: 1,
        versionNonce: seedFor(`${textId}:nonce`),
        isDeleted: false,
        boundElements: null,
        updated: updatedFor(el),
        link: null,
        locked: false,
        text: labelText,
        originalText: labelText,
        fontSize,
        fontFamily,
        textAlign: 'center',
        verticalAlign: 'middle',
        autoResize: true,
        lineHeight,
        containerId: base.id
      } as Record<string, any>;

      // A label has no opinion about where it is: it is as wide as its glyphs
      // and its container decides the rest. Both used to be guesses — an
      // estimate of 0.6 x fontSize per character, and a rectangle a quarter of
      // the way down its container — and both were wrong by tens of pixels on
      // every board (`labels.ts`, `measure-text.ts`).
      sizeText(label);
      const placement = boundTextPlacement(base as LabelledElement, label as LabelledElement);
      if (placement) { label.x = placement.x; label.y = placement.y; }

      boundTextElements.push(label);
    }

    cleanedExportElements.push(restoreServerFields(base));
  }

  // Patch shapes' boundElements to include connected arrows
  const shapeBoundArrows = new Map<string, { type: string; id: string }[]>();
  for (const el of cleanedExportElements) {
    if (el.startBinding?.elementId) {
      const arr = shapeBoundArrows.get(el.startBinding.elementId) || [];
      arr.push({ type: 'arrow', id: el.id });
      shapeBoundArrows.set(el.startBinding.elementId, arr);
    }
    if (el.endBinding?.elementId) {
      const arr = shapeBoundArrows.get(el.endBinding.elementId) || [];
      arr.push({ type: 'arrow', id: el.id });
      shapeBoundArrows.set(el.endBinding.elementId, arr);
    }
  }
  for (const el of cleanedExportElements) {
    const arrowBindings = shapeBoundArrows.get(el.id);
    if (arrowBindings) {
      // Skip refs the element already carries (re-exported expanded scenes),
      // otherwise every export cycle appends duplicate boundElements entries.
      const existing = new Set(
        (Array.isArray(el.boundElements) ? el.boundElements : []).map((b: any) => b?.id)
      );
      const additions = arrowBindings.filter(b => !existing.has(b.id));
      if (additions.length > 0) {
        el.boundElements = [
          ...(Array.isArray(el.boundElements) ? el.boundElements : []),
          ...additions
        ];
      }
    }
  }

  // Append all bound text elements after their parents
  cleanedExportElements.push(...boundTextElements);

  // Restate `index` over the whole document, in one increasing run.
  //
  // z-order is what `index` means, so the existing order is kept: elements
  // sort by the index they arrived with, and anything without one keeps its
  // place in the array. What changes is that the values are then reissued from
  // `fractionalIndex`, which is monotonic past ten elements where `a${n}` was
  // not. A board of twelve came back from a render with five indices repaired
  // because `a10` sorts before `a2`.
  //
  // Not done for the store, where a write names a few elements and the board
  // holds the rest: restating a partial document's indices would renumber it
  // against elements it cannot see.
  if (!forStore) {
    const order = cleanedExportElements
      .map((element, position) => ({ element, position }))
      .sort((a, b) => {
        const ai = typeof a.element.index === 'string' ? a.element.index : null;
        const bi = typeof b.element.index === 'string' ? b.element.index : null;
        if (ai !== null && bi !== null && ai !== bi) return ai < bi ? -1 : 1;
        return a.position - b.position;
      });
    order.forEach(({ element }, position) => { element.index = fractionalIndex(position); });
    cleanedExportElements.length = 0;
    cleanedExportElements.push(...order.map(({ element }) => element));
  }

  return deterministic ? canonicalizeKeys(cleanedExportElements) : cleanedExportElements;
}

/**
 * One agent write, converted: the elements to store.
 *
 * This is the boundary ADR 0015 names, and the two callers that matter both go
 * through it — `src/server.ts` on every agent write, and `check-labels.mjs`,
 * which runs the label loop to exhaustion and would prove nothing about a copy
 * of this. What comes back is the elements handed in, now complete, followed
 * by any label the conversion had to expand.
 */
export function expandForBoard(
  written: ServerElement[],
  board: ReadonlyMap<string, ServerElement>
): ServerElement[] {
  if (written.length === 0) return [];

  // A container whose label the board already holds keeps it, whichever
  // direction the binding is recorded in.
  //
  // A binding is written down twice and either half can be the one that
  // survives: the text names its container in `containerId`, the container
  // names its text in `boundElements`. A pane reports the text the instant a
  // person types into it while the container has nothing new to say; a note
  // edited by hand or a scene imported from elsewhere can arrive with one end
  // missing outright. The expansion below looks at the container's end only,
  // so on such a board a write carrying a label would read as a label nobody
  // had expanded, and it would expand a second one.
  //
  // Deleting the seed narrowed this without removing it. The write that trips
  // it is now always one carrying a label of its own, which means a rename —
  // the board's own copy of a container no longer carries anything to expand.
  // Taking it out fails three checks in `check-labels` (TASK-073).
  const labelled = boundTextsByContainer([...board.values()]);
  const mended = written.map((element) => {
    const textIds = labelled.get(element.id) ?? [];
    const refs = Array.isArray(element.boundElements) ? element.boundElements : [];
    // A reference to a text element the board does not hold is not a label,
    // and leaving it would suppress the real one.
    const live = refs.filter((ref) =>
      ref?.type !== 'text' || textIds.includes(ref.id) || board.has(ref.id));
    const named = live.some((ref) => ref?.type === 'text' && textIds.includes(ref.id));
    if (named || textIds.length === 0) {
      return live.length === refs.length
        ? element
        : { ...element, boundElements: live.length > 0 ? live : null } as ServerElement;
    }
    return {
      ...element,
      boundElements: [...live, { id: textIds[0] as string, type: 'text' }]
    } as ServerElement;
  });

  return expandElementsForExport(mended, {
    forStore: true,
    inUse: { has: (id: string) => board.has(id) }
  }) as unknown as ServerElement[];
}

/**
 * A label that now says something else, as the text element it has to become.
 *
 * Expansion only ever mints a text element for a container that has none, so a
 * rename would otherwise leave the seed and the text element disagreeing —
 * which is TASK-028, where a human's rename kept coming back. The text element
 * is the label, so the rename is written into it, and it is re-measured on the
 * way through. Nothing is stored here; the caller owns the board.
 */
export function relabelBoundTexts(
  written: readonly ServerElement[],
  board: ReadonlyMap<string, ServerElement>
): ServerElement[] {
  const labelled = boundTextsByContainer([...board.values()]);
  const relabelled: ServerElement[] = [];
  for (const container of written) {
    const wanted = labelSeedOf(container as LabelledElement);
    if (wanted === undefined) continue;
    const textId = labelled.get(container.id)?.[0];
    if (!textId) continue;
    const existing = board.get(textId);
    if (!existing || existing.text === wanted) continue;
    const [remeasured] = expandForBoard(
      [{ ...existing, text: wanted, originalText: wanted } as ServerElement], board);
    if (remeasured) relabelled.push(remeasured);
  }
  return relabelled;
}

/**
 * A text element's size, which is a measurement and not an opinion.
 *
 * Excalidraw's width for a piece of text is exactly what the browser's
 * `measureText` returns and its height is `fontSize * lineHeight * lineCount`,
 * so whatever a caller sent alongside the text is the last text's size — the
 * same reasoning that made the server restate an arrow's width and height
 * every time it writes a path (TASK-038).
 *
 * Two exceptions. `autoResize: false` is the one case where Excalidraw lets a
 * text keep a width its glyphs do not imply, because a human dragged it there.
 * And a family that ships no file — Helvetica resolves to whatever the
 * viewer's system calls Helvetica — has no honest server-side width at all, so
 * whatever the element carries is left alone.
 */
function sizeText(element: Record<string, any>): void {
  if (element.autoResize === false) return;
  const fontFamily = typeof element.fontFamily === 'number' ? element.fontFamily : DEFAULT_FONT_FAMILY;
  if (!canMeasure(fontFamily)) return;
  const fontSize = typeof element.fontSize === 'number' ? element.fontSize : DEFAULT_FONT_SIZE;
  const lineHeight = typeof element.lineHeight === 'number' ? element.lineHeight : undefined;
  const measured = measureText(String(element.text ?? ''), fontSize, fontFamily, lineHeight);
  element.width = measured.width;
  element.height = measured.height;
}

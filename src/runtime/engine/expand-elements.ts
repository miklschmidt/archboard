import { type ServerElement, normalizeFontFamily } from "./types.js";
import { generateKeyBetween } from "fractional-indexing";
import {
	type LabelledElement,
	boundTextPlacement,
	boundTextsByContainer,
	labelSeedOf,
	labelTextIdFor,
} from "./labels.js";
import { bindingFromRef } from "./arrow-binding.js";
import { fnv1a, type IdsInUse } from "../../shared/ids/ids.js";
import { lineHeightOf } from "./fonts.js";
import { canMeasure, measureText } from "./measure-text.js";
import { DEFAULT_LINEAR_POINTS } from "./geometry.js";

// The one conversion, in one direction, at one boundary (ADR 0015).
//
// An agent writes `{"type":"rectangle","label":{"text":"AuthService"}}`.
// Excalidraw has no `label` field: a label there is a separate text element
// bound to the shape, with a measured width, a computed position and about
// thirty other properties. Something has to turn one into the other.
//
// There used to be two somethings. This one, on the way into a note, and
// Excalidraw's own `convertToExcalidrawElements` in the browser on the way
// into a pane — a converter we did not control, which we then corrected
// locally.
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
// `tests/system/browser/fixed-point-document.test.ts` is that check and it is the arbiter.
//
// Measured with that check, against this version of Excalidraw, the only
// thing a render rewrites is `index` — so the defaults below come from
// Excalidraw's own `DEFAULT_ELEMENT_PROPS` and `AppState` rather than from a
// second converter's output, and they are the values a shape a user drew
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
	 * `createdAt`, `updatedAt`, `source` and the server's `version`. The
	 * conversion either way is this one, and neither way keeps a seed — not a
	 * `label`, and not an arrow's `start` and `end`.
	 */
	forStore?: boolean;
	/**
	 * Keep that bookkeeping without the rest of `forStore`.
	 *
	 * A board's note is where the board lives (ADR 0015), so it has to hold
	 * everything the board is, and that includes one field nothing else can
	 * recover: `source`, which says a human drew an element rather than an
	 * agent, and which `describe` reports and `compare` reads. What an arrow
	 * joins is not in that class — it is in `startBinding` and `endBinding`,
	 * which are Excalidraw's own fields and go into the note as themselves.
	 *
	 * Not `forStore`, because a note is a whole document: its z-order is restated
	 * and its labels are expanded, neither of which a partial write wants. And
	 * not on by default, because `export --out` writes a file for another tool,
	 * where archboard's bookkeeping is noise.
	 */
	keepServerFields?: boolean;
	/** Ids already spoken for elsewhere, so an expanded label cannot take one. */
	inUse?: IdsInUse;
}

// Excalidraw's defaults, from its own bundle rather than from anything's
// output: `DEFAULT_ELEMENT_PROPS` for the shared properties, `AppState` for
// what a freshly drawn element gets.
const DEFAULT_FONT_FAMILY = 5; // Excalifont. Virgil, our old default, is deprecated.
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_TEXT_ALIGN = "left"; // for a standalone text; a bound one is centred
const DEFAULT_VERTICAL_ALIGN = "top";
const DEFAULT_STROKE_WIDTH = 2;
const validIndexKey = (key: unknown): key is string => {
	if (typeof key !== "string") return false;
	try {
		generateKeyBetween(key, null);
		return true;
	} catch {
		return false;
	}
};

// Excalidraw's `index` is a fractional index, and it is the z-order. Two rules
// make one valid: the strings increase along the array, and each parses. Ours
// used to be `a${n}`, which breaks at ten elements — `a10` sorts before `a2` —
// so a board of twelve came back from a render with five indices repaired.
//
// These are the integer keys of the same scheme: one leading letter saying how
// many digits follow, then base-62 digits. `a0` through `az`, then `b00`.
const INDEX_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
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
	let digits = "";
	for (let i = 0; i < width; i++) {
		digits = (INDEX_DIGITS[remaining % INDEX_DIGITS.length] as string) + digits;
		remaining = Math.floor(remaining / INDEX_DIGITS.length);
	}
	return (INDEX_DIGITS[36 + width - 1] as string) + digits; // 36 is 'a'
}

/**
 * The position `fractionalIndex` would have been given to produce this key, or
 * null for a key from anywhere else.
 *
 * Excalidraw's scheme is wider than ours: it puts a key *between* two others
 * when a human sends one shape behind another, and those have no position in
 * our integer run. Saying null for those is the honest answer; validity and
 * repair use the shared fractional-indexing implementation below.
 */
export function indexPosition(key: string): number | null {
	const width = INDEX_DIGITS.indexOf(key[0] as string) - 36 + 1; // 36 is 'a'
	if (width < 1 || key.length !== width + 1) return null;
	let offset = 0;
	let span = INDEX_DIGITS.length;
	for (let w = 1; w < width; w++) {
		offset += span;
		span *= INDEX_DIGITS.length;
	}
	let value = 0;
	for (let i = 1; i < key.length; i++) {
		const digit = INDEX_DIGITS.indexOf(key[i] as string);
		if (digit < 0) return null;
		value = value * INDEX_DIGITS.length + digit;
	}
	return offset + value;
}

/**
 * Elements in z-order: by the index they carry, and by where they already sit
 * for anything that carries none.
 */
function inZOrder<T extends { index?: string | null }>(elements: T[]): T[] {
	return elements
		.map((element, position) => ({ element, position }))
		.toSorted((a, b) => {
			const ai = typeof a.element.index === "string" ? a.element.index : null;
			const bi = typeof b.element.index === "string" ? b.element.index : null;
			if (ai !== null && bi !== null && ai !== bi) return ai < bi ? -1 : 1;
			return a.position - b.position;
		})
		.map(({ element }) => element);
}

/**
 * References the board must settle after an element is deleted.
 *
 * Three things point at an element by id, and every one of them is a hole once
 * the element is gone. A bound text names its container in `containerId`, a
 * container names its label and its arrows in `boundElements`, and an arrow
 * names both ends in `startBinding` and `endBinding`.
 *
 * The pane repairs the first two on a server update, in `elementsForScene` —
 * it has to, because Excalidraw dereferences them as it renders and a pointer at
 * nothing is the one shape it will not survive. So a store that leaves them is
 * a store holding a document the renderer rewrites, which under ADR 0015 is a
 * board with two answers, and `tests/system/browser/live-session-convergence.test.ts` catches it as
 * one: delete a labelled box and the server keeps the words pointing at a shape
 * that is not there while the pane shows them loose.
 *
 * A label goes with its container rather than being cut loose, because a label
 * is part of the thing it names. Deleting a box and leaving its word floating
 * is not what anybody means by deleting the box, and it is not what Excalidraw
 * does when a user deletes one.
 *
 * Returns the ids that went with them and the elements it had to rewrite.
 */
export function settleDeletions(
	deleted: readonly string[],
	board: Map<string, ServerElement>,
): { alsoDeleted: string[]; changed: ServerElement[] } {
	if (deleted.length === 0) return { alsoDeleted: [], changed: [] };
	const gone = new Set(deleted);

	// A label belongs to its container, so it goes too.
	const alsoDeleted: string[] = [];
	for (const element of board.values()) {
		const container = element.containerId;
		if (typeof container === "string" && gone.has(container)) {
			alsoDeleted.push(element.id);
			gone.add(element.id);
		}
	}
	for (const id of alsoDeleted) board.delete(id);

	const changed: ServerElement[] = [];
	for (const element of board.values()) {
		const refs = Array.isArray(element.boundElements) ? element.boundElements : null;
		const kept = refs?.filter((ref: unknown) => {
			const record = ref && typeof ref === "object" ? (ref as Record<string, unknown>) : {};
			return !(typeof record.id === "string" && gone.has(record.id));
		});
		const loosened = refs !== null && kept !== undefined && kept.length !== refs.length;
		const source = element as unknown as Record<string, unknown>;
		const starts =
			source.startBinding && typeof source.startBinding === "object"
				? (source.startBinding as Record<string, unknown>)
				: null;
		const ends =
			source.endBinding && typeof source.endBinding === "object"
				? (source.endBinding as Record<string, unknown>)
				: null;
		const unbindStart = typeof starts?.elementId === "string" && gone.has(starts.elementId);
		const unbindEnd = typeof ends?.elementId === "string" && gone.has(ends.elementId);
		if (!loosened && !unbindStart && !unbindEnd) continue;
		const repaired = {
			...element,
			...(loosened ? { boundElements: kept as ServerElement["boundElements"] } : {}),
			...(unbindStart ? { startBinding: null } : {}),
			...(unbindEnd ? { endBinding: null } : {}),
		} as ServerElement;
		board.set(repaired.id, repaired);
		changed.push(repaired);
	}
	return { alsoDeleted, changed };
}

/**
 * The index each element in a z-ordered run should carry, or null where the
 * one it has is already right.
 *
 * REPAIR, NOT RESTATEMENT. Reissuing every index from its position would
 * rewrite all 300 of them every time somebody deleted a shape near the front,
 * and every one of those is an element a write has to report as changed. So an
 * index that is already increasing is kept, and one is issued only where the
 * run breaks: after a creation that is the new element and nothing else, and
 * after a deletion it is nothing at all.
 *
 * One rule, used by the board and by the note. The exporter used to reissue
 * every index while this repaired them, which was survivable while a note and
 * a board were two documents: the note said `a0, a1, a2` and the board said
 * `a0, a1, aB` and nobody compared them. The note is the board now (ADR 0015),
 * so two rules is two answers, and the second one arrives on the next read
 * having told nobody (`tests/system/browser/live-session-convergence.test.ts` catches it).
 */
export function settledIndices(
	ordered: ReadonlyArray<{ index?: string | null }>,
): Array<string | null> {
	const wanted: Array<string | null> = [];
	let last: string | null = null;
	for (const [at, element] of ordered.entries()) {
		const key = element.index;
		if (validIndexKey(key) && (last === null || key > last)) {
			last = key;
			wanted.push(null);
			continue;
		}
		let next: string | null = null;
		for (let ahead = at + 1; ahead < ordered.length; ahead += 1) {
			const candidate = ordered[ahead]?.index;
			if (validIndexKey(candidate) && (last === null || candidate > last)) {
				next = candidate;
				break;
			}
		}
		const repaired = generateKeyBetween(last, next);
		wanted.push(repaired);
		last = repaired;
	}
	return wanted;
}

/**
 * Give every element on a board an `index`, and leave the valid ones alone.
 *
 * `index` is z-order, it is a field of the note like any other, and until this
 * existed the store simply had none: an element an agent created carried no
 * index at all, Excalidraw assigned one the moment it rendered, and the pane
 * and the server then held two different documents for the rest of the session
 * (guarded by `tests/system/browser/live-session-convergence.test.ts`). Under ADR 0015 that is a board
 * with two answers, and a write cannot return a document the renderer has to
 * repair.
 *
 * The board is left in z-order, because z-order is the order a document is
 * written in and the store is what a document is built from.
 *
 * Returns the elements it had to change, for whoever is reporting the write.
 */
export function repairIndices(board: Map<string, ServerElement>): ServerElement[] {
	const held = [...board.values()];
	const ordered = inZOrder(held);
	const changed: ServerElement[] = [];
	const settled: ServerElement[] = [];
	const wanted = settledIndices(ordered);
	for (const [at, element] of ordered.entries()) {
		const index = wanted[at];
		if (index === null || index === undefined) {
			settled.push(element);
			continue;
		}
		// Replaced rather than edited: a snapshot or a branch may be holding a
		// deep copy taken from this one, and every write path here replaces
		// (TASK-042).
		const repaired = { ...element, index };
		changed.push(repaired);
		settled.push(repaired);
	}
	const reordered = ordered.some((element, at) => element !== held[at]);
	if (changed.length === 0 && !reordered) return changed;
	board.clear();
	for (const element of settled) board.set(element.id, element);
	return changed;
}

// Canonical key order for exported elements: identity/geometry first, the
// rest alphabetical — so a no-op import→export cycle is byte-identical and
// committed .excalidraw files produce minimal git diffs.
const KEY_ORDER = ["id", "type", "x", "y", "width", "height"];
export function canonicalizeKeys(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(canonicalizeKeys);
	if (v && typeof v === "object") {
		const record = v as Record<string, unknown>;
		const keys = Object.keys(record).toSorted((a, b) => {
			const ia = KEY_ORDER.indexOf(a);
			const ib = KEY_ORDER.indexOf(b);
			if (ia !== -1 || ib !== -1)
				return (ia === -1 ? KEY_ORDER.length : ia) - (ib === -1 ? KEY_ORDER.length : ib);
			return a < b ? -1 : 1;
		});
		const out: Record<string, unknown> = {};
		for (const k of keys) out[k] = canonicalizeKeys(record[k]);
		return out;
	}
	return v;
}

/**
 * The conversion. There is one of it, and this is it (ADR 0015).
 *
 * It was called `expandElementsForExport` until TASK-089 went looking for two
 * implementations of one thing and found the name instead: every board write
 * goes through here as well, by way of `expandForBoard` below, so "for export"
 * described half of what it does. `options.forStore` is the half it left out.
 *
 * Called two ways, and neither is a second implementation of anything:
 *
 *   · over a whole document, by `scene-document` on the way to a note and by
 *     `share-url` on the way to a URL. The whole element list is available, so
 *     z-order is restated across the lot.
 *   · over one write, through `expandForBoard`, which is this call with
 *     `forStore` and one thing done first.
 *
 * So the two cannot disagree about the same input, which is the property
 * ADR 0015 asks for and the reason `readBoardFile` and `readNote` were a real
 * problem while this pair was not.
 */
export function expandElements(
	sourceElements: ServerElement[],
	options: ExpandOptions = {},
): Record<string, unknown>[] {
	const { deterministic = false, forStore = false, keepServerFields = forStore } = options;
	const seedFor = (key: string): number =>
		deterministic ? (fnv1a(key) % 2147483646) + 1 : Math.floor(Math.random() * 2147483647);
	const updatedFor = (el: Record<string, unknown>): number => {
		if (!deterministic) return Date.now();
		// Prefer a preserved `updated` (re-imported scene) over the server's
		// updatedAt, so no-op import→export cycles are byte-identical.
		if (typeof el.updated === "number") return el.updated;
		const parsed = Date.parse(String(el.updatedAt ?? el.createdAt ?? ""));
		return Number.isNaN(parsed) ? 1 : parsed;
	};

	const cleanedExportElements: Record<string, unknown>[] = [];
	const boundTextElements: Record<string, unknown>[] = [];

	// Every name the scene already spends, so a label expanded here cannot be
	// handed one of them. `inUse` carries the rest of the board when this is
	// converting one write rather than a whole scene.
	const named = new Set<string>(sourceElements.map((el) => el.id));
	const taken: IdsInUse = {
		has: (id: string) => named.has(id) || (options.inUse?.has(id) ?? false),
	};

	function makeBaseElement(
		el: Record<string, unknown>,
		rest: Record<string, unknown>,
	): Record<string, unknown> {
		return {
			...rest,
			angle: rest.angle ?? 0,
			strokeColor: rest.strokeColor ?? "#1e1e1e",
			backgroundColor: rest.backgroundColor ?? "transparent",
			fillStyle: rest.fillStyle ?? "solid",
			strokeWidth: rest.strokeWidth ?? DEFAULT_STROKE_WIDTH,
			strokeStyle: rest.strokeStyle ?? "solid",
			roughness: rest.roughness ?? 1,
			opacity: rest.opacity ?? 100,
			groupIds: rest.groupIds ?? [],
			frameId: rest.frameId ?? null,
			// Rounded, because `currentItemRoundness` is `round` and a box a human
			// draws is rounded. `convertToExcalidrawElements` produced `null` here,
			// which is that converter declining to choose rather than Excalidraw
			// wanting square corners, and adopting it would have made every
			// agent-drawn box differ from every user-drawn one.
			roundness:
				rest.roundness ??
				(el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse"
					? { type: 3 }
					: null),
			seed: rest.seed ?? seedFor(`${String(el.id)}:seed`),
			version: rest.version ?? 1,
			versionNonce: rest.versionNonce ?? seedFor(`${String(el.id)}:nonce`),
			isDeleted: rest.isDeleted ?? false,
			boundElements: rest.boundElements ?? null,
			updated: updatedFor(el),
			link: rest.link ?? null,
			locked: rest.locked ?? false,
		};
	}

	function appendLabel(
		el: ServerElement,
		base: Record<string, unknown>,
		rest: Record<string, unknown>,
		label: unknown,
		text: unknown,
	): void {
		const labelText =
			(label &&
			typeof label === "object" &&
			typeof (label as Record<string, unknown>).text === "string"
				? (label as Record<string, unknown>).text
				: undefined) || (typeof text === "string" ? text : undefined);
		const hasBoundText =
			Array.isArray(base.boundElements) &&
			base.boundElements.some((binding: unknown) => {
				const record =
					binding && typeof binding === "object" ? (binding as Record<string, unknown>) : {};
				return (
					record.type === "text" &&
					typeof record.id === "string" &&
					(forStore ||
						sourceElements.some((other) => other.id === record.id && other.type === "text"))
				);
			});
		if (!labelText || hasBoundText) return;

		const textId = labelTextIdFor(String(base.id), taken);
		named.add(textId);
		base.boundElements = [
			...(Array.isArray(base.boundElements) ? base.boundElements : []),
			{ type: "text", id: textId },
		];
		const isArrow = el.type === "arrow" || el.type === "line";
		const fontSize = typeof rest.fontSize === "number" ? rest.fontSize : DEFAULT_FONT_SIZE;
		const fontFamily =
			normalizeFontFamily(
				typeof rest.fontFamily === "string" || typeof rest.fontFamily === "number"
					? rest.fontFamily
					: undefined,
			) ?? DEFAULT_FONT_FAMILY;
		const lineHeight = lineHeightOf(fontFamily);
		const labelElement = {
			id: textId,
			type: "text",
			x: base.x,
			y: base.y,
			width: 0,
			height: 0,
			angle: 0,
			strokeColor: isArrow ? "#1e1e1e" : base.strokeColor,
			backgroundColor: "transparent",
			fillStyle: "solid",
			strokeWidth: DEFAULT_STROKE_WIDTH,
			strokeStyle: "solid",
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
			updated: updatedFor(el as unknown as Record<string, unknown>),
			link: null,
			locked: false,
			text: labelText,
			originalText: labelText,
			fontSize,
			fontFamily,
			textAlign: "center",
			verticalAlign: "middle",
			autoResize: true,
			lineHeight,
			containerId: base.id,
		} as Record<string, unknown>;
		sizeText(labelElement);
		const placement = boundTextPlacement(
			base as unknown as LabelledElement,
			labelElement as unknown as LabelledElement,
		);
		if (placement) {
			labelElement.x = placement.x;
			labelElement.y = placement.y;
		}
		boundTextElements.push(labelElement);
	}

	for (const el of sourceElements) {
		// Strip server-only fields. They come back at the end of the loop when
		// these elements are going to the board's own map rather than to a file,
		// because there that bookkeeping is the point.
		const {
			createdAt,
			updatedAt,
			syncedAt,
			source: keptSource,
			syncTimestamp,
			label,
			start,
			end,
			text,
			version: serverVersion,
			...rest
		} = el as unknown as Record<string, unknown>;

		const base = makeBaseElement(el as unknown as Record<string, unknown>, rest);
		const restoreServerFields = (element: Record<string, unknown>): Record<string, unknown> => {
			if (!keepServerFields) return element;
			if (createdAt !== undefined) element.createdAt = createdAt;
			if (updatedAt !== undefined) element.updatedAt = updatedAt;
			if (syncedAt !== undefined) element.syncedAt = syncedAt;
			if (keptSource !== undefined) element.source = keptSource;
			if (syncTimestamp !== undefined) element.syncTimestamp = syncTimestamp;
			if (serverVersion !== undefined) element.version = serverVersion;
			// Nothing here restores `label`, `text` on anything that is not a text
			// element, or an arrow's `start` and `end`. All of them are the seed, and
			// the seed is an input format: it has been read by now, and what it said
			// is a text element and a binding on the board. Storing it too would be
			// one fact spelled twice, which is what needed a rule for which spelling
			// wins, which is what TASK-024, TASK-028 and TASK-029 each were
			// (TASK-073), and what TASK-088 was when a human re-bound an arrow and
			// the ref went on naming the shape they had dragged it off.
			return element;
		};

		// Standalone text elements: keep text directly
		if (el.type === "text") {
			base.text = text ?? rest.text ?? "";
			base.originalText = rest.originalText ?? base.text;
			base.fontSize = rest.fontSize ?? DEFAULT_FONT_SIZE;
			base.fontFamily =
				normalizeFontFamily(
					typeof rest.fontFamily === "string" || typeof rest.fontFamily === "number"
						? rest.fontFamily
						: undefined,
				) ?? DEFAULT_FONT_FAMILY;
			base.textAlign = rest.textAlign ?? DEFAULT_TEXT_ALIGN;
			base.verticalAlign = rest.verticalAlign ?? DEFAULT_VERTICAL_ALIGN;
			base.autoResize = rest.autoResize ?? true;
			base.lineHeight =
				typeof rest.lineHeight === "number"
					? rest.lineHeight
					: lineHeightOf(
							typeof base.fontFamily === "number" ? base.fontFamily : DEFAULT_FONT_FAMILY,
						);
			base.containerId = rest.containerId ?? null;
			sizeText(base);
			cleanedExportElements.push(restoreServerFields(base));
			continue;
		}

		// An arrow ends where its bindings say. A scene from a browser or a note
		// already carries them; an agent says `start: { id }`, which is the input
		// spelling of the same thing and becomes a binding here, through the one
		// conversion `arrow-binding.ts` holds. From here on the binding is all
		// anything reads, including the server's own routing (TASK-088).
		if (el.type === "arrow" || el.type === "line") {
			base.points = rest.points ?? DEFAULT_LINEAR_POINTS.map((point) => point.slice());
			base.lastCommittedPoint = null;
			const startRecord =
				rest.startBinding && typeof rest.startBinding === "object"
					? (rest.startBinding as Record<string, unknown>)
					: null;
			const endRecord =
				rest.endBinding && typeof rest.endBinding === "object"
					? (rest.endBinding as Record<string, unknown>)
					: null;
			base.startBinding = startRecord
				? { ...startRecord, fixedPoint: startRecord.fixedPoint ?? null }
				: bindingFromRef(start);
			base.endBinding = endRecord
				? { ...endRecord, fixedPoint: endRecord.fixedPoint ?? null }
				: bindingFromRef(end);
			base.startArrowhead = rest.startArrowhead ?? null;
			base.endArrowhead = rest.endArrowhead ?? (el.type === "arrow" ? "arrow" : null);
			// Only an arrow can be elbowed. A line carrying `elbowed: false` is a
			// field Excalidraw's line type does not have.
			if (el.type === "arrow") base.elbowed = rest.elbowed ?? false;
		}

		// Freedraw carries a stroke's own record of how it was drawn. A user-drawn
		// one always has these; one an agent wrote had none, so the browser filled
		// them in on a server update and the note never learned.
		if (el.type === "freedraw") {
			base.points = rest.points ?? [];
			base.pressures = rest.pressures ?? [];
			base.simulatePressure = rest.simulatePressure ?? true;
			base.lastCommittedPoint = rest.lastCommittedPoint ?? null;
		}

		appendLabel(el, base, rest, label, text);

		cleanedExportElements.push(restoreServerFields(base));
	}

	// Patch shapes' boundElements to include connected arrows
	const shapeBoundArrows = new Map<string, { type: string; id: string }[]>();
	for (const el of cleanedExportElements) {
		const startBinding =
			el.startBinding && typeof el.startBinding === "object"
				? (el.startBinding as Record<string, unknown>)
				: null;
		const endBinding =
			el.endBinding && typeof el.endBinding === "object"
				? (el.endBinding as Record<string, unknown>)
				: null;
		if (typeof startBinding?.elementId === "string") {
			const arr = shapeBoundArrows.get(startBinding.elementId) || [];
			arr.push({ type: "arrow", id: String(el.id) });
			shapeBoundArrows.set(startBinding.elementId, arr);
		}
		if (typeof endBinding?.elementId === "string") {
			const arr = shapeBoundArrows.get(endBinding.elementId) || [];
			arr.push({ type: "arrow", id: String(el.id) });
			shapeBoundArrows.set(endBinding.elementId, arr);
		}
	}
	for (const el of cleanedExportElements) {
		const arrowBindings = shapeBoundArrows.get(String(el.id));
		if (arrowBindings) {
			// Skip refs the element already carries (re-exported expanded scenes),
			// otherwise every export cycle appends duplicate boundElements entries.
			const existing = new Set(
				(Array.isArray(el.boundElements) ? el.boundElements : []).map((b: unknown) => {
					const record = b && typeof b === "object" ? (b as Record<string, unknown>) : {};
					return typeof record.id === "string" ? record.id : undefined;
				}),
			);
			const additions = arrowBindings.filter((b) => !existing.has(b.id));
			if (additions.length > 0) {
				el.boundElements = [
					...(Array.isArray(el.boundElements) ? el.boundElements : []),
					...additions,
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
	// place in the array. What changes is that a run that does not increase is
	// repaired — `fractionalIndex` is monotonic past ten elements where `a${n}`
	// was not, and a board of twelve came back from a render with five indices
	// repaired because `a10` sorts before `a2`.
	//
	// The same rule the board is held to (`settledIndices`), because a note is
	// the board (ADR 0015) and a second rule here would be a second answer.
	//
	// Not done for the store, where a write names a few elements and the board
	// holds the rest: settling a partial document's indices would renumber it
	// against elements it cannot see.
	if (!forStore) {
		const order = inZOrder(cleanedExportElements);
		const wanted = settledIndices(order);
		order.forEach((element, at) => {
			const index = wanted[at];
			if (index !== null && index !== undefined) element.index = index;
		});
		cleanedExportElements.length = 0;
		cleanedExportElements.push(...order);
	}

	return deterministic
		? (canonicalizeKeys(cleanedExportElements) as Record<string, unknown>[])
		: cleanedExportElements;
}

/**
 * One agent write, converted against the board it lands on.
 *
 * This is the boundary ADR 0015 names, and the two callers that matter both go
 * through it — the server application on every agent write, and `check-labels.mjs`,
 * which runs the label loop to exhaustion and would prove nothing about a copy
 * of this. What comes back is the elements handed in, now complete, followed
 * by any label the conversion had to expand.
 *
 * **It is not a second conversion and it does none of the converting.** All of
 * that is `expandElements` above, which this calls. What is here is the one
 * thing a partial write needs and a whole document does not: a write names a
 * few elements and the board holds the rest, so a reference to a text element
 * has to be squared against the board before anything can ask whether a
 * container already has a label. Given the whole document that question
 * answers itself, which is why the other entry point never asks it.
 *
 * TASK-089 went looking for two implementations meant to agree and this pair
 * was on the list. They are not two: one calls the other, so no input can get
 * two answers out of them, and `check-labels` asserts it rather than leaving
 * this paragraph to hold the line on its own.
 */
export function expandForBoard(
	written: ServerElement[],
	board: ReadonlyMap<string, ServerElement>,
): ServerElement[] {
	if (written.length === 0) return [];

	// A container whose label the board already holds keeps it, whichever
	// direction the binding is recorded in.
	//
	// A binding is written down twice and either half can be the one that
	// survives: the text names its container in `containerId`, the container
	// names its text in `boundElements`. A pane reports the text the instant a
	// person types into it while the container has nothing new to say; a note
	// edited by a user or a scene imported from elsewhere can arrive with one end
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
		const live = refs.filter(
			(ref) => ref?.type !== "text" || textIds.includes(ref.id) || board.has(ref.id),
		);
		const named = live.some((ref) => ref?.type === "text" && textIds.includes(ref.id));
		if (named || textIds.length === 0) {
			return live.length === refs.length
				? element
				: ({ ...element, boundElements: live.length > 0 ? live : null } as ServerElement);
		}
		return {
			...element,
			boundElements: [...live, { id: textIds[0] as string, type: "text" }],
		} as ServerElement;
	});

	return expandElements(mended, {
		forStore: true,
		inUse: { has: (id: string) => board.has(id) },
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
	board: ReadonlyMap<string, ServerElement>,
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
			[{ ...existing, text: wanted, originalText: wanted } as ServerElement],
			board,
		);
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
function sizeText(element: Record<string, unknown>): void {
	if (element.autoResize === false) return;
	const fontFamily =
		typeof element.fontFamily === "number" ? element.fontFamily : DEFAULT_FONT_FAMILY;
	if (!canMeasure(fontFamily)) return;
	const fontSize = typeof element.fontSize === "number" ? element.fontSize : DEFAULT_FONT_SIZE;
	const lineHeight = typeof element.lineHeight === "number" ? element.lineHeight : undefined;
	const measured = measureText(String(element.text ?? ""), fontSize, fontFamily, lineHeight);
	element.width = measured.width;
	element.height = measured.height;
}

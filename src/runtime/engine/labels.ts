// A label is one text element, and it stays the same text element.
//
// An agent writes a label the way it reads — `label: {text}` on the shape —
// and Excalidraw has no such field: a label there is a separate text element
// bound to the shape. Something has to turn one into the other, and for a long
// while two somethings did. The browser passed every server update to
// `convertToExcalidrawElements`, which mints a text element with a brand-new
// random id every single time it sees a `label`, and the seed that produced
// the first one stayed on the stored element.
//
// So nothing converged. The new text element synced back, the server merged it
// while keeping the seed, and the next broadcast expanded that seed again. A
// board of 41 drawn elements reached 284, five arrow labels were duplicated 42
// times each, and the arrows carrying the stacks were mangled into hairlines
// nobody could see or grab — so it read as arrows deleting themselves, and
// adjusting one only spun the loop faster (TASK-024).
//
// Under ADR 0015 there is one conversion, it happens at the write boundary,
// and nothing converts on the way out. `expand-elements.ts` is that
// conversion; the id it gives a label comes from `labelTextIdFor` below, so
// two places deriving a name for one label agree without telling each other,
// and so the name is already short enough to be an Obsidian block reference
// and the note writer has nothing to rename (TASK-069).
//
// What is left here is everything about a label that is not the conversion,
// kept pure so the server, the repair script and the regression check all read
// from the same sentence. Its one import, `geometry.ts`, is pure for the same
// reason and for the same readers.
//
// Nothing here reads a label back off a container, because a container does
// not carry one. The seed is an input format: the conversion reads it and the
// board keeps what it said, which is a text element (TASK-073). Storing it as
// well is what made a label two facts that could disagree, and every rule for
// settling the disagreement was wrong in a different way. Outbound, a report
// used to restate the seed from the text so a human's rename survived
// (`labelStatements`, TASK-028) and strike it out when Excalidraw deleted the
// text somebody emptied (`labelClearances`, TASK-029). Both are gone with the
// thing they corrected. A human retyping a label edits a text element, and the
// text element is the label.
//
// That is what a label *says*. Where it *sits* is a question of the same shape:
// the container decides, Excalidraw recomputes it at draw time, and so the
// stored coordinates can be wrong for a long while with nothing on screen to
// show it (`boundTextPlacement`, TASK-034).

import { measureLinear } from "./geometry.js";
import { derivedId, type IdsInUse } from "../../shared/ids/ids.js";

/**
 * The name the text element for a container's label answers to.
 *
 * Derived from the container rather than invented, so a label that is expanded
 * again — a board rewritten, a note read by an older archboard — keeps the
 * name it had, without anybody having to record it. Derived in the shape every
 * id is minted in, so the note writer has nothing to rename and an echo cannot
 * rename a label out from under somebody typing into it (`ids.ts`, TASK-069).
 *
 * `inUse` is every id on the board, including deleted ones: a label expanded
 * where an earlier one was cleared must not be handed the cleared element's
 * name back.
 */
export function labelTextIdFor(containerId: string, inUse?: IdsInUse): string {
	return derivedId(`${containerId}:label`, inUse);
}

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

export type LabelTraversalCollection =
	| "records"
	| "bound-elements"
	| "forward-membership"
	| "label-graph"
	| "path-points";

/** Optional domain-level claims used by inspection; production callers need no adapter. */
export interface LabelTraversalClaims {
	claim(collection: LabelTraversalCollection, count: number): void;
	claimSort(length: number): void;
}

function isText(element: LabelledElement | undefined): boolean {
	return !!element && element.type === "text";
}

function live(element: LabelledElement): boolean {
	return element.isDeleted !== true;
}

/** What an element's `label`/`text` says its label should read, if anything. */
export function labelSeedOf(element: LabelledElement): string | undefined {
	if (isText(element)) return undefined;
	if (typeof element.label?.text === "string") return element.label.text;
	if (typeof element.text === "string") return element.text;
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
	elements: readonly LabelledElement[],
	claims?: LabelTraversalClaims,
): Map<string, string[]> {
	claims?.claim("records", elements.length);
	const byId = new Map<string, LabelledElement>();
	for (const element of elements) {
		if (element && typeof element.id === "string" && live(element)) byId.set(element.id, element);
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

	claims?.claim("records", elements.length);
	for (const element of elements) {
		if (!live(element) || !Array.isArray(element.boundElements)) continue;
		claims?.claim("bound-elements", element.boundElements.length);
		for (const ref of element.boundElements) {
			if (ref?.type !== "text" || typeof ref.id !== "string") continue;
			if (!isText(byId.get(ref.id))) continue;
			record(element.id, ref.id);
		}
	}

	claims?.claim("records", elements.length);
	for (const element of elements) {
		if (!live(element) || !isText(element)) continue;
		const container = element.containerId;
		if (typeof container !== "string" || !container) continue;
		if (!byId.has(container)) continue;
		record(container, element.id);
	}

	return found;
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
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isLinear(element: LabelledElement): boolean {
	return element.type === "arrow" || element.type === "line";
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
	text: LabelledElement,
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
	containerIds?: readonly string[],
): BoundTextMove[] {
	const byId = new Map<string, LabelledElement>();
	for (const element of elements) {
		if (element && typeof element.id === "string") byId.set(element.id, element);
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
 * server update the pane can put a label back on the thing it names, but it
 * must not fine-tune one: Excalidraw is the authority on where a label is drawn, and it
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
export function boundTextDrift(
	elements: readonly LabelledElement[],
	claims?: LabelTraversalClaims,
): BoundTextDrift[] {
	claims?.claim("records", elements.length);
	const byId = new Map<string, LabelledElement>();
	for (const element of elements) {
		if (element && typeof element.id === "string") byId.set(element.id, element);
	}

	const drifted: BoundTextDrift[] = [];
	const labelled = boundTextsByContainer(elements, claims);
	claims?.claim("label-graph", labelled.size);
	for (const [containerId, textIds] of labelled) {
		const container = byId.get(containerId);
		if (!container) continue;
		const anchor = labelAnchorOf(container);
		if (!anchor) continue;
		claims?.claim("label-graph", textIds.length);
		for (const textId of textIds) {
			const text = byId.get(textId);
			if (!text) continue;
			const x = num(text.x);
			const y = num(text.y);
			if (x === undefined || y === undefined) continue;
			const centreX = x + (num(text.width) ?? 0) / 2;
			const centreY = y + (num(text.height) ?? 0) / 2;
			const distance = Math.hypot(centreX - anchor.x, centreY - anchor.y);
			if (isLinear(container) && Array.isArray(container.points))
				claims?.claim("path-points", container.points.length);
			const allowed = anchorSlack(container);
			if (distance <= allowed) continue;
			drifted.push({
				containerId,
				containerType: container.type ?? "unknown",
				textId,
				text: String(text.text ?? ""),
				distance,
				allowed,
			});
		}
	}
	claims?.claimSort(drifted.length);
	return drifted.toSorted((a, b) => b.distance - a.distance);
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
export function planLabelRepair(
	elements: readonly LabelledElement[],
	claims?: LabelTraversalClaims,
): LabelRepairPlan {
	claims?.claim("records", elements.length);
	const byId = new Map<string, LabelledElement>();
	for (const element of elements) {
		if (element && typeof element.id === "string") byId.set(element.id, element);
	}

	const labelled = boundTextsByContainer(elements, claims);
	const duplicates: DuplicateLabel[] = [];
	const removeIds: string[] = [];
	const rebind: Array<{ id: string; boundElements: BoundRef[] }> = [];

	claims?.claim("label-graph", labelled.size);
	for (const [containerId, textIds] of labelled) {
		const container = byId.get(containerId);
		if (!container) continue;

		claims?.claim("label-graph", textIds.length);
		const textIdSet = new Set(textIds);
		let named: Readonly<BoundRef> | undefined;
		if (Array.isArray(container.boundElements))
			for (const ref of container.boundElements) {
				claims?.claim("forward-membership", 1);
				if (ref?.type === "text" && textIdSet.has(ref.id)) {
					named = ref;
					break;
				}
			}
		if (!named) claims?.claim("label-graph", textIds.length);
		const keep = named?.id ?? oldest(textIds, byId);
		claims?.claim("label-graph", textIds.length);
		const remove = textIds.filter((id) => id !== keep);

		if (remove.length > 0) {
			duplicates.push({
				containerId,
				containerType: container.type ?? "unknown",
				keep,
				remove,
				text: String(byId.get(keep)?.text ?? ""),
			});
			removeIds.push(...remove);
		}

		// Rewrite the container's list whenever it names a doomed text or fails to
		// name the keeper. Arrow bindings in the same list are left alone.
		const current = Array.isArray(container.boundElements) ? container.boundElements : [];
		claims?.claim("label-graph", remove.length);
		const gone = new Set(remove);
		claims?.claim("bound-elements", current.length);
		const wanted: BoundRef[] = [];
		let namesDoomed = false,
			namesKeeper = false,
			textCount = 0;
		for (const ref of current) {
			if (!ref) continue;
			if (gone.has(ref.id)) namesDoomed = true;
			if (ref.type === "text") {
				textCount += 1;
				if (ref.id === keep) namesKeeper = true;
			} else wanted.push(ref);
		}
		wanted.push({ id: keep, type: "text" });
		const extraTexts = textCount > 1;
		if (namesDoomed || !namesKeeper || extraTexts) {
			rebind.push({ id: containerId, boundElements: wanted });
		}
	}

	const orphanIds: string[] = [];
	claims?.claim("records", elements.length);
	for (const element of elements) {
		if (!isText(element) || !live(element)) continue;
		const container = element.containerId;
		if (typeof container === "string" && container && !byId.has(container)) {
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
		if (typeof a === "string" && (typeof b !== "string" || a < b)) best = id;
	}
	return best;
}

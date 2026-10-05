// A lit relationship, lit along the whole of its route.
//
// Where routes of one kind lie on one line, the renderer has the heaviest (then
// the earliest) draw that stretch once and cuts it out of the others with a
// mask, so a trunk reads as one line. The viewer lights by relationship, and a
// lit route's ink on a stretch another route draws is that route's: it recedes
// with it. The line is then lit up to the junction where it joins the trunk and
// pale along the trunk, as if it stopped there.
//
// So a lit route is given its ink back on those stretches. It is pointed at a
// copy of its mask without the cutouts a trunk asks for. The cutouts for a
// crossing (a gap under the line that crosses over, which tells a crossing from
// a join) and for a see-through label stay, and so does the picture's own rule
// for a selected route, which is drawn in full.
//
// The picture's markup is the renderer's. The viewer adds a copy of a mask
// beside the original and an inline style on the group, and takes the style
// away again when the route is no longer lit.

import { LIT_CLASS, SELECTED_CLASS } from "@/ui/semantic-board-canvas/lib/subjects";

/** Every relationship's line group that the picture masks. */
const MASKED_LINES = "g[data-semantic-kind='edge'][mask]";

/** What a copy of a mask is called beside the original. */
const LIT_SUFFIX = "-lit";

/**
 * Whether a piece of a mask cuts away a stretch another route of the trunk
 * draws. The renderer cuts a trunk with butt caps, a crossing with round ones
 * and a label with a box.
 * @param piece A child of a mask.
 * @returns True for a trunk's cutout.
 */
function isTrunkCutout(piece: Element): boolean {
	return piece.localName === "path" && piece.getAttribute("stroke-linecap") === "butt";
}

/**
 * The id a `mask` attribute refers to.
 * @param value The attribute: `url(#id)`.
 * @returns The id, or null for anything else.
 */
function referenceOf(value: string | null): string | null {
	return /^url\(#(.+)\)$/.exec(value ?? "")?.[1] ?? null;
}

/**
 * The mask of a route without the cutouts a trunk asks for, made once beside
 * the original.
 * @param masks The picture's masks by id, to which a copy is added.
 * @param id The route's own mask.
 * @returns The copy's id, or null when the route's mask asks nothing of a trunk.
 */
function maskWithoutTrunk(masks: Map<string, Element>, id: string): string | null {
	const own = masks.get(id);
	if (own === undefined || !Array.from(own.children).some(isTrunkCutout)) {
		return null;
	}
	const litId = `${id}${LIT_SUFFIX}`;
	if (!masks.has(litId)) {
		const copy = own.cloneNode(true);
		if (!(copy instanceof Element)) {
			return null;
		}
		copy.setAttribute("id", litId);
		for (const piece of Array.from(copy.children).filter(isTrunkCutout)) {
			piece.remove();
		}
		own.after(copy);
		masks.set(litId, copy);
	}
	return litId;
}

/**
 * Light one relationship's line along the whole of its route, or let it be
 * drawn as the picture draws it.
 * @param group The line's group.
 * @param masks The picture's masks by id.
 */
function lightRoute(group: SVGElement, masks: Map<string, Element>): void {
	const lit = group.classList.contains(LIT_CLASS) && !group.classList.contains(SELECTED_CLASS);
	const own = referenceOf(group.getAttribute("mask"));
	const id = lit && own !== null ? maskWithoutTrunk(masks, own) : null;
	if (id === null) {
		group.style.removeProperty("mask");
	} else {
		group.style.setProperty("mask", `url(#${id})`);
	}
}

/**
 * Light every lit relationship along the whole of its route, and let every other
 * one be drawn as the picture draws it.
 *
 * Read from the marks on the groups, so it is brought up to date by whatever
 * changes them: attention, a veil, the light a poke asks for.
 * @param root The picture's root.
 */
function lightInk(root: Element): void {
	const masks = new Map(Array.from(root.querySelectorAll("mask"), (mask) => [mask.id, mask]));
	for (const group of root.querySelectorAll(MASKED_LINES)) {
		if (group instanceof SVGElement) {
			lightRoute(group, masks);
		}
	}
}

export { lightInk };

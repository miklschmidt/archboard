// Carrying a card — a node, a container's frame or header, a connection's
// label — from where it was drawn to where it is drawn now.
//
// The frame rects, the body and the halo around it, are each an offset from
// the card's box, so they are drawn at the moving box plus that offset. The
// content is left exactly as the renderer drew it, at its final place, and the
// whole of it is translated back by however far the box still has to go; when
// the content changed, the old content is borrowed from the last picture and
// translated the same way from its own box, so that both ride inside the one
// moving frame while one cross-fades into the other. A frame whose look
// changed — a standing's outline taking it over, say — is cross-faded the same
// way, the old frame riding over the new. Content is clipped to the frame only
// while the frame changes size, which is when it could spill.

import { PICTURE_TRANSITION_PHASES } from "@/shared/timing/timing";
import type { SemanticBox } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	SVG_NS,
	easeInOut,
	easeOut,
	emphasised,
	mixBox,
	phase,
	sameBox,
	sameSize,
	scaleAbout,
	setOpacity,
	setRect,
	wrapContent,
	type Updater,
} from "@/ui/semantic-board-canvas/lib/picture-motion";
import {
	cloneElement,
	lineEnds,
	pairContent,
	type ContentPairing,
	rectBox,
	splitCard,
	type SubjectGroup,
} from "@/ui/semantic-board-canvas/lib/picture-pairing";

/** How much a card arriving grows from. */
const ARRIVE_SCALE = 0.94;

/**
 * How far, in the picture's units, a card's content travels as it swaps: the
 * old content drops this far while it fades, the new settles this far down
 * into place. A fraction of a card's height, so the content is seen to move
 * and never to leave.
 */
const CONTENT_DROP = 10;

/** One part of a card's frame, and how to draw it at wherever the card is. */
type FramePart = (box: SemanticBox) => void;

/**
 * A frame rect as an offset from the card's box: its own edges relative to
 * the box's, so it keeps its inset as the box moves and resizes.
 * @param rect The rect.
 * @param box The card's box.
 * @returns How to draw it at a box, or null when it has no box of its own.
 */
function rectPart(rect: Element, box: SemanticBox): FramePart | null {
	const own = rectBox(rect);
	if (own === null) {
		return null;
	}
	const dx = own.x - box.x;
	const dy = own.y - box.y;
	const dw = own.width - box.width;
	const dh = own.height - box.height;
	return (at: SemanticBox): void => {
		setRect(rect, { x: at.x + dx, y: at.y + dy, width: at.width + dw, height: at.height + dh });
	};
}

/**
 * A frame line as offsets from the card's box: each end relative to the
 * nearest edges, so a lifeline stretches with the frame it runs down.
 * @param line The line.
 * @param box The card's box.
 * @returns How to draw it at a box, or null when it has no ends of its own.
 */
function linePart(line: Element, box: SemanticBox): FramePart | null {
	const ends = lineEnds(line);
	if (ends === null) {
		return null;
	}
	const right = box.x + box.width;
	const bottom = box.y + box.height;
	const dx1 = ends.x1 - box.x;
	const dy1 = ends.y1 - box.y;
	const dx2 = ends.x2 - right;
	const dy2 = ends.y2 - bottom;
	return (at: SemanticBox): void => {
		line.setAttribute("x1", String(at.x + dx1));
		line.setAttribute("y1", String(at.y + dy1));
		line.setAttribute("x2", String(at.x + at.width + dx2));
		line.setAttribute("y2", String(at.y + at.height + dy2));
	};
}

/**
 * Each part of a frame, ready to be drawn at the moving box.
 * @param frame The frame's rects and lines.
 * @param box The card's box.
 * @returns The parts; one with no geometry of its own is left alone.
 */
function frameParts(frame: readonly Element[], box: SemanticBox): FramePart[] {
	return frame.flatMap((element) => {
		const part = element.tagName === "line" ? linePart(element, box) : rectPart(element, box);
		return part === null ? [] : [part];
	});
}

/**
 * Draw the frame at a box.
 * @param parts The frame's parts.
 * @param box Where the card is now.
 */
function placeFrames(parts: readonly FramePart[], box: SemanticBox): void {
	for (const part of parts) {
		part(box);
	}
}

/** The attributes of a frame part that say where it is rather than how it looks. */
const GEOMETRY = new Set(["x", "y", "width", "height", "x1", "y1", "x2", "y2"]);

/**
 * How a frame rect looks, apart from where it is.
 * @param rect The rect.
 * @returns Its non-geometric attributes, in one string.
 */
function frameLook(rect: Element): string {
	return rect
		.getAttributeNames()
		.filter((name) => !GEOMETRY.has(name))
		.toSorted()
		.map((name) => `${name}=${rect.getAttribute(name) ?? ""}`)
		.join(" ");
}

/**
 * The old frame rects whose look the new frame does not keep, cloned to ride
 * over the new frame and fade: an outline a standing took over, a fill that
 * changed. A rect that looks the same is not cloned; the new one is it.
 * @param oldFrame The frame rects of the card in the last picture.
 * @param frame The frame rects of the card in the next.
 * @returns The clones, in drawing order.
 */
function fadingFrame(oldFrame: readonly Element[], frame: readonly Element[]): Element[] {
	return oldFrame.flatMap((rect, index) => {
		const counterpart = frame[index];
		return counterpart !== undefined && frameLook(counterpart) === frameLook(rect)
			? []
			: [cloneElement(rect)];
	});
}

/** Where a transition puts the clips it adds. */
let clipSequence = 0;

/**
 * Clip a card's content to its frame while the frame changes size.
 *
 * The clip goes on the holder around the content wrappers, which is never
 * transformed: a clip is read in the coordinates of the element it is on, so
 * one on a translated wrapper would cut a rectangle that moved with it.
 * @param group The card's group.
 * @param frame Its frame rects, for the corner radius.
 * @param holder The untransformed group the content wrappers sit in.
 * @returns The clip's rect, to be moved with the frame.
 */
function clipTo(group: SVGGElement, frame: readonly Element[], holder: Element): Element {
	const owner = group.ownerDocument;
	clipSequence += 1;
	const id = `picture-transition-clip-${clipSequence}`;
	const clipPath = owner.createElementNS(SVG_NS, "clipPath");
	clipPath.setAttribute("id", id);
	const clip = owner.createElementNS(SVG_NS, "rect");
	const radius = frame.find((rect) => rect.hasAttribute("rx"))?.getAttribute("rx");
	if (radius !== undefined && radius !== null) {
		clip.setAttribute("rx", radius);
	}
	clipPath.append(clip);
	group.prepend(clipPath);
	holder.setAttribute("clip-path", `url(#${id})`);
	return clip;
}

/**
 * How close to the card's edge, in the picture's units, a mark sits to be
 * astride it: a standing's pin is inset three units from the body and a
 * warning badge sits in the top-right corner, both reaching outside the frame,
 * while a type chip is set well inside. Measured from the halo the card is
 * boxed by, which lies three units outside the body.
 */
const MARK_MARGIN = 14;

/**
 * Where a `<g transform="translate(x,y)">` is placed.
 * @param element The element.
 * @returns The point, or null when it is not placed by a translate.
 */
function translateOf(element: Element): { readonly x: number; readonly y: number } | null {
	const match = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(
		element.getAttribute("transform") ?? "",
	);
	return match === null ? null : { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * Whether a content element is a mark astride the card's edge — a standing's
 * pin, a warning badge — rather than something drawn inside it.
 *
 * Such a mark reaches outside the frame by design, so it must not be clipped
 * to the frame while the card is in flight: clipped, it would be cut to a
 * sliver and pop back whole when the picture lands.
 * @param element The element.
 * @param box The card's box.
 * @returns True for a mark.
 */
function isCornerMark(element: Element, box: SemanticBox): boolean {
	const at = element.tagName === "g" ? translateOf(element) : null;
	if (at === null) {
		return false;
	}
	const nearX = at.x - box.x < MARK_MARGIN || box.x + box.width - at.x < MARK_MARGIN;
	const nearY = at.y - box.y < MARK_MARGIN || box.y + box.height - at.y < MARK_MARGIN;
	return nearX || nearY;
}

/** One role's content, in the wrappers it rides in: inside the clip, and astride the edge. */
type Wrapped = readonly SVGGElement[];

/** The wrappers a card's content and old frame ride in. */
interface Wrappers {
	/** The untransformed group the clipped content wrappers sit in, which carries the clip. */
	readonly holder: SVGGElement;
	/** The content both pictures draw, which glides with the frame. */
	readonly kept: Wrapped;
	/** The content only the new picture draws. */
	readonly incoming: Wrapped;
	/** The content only the old picture drew, borrowed. */
	readonly outgoing: Wrapped;
	/** The old frame rects whose look changed, riding over the new frame; null when none did. */
	readonly oldFrame: SVGGElement | null;
}

/**
 * Wrap one role's content twice over: what is drawn inside the frame in a
 * wrapper that goes under the clip, and the marks astride the edge in one
 * that does not. Either is left out when there is nothing for it.
 * @param owner The document.
 * @param role What the wrappers hold.
 * @param members The content.
 * @param box The card's box, for telling a mark from the rest.
 * @returns The clipped wrapper, if any, and the unclipped one, if any.
 */
function wrapRole(
	owner: Document,
	role: string,
	members: readonly Element[],
	box: SemanticBox,
): { readonly inside: SVGGElement | null; readonly marks: SVGGElement | null } {
	const marks = members.filter((element) => isCornerMark(element, box));
	const inside = members.filter((element) => !isCornerMark(element, box));
	return {
		inside: inside.length === 0 ? null : wrapContent(owner, role, inside),
		marks: marks.length === 0 ? null : wrapContent(owner, `${role}-marks`, marks),
	};
}

/**
 * Put the card's content in wrappers of the transition's own: what both
 * pictures draw, what only the new draws, and what only the old drew
 * borrowed; each split between the clipped holder and the marks astride the
 * edge, which ride outside it. The old frame, when its look changed, goes
 * beside them.
 * @param group The card's group in the next picture.
 * @param content The card's content, paired between the two pictures.
 * @param fading The old frame rects whose look changed, already cloned.
 * @param box The card's box in the next picture.
 * @returns The wrappers.
 */
function mountWrappers(
	group: SVGGElement,
	content: ContentPairing,
	fading: readonly Element[],
	box: SemanticBox,
): Wrappers {
	const owner = group.ownerDocument;
	const oldFrame = fading.length === 0 ? null : wrapContent(owner, "outgoing-frame", fading);
	const kept = wrapRole(owner, "kept", content.kept, box);
	const outgoing = wrapRole(owner, "outgoing", content.leaving.map(cloneElement), box);
	const incoming = wrapRole(owner, "incoming", content.arriving, box);
	const roles = [kept, outgoing, incoming];
	const holder = wrapContent(
		owner,
		"content",
		roles.flatMap((role) => (role.inside === null ? [] : [role.inside])),
	);
	// Drawing order: the new frame, the old frame over it, the clipped content,
	// then the marks astride the edge on top of everything.
	if (oldFrame !== null) {
		group.append(oldFrame);
	}
	group.append(holder, ...roles.flatMap((role) => (role.marks === null ? [] : [role.marks])));
	return {
		holder,
		kept: [kept.inside, kept.marks].filter((wrapper) => wrapper !== null),
		incoming: [incoming.inside, incoming.marks].filter((wrapper) => wrapper !== null),
		outgoing: [outgoing.inside, outgoing.marks].filter((wrapper) => wrapper !== null),
		oldFrame,
	};
}

/** What one card carries between its two boxes. */
interface Carried extends Wrappers {
	readonly from: SemanticBox;
	readonly to: SemanticBox;
	readonly frames: readonly FramePart[];
	readonly oldFrames: readonly FramePart[];
	readonly clip: Element | null;
}

/**
 * Place and fade one role's wrappers together.
 * @param wrappers The wrappers.
 * @param dx How far across from where they were drawn.
 * @param dy How far down from where they were drawn.
 * @param opacity How visible.
 */
function placeWrapped(wrappers: Wrapped, dx: number, dy: number, opacity: number): void {
	for (const wrapper of wrappers) {
		wrapper.setAttribute("transform", `translate(${dx},${dy})`);
		wrapper.style.opacity = String(opacity);
	}
}

/**
 * Draw the content swap at a moment: what leaves drops away as it fades, and
 * once it is gone what arrives settles down into place from just above. One
 * after the other, so nothing is seen twice at once.
 * @param carried What the card carries.
 * @param box Where the card is now.
 * @param progress How far through the whole transition.
 */
function swapContent(carried: Carried, box: SemanticBox, progress: number): void {
	const { from, to, incoming, outgoing } = carried;
	const { fadeStart, swapAt, fadeEnd } = PICTURE_TRANSITION_PHASES;
	const gone = easeInOut(phase(progress, fadeStart, swapAt));
	placeWrapped(outgoing, box.x - from.x, box.y - from.y + CONTENT_DROP * gone, 1 - gone);
	const here = easeInOut(phase(progress, swapAt, fadeEnd));
	placeWrapped(incoming, box.x - to.x, box.y - to.y - CONTENT_DROP * (1 - here), here);
}

/**
 * The step that draws one carried card at a moment.
 * @param carried What the card carries.
 * @returns The step.
 */
function cardStep(carried: Carried): Updater {
	const { from, to, frames, oldFrames, kept, oldFrame, clip } = carried;
	const { moveStart, moveEnd, fadeStart, fadeEnd } = PICTURE_TRANSITION_PHASES;
	return (progress: number): void => {
		const box = mixBox(from, to, emphasised(phase(progress, moveStart, moveEnd)));
		placeFrames(frames, box);
		placeFrames(oldFrames, box);
		if (clip !== null) {
			setRect(clip, box);
		}
		if (oldFrame !== null) {
			oldFrame.style.opacity = String(1 - easeInOut(phase(progress, fadeStart, fadeEnd)));
		}
		placeWrapped(kept, box.x - to.x, box.y - to.y, 1);
		swapContent(carried, box, progress);
	};
}

/**
 * Whether any of a card's content changed between the two pictures.
 * @param content The content, paired.
 * @returns True when something leaves or arrives.
 */
function swaps(content: ContentPairing): boolean {
	return content.arriving.length > 0 || content.leaving.length > 0;
}

/**
 * Carry a card from where it was to where it is, swapping over on the way
 * whatever of its content changed.
 * @param before The card in the last picture.
 * @param from Its box there.
 * @param after The card in the next.
 * @param to Its box there.
 * @returns The step, or null when the card neither moved nor changed.
 */
function carryCard(
	before: SubjectGroup,
	from: SemanticBox,
	after: SubjectGroup,
	to: SemanticBox,
): Updater | null {
	const next = splitCard(after.element, to);
	const old = splitCard(before.element, from);
	const content = pairContent(old.content, next.content);
	const changed = swaps(content);
	const fading = fadingFrame(old.frame, next.frame);
	if (sameBox(from, to) && !changed && fading.length === 0) {
		return null;
	}
	const wrappers = mountWrappers(after.element, content, fading, to);
	// Clipped while the frame changes size, and while content swaps: the old
	// content drops as it goes, and must not be seen below the frame.
	const clip =
		sameSize(from, to) && !changed ? null : clipTo(after.element, next.frame, wrappers.holder);
	return cardStep({
		...wrappers,
		from,
		to,
		frames: frameParts(next.frame, to),
		oldFrames: frameParts(fading, from),
		clip,
	});
}

/**
 * Let a card only the new picture has arrive: it grows into place and fades in.
 * @param group The card's group.
 * @param start Where in the whole its arrival begins; by default where a transition's arrivals do.
 * @param end Where it is in place.
 * @returns The step.
 */
function growIn(
	group: SubjectGroup,
	start: number = PICTURE_TRANSITION_PHASES.enterStart,
	end = 1,
): Updater {
	const box = group.box;
	return (progress: number): void => {
		const here = phase(progress, start, end);
		setOpacity(group.element, easeOut(here));
		if (box !== null) {
			group.element.setAttribute(
				"transform",
				scaleAbout(box, ARRIVE_SCALE + (1 - ARRIVE_SCALE) * emphasised(here)),
			);
		}
	};
}

export { carryCard, growIn };

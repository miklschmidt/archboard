// How a variant's subjects are drawn against the variant it is read against.
//
// Nothing here is authored and nothing here is stored. A caller hands one render
// a plain map of subject id to standing, derived that instant by reading the
// variant against the board's current one (or, on a board with none, the one it
// came from), and this file is the whole of what that map
// does to the picture (ADR 0023: the board owns meaning, the renderer owns
// presentation). Hand in no map and every function here returns nothing, which
// is what keeps a variant with nothing to read it against drawn exactly as it is.
//
// ## The vocabulary
//
// Three channels say the same thing three times, so that no one of them has to
// be read correctly on its own:
//
//   **Shape.** A pin on the subject's top-left corner: a crossed bar for added,
//   a single bar for removed, a wave for changed. Three silhouettes, told apart
//   by their outlines at any size and in a photocopy. They are marks rather than
//   words — paths, not `<text>` — because a legend and a caption are the
//   viewer's business and would be text this module invented.
//
//   **Lightness.** A removed subject, and only a removed subject, is ghosted.
//   That is the one thing a reader has to get right without looking twice,
//   because a removed subject is drawn as context for the change and is *not on
//   the proposal*. A thing you can see through is not a thing the design claims
//   to have. A line is ghosted whole: its group drops in opacity, its ink
//   weakened less than a live line's so it keeps APCA Lc 30, the floor for a mark
//   ({@link ghostOpacity}, `drawnInk`). A card, a
//   container, a participant and a label are blocks (`slab.ts`), and a removed
//   one has lost its thickness: a flat, see-through face with no front edge and
//   no shadow, its words faded to the secondary ink, which still keeps APCA Lc 60
//   ({@link standingPalette}). A removed message's words are faded the same way.
//
//   **Texture.** The block's outline says it a third time. A standing takes
//   over the outline of a block's top face, as it took over a card's outline
//   before the blocks: a border in its ink along the face's edge, inside it,
//   solid for added and dashed for changed (`standingBorder` in `slab.ts`). The face
//   keeps its group's tint and the front edge its group's colour; a container's
//   border runs round its tray, whose walls are its outline. A removed block
//   leaves the dashed border of a removal round its footprint. On a line — where a dash already means
//   what kind of relationship it is, and the stroke weight already means how much
//   attention its author asked for — the texture is carried by a wide tinted
//   swipe laid under the line instead, so neither of the two meanings the line
//   already carries is overwritten.
//
// A message of a sequence is the exception, because a sequence is read a row at
// a time, the way a diff is. Its standing is marked on its row (`flow-rows.ts`):
// a faint band of the standing's ink behind the row and the pin in the frame's
// margin, with the line in that ink and a removal ghosted. A swipe under the
// line and a dashed rule round the label said the same fact twice more, and a
// page of them read as a column of dashed boxes.
//
// Only then colour, and colour never alone: green added, orange changed, red
// removed, from the palette. Take all three hues away and the picture still
// reads — pin shape, ghosting and the border's texture are each sufficient.
//
// ## What it deliberately does not touch
//
// Geometry. Every mark here is painted on a box the layout had already
// decided on, or under a route that was already routed. Channel allocation
// happens earlier in the layout owner and may change routes and their space
// requirements when comparison standings differ. This painter moves nothing
// against anything else: where a corner mark reaches past a subject on the
// page's top or left margin, the page grows to keep the margin
// ({@link markedBox}) and the whole drawing moves in by that much, as one.
//
// The selection halo. That ring sits three units *outside* a subject and is
// invisible until a viewer puts `is-selected` on the group; the standing's
// border is inside the subject's face and its pin on its corner, so a selected
// added node shows the border and one ring outside it, never two rings. A
// removed block has no face to sit inside: its selection ring is drawn over
// its footprint's border rather than around it.
//
// ## The warning, which is not a standing
//
// A reconciliation nobody has decided yet is a different kind of fact: not what
// this proposal did to its source, but that the two disagree and that the
// disagreement is open. It is drawn from here because it is the same sort of
// derived-and-never-stored overlay, and it is drawn deliberately unlike the
// three: a triangle rather than a disc, the top-right corner rather than the
// top-left, the shell's warning ink rather than one of the three standing hues.
// A subject can be added and unsettled at once and both marks stay legible,
// because they never share a corner.
//
// It was a ring before this. The viewer lit a subject's own selection halo
// dashed, which meant a page could show a solid ring, a dashed ring and a
// dashed outline at once with nothing to say which of the three a reader was
// looking at — and a subject that was both attended and unsettled lost the
// dispute altogether, because one map held one mark per subject.

import type { ChangeKind } from "@/shared/semantic-board/index";
import { coord, union, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { tag, wrap, type Attributes } from "@/transformers/semantic-renderer/lib/svg/primitives";

// The comparison's word for this is `ChangeKind` and the render contract's is a
// subject standing. They are one vocabulary with two names, so this is an alias
// rather than a second declaration: a fifth standing added to the board contract
// is a type error here rather than a silently undrawn case.

/** How one subject of a proposal stands against the variant it came from. */
type SubjectStanding = ChangeKind;

/** What every subject of a picture states, by the id the board gave it. */
type StatedStandings = Readonly<Record<string, SubjectStanding>>;

/**
 * How one subject stands, by id, or undefined throughout when the caller stated
 * nothing — which is to say, when this is not a proposal.
 */
type StandingOf = (id: string) => SubjectStanding | undefined;

/** Which sort of subject a drawn group is, for the hook a viewer selects by. */
type SubjectKind = "node" | "edge" | "region" | "flow" | "step";

/** How far in from a subject's corner its pin sits, and how big the pin is. */
const PIN_INSET = 3;
const PIN_RADIUS = 9.2;

const PIN_STROKE = 1.7;
/**
 * The rim of the page's ground round a pin, which cuts it cleanly out of the
 * edge, the highlight and the shadow of the corner it stands on.
 */
const PIN_RIM = 1.5;

/**
 * What a ghosted line's ink is worth: clearly fainter than the proposal's own
 * lines, and still APCA Lc 30 on every ground it crosses, as a mark that means
 * something must be. Its dashed swipe and the missing pulses say the rest.
 */
const GHOST_OPACITY = 0.7;

/**
 * The border a standing draws round a block's top face, which it takes over as
 * the block's outline: how heavy it is, and its texture, solid for added and
 * dashed for changed and for removed.
 */
const OUTLINE_WIDTH = 1.8;
const OUTLINE_DASH: Readonly<Record<SubjectStanding, string | undefined>> = {
	added: undefined,
	removed: "7 3.5",
	changed: "7 3.5",
	unchanged: undefined,
};

/**
 * How much wider than its line a standing's swipe is drawn.
 *
 * Wide enough to read as a band behind the line and narrow enough that the line
 * is still the thing being followed. Wider than this and a marked relationship
 * becomes the loudest object on the page — which is wrong for all three
 * standings and badly wrong for a removal, whose whole job is to be quiet.
 */
const SWIPE_EXTRA = 4;

/**
 * The mark each standing wears, drawn in a ten-unit square about the origin.
 *
 * A crossed bar for something that was put there, one bar for something that was
 * taken away, a wave for something that says the same thing differently. An
 * unchanged subject wears nothing, because most of a proposal is unchanged and a
 * mark on all of it would mark none of it.
 */
const PIN_GLYPH: Readonly<Record<SubjectStanding, string>> = {
	added: "M-2.5,0 H2.5 M0,-2.5 V2.5",
	removed: "M-2.7,0 H2.7",
	changed: "M-2.9,0.9 Q-1.45,-2 0,0 Q1.45,2 2.9,-0.9",
	unchanged: "",
};

/**
 * The texture a swipe under a line takes: solid for added, a dash for changed
 * and for removed.
 *
 * A dash longer than the band is thick, because a band several units wide with
 * square ends needs one or the texture stops reading as a broken line and
 * starts reading as a row of beads.
 */
const SWIPE_DASH: Readonly<Record<SubjectStanding, string | undefined>> = {
	added: undefined,
	removed: "7 3.5",
	changed: "7 3.5",
	unchanged: undefined,
};

/**
 * How solid a swipe is: the same for every standing. A removed line's swipe is
 * ghosted with the rest of its group rather than exempted from it, which would
 * leave a removed line whose brightest part was the mark saying it is not there.
 */
const SWIPE_OPACITY: Readonly<Record<SubjectStanding, number>> = {
	added: 0.32,
	removed: 0.32,
	changed: 0.32,
	unchanged: 0,
};

/**
 * The ink one standing is drawn in, and the one question every channel asks.
 *
 * The line, the arrowhead it ends in and the pulses that ride it all ask this, so
 * a relationship drawn as changed is amber all the way through instead of an
 * amber band behind a grey line — which reads as a glow behind something
 * unrelated to it rather than as the line's own standing.
 * @param standing How the subject stands.
 * @param palette The theme's colours.
 * @returns The colour, or undefined for a subject that stands unchanged.
 */
function standingInk(standing: SubjectStanding, palette: Palette): string | undefined {
	if (standing === "added") {
		return palette.standingAdded;
	}
	if (standing === "removed") {
		return palette.standingRemoved;
	}
	return standing === "changed" ? palette.standingChanged : undefined;
}

/**
 * A stated map of standings, read as a lookup.
 *
 * An id the map does not mention stands unchanged: a caller states what moved,
 * not what did not. No map at all is the different answer — this picture is not
 * a proposal, so no subject of it has a standing to draw or to say out loud.
 * @param stated What the caller said, or undefined when it said nothing.
 * @returns The lookup.
 */
function standingsFrom(stated: StatedStandings | undefined): StandingOf {
	if (stated === undefined) {
		return () => undefined;
	}
	return (id: string) => stated[id] ?? "unchanged";
}

/**
 * The attribute a relationship's traffic layer carries, naming the
 * relationship: the layer is drawn apart from its line, over every line, and a
 * viewer lights, dims and raises it with the line it names.
 */
const TRAFFIC_ATTRIBUTE = "data-traffic";

/**
 * The attribute on a mark that stands with the subjects it lists,
 * space-separated: a group's region lists its cards, and a junction mark the
 * relationships that join or part at it. A viewer lights the mark while one of
 * them is lit.
 */
const MEMBERS_ATTRIBUTE = "data-members";

/**
 * The attribute on the group that holds one flow's row of participant cards,
 * naming the flow. A viewer slides the row down its lifelines to keep it in
 * view over rows further down.
 */
const HEAD_ATTRIBUTE = "data-flow-head";

/**
 * The attribute on a group that draws one part of a subject drawn in two: a
 * container's header, a relationship's or a message's label, a participant's
 * lifeline. A viewer says more about a subject where its words are.
 */
const PART_ATTRIBUTE = "data-semantic-part";

/**
 * The attributes every drawn subject's group carries: what it is, which subject
 * it is, and how it stands.
 *
 * One place, so that a group a viewer can select is a group a viewer can select
 * by standing, without each painter having to remember to say so.
 * @param kind Which sort of subject this is.
 * @param id The subject's semantic id.
 * @param standing How it stands, or undefined when this is not a proposal.
 * @returns The group's attributes.
 */
function subjectGroup(
	kind: SubjectKind,
	id: string,
	standing: SubjectStanding | undefined,
): Attributes {
	return {
		"data-semantic-kind": kind,
		"data-semantic-id": id,
		"data-semantic-standing": standing,
	};
}

/**
 * The ghosting of a removed line: a relationship's route, a message and its
 * words, a participant's column of time. A block draws its own ghost
 * (`slab.ts`) and its group stays at full strength.
 * @param standing How the subject stands, or undefined when this is not a proposal.
 * @returns The opacity its group takes, or undefined for a line still on the proposal.
 */
function ghostOpacity(standing: SubjectStanding | undefined): number | undefined {
	return standing === "removed" ? GHOST_OPACITY : undefined;
}

/**
 * The colours a subject's own words are drawn with: a removed block's names
 * and notes are faded to the secondary ink, which keeps APCA Lc 60 on its
 * see-through face as it does on every surface it can lie on.
 * @param palette The theme's colours.
 * @param standing How the subject stands, or undefined when this is not a proposal.
 * @returns The palette its words take.
 */
function standingPalette(palette: Palette, standing: SubjectStanding | undefined): Palette {
	return standing === "removed"
		? { ...palette, foreground: palette.muted, pillText: palette.muted }
		: palette;
}

/**
 * Whether a subject of some standing wears a pin in its corner: every
 * standing but unchanged, which has no glyph. The page is fitted to the
 * pins this says are drawn.
 * @param standing The standing, if the picture is a proposal.
 * @returns True when it does.
 */
function drawsPin(standing: SubjectStanding | undefined): standing is SubjectStanding {
	return standing !== undefined && PIN_GLYPH[standing] !== "";
}

/**
 * The pin on a subject's top-left corner.
 *
 * Centred just inside the corner and large enough to read at a glance, so it
 * stands on the corner and reaches past the subject's outline. The page counts
 * that reach ({@link markedBox}): a pinned subject on the page's top or left
 * margin moves the drawing in, and the pin keeps the margin every other edge
 * keeps. The atlas covers the subject, not its pin.
 * @param box The subject's box.
 * @param standing How it stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The pin, or nothing to draw.
 */
function standingPin(box: Box, standing: SubjectStanding | undefined, palette: Palette): string {
	return standingPinAt(box.x + PIN_INSET, box.y + PIN_INSET, standing, palette);
}

/**
 * The pin, centred on a point: a corner's, or the margin beside a row of a
 * sequence, which has no corner of its own.
 * @param x Where its centre goes.
 * @param y The same.
 * @param standing How the subject stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The pin, or nothing to draw.
 */
function standingPinAt(
	x: number,
	y: number,
	standing: SubjectStanding | undefined,
	palette: Palette,
): string {
	const ink = drawsPin(standing) ? standingInk(standing, palette) : undefined;
	if (standing === undefined || ink === undefined) {
		return "";
	}
	return wrap(
		"g",
		{ transform: `translate(${coord(x)},${coord(y)})` },
		tag("circle", {
			r: PIN_RADIUS,
			fill: ink,
			stroke: palette.background,
			"stroke-width": PIN_RIM,
		}) +
			tag("path", {
				d: PIN_GLYPH[standing],
				fill: "none",
				stroke: palette.background,
				"stroke-width": PIN_STROKE,
				"stroke-linecap": "round",
			}),
	);
}

/**
 * The swipe laid under a line that stands for something.
 *
 * A line has no outline to take over and no corner to pin, and the two things it
 * already says with its own stroke — dash for what sort of relationship it is,
 * weight for how much attention its author asked for — are not available to be
 * borrowed. So the standing is drawn beside the line rather than on it: a band
 * wide enough to read from across the room, tinted rather than solid so the line
 * it belongs to is still the thing you follow, and textured with the same three
 * dashes every other subject wears.
 *
 * Wider than the selection halo and painted under it, so that a selected line
 * shows its cobalt ring with the swipe still visible either side of it.
 * @param path The line's own `d`.
 * @param width The line's own stroke width.
 * @param standing How it stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The swipe, or nothing to draw.
 */
function standingSwipe(
	path: string,
	width: number,
	standing: SubjectStanding | undefined,
	palette: Palette,
): string {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	if (standing === undefined || ink === undefined) {
		return "";
	}
	return tag("path", {
		d: path,
		fill: "none",
		stroke: ink,
		"stroke-width": width + SWIPE_EXTRA,
		"stroke-opacity": SWIPE_OPACITY[standing],
		// Square ends, unlike the line it sits under. A round cap on a band this
		// wide turns every dash into a bead and every dotted swipe into a string
		// of them; the join stays round so a route's corners do not spike.
		"stroke-linecap": "butt",
		"stroke-linejoin": "round",
		"stroke-dasharray": SWIPE_DASH[standing],
	});
}

/**
 * Which subjects the board says nobody has decided yet.
 *
 * The same shape as a standing lookup and for the same reason: the caller
 * derives it at the moment of the render — the render route already computes it
 * for the words beside the picture — and nothing about it is stored on a board.
 */
type UnsettledOf = (id: string) => boolean;

/** How big the warning triangle is, corner to corner. */
const BADGE_SIZE = 11;

/**
 * The triangle, drawn about its own centre, and the bar and dot inside it.
 *
 * A silhouette no standing wears: the three pins are discs, and this is the
 * shape that means "look at this before you trust it" everywhere else a person
 * has seen one. It reaches this far from its centre, to each side, above and
 * below, which the page counts where it reaches past a subject.
 */
const BADGE_REACH = { side: 5.4, above: 5.2, below: 4.4 };
const BADGE_GLYPH = `M0,-${BADGE_REACH.above} L${BADGE_REACH.side},${BADGE_REACH.below} H-${BADGE_REACH.side} Z`;
const BADGE_BANG = "M0,-2.4 V0.9";
const BADGE_DOT = "M0,2.6 V2.9";

/**
 * The warning mark, centred whereever it was put.
 *
 * Drawn as a filled triangle with the ground knocked out of it, exactly as a
 * standing pin is, so the two read as one family of marks at one size while
 * saying different things.
 * @param x Where its centre goes.
 * @param y The same.
 * @param palette The theme's colours.
 * @returns The badge.
 */
function warningMark(x: number, y: number, palette: Palette): string {
	return wrap(
		"g",
		{ transform: `translate(${coord(x)},${coord(y)})`, "pointer-events": "none" },
		tag("path", { d: BADGE_GLYPH, fill: palette.warning }) +
			tag("path", {
				d: `${BADGE_BANG} ${BADGE_DOT}`,
				fill: "none",
				stroke: palette.background,
				"stroke-width": PIN_STROKE,
				"stroke-linecap": "round",
			}),
	);
}

/**
 * The warning on a box's top-right corner.
 *
 * The mirror of the standing pin's corner, so a subject that is both marked
 * says both without either mark moving. Centred as far in from the corner as
 * the pin, it reaches a little past the outline, and the page counts that reach
 * as it counts the pin's ({@link markedBox}); inside, it stands in the
 * right-hand padding every box already leaves, so no word is ever nearer to it
 * than the padding allows and nothing had to be re-measured to make room.
 * @param box The subject's box.
 * @param unsettled Whether the board says this subject is undecided.
 * @param palette The theme's colours.
 * @returns The badge, or nothing to draw.
 */
function warningBadge(box: Box, unsettled: boolean, palette: Palette): string {
	if (!unsettled) {
		return "";
	}
	return warningMark(box.x + box.width - PIN_INSET, box.y + PIN_INSET, palette);
}

/**
 * What a subject's box and the marks on its corners cover, which the page must
 * hold: its pin where it stands for something, and its warning where the board
 * says it is undecided. Nothing is added where neither is drawn.
 * @param box The subject's box.
 * @param standing How it stands, or undefined when this is not a proposal.
 * @param unsettled Whether the board says it is undecided.
 * @returns The box, grown to its marks.
 */
function markedBox(box: Box, standing: SubjectStanding | undefined, unsettled: boolean): Box {
	const pin = {
		x: box.x + PIN_INSET - PIN_RADIUS,
		y: box.y + PIN_INSET - PIN_RADIUS,
		width: 2 * PIN_RADIUS,
		height: 2 * PIN_RADIUS,
	};
	const badge = {
		x: box.x + box.width - PIN_INSET - BADGE_REACH.side,
		y: box.y + PIN_INSET - BADGE_REACH.above,
		width: 2 * BADGE_REACH.side,
		height: BADGE_REACH.above + BADGE_REACH.below,
	};
	return union([box, ...(drawsPin(standing) ? [pin] : []), ...(unsettled ? [badge] : [])])!;
}

/**
 * The warning on a line, which has no corner to put one in.
 *
 * On the leading edge of the words it carries, when it carries any: a pill is
 * opaque and padded, so a mark straddling its left edge is clear of its text
 * and is where a reader is already looking. A line with no words takes it at
 * the point the label pass would have put them.
 * @param at Where to centre it.
 * @param unsettled Whether the board says this relationship is undecided.
 * @param palette The theme's colours.
 * @returns The badge, or nothing to draw.
 */
function warningOnLine(
	at: { readonly x: number; readonly y: number } | undefined,
	unsettled: boolean,
	palette: Palette,
): string {
	if (!unsettled || at === undefined) {
		return "";
	}
	return warningMark(at.x, at.y, palette);
}

/**
 * What the caller said is unsettled, read as a lookup.
 * @param stated The subject ids, or undefined when the caller said nothing.
 * @returns The lookup, which answers false for everything when nothing was said.
 */
function unsettledFrom(stated: readonly string[] | undefined): UnsettledOf {
	if (stated === undefined || stated.length === 0) {
		return () => false;
	}
	const held = new Set(stated);
	return (id: string) => held.has(id);
}

export {
	type SubjectStanding,
	type StatedStandings,
	type StandingOf,
	type SubjectKind,
	type UnsettledOf,
	BADGE_SIZE,
	OUTLINE_DASH,
	OUTLINE_WIDTH,
	PIN_INSET,
	HEAD_ATTRIBUTE,
	PART_ATTRIBUTE,
	MEMBERS_ATTRIBUTE,
	TRAFFIC_ATTRIBUTE,
	ghostOpacity,
	markedBox,
	standingInk,
	standingPalette,
	standingsFrom,
	subjectGroup,
	standingPin,
	standingPinAt,
	standingSwipe,
	unsettledFrom,
	warningBadge,
	warningOnLine,
};

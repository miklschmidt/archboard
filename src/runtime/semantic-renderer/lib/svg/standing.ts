// How a proposal's subjects are drawn against the variant they came from.
//
// Nothing here is authored and nothing here is stored. A caller hands one render
// a plain map of subject id to standing, derived that instant by reading the
// proposal against its predecessor, and this file is the whole of what that map
// does to the picture (ADR 0023: the board owns meaning, the renderer owns
// presentation). Hand in no map and every function here returns nothing, which
// is what keeps a board that is not a proposal drawn exactly as it was.
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
//   **Lightness.** A removed subject, and only a removed subject, is ghosted:
//   the whole group drops to half opacity, fill, words and all. That is the one
//   thing a reader has to get right without looking twice, because a removed
//   subject is drawn as context for the change and is *not on the proposal*. A
//   thing you can see through is not a thing the design claims to have.
//
//   **Texture.** The outline says it a third time: solid for added, a long dash
//   for changed, a fine dot for removed. On a line — where a dash already means
//   what kind of relationship it is, and the stroke weight already means how much
//   attention its author asked for — the texture is carried by a wide tinted
//   swipe laid under the line instead, so neither of the two meanings the line
//   already carries is overwritten.
//
// Only then colour, and colour never alone: green added, amber changed, red
// removed, from the palette. Take all three hues away and the picture still
// reads — pin shape, ghosting and outline texture are each sufficient.
//
// ## What it deliberately does not touch
//
// Geometry. Every mark here is painted inside a box the layout had already
// decided on, or under a route that was already routed, so the same content
// draws at the same size and the atlas says the same thing whether or not a
// standing was handed in.
//
// The selection halo. That ring sits three units *outside* a subject and is
// invisible until a viewer puts `is-selected` on the group; the standing sits on
// the subject's own outline and inside its own corner. A selected added node
// shows both, concentric, and neither is the other.

import type { ChangeKind } from "@/shared/semantic-board/index";
import { coord, type Box } from "@/runtime/semantic-renderer/lib/geometry";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import { tag, wrap, type Attributes } from "@/runtime/semantic-renderer/lib/svg/primitives";

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
const PIN_INSET = 6;
const PIN_RADIUS = 5.2;
const PIN_STROKE = 1.7;

/** What a ghosted subject's ink is worth. */
const GHOST_OPACITY = 0.5;

/** How heavy a standing makes a subject's own outline. */
const OUTLINE_WIDTH = 1.8;

/**
 * How much wider than its line a standing's swipe is drawn.
 *
 * Wide enough to read as a band behind the line and narrow enough that the line
 * is still the thing being followed. Wider than this and a marked relationship
 * becomes the loudest object on the page — which is wrong for all three
 * standings and badly wrong for a removal, whose whole job is to be quiet.
 */
const SWIPE_EXTRA = 7;

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

/** The texture each standing puts on a subject's own outline. */
const OUTLINE_DASH: Readonly<Record<SubjectStanding, string | undefined>> = {
	added: undefined,
	removed: "2 3.4",
	changed: "7 3.5",
	unchanged: undefined,
};

/**
 * The same three textures, at the scale a swipe under a line is drawn at.
 *
 * Longer than the outline's, because a band several units wide with square ends
 * needs a dash longer than it is thick or the texture stops reading as a broken
 * line and starts reading as a row of beads.
 */
const SWIPE_DASH: Readonly<Record<SubjectStanding, string | undefined>> = {
	added: undefined,
	removed: "3 5.5",
	changed: "11 6",
	unchanged: undefined,
};

/**
 * How solid a swipe is.
 *
 * A removed subject's whole group is already at half opacity, so its swipe is
 * stated at roughly twice the others to land on the same tint once the ghosting
 * has been applied to it. The alternative — exempting the swipe from the ghost —
 * would mean a removed line whose brightest part was the mark saying it is not
 * there.
 */
const SWIPE_OPACITY: Readonly<Record<SubjectStanding, number>> = {
	added: 0.32,
	removed: 0.6,
	changed: 0.32,
	unchanged: 0,
};

/**
 * The ink one standing is drawn in.
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
 * The attributes every drawn subject's group carries: what it is, which subject
 * it is, how it stands, and the ghosting that half of a removal is.
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
		opacity: standing === "removed" ? GHOST_OPACITY : undefined,
	};
}

/**
 * What a standing does to a subject's own outline: takes it over, heavier and in
 * the standing's ink and texture.
 *
 * Taking the outline over rather than adding a second rule around it is what
 * keeps the geometry untouched — the rule was already being drawn, and it is
 * drawn differently.
 * @param standing How the subject stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns Attributes to spread over the subject's own, empty when there is nothing to say.
 */
function standingOutline(
	standing: SubjectStanding | undefined,
	palette: Palette,
): Readonly<Attributes> {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	if (standing === undefined || ink === undefined) {
		return {};
	}
	return {
		stroke: ink,
		"stroke-width": OUTLINE_WIDTH,
		"stroke-dasharray": OUTLINE_DASH[standing],
	};
}

/**
 * The pin on a subject's top-left corner.
 *
 * Inside the box rather than astride its corner, for two reasons that agree: a
 * mark reaching outside a subject would be a mark the atlas does not cover and
 * the page margin has to make room for, and a mark astride the corner would sit
 * exactly where the selection ring passes. Six units in clears a card's icon
 * chip, a container's title block and a flow frame's header alike, because all
 * three are set in further than that.
 * @param box The subject's box.
 * @param standing How it stands, or undefined when this is not a proposal.
 * @param palette The theme's colours.
 * @returns The pin, or nothing to draw.
 */
function standingPin(box: Box, standing: SubjectStanding | undefined, palette: Palette): string {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	if (standing === undefined || ink === undefined) {
		return "";
	}
	return wrap(
		"g",
		{ transform: `translate(${coord(box.x + PIN_INSET)},${coord(box.y + PIN_INSET)})` },
		tag("circle", { r: PIN_RADIUS, fill: ink }) +
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

export {
	type SubjectStanding,
	type StatedStandings,
	type StandingOf,
	type SubjectKind,
	standingsFrom,
	subjectGroup,
	standingOutline,
	standingPin,
	standingSwipe,
};

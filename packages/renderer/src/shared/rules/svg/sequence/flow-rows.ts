// How a compared flow says which of its messages moved: once, on the message's
// own row.
//
// A sequence is read down the page a row at a time, the way a diff is, so a
// message the proposal added, changed or removed is marked the way a diff marks
// a line: a faint band of the standing's ink across the frame behind the row,
// and the standing's pin in the frame's left margin, in the column the flow's
// own pin stands in. The message's line and head take the ink too (the painter
// beside this one), and a removed message is ghosted. Nothing else: a swipe
// under the line and a dashed rule round the label said the same fact twice
// more, and on a reply the swipe's dash fought the reply's own.
//
// A mark stands with its message. It lists the message as its member, so a
// presented step that leaves the message standing leaves its mark standing, and
// one that veils the message veils the mark with it.

import type { FlowLayout } from "#shared/rules/layout/sequence/dataflow.ts";
import { activationLookup } from "#shared/rules/layout/sequence/dataflow.ts";
import { stepBox } from "#shared/rules/layout/sequence/messages.ts";
import { pitchOf } from "#shared/rules/layout/sequence/step-rows.ts";
import { coord, type Box } from "#shared/rules/geometry.ts";
import type { Palette } from "#shared/rules/svg/page/theme.ts";
import { lines, tag, wrap } from "#shared/rules/svg/page/primitives.ts";
import {
	MEMBERS_ATTRIBUTE,
	PIN_INSET,
	standingInk,
	standingPinAt,
	type StandingOf,
	type SubjectStanding,
} from "#shared/rules/svg/parts/standing.ts";

/** How one message stands, and the standing its marks are drawn for. */
interface Stands {
	/** Its own standing, which its group states and a removal ghosts. */
	readonly standing: SubjectStanding | undefined;
	/** The standing its row and ink are drawn for ({@link markedWithin}). */
	readonly mark: SubjectStanding | undefined;
}

/** How strong the band behind a marked row is: a tint the lifelines still read through. */
const ROW_TINT = 0.08;

/**
 * A standing's tint over a box.
 *
 * The band behind a row, and again over a note's plate on that row: the plate
 * is laid in the frame's ground to hide a lifeline behind the words, so on a
 * marked row it takes the row's tint too, or it would stand out of the band as
 * a box of its own.
 * @param box Where the tint goes.
 * @param standing The standing its marks are drawn for.
 * @param palette The theme's colours.
 * @returns The tint, or nothing for a standing that marks nothing.
 */
function rowTint(box: Box, standing: SubjectStanding | undefined, palette: Palette): string {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	if (ink === undefined) {
		return "";
	}
	return tag("rect", {
		x: coord(box.x),
		y: coord(box.y),
		width: coord(box.width),
		height: coord(box.height),
		fill: ink,
		"fill-opacity": ROW_TINT,
	});
}

/**
 * How a message of a flow is marked: by its own standing, unless its whole flow
 * was added or removed. The flow's own mark says that of every message in it,
 * and a page of rows repeating it would say one fact once per message.
 * @param flow How the flow stands, or undefined when this is not a proposal.
 * @param own How the message stands.
 * @returns The standing its marks are drawn for.
 */
function markedWithin(
	flow: SubjectStanding | undefined,
	own: SubjectStanding | undefined,
): SubjectStanding | undefined {
	return own !== undefined && (flow === "added" || flow === "removed") ? "unchanged" : own;
}

/** Where one message's row runs down the page, and where its pin goes on it. */
interface RowSpan {
	readonly top: number;
	readonly bottom: number;
	/** The middle of the message's words and line, above any note it carries. */
	readonly middle: number;
}

/**
 * Where each message's row runs down the page: from its own top to the next
 * message's, so the rows of a flow tile it and neighbouring marked rows join
 * into one band, as a diff's changed lines do. The last row ends where its own
 * words do.
 * @param layout The flow.
 * @returns Each message's row, in order.
 */
function rowSpans(layout: FlowLayout): RowSpan[] {
	const activeAt = activationLookup(layout.columns);
	const rows = layout.steps.map((placed) => stepBox(placed, activeAt));
	return rows.map((row, index) => ({
		top: row.y,
		bottom: rows[index + 1]?.y ?? row.y + row.height,
		// A row is centred on what the message draws and a note only lengthens it.
		middle: row.y + pitchOf(layout.steps[index]!.step.kind) / 2,
	}));
}

/**
 * The marks of every message of one flow that moved: its band and its pin.
 * @param layout The flow.
 * @param palette The theme's colours.
 * @param markOf How each message is marked ({@link markedWithin}).
 * @returns The marks, drawn under the columns and the messages.
 */
function paintRowMarks(layout: FlowLayout, palette: Palette, markOf: StandingOf): string {
	const { frame } = layout;
	const spans = rowSpans(layout);
	return lines(
		layout.steps.map((placed, index) => {
			const standing = markOf(placed.step.id);
			const band = spans[index]!;
			const tint = rowTint(
				{ x: frame.x, y: band.top, width: frame.width, height: band.bottom - band.top },
				standing,
				palette,
			);
			if (tint === "") {
				return "";
			}
			return wrap(
				"g",
				{ [MEMBERS_ATTRIBUTE]: placed.step.id, "pointer-events": "none" },
				lines([tint, standingPinAt(frame.x + PIN_INSET, band.middle, standing, palette)]),
			);
		}),
	);
}

export { markedWithin, paintRowMarks, rowTint, type Stands };

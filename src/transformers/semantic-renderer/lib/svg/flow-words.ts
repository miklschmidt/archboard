// What one message of a sequence says: its label on an opaque plate, the note
// under it, and the warning on a message nobody has decided yet.
//
// Drawn on the layer above every message's run, in a group that says it is the
// message, so a viewer lights the words with the line. A plate is laid in full
// under ghosted words, and a note's plate takes the tint of a marked row, so
// neither a lifeline behind it nor the plate itself stands out of the row.

import type { SubjectStanding } from "@/transformers/semantic-renderer/lib/svg/standing";
import { PILL_HEIGHT, PILL_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import {
	MESSAGE_LINE_STEP,
	STEP_NOTE_PADDING_X,
	STEP_NOTE_PADDING_Y,
} from "@/transformers/semantic-renderer/lib/sequence-design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import type { ActiveAt, PlacedStep } from "@/transformers/semantic-renderer/lib/layout/dataflow";
import { labelBox } from "@/transformers/semantic-renderer/lib/layout/messages";
import { rowTint, type Stands } from "@/transformers/semantic-renderer/lib/svg/flow-rows";
import { lines, tag, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	PART_ATTRIBUTE,
	subjectGroup,
	warningOnLine,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import { stylesFor, type SvgStyles } from "@/transformers/semantic-renderer/lib/svg/styles";

/** How heavy a lit plate's rule is. */
const LIT_RULE_WIDTH = 1.25;
/** Where a plate's text baseline sits inside it. */
const PILL_BASELINE = 0.68;

/**
 * One message's label, on its opaque plate, a line at a time, each centred.
 * @param words What the message is, wrapped.
 * @param box Where the plate goes.
 * @param styles The palette's attribute bundles.
 * @returns The plate and its words.
 */
function paintLabel(
	words: readonly { readonly text: string }[],
	box: Box,
	styles: SvgStyles,
): string {
	return (
		tag("rect", {
			x: coord(box.x),
			y: coord(box.y),
			width: coord(box.width),
			height: coord(box.height),
			rx: PILL_RADIUS,
			...styles.pill,
		}) +
		// The plate's rule in the selection's ink, lit when the message is.
		tag("rect", {
			class: "ab-halo",
			x: coord(box.x),
			y: coord(box.y),
			width: coord(box.width),
			height: coord(box.height),
			rx: PILL_RADIUS,
			"stroke-width": LIT_RULE_WIDTH,
			...styles.halo,
		}) +
		words
			.map(({ text }, index) =>
				textNode(
					{
						x: coord(box.x + box.width / 2),
						y: coord(box.y + PILL_HEIGHT * PILL_BASELINE + index * MESSAGE_LINE_STEP),
						"text-anchor": "middle",
						...styles.pillText,
					},
					text,
				),
			)
			.join("")
	);
}

/**
 * A plain rounded plate, filled and unruled.
 * @param box Where it goes.
 * @param fill Its ground.
 * @returns The plate.
 */
function plainPlate(box: Box, fill: string): string {
	return tag("rect", {
		x: coord(box.x),
		y: coord(box.y),
		width: coord(box.width),
		height: coord(box.height),
		rx: PILL_RADIUS,
		fill,
	});
}

/**
 * A step's note under its message: complete lines on a plate of the frame's
 * ground, so a lifeline it crosses passes behind the words.
 * @param placed The message.
 * @param palette The theme's colours.
 * @param mark The standing its row is marked for, whose tint the plate takes ({@link rowTint}).
 * @returns The note, or nothing when the step has none.
 */
function paintNote(
	placed: PlacedStep,
	palette: Palette,
	mark: SubjectStanding | undefined,
): string {
	const note = placed.note;
	if (note === undefined) {
		return "";
	}
	const styles = stylesFor(palette);
	return lines([
		plainPlate(note.box, styles.band.fill),
		rowTint(note.box, mark, palette),
		...note.lines.map((run) =>
			textNode(
				{
					"xml:space": "preserve",
					x: coord(note.box.x + STEP_NOTE_PADDING_X + run.x),
					y: coord(note.box.y + STEP_NOTE_PADDING_Y + run.y),
					...styles.note,
				},
				run.text,
			),
		),
	]);
}

/**
 * What one message says, on the layer above every run.
 *
 * The plate and the warning badge, in a group that says it is the message, for
 * the same reason the architecture grammar splits a relationship in two: the
 * words of one message have to sit above the dots of ALL of them. Upstream, and
 * this fork until now, argued that a stack of horizontal runs at a fixed pitch
 * could never reach each other's plates — and mostly it cannot, but "mostly"
 * is a thing that has to be re-derived every time somebody adds a self-message
 * loop or a taller plate, and the rule it was standing in for is the simple one:
 * the words are on top.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @param palette The theme's colours.
 * @param stands How this step stands, and the standing its marks are drawn for.
 * @param stands.standing Its own standing, which its group states and a removal ghosts.
 * @param stands.mark The standing its row is marked for.
 * @param unsettled Whether the board says nobody has decided this message yet.
 * @returns The message's words, or nothing when it has none to say.
 */
function paintStepWords(
	placed: PlacedStep,
	activeAt: ActiveAt,
	palette: Palette,
	{ standing, mark }: Stands,
	unsettled: boolean,
): string {
	const plate = labelBox(placed, activeAt);
	const styles = stylesFor(palette);
	const words = lines([
		paintLabel(placed.words.lines, plate, styles),
		paintNote(placed, palette, mark),
		// On the leading edge of the plate, clear of its words.
		warningOnLine({ x: plate.x, y: plate.y + plate.height / 2 }, unsettled, palette),
	]);
	const { opacity, ...step } = subjectGroup("step", placed.step.id, standing);
	const identity = { ...step, [PART_ATTRIBUTE]: "label" };
	if (opacity === undefined) {
		return wrap("g", identity, words);
	}
	// Ghosted words stay on plates as solid as a live message's, so a lifeline
	// behind them is hidden rather than read through them: the plates are laid
	// at full strength first, and only the words on them are ghosted.
	return wrap(
		"g",
		identity,
		lines([
			plainPlate(plate, styles.pill.fill),
			placed.note === undefined
				? ""
				: plainPlate(placed.note.box, styles.band.fill) + rowTint(placed.note.box, mark, palette),
			wrap("g", { opacity }, words),
		]),
	);
}

export { paintStepWords };

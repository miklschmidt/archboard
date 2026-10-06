// What one message of a sequence says: its label on an opaque chip, the note
// under it, and the warning on a message nobody has decided yet.
//
// Drawn on the layer above every message's run, in a group that says it is the
// message, so a viewer lights the words with the line. Every plate is opaque, so
// a lifeline behind the words is hidden, and a plate on a marked row takes the
// row's tint, so it does not stand out of the row.

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
import { labelLook } from "@/transformers/semantic-renderer/lib/svg/appearance";
import {
	lines,
	tag,
	textNode,
	wrap,
	type Attributes,
} from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	ghostFace,
	slab,
	slabSeat,
	slabShadow,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import {
	PART_ATTRIBUTE,
	standingPalette,
	subjectGroup,
	warningOnLine,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";

/** How heavy a lit chip's rule is. */
const LIT_RULE_WIDTH = 1.25;
/** Where a plate's text baseline sits inside it. */
const PILL_BASELINE = 0.68;

/**
 * One message's label, a line at a time, each centred, on a chip like a
 * relationship's label in an architecture: a low slab with a contact shadow.
 * A message the proposal removed has lost the chip's thickness: its words, in
 * the secondary ink, lie on a flat, see-through plate over the frame's face,
 * which still hides a lifeline behind them.
 * @param words What the message is, wrapped.
 * @param box Where the chip goes.
 * @param palette The theme's colours.
 * @param stands How the message stands, and the standing its row is marked for.
 * @param stands.standing How the message stands.
 * @param stands.mark The standing its row is marked for, whose tint a removed message's plate takes.
 * @returns The chip and its words.
 */
function paintLabel(
	words: readonly { readonly text: string }[],
	box: Box,
	palette: Palette,
	{ standing, mark }: Stands,
): string {
	const styles = stylesFor(standingPalette(palette, standing));
	return (
		(standing === "removed"
			? plainPlate(box, palette.plinthFace) +
				tag("rect", { ...rectOf(box), ...ghostFace(palette) }) +
				rowTint(box, mark, palette)
			: slabSeat(box, PILL_RADIUS) +
				slabShadow(box, PILL_RADIUS, "chip", palette) +
				slab(box, labelLook(palette), palette)) +
		// The chip's rule in the selection's ink, lit when the message is.
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
 * A rounded plate's geometry.
 * @param box Where it goes.
 * @returns Its attributes.
 */
function rectOf(box: Box): Attributes {
	return {
		x: coord(box.x),
		y: coord(box.y),
		width: coord(box.width),
		height: coord(box.height),
		rx: PILL_RADIUS,
	};
}

/**
 * A plain rounded plate, filled and unruled.
 * @param box Where it goes.
 * @param fill Its ground.
 * @returns The plate.
 */
function plainPlate(box: Box, fill: string): string {
	return tag("rect", { ...rectOf(box), fill });
}

/**
 * The plate a note lies on: the frame's own face, a top-level plinth's
 * (`dataflow.ts`), with its row's tint over it.
 * @param box Where it goes.
 * @param mark The standing its row is marked for.
 * @param palette The theme's colours.
 * @returns The plate.
 */
function notePlate(box: Box, mark: SubjectStanding | undefined, palette: Palette): string {
	return plainPlate(box, palette.plinthFace) + rowTint(box, mark, palette);
}

/**
 * A step's note under its message: complete lines on a plate of the frame's
 * own face, so a lifeline it crosses passes behind the words.
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
		notePlate(note.box, mark, palette),
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
 * The chip and the warning badge, in a group that says it is the message, for
 * the same reason the architecture grammar splits a relationship in two: the
 * words of one message have to sit above the pulses of ALL of them. Upstream, and
 * this fork until now, argued that a stack of horizontal runs at a fixed pitch
 * could never reach each other's plates — and mostly it cannot, but "mostly"
 * is a thing that has to be re-derived every time somebody adds a self-message
 * loop or a taller plate, and the rule it was standing in for is the simple one:
 * the words are on top.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @param palette The theme's colours.
 * @param stands How this step stands, and the standing its marks are drawn for.
 * @param unsettled Whether the board says nobody has decided this message yet.
 * @returns The message's words, or nothing when it has none to say.
 */
function paintStepWords(
	placed: PlacedStep,
	activeAt: ActiveAt,
	palette: Palette,
	stands: Stands,
	unsettled: boolean,
): string {
	const plate = labelBox(placed, activeAt);
	return wrap(
		"g",
		{ ...subjectGroup("step", placed.step.id, stands.standing), [PART_ATTRIBUTE]: "label" },
		lines([
			paintLabel(placed.words.lines, plate, palette, stands),
			paintNote(placed, palette, stands.mark),
			// On the leading edge of the plate, clear of its words.
			warningOnLine({ x: plate.x, y: plate.y + plate.height / 2 }, unsettled, palette),
		]),
	);
}

export { paintStepWords };

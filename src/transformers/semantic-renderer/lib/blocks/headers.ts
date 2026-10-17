// A container's header at the width it is laid out at (TASK-486). Its words
// are measured before layout at each width they can wrap at (`headers` in
// measurement.ts): the narrowest is the header's least width, and each wider
// one takes a line fewer, so the header row stands shorter. A block takes the
// widest one its container has room for once it knows how wide that is, and
// the drawing paints the words wrapped at the width it took.
//
// A block keeps its header as a box in its top-left corner, its insets in from
// its sides, at least as wide as the header's least width: the box a block
// holds no wider than what it holds, so taking a wider header widens no block.
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import { HEADER_STEPS } from "@/transformers/semantic-renderer/lib/layout/compound-graph";

/** A width and a height. */
interface Size {
	readonly width: number;
	readonly height: number;
}

/**
 * A container's title row, at its least width, and each wider size it can
 * take, narrowest first, the first of them the least; absent where it has one size.
 */
interface Header extends Size {
	readonly steps?: readonly Size[];
}

/** A header the layout took: its size, and which of its sizes that is when it is a wider one. */
interface TakenHeader {
	readonly size: Size;
	readonly index?: number;
}

const StepsSchema = z.array(z.tuple([z.number(), z.number()]));

/**
 * The sizes a container's title row can take, as its measured node carries them.
 * @param node The measured container.
 * @param band How much a caption band above its title adds to the row.
 * @returns The sizes, or nothing when it has one.
 */
function stepsOf(node: ElkNode, band: number): Pick<Header, "steps"> {
	const rows = node.layoutOptions?.[HEADER_STEPS];
	if (rows === undefined) return {};
	const steps = StepsSchema.parse(JSON.parse(rows));
	return { steps: steps.map(([width, height]) => ({ width, height: height + band })) };
}

/**
 * The shortest header a block has room for, as the box it keeps: its least
 * when none of its wider sizes fits.
 * @param header The header.
 * @param room How much room the block gives it.
 * @param room.frame How wide the container is.
 * @param room.content How wide what the block holds is, between its insets.
 * @param room.beside How wide the header's box may be before it reaches each thing beside it.
 * @returns The box, and which of its sizes it is when it is a wider one.
 */
function headerWithin(
	header: Header,
	room: { readonly frame: number; readonly content: number; readonly beside: readonly number[] },
): TakenHeader {
	const steps = header.steps ?? [];
	/**
	 * The box a block keeps for one size of the header: its frame's insets in from the container's sides.
	 * @param step The size.
	 * @returns The box's width.
	 */
	const boxOf = (step: Size): number =>
		Math.max(header.width, step.width - room.frame + room.content);
	let index = 0;
	while (
		index + 1 < steps.length &&
		steps[index + 1]!.width <= room.frame &&
		room.beside.every((beside) => boxOf(steps[index + 1]!) <= beside)
	)
		index += 1;
	if (index === 0) return { size: header };
	return { size: { width: boxOf(steps[index]!), height: steps[index]!.height }, index };
}

/**
 * Which of its header's wider sizes a block took, as its layout answers it.
 * @param taken The header it took, if it has one.
 * @returns The size's index, when it took a wider one.
 */
function takenIndex(taken: TakenHeader | undefined): { header?: number } {
	return taken?.index === undefined ? {} : { header: taken.index };
}

export { headerWithin, stepsOf, takenIndex, type Header, type TakenHeader };

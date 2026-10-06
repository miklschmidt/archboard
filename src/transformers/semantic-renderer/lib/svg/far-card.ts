// What a card draws when the picture is seen from far away: a tile down its
// start that holds its kind's glyph large, and beside it its name and the
// start of its responsibility. Each is set at a size that still reads from
// far away without filling the card the way a name grown to its height did.
//
// The words are laid out from the card's own box, so a short card and a tall
// one stay one design: a card too short for both name and gist keeps its name.
import type { TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import {
	CARD_NOTE_FONT,
	CARD_TITLE_FONT,
	type DiagramFont,
} from "@/transformers/semantic-renderer/lib/fonts";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { measure, truncate } from "@/transformers/semantic-renderer/lib/text";
import { DRILL_MARK_ROOM } from "@/transformers/semantic-renderer/lib/svg/drill-mark";
import { farChip, farLayer, farMark } from "@/transformers/semantic-renderer/lib/svg/far-view";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";

/** The step between one line of a far name and the next, per unit of its size. */
const NAME_LINE = 1.15;
/** The step between one line of a far gist and the next, per unit of its size. */
const GIST_LINE = 1.25;
/** The room between a card's name and its gist. */
const GIST_GAP = 3;
/** The room a card keeps above and below its words. */
const PAD_Y = 10;
/** The room the tile keeps from the card's edge, and the words keep from the tile. */
const EDGE = 12;
/** The room the words keep from the card's far side. */
const END = 14;
/** The tile's side, or less when the card is shorter. */
const TILE = 52;
/** The largest and the smallest a far name is set. */
const NAME_SIZES = { max: 20, min: 15 } as const;
/** The most lines a far name takes. */
const NAME_LINES = 2;
/** The most lines a far gist takes. */
const GIST_LINES = 2;
/** A far gist's size as a share of its name's, and the smallest it is set. */
const GIST_SIZE = { share: 0.68, min: 13 } as const;
/** The mark of a part that opens another board, per unit of its near size. */
const MARK_SCALE = 1.2;

/** A card's name and gist, broken into lines and sized. */
interface Stack {
	readonly nameSize: number;
	readonly names: readonly string[];
	/** Whether the name keeps all its words, whole, on its lines. */
	readonly kept: boolean;
	readonly gistSize: number;
	readonly gists: readonly string[];
	readonly height: number;
}

/** What to try, in order: a name as large as it can be with a gist as long as it can be, the gist dropped last. */
const ATTEMPTS: readonly { readonly size: number; readonly gistLines: number }[] = (() => {
	const sizes = Array.from(
		{ length: NAME_SIZES.max - NAME_SIZES.min + 1 },
		(_, i) => NAME_SIZES.max - i,
	);
	const lines = Array.from({ length: GIST_LINES }, (_, i) => GIST_LINES - i);
	return [
		...sizes.flatMap((size) => lines.map((gistLines) => ({ size, gistLines }))),
		...sizes.map((size) => ({ size, gistLines: 0 })),
	];
})();

/**
 * A text broken into lines by words, balanced so the lines share their words
 * evenly, and cut with an ellipsis where it takes more than some lines.
 * @param text The words.
 * @param face The face they are set in.
 * @param size Their size.
 * @param room The width a line has.
 * @param most The most lines.
 * @returns The lines.
 */
function breakLines(
	text: string,
	face: DiagramFont,
	size: number,
	room: number,
	most: number,
): string[] {
	const words = text.split(/\s+/u).filter((word) => word !== "");
	/**
	 * The words broken greedily at a width.
	 * @param limit The width.
	 * @returns The lines.
	 */
	const greedy = (limit: number): string[] => {
		const broken: string[] = [];
		let line = "";
		for (const word of words) {
			const next = line === "" ? word : `${line} ${word}`;
			if (line !== "" && measure(next, face, size) > limit) {
				broken.push(line);
				line = word;
			} else {
				line = next;
			}
		}
		if (line !== "") broken.push(line);
		return broken;
	};
	let lines = greedy(room);
	if (lines.length > 1 && lines.length <= most) {
		const count = lines.length;
		for (let limit = room - 4; limit > room / 2; limit -= 4) {
			const narrower = greedy(limit);
			if (narrower.length !== count) break;
			lines = narrower;
		}
	}
	if (lines.length > most) {
		lines = [...lines.slice(0, most - 1), lines.slice(most - 1).join(" ")];
	}
	return lines.map((line) => truncate(line, face, size, room));
}

/**
 * A card's words at one name size, broken to the room they have.
 * @param name The card's name, its words single-spaced.
 * @param gist What the card is responsible for, when it says.
 * @param attempt The name's size and the most lines of the gist.
 * @param attempt.size The name's size.
 * @param attempt.gistLines The most lines of the gist, none to leave it out.
 * @param room The width the words have.
 * @returns The words, broken and sized.
 */
function stackAt(
	name: string,
	gist: string | undefined,
	attempt: { size: number; gistLines: number },
	room: number,
): Stack {
	const { size, gistLines } = attempt;
	const names = breakLines(name, CARD_TITLE_FONT, size, room, NAME_LINES);
	const gistSize = Math.max(GIST_SIZE.min, Math.round(size * GIST_SIZE.share));
	const gists =
		gist === undefined || gistLines === 0
			? []
			: breakLines(gist, CARD_NOTE_FONT, gistSize, room, gistLines);
	return {
		nameSize: size,
		names,
		kept: names.join(" ") === name,
		gistSize,
		gists,
		height:
			names.length * size * NAME_LINE +
			(gists.length > 0 ? GIST_GAP + gists.length * gistSize * GIST_LINE : 0),
	};
}

/**
 * Size a card's name and gist to the room its box holds: the largest name that
 * keeps its words whole on two lines, with as much of the gist as fits beside
 * it. A card that cannot hold both keeps its name, cut at the smallest size
 * when even that does not fit.
 * @param name The card's name.
 * @param gist What the card is responsible for, when it says.
 * @param room The width the words have.
 * @param height The height the words have.
 * @returns The words, broken and sized.
 */
function settle(name: string, gist: string | undefined, room: number, height: number): Stack {
	const whole = name
		.split(/\s+/u)
		.filter((word) => word !== "")
		.join(" ");
	for (const attempt of ATTEMPTS) {
		if (gist === undefined && attempt.gistLines > 0) continue;
		const stack = stackAt(whole, gist, attempt, room);
		if (stack.kept && stack.height <= height) return stack;
	}
	return stackAt(whole, undefined, { size: NAME_SIZES.min, gistLines: 0 }, room);
}

/**
 * One line of words as a run: its baseline stands half a cap height below the
 * line's middle.
 * @param text The line.
 * @param place Where the line starts and where its own line begins.
 * @param place.x Where it starts.
 * @param place.top The top of its line.
 * @param style How it is set.
 * @param style.size Its size.
 * @param style.step The step of its lines, per unit of its size.
 * @param style.face The face it is set in.
 * @param style.role Whether it is a name or a gist.
 * @returns The run.
 */
function run(
	text: string,
	place: { x: number; top: number },
	style: { size: number; step: number; face: DiagramFont; role: "title" | "note" },
): TextRun {
	return {
		text,
		width: measure(text, style.face, style.size),
		x: place.x,
		y: place.top + (style.size * style.step) / 2 + style.size * 0.35,
		font: style.face,
		fontSize: style.size,
		role: style.role,
	};
}

/**
 * A stack's runs, the name's lines and then the gist's, from one top.
 * @param stack The sized words.
 * @param x Where every line starts.
 * @param top Where the stack starts.
 * @returns The runs.
 */
function runsOf(stack: Stack, x: number, top: number): TextRun[] {
	const nameStep = stack.nameSize * NAME_LINE;
	const gistStep = stack.gistSize * GIST_LINE;
	const gistTop = top + stack.names.length * nameStep + GIST_GAP;
	return [
		...stack.names.map((text, index) =>
			run(
				text,
				{ x, top: top + index * nameStep },
				{ size: stack.nameSize, step: NAME_LINE, face: CARD_TITLE_FONT, role: "title" },
			),
		),
		...stack.gists.map((text, index) =>
			run(
				text,
				{ x, top: gistTop + index * gistStep },
				{ size: stack.gistSize, step: GIST_LINE, face: CARD_NOTE_FONT, role: "note" },
			),
		),
	];
}

/**
 * What a card draws from far away: its kind's tile, its name and the start of
 * what it is responsible for. It is hidden until a viewer says the picture is
 * far.
 * @param node What the card says.
 * @param node.name The card's name.
 * @param node.responsibility What it is responsible for, when it says.
 * @param box The card's box.
 * @param look The card's chip and the selected theme.
 * @param look.appearance Its type chip's colour and glyph, and whether it opens a board.
 * @param look.palette The selected theme.
 * @param unsettled Whether the card wears the warning badge.
 * @returns The far layer.
 */
function paintFarCard(
	node: { readonly name: string; readonly responsibility?: string | undefined },
	box: Box,
	look: { appearance: NodeAppearance; palette: Palette },
	unsettled: boolean,
): string {
	const tile = Math.min(TILE, box.height - EDGE * 2);
	const x = EDGE + tile + EDGE;
	const room =
		box.width - x - END - (look.appearance.drill === null ? 0 : DRILL_MARK_ROOM * MARK_SCALE);
	const gist = node.responsibility?.trim() === "" ? undefined : node.responsibility;
	const stack = settle(node.name, gist, room, box.height - PAD_Y * 2);
	return farLayer(
		farChip(box, { x: EDGE, y: (box.height - tile) / 2, size: tile }, look) +
			paintTextRuns(runsOf(stack, x, (box.height - stack.height) / 2), box, look.palette) +
			farMark(box, MARK_SCALE, look, unsettled),
	);
}

/**
 * A heading from far away that has no kind of its own to show, a flow's on its
 * header slab: its name and the start of its summary, set as a far card's are,
 * from the box's start. It is hidden until a viewer says the picture is far.
 * @param name The heading's name.
 * @param summary What it says under its name, when it says.
 * @param box The face its words stand on.
 * @param palette The selected theme.
 * @returns The far layer.
 */
function paintFarHeading(
	name: string,
	summary: string | undefined,
	box: Box,
	palette: Palette,
): string {
	const gist = summary?.trim() === "" ? undefined : summary;
	const stack = settle(name, gist, box.width, box.height - PAD_Y * 2);
	return farLayer(paintTextRuns(runsOf(stack, 0, (box.height - stack.height) / 2), box, palette));
}

export { paintFarCard, paintFarHeading };

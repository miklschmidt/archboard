// Which variant `semantic compare` reads another against: the one named, or the
// one its picture is drawn against.

import {
	comparedWith,
	resolveVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { CliUsageError } from "@/cli/command-contract/contract";

/** The refusal `readAgainst` throws when nothing was named and there is nothing to read against. */
const nothingToCompareRefusal = {
	code: "NOTHING_TO_COMPARE",
	exit: 2,
	stream: "stderr" as const,
	description:
		"No --against was named and the variant has nothing to be read against: it is the current " +
		"variant, which every other variant is read against, or a first draft on a board with none.",
};

/**
 * The variant one is read against: the one named, or the one its picture is
 * drawn against.
 *
 * With nothing named, the current variant and a first draft on a board with no
 * current one have nothing to be read against, and an answer that invented one
 * would call every part either "added" or the whole board unchanged. So it is
 * refused, naming the variants that can be read against something, since one
 * of them is what the reader meant.
 * @param board The board as read.
 * @param variant The variant asked about.
 * @param named The variant `--against` named, if any.
 * @returns The variant to read it against.
 * @throws {CliUsageError} When the named one is not on the board, or nothing was named and
 * there is nothing to read it against.
 */
function readAgainst(
	board: SemanticBoard,
	variant: SemanticVariant,
	named: string | undefined,
): SemanticVariant {
	const found = named === undefined ? comparedWith(board, variant) : resolveVariant(board, named);
	if (found !== undefined) {
		return found;
	}
	if (named !== undefined) {
		throw new CliUsageError(
			`"${board.name}" has no variant "${named}" to read against. Its variants: ${board.variants.map((one) => `"${one.name}"`).join(", ")}.`,
		);
	}
	const comparable = board.variants.filter((one) => comparedWith(board, one) !== undefined);
	throw new CliUsageError(
		`"${variant.name}" has nothing to be read against on "${board.name}": ` +
			(variant.lifecycle === "current"
				? "it is the current variant, and every other variant is read against it. "
				: "the board has no current variant and this draft came from nothing. ") +
			`Name another variant with --variant, or what to read this one against with --against. ` +
			`Variants that have a comparison: ${comparable.map((one) => `"${one.name}"`).join(", ") || "none yet"}.`,
	);
}

export { nothingToCompareRefusal, readAgainst };

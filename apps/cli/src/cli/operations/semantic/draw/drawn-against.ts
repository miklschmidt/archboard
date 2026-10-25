// What a picture or a recording drawn against a named variant is asked with: the option, the
// refusals, and the id the server is told (TASK-478.01). `semantic render`, `semantic rasterize`
// and `semantic record` share it.

import { readSemanticBoardOnServer } from "#cli/clients/server/semantic-boards.ts";
import { drawnAgainstNamed } from "#cli/rules/semantic/compare/read-against.ts";
import { askedVariant } from "#cli/operations/semantic/input/semantic-input.ts";

/**
 * The option that names what a picture or a recording is drawn against. Such a picture
 * reads relative to the variant it names, which is why it carries no Planned frame: for a
 * pull request, the variant of the pull request below it.
 */
const AGAINST_OPTION = {
	kind: "option",
	key: "against",
	spellings: ["--against"],
	value: "required",
	placeholder: "variant",
	description:
		"Draw it relative to this variant, by id or name: it marks only what the drawn variant adds, changes and " +
		"removes over it, and carries no Planned frame, also on a board with no current variant. It cannot be the drawn variant, " +
		"and cannot be combined with --no-comparison",
} as const;

/** What a drawing command refuses when it is asked for no comparison against a variant. */
const AGAINST_NO_COMPARISON_REFUSAL = {
	message:
		"--against names what the picture is compared with, so it cannot be combined with --no-comparison.",
	path: ["against"],
};

/**
 * Whether a drawing's input asks for a comparison against a variant and for none at all.
 * @param input The parsed input.
 * @param input.against The variant `--against` named, if any.
 * @param input.noComparison Whether the comparison is hidden.
 * @returns True when the two do not contradict each other.
 */
function againstAgreesWithComparison(input: {
	against?: string | undefined;
	noComparison: boolean;
}): boolean {
	return input.against === undefined || !input.noComparison;
}

/**
 * The id of the variant a drawing is read against, when `--against` named one: read off the
 * board the way `semantic compare` reads it, so a variant that is not there is refused as
 * that command refuses it, before anything is drawn.
 * @param board The board's name.
 * @param input The variant to be drawn and the variant `--against` named, if any.
 * @param input.variant The variant to draw, by id or name.
 * @param input.against The variant to read it against, by id or name.
 * @returns The id, or undefined when none was named.
 * @throws {CliUsageError} When the named variant cannot be used.
 */
async function resolvedAgainst(
	board: string,
	input: { variant?: string | undefined; against?: string | undefined },
): Promise<string | undefined> {
	if (input.against === undefined) return undefined;
	const read = await readSemanticBoardOnServer(board);
	return drawnAgainstNamed(read, askedVariant(read, input.variant), input.against).id;
}

export {
	AGAINST_NO_COMPARISON_REFUSAL,
	AGAINST_OPTION,
	againstAgreesWithComparison,
	resolvedAgainst,
};

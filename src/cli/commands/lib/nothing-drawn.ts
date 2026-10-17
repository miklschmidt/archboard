// What both drawing commands say when the render answered with no picture:
// the board holds nothing, or the chosen view names nothing the variant holds.

import { CliUsageError } from "@/cli/command-contract/contract";
import type { NothingDrawn } from "@/shared/semantic-board/index";

/** The refusal of a view that draws nothing on the chosen variant, as a command declares it. */
const viewEmptyRefusal = {
	code: "VIEW_EMPTY_ON_VARIANT",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The view names no part or flow that the chosen variant holds, so it draws nothing there.",
};

/** A view that draws nothing on a variant that does hold content. */
class ViewEmptyError extends Error {
	readonly code = viewEmptyRefusal.code;
}

/**
 * Refuse a draw that answered with no picture, saying which kind of nothing it is.
 * @param drawn The answer, naming the variant and the view it was asked for.
 * @throws {ViewEmptyError} When the variant has content but the view names none of it.
 * @throws {CliUsageError} When the board has nothing on it.
 */
function refuseNothingDrawn(drawn: NothingDrawn): never {
	if (drawn.empty === "VIEW_EMPTY_ON_VARIANT" && drawn.view !== null) {
		throw new ViewEmptyError(
			`The view "${drawn.view.name}" draws nothing on "${drawn.variant.name}": none of the parts or flows it names are on that variant.`,
		);
	}
	throw new CliUsageError(
		`Semantic board "${drawn.board}" has nothing on it yet, so there is nothing to draw.`,
	);
}

export { refuseNothingDrawn, viewEmptyRefusal };

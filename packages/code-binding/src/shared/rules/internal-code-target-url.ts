import {
	CodeTargetOpenRequestSchema,
	type CodeTargetOpenRequest,
} from "#shared/schemas/code-target-open.ts";

/**
 * Spells the internal link the canvas uses to ask the server to open the code
 * target bound to one element.
 * @param request - The board and element whose binding should open.
 * @returns The relative `/api/code-targets/open` URL with both as query parameters.
 */
function buildInternalCodeTargetUrl(request: CodeTargetOpenRequest): string {
	const parsed = CodeTargetOpenRequestSchema.parse(request);
	const query = new URLSearchParams({ board: parsed.board, element: parsed.element });
	return `/api/code-targets/open?${query.toString()}`;
}

export { buildInternalCodeTargetUrl };

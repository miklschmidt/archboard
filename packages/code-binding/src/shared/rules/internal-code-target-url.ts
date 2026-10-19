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

/**
 * Tells whether a link is a same-origin path: rooted, not protocol-relative,
 * without a fragment or a backslash that a URL parser might reinterpret.
 * @param value - The raw link text.
 * @returns True when the link can only name a path on this server.
 */
function isRootedPath(value: string): boolean {
	return (
		value.startsWith("/") &&
		!value.startsWith("//") &&
		!value.includes("#") &&
		!value.includes("\\")
	);
}

/**
 * Parses a rooted path against a placeholder origin so the caller sees only
 * whether it is the code-target open route with exactly its two parameters.
 * @param value - A link that passed {@link isRootedPath}.
 * @returns The parsed URL when it is the open route with `board` then `element`, else null.
 */
function codeTargetRouteUrl(value: string): URL | null {
	let url: URL;
	try {
		url = new URL(value, "http://archboard.invalid");
	} catch {
		return null;
	}
	if (url.pathname !== "/api/code-targets/open") {
		return null;
	}
	const keys = [...url.searchParams.keys()];
	const exact = keys.length === 2 && keys[0] === "board" && keys[1] === "element";
	return exact ? url : null;
}

/**
 * Reads a link back into the open request it was built from, accepting only
 * the exact shape {@link buildInternalCodeTargetUrl} produces so an arbitrary
 * link on the canvas is never mistaken for a code-target open.
 * @param value - The raw link text found on an element.
 * @returns The board and element the link names, or null when it is not such a link.
 */
function parseInternalCodeTargetUrl(value: string): CodeTargetOpenRequest | null {
	if (!isRootedPath(value)) {
		return null;
	}
	const url = codeTargetRouteUrl(value);
	if (url === null) {
		return null;
	}
	const result = CodeTargetOpenRequestSchema.safeParse({
		board: url.searchParams.get("board"),
		element: url.searchParams.get("element"),
	});
	return result.success ? result.data : null;
}

export { buildInternalCodeTargetUrl, parseInternalCodeTargetUrl };

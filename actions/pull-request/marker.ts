// The markers of the pull request action: the sticky comment's, and the one a pull request body
// carries to name its proposal (the `archboard-pr` skill writes it). Pure.

/** The hidden marker that identifies the one comment this action keeps up to date. */
const COMMENT_MARKER = "<!-- archboard:pull-request -->";

/** What a pull request body says about its proposal. */
interface BodyMarker {
	readonly model?: string | undefined;
	readonly state?: string | undefined;
	readonly checkpoint?: string | undefined;
	readonly against?: string | undefined;
}

const BODY_MARKER = /<!--\s*archboard-pr\s+([^>]*?)-->/u;
const ATTRIBUTE = /([a-z]+)="([^"]*)"/gu;

/**
 * Read the `archboard-pr` marker of a pull request body. The `archboard-pr:begin` and `:end`
 * comments of the same skill are no marker.
 * @param body The pull request body.
 * @returns The attributes of the marker, or undefined when the body has none.
 */
function parseBodyMarker(body: string): BodyMarker | undefined {
	const found = BODY_MARKER.exec(body);
	if (found?.[1] === undefined) return undefined;
	const attributes = new Map(
		[...found[1].matchAll(ATTRIBUTE)].map(([, key, value]) => [key, value]),
	);
	return {
		model: attributes.get("model"),
		state: attributes.get("state"),
		checkpoint: attributes.get("checkpoint"),
		against: attributes.get("against"),
	};
}

const SECTION_BEGIN = "<!-- archboard-pr:begin -->";
const SECTION_END = "<!-- archboard-pr:end -->";
/** The opening fence of a Mermaid code block, with backticks or tildes, as GitHub reads it. */
const MERMAID_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid\b/gimu;

/**
 * Count the Mermaid charts in the `archboard-pr` section of a pull request body. The skill draws
 * every flowchart and sequence chart there from a model flow, so a Mermaid chart there was drawn by
 * hand. A section without its end runs to the end of the body.
 * @param body The pull request body.
 * @returns The number of fenced `mermaid` blocks in the section, 0 when the body has none.
 */
function mermaidCharts(body: string): number {
	const begin = body.indexOf(SECTION_BEGIN);
	if (begin === -1) return 0;
	const end = body.indexOf(SECTION_END, begin);
	const section = body.slice(begin, end === -1 ? undefined : end);
	return [...section.matchAll(MERMAID_FENCE)].length;
}

/** A comment of the pull request, as the REST API lists it. */
interface IssueComment {
	readonly id: number;
	readonly body?: string | null | undefined;
}

/**
 * Pick the comment to update: the first one that carries the sticky marker.
 * @param comments The comments of the pull request, oldest first.
 * @returns The id of the comment to update, or undefined when the action should create one.
 */
function findStickyComment(comments: readonly IssueComment[]): number | undefined {
	return comments.find((comment) => comment.body?.includes(COMMENT_MARKER) === true)?.id;
}

export {
	COMMENT_MARKER,
	findStickyComment,
	mermaidCharts,
	parseBodyMarker,
	type BodyMarker,
	type IssueComment,
};

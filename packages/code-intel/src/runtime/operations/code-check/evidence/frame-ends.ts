// A relationship with an end on a module with parts makes a caller and no entry
// point there (ADR 0044). `RELATIONSHIP_ON_CONTAINER` is information, not a
// warning: an author prefers the part that makes or answers the call, and the
// end stays right when no part stands for the call. It reads the board alone,
// so it needs no evidence and no binding.

import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
import { siteOf } from "#runtime/operations/code-check/evidence/relationships.ts";
import type { CodeFinding } from "#shared/protocol/code-check.ts";
import { describeSubject } from "@archboard/board/policy";
import { edgeSubjects } from "@archboard/board/vault-policy";

/**
 * Name each relationship with an end on a module with parts, unless one end holds
 * the other, which `CONTAINER_LINE_TO_OWN_PART` names.
 * @param read The board.
 * @param lineages Each part and the parts that hold it, the part first.
 * @returns One information finding for each such relationship.
 */
function frameEndFindings(
	read: BoardToCheck,
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): CodeFinding[] {
	const { content } = read.variant;
	const containers = new Set(content.nodes.flatMap(({ parent }) => parent ?? []));
	const subjectOf = edgeSubjects(content);
	return content.edges
		.filter(
			({ from, to }) =>
				(containers.has(from) || containers.has(to)) &&
				lineages.get(from)?.has(to) !== true &&
				lineages.get(to)?.has(from) !== true,
		)
		.map((edge) => {
			const subject = subjectOf(edge);
			return {
				...siteOf(read, `edges.${edge.id}`, subject),
				severity: "information",
				code: "RELATIONSHIP_ON_CONTAINER",
				message:
					`The ${describeSubject(subject)} ends on a module with parts, so it makes a caller and ` +
					"no entry point there. If a part makes or answers the call, end it on that part: an " +
					"edit-relationship change with source or set.to. The end is right when no part stands " +
					"for the call.",
			};
		});
}

export { frameEndFindings };

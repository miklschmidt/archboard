import type { SemanticBoard } from "#shared/schemas/board-document.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { messagesOf } from "#shared/rules/flow-steps.ts";
import { contentCheckedVariants } from "#runtime/operations/check/content-checks.ts";
import { nodeSubject } from "#runtime/operations/check/subject.ts";

/**
 * Find parts with no connection to another part on the board.
 * @param board The board family.
 * @param file Its source file.
 * @returns One warning per isolated part in an editable variant.
 */
function semanticUnconnectedNodeDiagnostics(board: SemanticBoard, file: string): VaultDiagnostic[] {
	return contentCheckedVariants(board).flatMap((variant) => {
		const connected = new Set<string>();
		const connect = (from: string, to: string): void => {
			if (from !== to) {
				connected.add(from);
				connected.add(to);
			}
		};
		for (const node of variant.content.nodes) {
			if (node.parent !== undefined) connect(node.id, node.parent);
		}
		for (const edge of variant.content.edges) connect(edge.from, edge.to);
		for (const flow of variant.content.flows) {
			for (const step of messagesOf(flow.steps)) connect(step.from, step.to);
		}
		return variant.content.nodes
			.filter((node) => !connected.has(node.id))
			.map((node) => ({
				severity: "warning" as const,
				code: "NODE_UNCONNECTED",
				file,
				board: board.name,
				variant: variant.name,
				subject: nodeSubject(node),
				message:
					`${JSON.stringify(node.name)} has no connection to another node on this board. ` +
					"Add the missing connection, move the node to a board where it connects, or delete it.",
			}));
	});
}

export { semanticUnconnectedNodeDiagnostics };

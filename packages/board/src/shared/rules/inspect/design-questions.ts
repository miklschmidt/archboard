// The board's design questions, read off one variant: where understanding or
// changing the code may take more work than its job needs (ADR 0044, ADR 0059).
//
// There are three. Which entry points only pass one call on? Which containers
// have no hidden part? Which containers have no entry point? Each answer is a
// list of containers with the parts behind them. Nothing here counts across
// the questions, scores a container or says that one is deep or shallow: a
// board says which parts callers reach, and the code says what they do. A
// result is a question for the reader, never a fault.
//
// It reads the whole variant before any view narrows it, through the one
// derivation of a container's interface, so the CLI, the server's route and
// the pane cannot answer the same variant differently.

import type { SemanticNode, VariantContent } from "#shared/schemas/content.ts";
import { inspectContainer } from "#shared/rules/inspect/container-interface.ts";

/** One container, and the parts of it that a design question names. */
interface QuestionResult {
	readonly container: SemanticNode;
	readonly parts: readonly SemanticNode[];
}

/** The answers to the three design questions, each in document order. */
interface DesignQuestions {
	/** Containers with an entry point that only passes one call on, and those entry points. */
	readonly passThroughEntryPoints: readonly QuestionResult[];
	/** Containers whose every child is an entry point, with those children. */
	readonly containersWithNoHiddenPart: readonly QuestionResult[];
	/** Containers that no relationship from outside reaches a child of, with their children. */
	readonly containersWithNoEntryPoint: readonly QuestionResult[];
}

/**
 * The three design questions of one variant.
 *
 * A node with no children has no interface, so it is in neither of the last
 * two lists: "holds no parts" is a fact of its own (ADR 0044). A container that
 * has no entry point is listed with its children, which are all hidden parts,
 * and the list does not say whether the board draws a caller of it.
 * @param content The variant's whole content, before any view narrows it.
 * @returns What each question finds.
 */
function designQuestions(content: VariantContent): DesignQuestions {
	const passing: QuestionResult[] = [];
	const noHiddenPart: QuestionResult[] = [];
	const noEntryPoint: QuestionResult[] = [];
	for (const node of content.nodes) {
		const inspection = inspectContainer(content, node);
		if (!inspection.holdsParts) continue;
		if (inspection.passThrough.length > 0) {
			passing.push({ container: node, parts: inspection.passThrough });
		}
		if (inspection.hiddenParts.length === 0) {
			noHiddenPart.push({
				container: node,
				parts: inspection.entryPoints.map((entry) => entry.node),
			});
		}
		if (inspection.entryPoints.length === 0) {
			noEntryPoint.push({ container: node, parts: inspection.hiddenParts });
		}
	}
	return {
		passThroughEntryPoints: passing,
		containersWithNoHiddenPart: noHiddenPart,
		containersWithNoEntryPoint: noEntryPoint,
	};
}

export { type DesignQuestions, type QuestionResult, designQuestions };

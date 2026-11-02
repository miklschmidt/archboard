import type { LegacyBoard } from "#shared/schemas/legacy-board.ts";
import type { VariantContent } from "#shared/schemas/content.ts";
import type { DiagnosticSubject, SemanticPolicy } from "#shared/schemas/semantic-policy.ts";
import { edgeSubjects, nodeSubject } from "#runtime/operations/check/subject.ts";

interface Reference {
	key: string;
	path: string;
	value: string;
	vocabulary: "levels" | "nodeKinds" | "relationshipKinds" | "groups";
	variant?: string;
	/** The node or relationship that states it; none for the model's own level. */
	subject?: DiagnosticSubject;
}

/**
 * All references, including reconciliation bases that still carry authored meaning.
 * @param model The complete legacy board family.
 * @param includeBases Whether to include reconciliation snapshots in diagnostics.
 * @returns Every semantic vocabulary reference.
 */
function references(model: LegacyBoard, includeBases = true): Reference[] {
	const result: Reference[] = [
		{ key: "document:level", path: "level", value: model.level, vocabulary: "levels" },
	];
	for (const variant of model.variants) {
		result.push(
			...contentReferences(variant.content, variant.id, `variants.${variant.id}.content`),
		);
		if (includeBases && variant.reconciliation !== undefined)
			result.push(
				...contentReferences(
					variant.reconciliation.base,
					variant.id,
					`variants.${variant.id}.reconciliation.base`,
				),
			);
	}
	return result;
}
/**
 * Identify a subject by stable identity so unchanged removed definitions can survive branching.
 * @param content One authored state.
 * @param variant The owning variant.
 * @param prefix The diagnostic location prefix.
 * @returns References in this content.
 */
function contentReferences(content: VariantContent, variant: string, prefix: string): Reference[] {
	const edgeSubject = edgeSubjects(content);
	return [
		...content.nodes.map((node) => ({
			key: `node:${node.id}:kind`,
			path: `${prefix}.nodes.${node.id}.kind`,
			value: node.kind,
			vocabulary: "nodeKinds" as const,
			variant,
			subject: nodeSubject(node),
		})),
		// One reference per membership, keyed by the node and the group rather
		// than by where the id sits in the array: a membership is the same
		// membership after the list beside it changes.
		...content.nodes.flatMap((node) =>
			(node.groups ?? []).map((group) => ({
				key: `node:${node.id}:groups:${group}`,
				path: `${prefix}.nodes.${node.id}.groups.${group}`,
				value: group,
				vocabulary: "groups" as const,
				variant,
				subject: nodeSubject(node),
			})),
		),
		...content.edges.map((edge) => ({
			key: `edge:${edge.id}:kind`,
			path: `${prefix}.edges.${edge.id}.kind`,
			value: edge.kind,
			vocabulary: "relationshipKinds" as const,
			variant,
			subject: edgeSubject(edge),
		})),
	];
}
/**
 * Membership of one reference in the interpreted consumer vocabulary.
 * @param reference The authored reference.
 * @param policy Current valid policy.
 * @returns Whether the reference is configured.
 */
function known(reference: Reference, policy: SemanticPolicy): boolean {
	return reference.vocabulary === "levels"
		? policy.levels.includes(reference.value)
		: Object.hasOwn(policy[reference.vocabulary], reference.value);
}
/**
 * Retain unknown vocabulary values and source coordinates for migration choices.
 * @param model The complete original family, including reconciliation bases.
 * @param policy The valid authored vocabulary.
 * @returns Unconfigured original references.
 */
function unknownVocabularyReferences(model: LegacyBoard, policy: SemanticPolicy): Reference[] {
	return references(model).filter((reference) => !known(reference, policy));
}
export { unknownVocabularyReferences };

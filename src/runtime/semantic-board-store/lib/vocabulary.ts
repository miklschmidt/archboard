import type { SemanticBoard, VariantContent } from "@/shared/semantic-board/index";
import type { SemanticPolicy, VaultDiagnostic } from "@/shared/semantic-policy/index";

interface Reference {
	key: string;
	path: string;
	value: string;
	vocabulary: "levels" | "nodeKinds" | "relationshipKinds" | "groups";
	variant?: string;
}

/**
 * All references, including reconciliation bases that still carry authored meaning.
 * @param board The complete board family.
 * @param includeBases Whether to include reconciliation snapshots in diagnostics.
 * @returns Every semantic vocabulary reference.
 */
function references(board: SemanticBoard, includeBases = true): Reference[] {
	const result: Reference[] = [
		{ key: "board:level", path: "level", value: board.level, vocabulary: "levels" },
	];
	for (const variant of board.variants) {
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
	return [
		...content.nodes.map((node) => ({
			key: `node:${node.id}:kind`,
			path: `${prefix}.nodes.${node.id}.kind`,
			value: node.kind,
			vocabulary: "nodeKinds" as const,
			variant,
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
			})),
		),
		...content.edges.map((edge) => ({
			key: `edge:${edge.id}:kind`,
			path: `${prefix}.edges.${edge.id}.kind`,
			value: edge.kind,
			vocabulary: "relationshipKinds" as const,
			variant,
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
 * Warn about removed definitions without making existing architecture unreadable.
 * @param board The whole family.
 * @param file The board file.
 * @param policy Current valid policy.
 * @returns Unknown reference diagnostics.
 */
function semanticVocabularyDiagnostics(
	board: SemanticBoard,
	file: string,
	policy: SemanticPolicy,
): VaultDiagnostic[] {
	return references(board)
		.filter((reference) => !known(reference, policy))
		.map((reference) => ({
			severity: "warning",
			code: "UNKNOWN_VOCABULARY",
			file,
			board: board.name,
			path: reference.path,
			...(reference.variant === undefined ? {} : { variant: reference.variant }),
			message: `${reference.vocabulary} has no definition for ${JSON.stringify(reference.value)}. Add it to .archboard/config.yaml or change this reference to a configured value; existing content remains readable with neutral appearance.`,
		}));
}
/**
 * Refuse only newly introduced unknown subject references; retained history remains editable.
 * @param candidate The proposed family.
 * @param before The family before the edit.
 * @param policy Current valid policy.
 * @returns The first newly authored unknown reference, or null.
 */
function newVocabularyProblem(
	candidate: SemanticBoard,
	before: SemanticBoard | null,
	policy: SemanticPolicy,
): string | null {
	const prior = new Set(
		before === null
			? []
			: references(before, false).map(
					(reference) => `${reference.variant ?? ""}:${reference.key}:${reference.value}`,
				),
	);
	const existing = new Set(before?.variants.map((entry) => entry.id));
	const unknown = references(candidate, false).find((reference) => {
		if (known(reference, policy)) return false;
		let variant = reference.variant;
		while (variant !== undefined && !existing.has(variant)) {
			variant = candidate.variants.find((entry) => entry.id === variant)?.parent;
		}
		return !prior.has(`${variant ?? ""}:${reference.key}:${reference.value}`);
	});
	return unknown === undefined
		? null
		: `${unknown.path}: ${JSON.stringify(unknown.value)} is not configured in ${unknown.vocabulary}. Choose a configured value (archboard semantic config) or define it in .archboard/config.yaml.`;
}
export { semanticVocabularyDiagnostics, newVocabularyProblem };

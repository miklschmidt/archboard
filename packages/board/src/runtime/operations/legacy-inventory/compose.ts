import { predecessorNames } from "#shared/rules/legacy-inventory/names.ts";
import { convertedReadings } from "#runtime/operations/legacy-inventory/readings.ts";
import type {
	ArchitectureModel,
	ArchitectureModelRead,
	ModelDiagnostic,
} from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { SemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import { currentFlows } from "#shared/rules/legacy-inventory/flows.ts";
import {
	groupOccurrences,
	resolvedValue,
	definitionFields,
	chosenValue,
} from "#runtime/operations/legacy-inventory/preview-choices.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import { composeModules } from "#runtime/operations/legacy-inventory/preview-subjects.ts";
import { modelRevision } from "#runtime/store/model-files.ts";
import { decodeModel, failure } from "#runtime/operations/read/model-read.ts";
/**
 * Compose one selected definition for each mapped flow identity.
 * @param inventory Original current behavior and explicit choices.
 * @param diagnostics Contradictions that block this candidate.
 * @returns Independent synthetic collections.
 */
function composeCollections(inventory: LegacyInventory, diagnostics: ModelDiagnostic[]) {
	type CandidateCollection = Pick<
		ArchitectureModel["collections"][number],
		"schemaVersion" | "id" | "name"
	> & { flows: unknown[] };
	const collections = new Map<string, CandidateCollection>();
	for (const [id, entries] of groupOccurrences(currentFlows(inventory), (entry) =>
		mappedIdentity(inventory.plan, entry.subject),
	)) {
		const owner = entries.find((entry) => entry.subject === id) ?? entries[0]!;
		const fields = definitionFields(
			resolvedValue(inventory, "definition", entries, diagnostics),
			diagnostics,
		);
		const formerNames = [
			...new Set(
				entries
					.flatMap((entry) =>
						predecessorNames(inventory, entry.board, entry.state, (state) =>
							state.content.flows
								.filter((flow) => flow.id === entry.flow.id)
								.map((flow) => flow.name),
						),
					)
					.filter((name) => name !== fields["name"]),
			),
		];
		const collection: CandidateCollection = collections.get(owner.board) ?? {
			schemaVersion: 1,
			id: owner.board,
			name: owner.name,
			flows: [],
		};
		collection.flows.push({ ...fields, id, ...(formerNames.length === 0 ? {} : { formerNames }) });
		collections.set(owner.board, collection);
	}
	return collections.values();
}

/**
 * Encode canonical candidate inputs without writing any file.
 * @param inventory The exact sources and explicit mapping choices.
 * @param diagnostics Contradictions that block this candidate.
 * @param policy The complete selected vocabulary.
 * @returns Synthetic bytes and their source provenance.
 */
function candidateInputs(
	inventory: LegacyInventory,
	diagnostics: ModelDiagnostic[],
	policy: ArchitectureModel["policy"],
) {
	const inputs = new Map<string, Buffer>();
	/**
	 * Encode one disposable candidate document.
	 * @param file Its synthetic location.
	 * @param value Its complete schema input.
	 */
	function put(file: string, value: unknown) {
		inputs.set(file, Buffer.from(JSON.stringify(value)));
	}
	for (const walk of convertedReadings(inventory).walkthroughs)
		put(`walkthroughs/${walk.id.replace("#", "/")}.walkthrough.json`, walk);
	for (const collection of composeCollections(inventory, diagnostics))
		put(`flows/${collection.id}.flows.json`, collection);
	for (const { file, ...subject } of composeModules(inventory, diagnostics)) put(file, subject);
	const current = inventory.boards.some(({ document }) => document?.current !== undefined)
		? { id: inventory.plan.origin, name: "Migration baseline" }
		: null;
	put("model.json", {
		schemaVersion: 1,
		id: inventory.plan.origin,
		name: inventory.plan.origin,
		current,
	});
	inputs.set(".archboard/config.yaml", Buffer.from(Bun.YAML.stringify(policy)));
	put("legacy-source.json", inventory.source);
	put("migration-plan.json", { plan: inventory.plan, revision: inventory.planRevision });
	return inputs;
}

/**
 * Compose captured legacy meaning through the canonical schema and coherence owner.
 * @param inventory The exact captured source and explicit choices.
 * @returns A complete canonical candidate or actionable diagnostics.
 */
function composeModel(inventory: LegacyInventory): ArchitectureModelRead {
	const policy = previewPolicy(inventory);
	if (!policy.success) return policy;
	const diagnostics: ModelDiagnostic[] = [];
	const inputs = candidateInputs(inventory, diagnostics, policy.policy);
	return diagnostics.length > 0
		? failure("MAPPING_INVALID", diagnostics)
		: decodeModel({ inputs, revision: modelRevision(inputs), diagnostics: [] });
}
export { composeModel };
/**
 * Resolve a complete policy from the explicit conflict decisions.
 * @param inventory Original authored policy and choices.
 * @returns A valid candidate policy or a complete refusal.
 */
function previewPolicy(inventory: LegacyInventory) {
	const policies = inventory.conflicts
		.filter((conflict) => conflict.kind === "policy")
		.map((conflict) => chosenValue(inventory, conflict));
	const policy = SemanticPolicySchema.safeParse(policies[0] ?? inventory.policy);
	if (!policy.success || policies.some((value) => !sameSemanticValue(value, policies[0])))
		return failure("MAPPING_INVALID", [
			{
				code: "MAPPING_INVALID",
				file: ".archboard/migration-plan.json",
				message: "Policy choices must supply one complete, valid candidate policy.",
				recovery: "Resolve every policy conflict with the same complete policy object.",
			},
		]);
	return { success: true as const, policy: policy.data };
}

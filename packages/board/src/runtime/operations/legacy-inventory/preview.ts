import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import type { SemanticVariant } from "#shared/schemas/board-document.ts";
import { SemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import { currentFlows } from "#shared/rules/legacy-inventory/flows.ts";
import {
	groupOccurrences,
	resolvedValue,
	definitionFields,
	chosenValue,
} from "#runtime/operations/legacy-inventory/preview-choices.ts";
import { readLegacyInventory } from "#runtime/operations/legacy-inventory/inventory.ts";
import { currentNodes } from "#shared/rules/legacy-inventory/evidence.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import { composeModules } from "#runtime/operations/legacy-inventory/preview-subjects.ts";
import type { ModelDiagnostic } from "#shared/schemas/model.ts";
import { readMigrationPlan } from "#runtime/store/migration-plan.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import {
	decodeModel,
	selectModule,
	selectFlow,
	failure,
} from "#runtime/operations/read/model-read.ts";

type Preview = NonNullable<ArchitectureModel["migrationPreview"]>;

/**
 * Preserve original state metadata without importing its independent history.
 * @param state One original state.
 * @returns The supported descriptive metadata.
 */
function stateMetadata(state: SemanticVariant) {
	return {
		id: state.id,
		name: state.name,
		formerNames: state.formerNames,
		summary: state.summary,
		documents: state.documents,
	};
}

/**
 * Retain original current metadata and explicit future proposal addresses.
 * @param inventory Exact original coverage and owner choices.
 * @returns Preview provenance without importing planned subjects.
 */
function previewCoverage(inventory: LegacyInventory): Preview {
	const preview: Preview = {
		origin: inventory.plan.origin,
		source: inventory.source,
		planRevision: inventory.planRevision!,
		coverage: [],
		plannedBoards: [],
	};
	for (const { document, file } of inventory.boards) {
		if (document === undefined) continue;
		const state = document.variants.find((variant) => variant.id === document.current);
		preview.coverage.push({
			board: document.id,
			file,
			name: document.name,
			formerNames: document.formerNames,
			current:
				state === undefined
					? undefined
					: {
							...stateMetadata(state),
							legacy: `${inventory.plan.origin}/${document.id}#${state.id}`,
						},
		});
		if (state !== undefined) continue;
		preview.plannedBoards.push({
			board: document.id,
			states: document.variants.map((variant) => {
				const legacy = `${inventory.plan.origin}/${document.id}#${variant.id}`;
				return {
					...stateMetadata(variant),
					legacy,
					canonical: mappedIdentity(inventory.plan, legacy),
					lifecycle: variant.lifecycle,
				};
			}),
		});
	}
	return preview;
}

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
			...new Set(entries.map((entry) => entry.flow.name).filter((name) => name !== fields["name"])),
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
	const preview = previewCoverage(inventory);
	const inputs = new Map<string, Buffer>();
	/**
	 * Encode one disposable candidate document.
	 * @param file Its synthetic location.
	 * @param value Its complete schema input.
	 */
	function put(file: string, value: unknown) {
		inputs.set(file, Buffer.from(JSON.stringify(value)));
	}
	for (const collection of composeCollections(inventory, diagnostics))
		put(`flows/${collection.id}.flows.json`, collection);
	for (const { file, ...subject } of composeModules(inventory, diagnostics)) put(file, subject);
	const current = preview.coverage.some((entry) => entry.current !== undefined)
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
	return { inputs, preview };
}

/**
 * Read a saved mapping plan as a candidate through canonical validation.
 * @param vault The explicitly addressed legacy vault.
 * @param origin The saved import namespace.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @returns The complete candidate without installing any input.
 */
function readMigrationPreview(
	vault: string,
	origin: string,
	module?: string,
	flow?: string,
): ArchitectureModelRead {
	const inventory = readLegacyInventory(vault, origin);
	if (!inventory.success) return failure("MAPPING_INVALID", inventory.diagnostics);
	const refused = previewEligibility(inventory) ?? previewReferenceFailure(inventory);
	return refused ?? composePreview(vault, inventory, module, flow);
}

/**
 * Require a fresh saved plan and complete explicit decisions.
 * @param inventory Original coverage and exact plan revisions.
 * @returns A structured refusal or no unmet prerequisite.
 */
function previewEligibility(inventory: LegacyInventory) {
	if (inventory.planRevision === null)
		return failure("MAPPING_REQUIRED", [
			{
				code: "MAPPING_REQUIRED",
				file: ".archboard/migration-plan.json",
				message: "Preview requires a saved mapping plan.",
				recovery: "Save the explicit mapping plan and retry the preview.",
			},
		]);
	if (inventory.plan.sourceDigest !== inventory.source.digest)
		return failure("MAPPING_STALE", inventory.diagnostics);
	if (inventory.diagnostics.some((diagnostic) => diagnostic.code !== "INVALID_POLICY"))
		return failure("MAPPING_INVALID", inventory.diagnostics);
	if (inventory.unresolved.length > 0)
		return failure(
			"MAPPING_UNRESOLVED",
			inventory.unresolved.map((key) => ({
				code: "MAPPING_UNRESOLVED",
				file: ".archboard/migration-plan.json",
				path: key,
				message: "A mapping conflict has no explicit choice.",
				recovery: "Resolve every conflict against a fresh inventory before previewing.",
			})),
		);
	return undefined;
}

/**
 * Require explicit targets for current drill-down references.
 * @param inventory Original current subjects and reference mappings.
 * @returns A structured refusal or complete reference mapping coverage.
 */
function previewReferenceFailure(inventory: LegacyInventory) {
	const missingReferences = currentNodes(inventory).filter(
		(entry) =>
			entry.node.drillDown !== undefined &&
			!inventory.plan.references?.some((mapping) => mapping.legacy === entry.subject),
	);
	if (missingReferences.length > 0)
		return failure(
			"MAPPING_UNRESOLVED",
			missingReferences.map((entry) => ({
				code: "MAPPING_UNRESOLVED",
				file: entry.file,
				subjects: [entry.subject!],
				message: "A drill-down has no explicit canonical subject and state mapping.",
				recovery: "Add its exact target to the mapping plan references and save the plan.",
			})),
		);
	return undefined;
}

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

/**
 * Refuse interference with captured source or mapping bytes during composition.
 * @param vault The explicitly addressed legacy vault.
 * @param inventory The source and plan that supplied this candidate.
 * @returns Whether either captured input changed.
 */
function previewChanged(vault: string, inventory: LegacyInventory): boolean {
	const latest = readModelFiles(vault);
	const plan = readMigrationPlan(vault, inventory.plan.origin);
	return (
		latest.diagnostics.length > 0 ||
		latest.revision.digest !== inventory.source.digest ||
		plan.problem !== undefined ||
		plan.revision !== inventory.planRevision
	);
}

/**
 * Validate and select the synthetic candidate through the existing canonical reader.
 * @param vault The explicitly addressed legacy vault.
 * @param inventory Exact source inputs and explicit choices.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @returns A complete candidate or actionable refusal.
 */
function composePreview(
	vault: string,
	inventory: LegacyInventory,
	module?: string,
	flow?: string,
): ArchitectureModelRead {
	const policy = previewPolicy(inventory);
	if (!policy.success) return policy;
	const diagnostics: ModelDiagnostic[] = [];
	const { inputs, preview } = candidateInputs(inventory, diagnostics, policy.policy);
	if (diagnostics.length > 0) return failure("MAPPING_INVALID", diagnostics);
	const model = decodeModel({ inputs, revision: modelRevision(inputs), diagnostics: [] });
	if (previewChanged(vault, inventory))
		return failure("MODEL_CHANGED", [
			{
				code: "MODEL_CHANGED",
				file: ".archboard/migration-plan.json",
				message: "The source or mapping choices changed during composition.",
				recovery: "Finish external edits and preview the fresh mapping plan again.",
			},
		]);
	return model.success
		? selectFlow(selectModule({ ...model, migrationPreview: preview }, module), flow)
		: model;
}
export { readMigrationPreview };

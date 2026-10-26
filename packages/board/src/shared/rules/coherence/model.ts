import { everyStep, messagesOf } from "#shared/rules/flow-steps.ts";
import type { ArchitectureModel, ModelDiagnostic } from "#shared/schemas/model.ts";

type Module = ArchitectureModel["modules"][number];

/**
 * Find conflicting definitions and retired identities.
 * @param modules All modules in path order.
 * @param manifest The current model manifest.
 * @param collections The independent flow definitions.
 * @returns Identity diagnostics.
 */
function identityDiagnostics(
	modules: Module[],
	manifest: ArchitectureModel["manifest"],
	collections: ArchitectureModel["collections"],
): ModelDiagnostic[] {
	const definitions = new Map<string, string>();
	const retired = new Set(manifest.retiredIds);
	const diagnostics: ModelDiagnostic[] = [];
	const subjects = modules.flatMap((module) =>
		[module.id, ...module.outgoing.map((edge) => edge.id)].map((id) => ({ id, file: module.file })),
	);
	subjects.push(
		...collections.flatMap((collection) =>
			collection.flows.flatMap((flow) =>
				[flow.id, ...everyStep(flow.steps).map((step) => step.id)].map((id) => ({
					id,
					file: collection.file,
				})),
			),
		),
	);
	for (const { id, file } of subjects) {
		if (retired.has(id))
			diagnostics.push({
				code: "RETIRED_ID",
				file,
				subjects: [id],
				message: `Retired identity ${id} has a live definition.`,
				recovery: "Preserve the retired identity reservation and repair the live definition.",
			});
		const previous = definitions.get(id);
		if (previous === undefined) definitions.set(id, file);
		else
			diagnostics.push({
				code: "DUPLICATE_ID",
				file,
				subjects: [id],
				message: `Identity ${id} has more than one definition.`,
				recovery: `Resolve the duplicate in ${previous} and ${file} without renaming an existing identity.`,
			});
	}
	return diagnostics;
}

/**
 * Find vocabulary references absent from the authored policy.
 * @param module A module definition.
 * @param policy The valid policy.
 * @returns Vocabulary diagnostics.
 */
function vocabularyDiagnostics(
	module: Module,
	policy: ArchitectureModel["policy"],
): ModelDiagnostic[] {
	const references = [
		{ value: module.kind, path: "kind", configured: policy.nodeKinds },
		...(module.groups ?? []).map((value, index) => ({
			value,
			path: `groups.${index}`,
			configured: policy.groups,
		})),
		...module.outgoing.map((edge, index) => ({
			value: edge.kind,
			path: `outgoing.${index}.kind`,
			configured: policy.relationshipKinds,
		})),
	];
	return references
		.filter((reference) => !Object.hasOwn(reference.configured, reference.value))
		.map((reference) => ({
			code: "UNKNOWN_VOCABULARY",
			file: module.file,
			path: reference.path,
			subjects: [module.id],
			message: `The policy does not define ${reference.value}.`,
			recovery: "Use a configured vocabulary key or define it in .archboard/config.yaml.",
		}));
}

/**
 * Find absent local parents and relationship endpoints.
 * @param module A module definition.
 * @param byId Every module in the model.
 * @returns Reference diagnostics.
 */
function referenceDiagnostics(module: Module, byId: Map<string, Module>): ModelDiagnostic[] {
	const references = [
		...(module.parent === undefined
			? []
			: [{ target: module.parent, id: module.id, path: "parent" }]),
		...module.outgoing.map((edge, index) => ({
			target: edge.to,
			id: edge.id,
			path: `outgoing.${index}.to`,
		})),
	];
	return references
		.filter((reference) => !byId.has(reference.target))
		.map((reference) => ({
			code: "MISSING_LOCAL_TARGET",
			file: module.file,
			path: reference.path,
			subjects: [reference.id, reference.target],
			message: `Local target ${reference.target} has no module definition.`,
			recovery: "Restore the target definition or repair the explicit reference.",
		}));
}

/**
 * Walk one containment chain without recursion or repeating completed chains.
 * @param start The module at the start of this chain.
 * @param byId Every module in the model.
 * @param visited Modules already visited in this read.
 * @returns The identities in a cyclic chain, or an empty list.
 */
function containmentCycle(
	start: string,
	byId: Map<string, Module>,
	visited: Set<string>,
): string[] {
	const chain = new Set<string>();
	let next: string | undefined = start;
	while (next !== undefined) {
		if (chain.has(next)) return [...chain];
		if (visited.has(next)) return [];
		chain.add(next);
		visited.add(next);
		next = byId.get(next)?.parent;
	}
	return [];
}

/**
 * Validate containment independently of dependency cycles.
 * @param modules All module definitions.
 * @param byId Every module in the model.
 * @returns Containment diagnostics.
 */
function forestDiagnostics(modules: Module[], byId: Map<string, Module>): ModelDiagnostic[] {
	const visited = new Set<string>();
	return modules.flatMap((module) => {
		const subjects = containmentCycle(module.id, byId, visited);
		return subjects.length === 0
			? []
			: [
					{
						code: "CONTAINMENT_CYCLE",
						file: module.file,
						path: "parent",
						subjects,
						message: "Module containment contains a cycle.",
						recovery: "Remove a parent reference from the cycle. Dependencies can still cycle.",
					},
				];
	});
}

/**
 * Validate the complete authored model before returning any part of it.
 * @param modules All discovered modules in path order.
 * @param policy The valid authored vocabulary.
 * @param manifest The model identity and current-state metadata.
 * @param collections The independent flow definitions.
 * @returns Diagnostics that refuse the complete model.
 */
function modelDiagnostics(
	modules: Module[],
	policy: ArchitectureModel["policy"],
	manifest: ArchitectureModel["manifest"],
	collections: ArchitectureModel["collections"],
): ModelDiagnostic[] {
	const byId = new Map(modules.map((module) => [module.id, module]));
	return [
		...(manifest.current === null && modules.length > 0
			? [
					{
						code: "NO_CURRENT_STATE",
						file: "model.json",
						message: "Module definitions exist without a current architectural state.",
						recovery:
							"Declare the current state or remove definitions that do not belong to current architecture.",
					},
				]
			: []),
		...identityDiagnostics(modules, manifest, collections),
		...modules.flatMap((module) => [
			...vocabularyDiagnostics(module, policy),
			...referenceDiagnostics(module, byId),
		]),
		...forestDiagnostics(modules, byId),
		...collectionDiagnostics(collections, byId),
	];
}

/**
 * Name the file and subjects of one behavioral failure.
 * @param file The authored collection path.
 * @param code The stable diagnostic code.
 * @param subjects The affected subject identities.
 * @param message The violated behavioral contract.
 * @returns The complete actionable diagnostic.
 */
function flowDiagnostic(
	file: string,
	code: string,
	subjects: string[],
	message: string,
): ModelDiagnostic {
	return {
		file,
		code,
		subjects,
		message,
		recovery: "Repair the explicit flow references and read the complete model again.",
	};
}
/**
 * Validate ordered participants and message membership independently of file naming.
 * @param flow One complete flow tree.
 * @param file The authored collection path.
 * @param modules Every canonical module definition.
 * @returns The reference and membership failures.
 */
function flowDiagnostics(
	flow: ArchitectureModel["collections"][number]["flows"][number],
	file: string,
	modules: Map<string, Module>,
): ModelDiagnostic[] {
	return [
		...(new Set(flow.participants).size === flow.participants.length
			? []
			: [
					flowDiagnostic(
						file,
						"DUPLICATE_PARTICIPANT",
						[flow.id],
						"Each participant must appear once in its authored order.",
					),
				]),
		...flow.participants
			.filter((id) => !modules.has(id))
			.map((id) =>
				flowDiagnostic(
					file,
					"MISSING_LOCAL_TARGET",
					[flow.id, id],
					"A participant has no module definition.",
				),
			),
		...messagesOf(flow.steps).flatMap((step) =>
			[step.from, step.to]
				.filter((id) => !flow.participants.includes(id))
				.map((id) =>
					flowDiagnostic(
						file,
						"MISSING_PARTICIPANT",
						[flow.id, step.id, id],
						"A message endpoint is absent from the participant list.",
					),
				),
		),
	];
}
/**
 * Validate collection identity separately from subject identity.
 * @param collections The independent flow collections.
 * @param modules Every canonical module definition.
 * @returns Collection and behavioral reference diagnostics.
 */
function collectionDiagnostics(
	collections: ArchitectureModel["collections"],
	modules: Map<string, Module>,
): ModelDiagnostic[] {
	const seen = new Set<string>();
	const diagnostics: ModelDiagnostic[] = [];
	for (const collection of collections) {
		if (seen.has(collection.id))
			diagnostics.push(
				flowDiagnostic(
					collection.file,
					"DUPLICATE_COLLECTION",
					[],
					"A collection identity has more than one definition.",
				),
			);
		seen.add(collection.id);
		diagnostics.push(
			...collection.flows.flatMap((flow) => flowDiagnostics(flow, collection.file, modules)),
		);
	}
	return diagnostics;
}

/**
 * Compare authored positions with stable identities as the tie breaker.
 * @param one One ordered subject.
 * @param other Another ordered subject.
 * @returns A deterministic ordering independent of file locations.
 */
function compareModelSubjects(
	one: Pick<Module, "id" | "order">,
	other: Pick<Module, "id" | "order">,
): number {
	return one.order - other.order || (one.id < other.id ? -1 : Number(one.id > other.id));
}

export { modelDiagnostics, compareModelSubjects };

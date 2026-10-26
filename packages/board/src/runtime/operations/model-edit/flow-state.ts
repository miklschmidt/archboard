import type { z } from "zod";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { FlowChangeSchema, NewStepSchema } from "#shared/schemas/model-flows.ts";
import { flatSteps, type FlatStep } from "#shared/rules/flow-steps.ts";
import { selectModule } from "#runtime/operations/read/model-read.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";

type Collection = ArchitectureModel["collections"][number];
type Flow = Collection["flows"][number];
type Change = z.infer<typeof FlowChangeSchema>;
type Placement = Extract<Change, { type: "move-step" }>["placement"];
type Entry = { value: FlatStep; place: Placement };

/**
 * Refuse the complete candidate with affected identities.
 * @param message The conflict and recovery action.
 * @param subjects The affected identities.
 * @throws {ArchiveError} Names the explicit conflict.
 */
function conflict(message: string, subjects: string[] = []): never {
	throw new ArchiveError("MODEL_INVALID", message, "model.json", subjects);
}
/**
 * Find a collection by identity before a unique name.
 * @param collections The current candidate collections.
 * @param selector The explicit collection reference.
 * @returns The continuing collection.
 */
function collectionOf(collections: Collection[], selector: string): Collection {
	const exact = collections.find((value) => value.id === selector);
	if (exact) return exact;
	const matches = collections.filter((value) => value.name === selector);
	if (matches.length !== 1) conflict("Select one existing collection by identity or unique name.");
	return matches[0]!;
}
/**
 * Find a flow by identity before current or former names.
 * @param collections The current candidate collections.
 * @param selector The explicit flow reference.
 * @returns The continuing flow.
 */
function flowOf(collections: Collection[], selector: string): Flow {
	const flows = collections.flatMap((collection) => collection.flows);
	const exact = flows.find((flow) => flow.id === selector);
	if (exact) return exact;
	const matches = flows.filter(
		(flow) => flow.name === selector || flow.formerNames?.includes(selector),
	);
	if (matches.length !== 1)
		conflict("Select one existing flow by qualified identity or unique name.");
	return matches[0]!;
}
/**
 * Resolve a step in the complete candidate.
 * @param entries Every continuing step and its placement.
 * @param id The explicit step identity.
 * @returns The continuing step record.
 */
function entryOf(entries: Map<string, Entry>, id: string): Entry {
	const entry = entries.get(id);
	if (!entry) conflict("Use an existing step identity.", [id]);
	return entry;
}
/**
 * Flatten through the existing flow owner without changing identity or order.
 * @param flows The selected flow trees.
 * @returns Each step and its explicit holder.
 */
function readEntries(flows: Pick<Flow, "id" | "steps">[]): Map<string, Entry> {
	return new Map(
		flows.flatMap((flow) =>
			flatSteps(flow.steps).map(
				({ within, ...value }) =>
					[
						value.id,
						{
							value,
							place:
								within === undefined
									? { holder: flow.id }
									: {
											holder: within.step,
											...(within.alternative === undefined
												? {}
												: { alternative: within.alternative }),
										},
						},
					] as const,
			),
		),
	);
}
/**
 * Allocate a new subtree through the existing identity authority.
 * @param step The authored subtree without identities.
 * @param fresh The shared candidate identity allocator.
 * @returns The new subtree with stable identities.
 */
function newStep(step: z.infer<typeof NewStepSchema>, fresh: () => string): Flow["steps"][number] {
	const id = fresh();
	if (step.kind === "loop")
		return { ...step, id, steps: step.steps.map((value) => newStep(value, fresh)) };
	if (step.kind === "decision")
		return {
			...step,
			id,
			alternatives: step.alternatives.map((value) => ({
				...value,
				steps: value.steps.map((child) => newStep(child, fresh)),
			})),
		};
	return { ...step, id };
}
/**
 * Collect a subject, its ancestors, flow participants, and moved subtree.
 * @param entries The selected side of the step graph.
 * @param flows The selected side of the flow definitions.
 * @param id The changed root identity.
 * @param subjects The complete affected claim and event set.
 */
function includeAffected(
	entries: Map<string, Entry>,
	flows: Flow[],
	id: string,
	subjects: Set<string>,
): void {
	const visiting = new Set<string>();
	/**
	 * Include each ancestor once.
	 * @param subject The next identity on the holder path.
	 */
	const include = (subject: string): void => {
		if (visiting.has(subject)) return;
		visiting.add(subject);
		subjects.add(subject);
		const flow = flows.find((value) => value.id === subject);
		if (flow) {
			for (const participant of flow.participants) subjects.add(participant);
			return;
		}
		const entry = entries.get(subject);
		if (entry) include(entry.place.holder);
	};
	include(id);
	const queue = [id];
	for (let index = 0; index < queue.length; index++)
		for (const [child, entry] of entries)
			if (entry.place.holder === queue[index] && !queue.includes(child)) {
				queue.push(child);
				include(child);
			}
}
/**
 * Resolve module selectors against continuing and explicitly removed definitions.
 * @param model The original complete reading.
 * @param modules The candidate module definitions.
 * @returns The shared module selector for this batch.
 */
function moduleSelector(model: ArchitectureModel, modules: ArchitectureModel["modules"]) {
	const lookup = [
		...new Map([...model.modules, ...modules].map((module) => [module.id, module])).values(),
	];
	return (selector: string): string => {
		const result = selectModule({ ...model, modules: lookup }, selector);
		if (!result.success) {
			const diagnostic = result.diagnostics[0]!;
			throw new ArchiveError(result.code, diagnostic.message, diagnostic.file, diagnostic.subjects);
		}
		return result.selectedModule!;
	};
}
export {
	type Flow,
	type Collection,
	type Change,
	type Placement,
	type Entry,
	conflict,
	collectionOf,
	flowOf,
	entryOf,
	readEntries,
	newStep,
	includeAffected,
	moduleSelector,
};

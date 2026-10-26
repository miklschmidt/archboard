import type { z } from "zod";
import type { NewStepSchema, FlowChangeSchema } from "#shared/schemas/model-flows.ts";
import { FlowChangeSchema as ChangeSchema } from "#shared/schemas/model-flows.ts";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { flatSteps, nestedSteps, type FlatStep } from "#shared/rules/flow-steps.ts";
import { selectModule } from "#runtime/operations/read/model-read.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";

type Collection = ArchitectureModel["collections"][number];
type Flow = Collection["flows"][number];
type Change = z.infer<typeof FlowChangeSchema>;
type Placement = Extract<Change, { type: "move-step" }>["placement"];
type Entry = { value: FlatStep; place: Placement };

/** Allocate a new subtree through the existing identity authority. */
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

function conflict(message: string, subjects: string[] = []): never {
	throw new ArchiveError("MODEL_INVALID", message, "model.json", subjects);
}
function collectionOf(collections: Collection[], selector: string): Collection {
	const exact = collections.find((value) => value.id === selector);
	if (exact) return exact;
	const matches = collections.filter((value) => value.name === selector);
	if (matches.length !== 1) conflict("Select one existing collection by identity or unique name.");
	return matches[0]!;
}
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
function entryOf(entries: Map<string, Entry>, id: string): Entry {
	const entry = entries.get(id);
	if (!entry) conflict("Use an existing step identity.", [id]);
	return entry;
}
function placeKey(place: Placement): string {
	return JSON.stringify([place.holder, place.alternative]);
}
function readEntries(flows: Pick<Flow, "id" | "steps">[]): Map<string, Entry> {
	return new Map(
		flows.flatMap((flow) =>
			flatSteps(flow.steps).map((value) => {
				const { within, ...alone } = value;
				return [
					value.id,
					{
						value: alone,
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
				] as const;
			}),
		),
	);
}
function assign(
	value: object,
	set: object | undefined,
	clear: readonly string[] | undefined,
): void {
	for (const field of clear ?? [])
		if (set && Object.hasOwn(set, field)) conflict(`Field ${field} is both assigned and cleared.`);
	Object.assign(value, set);
	for (const field of clear ?? []) Reflect.deleteProperty(value, field);
}

/** Collect each changed subject, its subtree, old/new holders, flow, and participants. */
function includeAffected(
	entries: Map<string, Entry>,
	flows: Flow[],
	id: string,
	subjects: Set<string>,
): void {
	const visiting = new Set<string>();
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

/** Require every destination and relative order before nesting through the existing flow owner. */
function materialize(
	flows: Flow[],
	entries: Map<string, Entry>,
	moves: Map<string, Placement>,
): void {
	const groups = new Map<string, string[]>();
	const flowIds = new Set(flows.map((flow) => flow.id));
	for (const [id, entry] of entries) {
		const { holder, alternative } = entry.place;
		const parent = entries.get(holder)?.value;
		const valid = flowIds.has(holder)
			? alternative === undefined
			: parent?.kind === "loop"
				? alternative === undefined
				: parent?.kind === "decision" &&
					alternative !== undefined &&
					parent.alternatives.includes(alternative);
		if (!valid) conflict("The placement holder or exact alternative is missing.", [id, holder]);
		const key = placeKey(entry.place);
		if (!groups.has(key)) groups.set(key, []);
		if (!moves.has(id)) groups.get(key)!.push(id);
	}
	const active = new Set<string>();
	const done = new Set<string>();
	const insert = (id: string): void => {
		if (done.has(id)) return;
		if (active.has(id)) conflict("Relative step ordering contains a cycle.", [...active, id]);
		active.add(id);
		const entry = entryOf(entries, id);
		const before = moves.get(id)?.before;
		const group = groups.get(placeKey(entry.place))!;
		if (before !== undefined) {
			const sibling = entryOf(entries, before);
			if (placeKey(sibling.place) !== placeKey(entry.place))
				conflict("The before identity is not a sibling in the destination holder.", [id, before]);
			if (moves.has(before)) insert(before);
			group.splice(group.indexOf(before), 0, id);
		} else group.push(id);
		active.delete(id);
		done.add(id);
	};
	for (const id of [...moves.keys()].sort()) insert(id);
	const reached = new Set<string>();
	const flatten = (holder: string, alternative?: string): FlatStep[] => {
		return (
			groups.get(placeKey({ holder, ...(alternative === undefined ? {} : { alternative }) })) ?? []
		).flatMap((id) => {
			if (reached.has(id)) conflict("Step containment contains a cycle.", [id, holder]);
			reached.add(id);
			const value = entryOf(entries, id).value;
			const within = flowIds.has(holder)
				? {}
				: { within: { step: holder, ...(alternative === undefined ? {} : { alternative }) } };
			return [
				{ ...value, ...within },
				...(value.kind === "loop"
					? flatten(id)
					: value.kind === "decision"
						? value.alternatives.flatMap((label) => flatten(id, label))
						: []),
			];
		});
	};
	for (const flow of flows) flow.steps = nestedSteps(flatten(flow.id));
	if (reached.size !== entries.size)
		conflict(
			"Step placements contain an unreachable holder or containment cycle.",
			[...entries.keys()].filter((id) => !reached.has(id)),
		);
}

/** Extend the complete candidate behind the existing durable write operation. */
function applyFlowChanges(
	model: ArchitectureModel,
	statements: Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"],
	fresh: () => string,
	subjects: Set<string>,
	retired: Set<string>,
	removedModules: Set<string>,
 modules: ArchitectureModel["modules"],
): Collection[] {
	const collections = structuredClone(model.collections);
 const lookup=[...new Map([...model.modules,...modules].map(module=>[module.id,module])).values()];
 const moduleId=(selector:string):string=>{
  const result=selectModule({...model,modules:lookup},selector);
  if(!result.success){const diagnostic=result.diagnostics[0]!;throw new ArchiveError(result.code,diagnostic.message,diagnostic.file,diagnostic.subjects);}
  return result.selectedModule!;
 };

	const changes = statements.flatMap((change) => {
		const parsed = ChangeSchema.safeParse(change);
		return parsed.success ? [parsed.data] : [];
	});
	for (const change of changes)
		if (change.type === "add-collection") {
			const id = fresh().split("#")[1]!;
			collections.push({
				schemaVersion: 1,
				id,
				name: change.name,
				file: `${id}.flows.json`,
				flows: [],
			});
		}
	for (const change of changes)
		if (change.type === "add-flow")
			collectionOf(collections, change.collection).flows.push({
				...change.flow,
 participants:change.flow.participants.map(moduleId),
				id: fresh(),
				steps: change.flow.steps.map((step) => newStep(step, fresh)),
			});
	const flows = collections.flatMap((collection) => collection.flows);
	const entries = readEntries(flows);
	const originalEntries = readEntries(model.collections.flatMap((collection) => collection.flows));
	const moves = new Map<string, Placement>();
	const edited = new Set<string>();
	const removals = new Set<string>();
	const removedCollections = new Set<string>();
	const once = (id: string): void => {
		if (edited.has(id)) conflict("State one edit or removal per subject.", [id]);
		edited.add(id);
	};
	for (const change of changes) {
		if (change.type === "edit-flow" || change.type === "remove-flow") {
			const flow = flowOf(collections, change.subject);
			once(flow.id);
			includeAffected(entries, flows, flow.id, subjects);
			if (change.type === "remove-flow") {
				removals.add(flow.id);
				continue;
			}
			const previous = flow.name;
			assign(flow, change.set, change.clear);
 flow.participants=flow.participants.map(moduleId);
			if (previous !== flow.name)
				flow.formerNames = [...new Set([...(flow.formerNames ?? []), previous])];
			if (change.collection !== undefined) {
				for (const collection of collections)
					collection.flows = collection.flows.filter((value) => value.id !== flow.id);
				collectionOf(collections, change.collection).flows.push(flow);
			}
		} else if (change.type === "edit-collection" || change.type === "remove-collection") {
			const collection = collectionOf(collections, change.collection);
			once(`collection:${collection.id}`);
			for (const flow of collection.flows) includeAffected(entries, flows, flow.id, subjects);
			if (change.type === "edit-collection") collection.name = change.name;
			else removedCollections.add(collection.id);
		} else if (change.type === "add-step") {
			const step = newStep(change.step, fresh);
			const added = readEntries([{ id: change.placement.holder, steps: [step] }]);
			for (const [id, entry] of added) entries.set(id, entry);
			moves.set(step.id, change.placement);
		} else if (change.type === "edit-step" || change.type === "remove-step") {
			const entry = entryOf(entries, change.subject);
			once(change.subject);
			includeAffected(entries, flows, change.subject, subjects);
			if (change.type === "remove-step") removals.add(change.subject);
			else assign(entry.value, change.set, change.clear);
		} else if (change.type === "move-step") {
			entryOf(entries, change.subject);
			if (moves.has(change.subject))
				conflict("A step has conflicting placements.", [change.subject]);
			includeAffected(entries, flows, change.subject, subjects);
			moves.set(change.subject, change.placement);
		}
	}
	for (const collection of [...collections])
		if (removedCollections.has(collection.id)) {
			for (const flow of collection.flows) removals.add(flow.id);
			collections.splice(collections.indexOf(collection), 1);
		}
	for (const [id, place] of moves) {
		entryOf(entries, id).place = place;
		if (place.before !== undefined) includeAffected(entries, flows, place.before, subjects);
	}
	for (const entry of entries.values()) if("from" in entry.value) {entry.value.from=moduleId(entry.value.from);entry.value.to=moduleId(entry.value.to);}
	// References to removed modules disappear with their messages, never with structural reverse edges.
	for (const flow of flows)
		if (flow.participants.some((id) => removedModules.has(id))) {
			includeAffected(entries, flows, flow.id, subjects);
			flow.participants = flow.participants.filter((id) => !removedModules.has(id));
		}
	for (const [id, entry] of entries)
		if (
			"from" in entry.value &&
			(removedModules.has(entry.value.from) || removedModules.has(entry.value.to))
		)
			removals.add(id);
	const discarded = new Set(removals);
	for (const [id, entry] of entries)
		if (
			"from" in entry.value &&
			(removedModules.has(entry.value.from) || removedModules.has(entry.value.to)) &&
			(edited.has(id) || moves.has(id))
		)
			conflict("An edited or moved message still names a removed endpoint.", [id]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const [id, entry] of entries) {
			if (discarded.has(id)) continue;
			const children = [...entries].filter(([, child]) => child.place.holder === id);
			const emptied =
				removedModules.size > 0 &&
				(entry.value.kind === "loop" || entry.value.kind === "decision") &&
				children.every(([child]) => discarded.has(child));
			if (discarded.has(entry.place.holder) || emptied) {
				discarded.add(id);
				changed = true;
			}
		}
		if (removedModules.size > 0)
			for (const flow of flows) {
				if (discarded.has(flow.id)) continue;
				const roots = [...entries].filter(([, entry]) => entry.place.holder === flow.id);
				if (flow.participants.length === 0 || roots.every(([id]) => discarded.has(id))) {
					discarded.add(flow.id);
					changed = true;
				}
			}
	}
	for (const id of discarded) {
		includeAffected(
			originalEntries,
			model.collections.flatMap((collection) => collection.flows),
			id,
			subjects,
		);
		retired.add(id);
		entries.delete(id);
		moves.delete(id);
	}
	for (const collection of collections)
		collection.flows = collection.flows.filter((value) => !discarded.has(value.id));
	const remaining = collections.flatMap((collection) => collection.flows);
	for (const id of moves.keys()) includeAffected(entries, remaining, id, subjects);
	for (const flow of remaining)
		if (
			edited.has(flow.id) || !model.collections.some((collection) =>
				collection.flows.some((value) => value.id === flow.id),
			)
		)
			includeAffected(entries, remaining, flow.id, subjects);
	materialize(remaining, entries, moves);
	return collections;
}
export { applyFlowChanges };

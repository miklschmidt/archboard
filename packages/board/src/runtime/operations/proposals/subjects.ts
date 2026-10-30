import { flatSteps, type FlatStep } from "#shared/rules/flow-steps.ts";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { z } from "zod";
import { ProposalChangeSchema, SubjectKindSchema } from "#shared/schemas/model-proposals.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import { isDeepStrictEqual } from "node:util";

type Change = z.infer<typeof ProposalChangeSchema>;
type Placement = Extract<Change, { type: "place" }>["placement"];
type Subject = {
	kind: z.infer<typeof SubjectKindSchema>;
	value: Record<string, unknown>;
	placement?: Placement;
};
type Subjects = Map<string, Subject>;
type ModelFlow = ArchitectureModel["collections"][number]["flows"][number];

/**
 * Read a sibling reference without storing an array index.
 * @param id The next sibling identity.
 * @returns The optional ordering instruction.
 */
function before(id: string | undefined) {
	return id === undefined ? {} : { before: id };
}
/**
 * Flatten one flow's steps with exact holder references.
 * @param flow The complete flow.
 * @returns Its independent steps.
 */
function stepSubjects(flow: ModelFlow): [string, Subject][] {
	const flat = flatSteps(flow.steps);
	return flat.map((step, index) => {
		const { within, ...value } = step;
		const next = flat.slice(index + 1).find((other) => isDeepStrictEqual(other.within, within));
		return [
			step.id,
			{
				kind: "step",
				value,
				placement: {
					holder: within?.step ?? flow.id,
					...(within?.alternative === undefined ? {} : { alternative: within.alternative }),
					...before(next?.id),
				},
			},
		];
	});
}
/**
 * Flatten one flow without copying its steps into its own fields.
 * @param flow The authored flow.
 * @param placement Its collection and relative order.
 * @returns Independent subjects.
 */
function flowSubjects(flow: ModelFlow, placement: Placement): [string, Subject][] {
	const { steps: _steps, ...value } = flow;
	return [[flow.id, { kind: "flow", value, placement }], ...stepSubjects(flow)];
}
/**
 * Flatten one collection and its flows.
 * @param model The model namespace.
 * @param collection The authored collection.
 * @returns Independent subjects.
 */
function collectionSubjects(
	model: string,
	collection: ArchitectureModel["collections"][number],
): [string, Subject][] {
	const { flows, file: _file, ...value } = collection;
	const holder = `${model}#${collection.id}`;
	return [
		[holder, { kind: "collection", value }],
		...flows.flatMap((flow, index) =>
			flowSubjects(flow, { holder, ...before(flows[index + 1]?.id) }),
		),
	];
}
/**
 * Flatten subjects without copying held definitions into their owners.
 * @param model The coherent architecture.
 * @returns Subjects with identity-based structural placement.
 */
function subjectsOf(model: ArchitectureModel): Subjects {
	const modules = model.modules.flatMap((module): [string, Subject][] => {
		const { outgoing, file: _file, parent, ...value } = module;
		return [
			[module.id, { kind: "module", value, placement: { holder: parent ?? model.manifest.id } }],
			...outgoing.map((edge): [string, Subject] => [
				edge.id,
				{ kind: "relationship", value: { ...edge }, placement: { holder: module.id } },
			]),
		];
	});
	return new Map([
		...modules,
		...model.walkthroughs.flatMap((walk): [string, Subject][] => {
			const { beats, file: _file, ...value } = walk;
			return [
				[walk.id, { kind: "walkthrough", value }],
				...beats.map((beat, index): [string, Subject] => [
					beat.id,
					{
						kind: "beat",
						value: beat,
						placement: { holder: walk.id, ...before(beats[index + 1]?.id) },
					},
				]),
			];
		}),
		...model.collections.flatMap((collection) => collectionSubjects(model.manifest.id, collection)),
	]);
}
/**
 * Read changed fields with explicit clearing.
 * @param id The continuing subject.
 * @param beforeValue Its baseline fields.
 * @param afterValue Its intended fields.
 * @returns Only changed fields.
 */
function changedFields(
	id: string,
	beforeValue: Subject["value"],
	afterValue: Subject["value"],
): Change[] {
	return [...new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])].flatMap(
		(field): Change[] => {
			if (isDeepStrictEqual(beforeValue[field], afterValue[field])) return [];
			return afterValue[field] === undefined
				? [{ type: "clear", subject: id, field }]
				: [{ type: "assign", subject: id, field, value: afterValue[field] }];
		},
	);
}
/**
 * Store one subject's own changes.
 * @param id The stable identity.
 * @param previous The baseline subject, when present.
 * @param next The resulting subject.
 * @returns Compact field and placement changes.
 */
function subjectChanges(id: string, previous: Subject | undefined, next: Subject): Change[] {
	const changes: Change[] =
		previous === undefined
			? [{ type: "add", subject: id, kind: next.kind, value: next.value }]
			: changedFields(id, previous.value, next.value);
	if (next.placement !== undefined && !isDeepStrictEqual(previous?.placement, next.placement))
		changes.push({ type: "place", subject: id, placement: next.placement });
	return changes;
}
/**
 * Store only changed subjects, fields, and relative placements.
 * @param baseline The immutable starting architecture.
 * @param candidate The complete intended result.
 * @returns Normalized identity changes.
 */
function compactChanges(baseline: ArchitectureModel, candidate: ArchitectureModel): Change[] {
	const left = subjectsOf(baseline),
		right = subjectsOf(candidate);
	const removed: Change[] = [...left.keys()]
		.filter((id) => !right.has(id))
		.map((subject) => ({ type: "remove", subject }));
	return [
		...removed,
		...[...right].flatMap(([id, next]) => subjectChanges(id, left.get(id), next)),
	];
}
/**
 * Name one field operation independently of its value.
 * @param change The stored identity change.
 * @returns Its conflict key.
 */
function operationField(change: Change) {
	return change.type === "assign" || change.type === "clear"
		? `field:${change.field}`
		: change.type;
}
/**
 * Reject contradictory operations on one field or definition.
 * @param changes The complete stored patch.
 */
function requireUniqueChanges(changes: Change[]): void {
	const keys = changes.map((change) => `${change.subject}:${operationField(change)}`);
	if (new Set(keys).size !== keys.length)
		throw new ArchiveError("MODEL_INVALID", "A proposal repeats a subject operation.");
	const definitions = changes
		.filter((change) => change.type === "add" || change.type === "remove")
		.map((change) => change.subject);
	if (new Set(definitions).size !== definitions.length)
		throw new ArchiveError("MODEL_INVALID", "A proposal both adds and removes one identity.");
}
/**
 * Apply only explicit subject additions and removals.
 * @param subjects The mutable candidate subjects.
 * @param change One stored change.
 */
function changeDefinition(subjects: Subjects, change: Change): void {
	if (change.type === "add") {
		const local = change.kind === "collection" ? change.subject.split("#")[1] : change.subject;
		if (subjects.has(change.subject) || change.value["id"] !== local)
			throw new ArchiveError(
				"MODEL_INVALID",
				"A proposal addition must use its fresh stable identity.",
			);
		subjects.set(change.subject, { kind: change.kind, value: structuredClone(change.value) });
	}
}
/**
 * Apply an explicit subject removal.
 * @param subjects The mutable subject graph.
 * @param change The stored identity change.
 */
function removeDefinition(subjects: Subjects, change: Change): void {
	if (change.type === "remove" && !subjects.delete(change.subject))
		throw new ArchiveError("MODEL_INVALID", "A proposal removes a missing subject.");
}
/**
 * Assign or clear one continuing field.
 * @param subject The continuing subject.
 * @param change The explicit field operation.
 */
function assignSubjectField(
	subject: Subject,
	change: Extract<Change, { type: "assign" | "clear" }>,
): void {
	if (
		["id", "schemaVersion", "file", "outgoing", "flows", "steps", "within", "parent"].includes(
			change.field,
		)
	)
		throw new ArchiveError(
			"MODEL_INVALID",
			"Use identity changes and placements for owned subjects.",
		);
	if (change.type === "clear") delete subject.value[change.field];
	else subject.value[change.field] = change.value;
}
/**
 * Apply continuing fields or structural placement.
 * @param subjects The complete candidate subjects.
 * @param change One stored change.
 */
function changeFields(subjects: Subjects, change: Change): void {
	if (change.type === "add" || change.type === "remove") return;
	const subject = subjects.get(change.subject);
	if (subject === undefined)
		throw new ArchiveError("MODEL_INVALID", "A proposal changes a missing subject.");
	if (change.type === "place") {
		subject.placement = change.placement;
		return;
	}
	assignSubjectField(subject, change);
}
/**
 * Reject owned additions without an exact placement.
 * @param subjects The complete candidate.
 */
function requirePlacements(subjects: Subjects): void {
	for (const subject of subjects.values())
		if (!["collection", "walkthrough"].includes(subject.kind) && subject.placement === undefined)
			throw new ArchiveError("MODEL_INVALID", "An owned subject needs an explicit placement.");
}
/**
 * Apply normalized identity changes before complete canonical validation.
 * @param base The retained subjects.
 * @param changes The stored changes.
 * @returns The complete candidate subjects.
 */
function applyCompactChanges(base: Subjects, changes: Change[]): Subjects {
	requireUniqueChanges(changes);
	const subjects = structuredClone(base);
	for (const change of changes) {
		changeDefinition(subjects, change);
		removeDefinition(subjects, change);
	}
	for (const change of changes) changeFields(subjects, change);
	requirePlacements(subjects);
	return subjects;
}
/**
 * Read the predecessor of each explicitly ordered sibling.
 * @param held Direct subjects of one holder.
 * @returns The identity index and predecessor references.
 */
function siblingPredecessors(held: [string, Subject][]) {
	const byId = new Map(held),
		prior = new Map<string, string>();
	for (const [id, subject] of held) {
		const next = subject.placement?.before;
		if (next === undefined) continue;
		if (!byId.has(next) || prior.has(next))
			throw new ArchiveError(
				"MODEL_INVALID",
				"A proposal has missing siblings or incompatible relative ordering.",
			);
		prior.set(next, id);
	}
	return { byId, prior };
}
/**
 * Order direct subjects through stable sibling references.
 * @param subjects All resolved subjects.
 * @param holder The owner identity.
 * @param alternative The exact alternative label.
 * @returns Ordered direct subjects.
 */
function heldSubjects(
	subjects: Subjects,
	holder: string,
	alternative?: string,
): [string, Subject][] {
	const held = [...subjects].filter(
		([, subject]) =>
			subject.placement?.holder === holder && subject.placement.alternative === alternative,
	);
	const { byId, prior } = siblingPredecessors(held);
	const result: [string, Subject][] = [],
		visited = new Set<string>();
	/**
	 * Append one complete sibling chain.
	 * @param id The first sibling.
	 */
	function append(id: string): void {
		if (visited.has(id))
			throw new ArchiveError("MODEL_INVALID", "A proposal has cyclic sibling ordering.");
		visited.add(id);
		const subject = byId.get(id)!;
		result.push([id, subject]);
		const next = subject.placement?.before;
		if (next !== undefined) append(next);
	}
	for (const [id] of held) if (!prior.has(id)) append(id);
	if (visited.size !== held.length)
		throw new ArchiveError("MODEL_INVALID", "A proposal has cyclic sibling ordering.");
	return result;
}
export {
	subjectsOf,
	compactChanges,
	applyCompactChanges,
	heldSubjects,
	type Subjects,
	type Subject,
	type FlatStep,
};

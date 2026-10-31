// What a proposal changes, as a list that a reader walks: one row for each changed subject, under
// the owner that holds it. A module owns its outgoing relationships, a flow its steps and a
// walkthrough its beats. Most changes are steps, and the Modules tree has no row for a step.
// Nothing here compares anything: the comparison of the reading says what changed, and its
// drawing puts back what the proposal removed, so a removed subject has a row and a place.

import { drawingOf, type FieldChange } from "@archboard/board/comparison";
import { everyStep, stepWords } from "@archboard/board/flow";
import { modelContent, moduleForest, type Model, type SemanticEdge } from "@archboard/board/content";

type Comparison = NonNullable<Model["comparison"]>;
type Subject = Comparison["subjects"][number];
type ChangeStanding = Exclude<Subject["kind"], "unchanged">;
type ChangedSubject = Subject & { readonly kind: ChangeStanding };
type Content = ReturnType<typeof drawingOf>["content"];
type Walkthrough = Model["walkthroughs"][number];
type Branch = ReturnType<typeof moduleForest>[number];

/** Where a reader goes to see a change. */
type ChangeTarget =
	| { readonly kind: "scope"; readonly scope: string | null; readonly subject: string }
	| { readonly kind: "flow"; readonly flow: string; readonly subject: string }
	| { readonly kind: "walkthrough"; readonly walkthrough: string; readonly beat: number }
	| { readonly kind: "subject"; readonly subject: string };

/** One changed subject. */
interface Change {
	readonly id: string;
	readonly standing: ChangeStanding;
	readonly words: string;
	readonly target: ChangeTarget;
}

/** The changes of one owner. */
interface ChangeGroup {
	readonly id: string;
	readonly name: string;
	readonly changes: readonly Change[];
}

/** Everything a proposal changes, in the order of the walk. */
interface ChangeList {
	readonly groups: readonly ChangeGroup[];
	readonly changes: readonly Change[];
	/** Where each subject stands in the walk. */
	readonly positions: ReadonlyMap<string, number>;
}

/** What a list reads its rows from. */
interface ChangeReading {
	readonly changed: ReadonlyMap<string, ChangedSubject>;
	readonly parents: ReadonlyMap<string, string | undefined>;
	readonly names: ReadonlyMap<string, string>;
}

/**
 * Whether a subject differs from the base.
 * @param subject A subject of the comparison.
 * @returns True for every subject but an unchanged one.
 */
function isChanged(subject: Subject): subject is ChangedSubject {
	return subject.kind !== "unchanged";
}

/**
 * How many subjects a comparison reports as changed.
 * @param comparison The comparison.
 * @returns The count.
 */
function changedCount(comparison: Comparison): number {
	return comparison.subjects.filter(isChanged).length;
}

/**
 * What a parent is called in a sentence.
 * @param parent The `parent` of a module, as the comparison reports it.
 * @param names The name of each module.
 * @returns Its name, or the roots for a module with no parent.
 */
function parentName(parent: unknown, names: ReadonlyMap<string, string>): string {
	return typeof parent === "string" ? (names.get(parent) ?? parent) : "the roots";
}

/** The compared fields of a subject that hold modules. */
const MODULE_FIELDS: ReadonlySet<string> = new Set(["from", "to", "participants"]);

/**
 * A compared value with its modules named.
 * @param value The value.
 * @param names The name of each module.
 * @returns The value, with each module's name for its identity.
 */
function withNames(value: unknown, names: ReadonlyMap<string, string>): unknown {
	if (Array.isArray(value)) return value.map((one: unknown) => withNames(one, names));
	return typeof value === "string" ? (names.get(value) ?? value) : value;
}

/**
 * A changed field as a reader reads it: a module by its name, never by its identity.
 * @param change The field.
 * @param names The name of each module, from the reading and its base.
 * @returns The field.
 */
function namedField(
	change: Subject["fields"][number],
	names: ReadonlyMap<string, string>,
): FieldChange {
	const { field, before, after } = change;
	if (field === "parent")
		return { field, before: parentName(before, names), after: parentName(after, names) };
	if (!MODULE_FIELDS.has(field)) return { field, before, after };
	return { field, before: withNames(before, names), after: withNames(after, names) };
}

/**
 * What one changed field says in a row.
 * @param change The field.
 * @param reading The names of the modules.
 * @returns The words.
 */
function fieldWords(change: Subject["fields"][number], reading: ChangeReading): string {
	const { field, before, after } = change;
	if (field !== "parent") return field.replace(/[A-Z]/gu, (hump) => ` ${hump.toLowerCase()}`);
	return `moved from ${parentName(before, reading.names)} to ${parentName(after, reading.names)}`;
}

/**
 * What an owner's row of its own change says, since its name stands over the row already.
 * @param subject The owner's change.
 * @param reading The names of the modules.
 * @returns The words.
 */
function ownWords(subject: ChangedSubject, reading: ChangeReading): string {
	if (subject.kind === "added") return "Added";
	if (subject.kind === "removed") return "Removed";
	const moveFirst = subject.fields.toSorted(
		(one, other) => Number(other.field === "parent") - Number(one.field === "parent"),
	);
	const words = moveFirst.map((field) => fieldWords(field, reading)).join(", ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The row of one subject, when it changed.
 * @param reading The changes.
 * @param id The subject.
 * @param words What its row says.
 * @param target Where it opens.
 * @returns The row, or nothing.
 */
function rowOf(
	reading: ChangeReading,
	id: string,
	words: string | ((subject: ChangedSubject) => string),
	target: ChangeTarget,
): Change[] {
	const subject = reading.changed.get(id);
	if (subject === undefined) return [];
	const said = typeof words === "string" ? words : words(subject);
	return [{ id, standing: subject.kind, words: said, target }];
}

/**
 * The row of an owner's own change.
 * @param reading The changes.
 * @param id The owner.
 * @param target Where it opens.
 * @returns The row, or nothing.
 */
function ownRow(reading: ChangeReading, id: string, target: ChangeTarget): Change[] {
	return rowOf(reading, id, (subject) => ownWords(subject, reading), target);
}

/**
 * The module whose picture draws both ends of a relationship, or the line that stands for it.
 * @param parents The parent of each module.
 * @param from One end.
 * @param to The other end.
 * @returns The innermost module that holds both, or null for the roots.
 */
function commonScope(
	parents: ChangeReading["parents"],
	from: string,
	to: string,
): string | null {
	const above = new Set<string>();
	for (let at: string | undefined = from; at !== undefined; at = parents.get(at)) above.add(at);
	for (let at: string | undefined = to; at !== undefined; at = parents.get(at)) {
		if (above.has(at)) return at;
	}
	return null;
}

/**
 * What a relationship's row says, since the module at its start stands over the row.
 * @param edge The relationship.
 * @param names The name of each module.
 * @returns The words.
 */
function relationshipWords(edge: SemanticEdge, names: ChangeReading["names"]): string {
	const to = `→ ${names.get(edge.to) ?? edge.to}`;
	return edge.label === undefined ? to : `${to} · ${edge.label}`;
}

/**
 * The modules in the order of the tree.
 * @param branches The branches.
 * @returns Their modules.
 */
function modulesInOrder(branches: readonly Branch[]): string[] {
	return branches.flatMap((branch) => [...branch.steps, ...modulesInOrder(branch.children)]);
}

/**
 * One owner, when it has changes.
 * @param id The owner.
 * @param name What it is called.
 * @param changes Its changes.
 * @returns The group, or nothing.
 */
function groupOf(id: string, name: string, changes: readonly Change[]): ChangeGroup[] {
	return changes.length === 0 ? [] : [{ id, name, changes }];
}

/**
 * The changed relationships of each module.
 * @param content The drawing of the comparison.
 * @param reading The changes.
 * @returns The rows by the module that owns them.
 */
function relationshipRows(content: Content, reading: ChangeReading): Map<string, Change[]> {
	const rows = new Map<string, Change[]>();
	for (const edge of content.edges) {
		const scope = commonScope(reading.parents, edge.from, edge.to);
		const target = { kind: "scope", scope, subject: edge.id } as const;
		const row = rowOf(reading, edge.id, relationshipWords(edge, reading.names), target);
		if (row.length > 0) rows.set(edge.from, [...(rows.get(edge.from) ?? []), ...row]);
	}
	return rows;
}

/**
 * The changes that modules own, in the order of the tree.
 * @param content The drawing of the comparison.
 * @param reading The changes.
 * @returns A group for each module with changes.
 */
function moduleGroups(content: Content, reading: ChangeReading): ChangeGroup[] {
	const relationships = relationshipRows(content, reading);
	return modulesInOrder(moduleForest(content)).flatMap((id) => {
		const scope = reading.parents.get(id) ?? null;
		const own = ownRow(reading, id, { kind: "scope", scope, subject: id });
		return groupOf(id, reading.names.get(id) ?? id, [...own, ...(relationships.get(id) ?? [])]);
	});
}

/**
 * The changes of collections, whose names only a comparison's two sides hold.
 * @param sides The base, then the reading.
 * @param reading The changes.
 * @returns A group for each changed collection.
 */
function collectionGroups(sides: readonly Model[], reading: ChangeReading): ChangeGroup[] {
	const named = new Map(
		sides.flatMap((side) =>
			side.collections.map((one) => [`${side.manifest.id}#${one.id}`, one.name] as const),
		),
	);
	return [...named].flatMap(([id, name]) =>
		groupOf(id, name, ownRow(reading, id, { kind: "subject", subject: id })),
	);
}

/**
 * The changes that flows own. A step opens its flow, and a removed step stands where it stood.
 * @param content The drawing of the comparison.
 * @param reading The changes.
 * @returns A group for each flow with changes.
 */
function flowGroups(content: Content, reading: ChangeReading): ChangeGroup[] {
	return content.flows.flatMap(({ id, name, steps }) => {
		const own = ownRow(reading, id, { kind: "flow", flow: id, subject: id });
		const held = everyStep(steps).flatMap((step) =>
			rowOf(reading, step.id, stepWords(step), { kind: "flow", flow: id, subject: step.id }),
		);
		return groupOf(id, name, [...own, ...held]);
	});
}

/**
 * The beats that only the base holds, which no presentation can open.
 * @param walkthrough The walkthrough.
 * @param base The same walkthrough in the base.
 * @param reading The changes.
 * @returns Their rows.
 */
function removedBeats(
	walkthrough: Walkthrough | undefined,
	base: Walkthrough | undefined,
	reading: ChangeReading,
): Change[] {
	const held = new Set(walkthrough?.beats.map((beat) => beat.id));
	return (base?.beats ?? [])
		.filter((beat) => !held.has(beat.id))
		.flatMap((beat) => rowOf(reading, beat.id, beat.title, { kind: "subject", subject: beat.id }));
}

/**
 * The changes of a walkthrough that the reading holds. A beat opens the presentation there.
 * @param walkthrough The walkthrough.
 * @param base The same walkthrough in the base.
 * @param reading The changes.
 * @returns Its group, when it has changes.
 */
function walkthroughGroup(
	walkthrough: Walkthrough,
	base: Walkthrough | undefined,
	reading: ChangeReading,
): ChangeGroup[] {
	const { id, name, beats } = walkthrough;
	const own = ownRow(reading, id, { kind: "walkthrough", walkthrough: id, beat: 0 });
	const held = beats.flatMap((beat, index) =>
		rowOf(reading, beat.id, beat.title, { kind: "walkthrough", walkthrough: id, beat: index }),
	);
	return groupOf(id, name, [...own, ...held, ...removedBeats(walkthrough, base, reading)]);
}

/**
 * The changes of a walkthrough that only the base holds.
 * @param base The walkthrough.
 * @param reading The changes.
 * @returns Its group.
 */
function removedWalkthrough(base: Walkthrough, reading: ChangeReading): ChangeGroup[] {
	const own = ownRow(reading, base.id, { kind: "subject", subject: base.id });
	return groupOf(base.id, base.name, [...own, ...removedBeats(undefined, base, reading)]);
}

/**
 * The changes that walkthroughs own.
 * @param model The reading.
 * @param reference The base.
 * @param reading The changes.
 * @returns A group for each walkthrough with changes.
 */
function walkthroughGroups(
	model: Model,
	reference: Model,
	reading: ChangeReading,
): ChangeGroup[] {
	const held = new Set(model.walkthroughs.map((walkthrough) => walkthrough.id));
	const bases = new Map(reference.walkthroughs.map((one) => [one.id, one]));
	return [
		...model.walkthroughs.flatMap((one) => walkthroughGroup(one, bases.get(one.id), reading)),
		...reference.walkthroughs
			.filter((one) => !held.has(one.id))
			.flatMap((one) => removedWalkthrough(one, reading)),
	];
}

/**
 * What a reading changes against its base, grouped by owner.
 * @param model The reading, with its comparison.
 * @param reference The base, read coherently with it.
 * @returns The list, structure first, then behavior, then what explains them.
 */
function changeList(model: Model, reference: Model): ChangeList {
	const subjects = model.comparison?.subjects.filter(isChanged) ?? [];
	const { content } = drawingOf(modelContent(model), modelContent(reference));
	const reading: ChangeReading = {
		changed: new Map(subjects.map((subject) => [subject.id, subject])),
		parents: new Map(content.nodes.map((node) => [node.id, node.parent])),
		names: new Map(content.nodes.map((node) => [node.id, node.name])),
	};
	const groups = [
		...moduleGroups(content, reading),
		...collectionGroups([reference, model], reading),
		...flowGroups(content, reading),
		...walkthroughGroups(model, reference, reading),
	];
	const changes = groups.flatMap((group) => group.changes);
	return { groups, changes, positions: new Map(changes.map(({ id }, index) => [id, index])) };
}

/**
 * The subject that keeps a reader's place in a list that changed: the same subject, or else the
 * nearest one after it that stays, or else the nearest one before it.
 * @param before The list the reader walked.
 * @param after The list now.
 * @param id The subject the reader stood on.
 * @returns The subject, or null when none of the list stays.
 */
function placeIn(before: ChangeList, after: ChangeList, id: string): string | null {
	if (after.positions.has(id)) return id;
	const at = before.positions.get(id) ?? 0;
	const onward = [...before.changes.slice(at + 1), ...before.changes.slice(0, at).toReversed()];
	return onward.find((change) => after.positions.has(change.id))?.id ?? null;
}

export {
	changeList,
	changedCount,
	namedField,
	placeIn,
	type Change,
	type ChangeGroup,
	type ChangeList,
	type ChangeTarget,
};

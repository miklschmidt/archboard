// A reference to what is selected, to paste to a person or an agent: what each
// subject is, its exact identity, and the address of the reading it was chosen in.

import {
	selectedSubject,
	type SelectionReading,
} from "#ui/rules/architecture-model/selected-subject.ts";

type Relationship = SelectionReading["model"]["relationships"][number];

/**
 * A module's name, from the reading or the base it is compared with.
 * @param reading The reading.
 * @param id The module.
 * @returns Its name, or its identity when neither holds it.
 */
function moduleName(reading: SelectionReading, id: string): string {
	const sides = [reading.model, reading.projection.reference];
	const modules = sides.flatMap((model) => model?.modules ?? []);
	return modules.find((module) => module.id === id)?.name ?? id;
}

/**
 * One relationship: its identity, its ends, its kind and what it says.
 * @param reading The reading.
 * @param edge The relationship.
 * @returns The line.
 */
function relationshipLine(reading: SelectionReading, edge: Relationship): string {
	const ends = `${moduleName(reading, edge.from)} → ${moduleName(reading, edge.to)}`;
	const said = edge.label === undefined ? "" : `, "${edge.label}"`;
	return `Relationship ${edge.id}: ${ends}, ${edge.kind}${said}`;
}

/**
 * One selected subject.
 * @param reading The reading.
 * @param id The subject.
 * @returns The line, which is its identity alone for anything but a relationship or a module.
 */
function subjectLine(reading: SelectionReading, id: string): string {
	const edge = reading.model.relationships.find((relationship) => relationship.id === id);
	if (edge !== undefined) return relationshipLine(reading, edge);
	return reading.model.modules.some((module) => module.id === id)
		? `Module ${id}: ${moduleName(reading, id)}`
		: id;
}

/**
 * The reference to a selection.
 * @param reading The reading and what is selected in it.
 * @param address The address of that reading.
 * @returns A line for each subject, then the address. A drawn line names each relationship it joins.
 */
function subjectReference(reading: SelectionReading, address: string): string {
	const subject = selectedSubject(reading);
	const lines =
		subject.kind === "connection"
			? subject.connection.joins.map((edge) => relationshipLine(reading, edge))
			: [...reading.ids].map((id) => subjectLine(reading, id));
	return [...lines, address].join("\n");
}

export { subjectReference };

import { expect } from "bun:test";
import {
	cloneManifest,
	validateManifest,
	validateOrderedValues,
	type JsonRecord,
} from "./codex-additional-context-policy.js";

export type Factory = () => JsonRecord;
export type Selector = (root: JsonRecord) => JsonRecord;
export type Validator = (root: JsonRecord) => void;
export type Values = {
	get: (root: JsonRecord) => string[];
	set: (root: JsonRecord, values: string[]) => void;
};

function replaceFields(target: JsonRecord, entries: [string, unknown][]): void {
	for (const field of Object.keys(target)) delete target[field];
	for (const [field, value] of entries) target[field] = value;
}

export function expectObjectSurfaceAttacks(
	factory: Factory,
	select: Selector,
	validate: Validator,
	label: string,
	fields: readonly string[],
): void {
	for (const field of fields) {
		const changed = factory();
		delete select(changed)[field];
		expect(() => validate(changed)).toThrow(`${label} is missing ${field}`);
	}
	const added = factory();
	select(added).unreviewed_field = true;
	expect(() => validate(added)).toThrow(`${label} has extra unreviewed_field`);
	const reordered = factory();
	const target = select(reordered);
	const entries = Object.entries(target);
	[entries[0], entries[1]] = [entries[1]!, entries[0]!];
	replaceFields(target, entries);
	expect(() => validate(reordered)).toThrow(`${label} reordered ${fields[0]}`);
	expect(() => validateOrderedValues(label, [...fields, fields[0]!], fields)).toThrow(
		`${label} has duplicate ${fields[0]}`,
	);
}

export function expectOrderedSetAttacks(
	factory: Factory,
	values: Values,
	validate: Validator,
	label: string,
	expected: readonly string[],
	unknown = "unreviewed_value",
): void {
	for (const [index, member] of expected.entries()) {
		const deleted = factory();
		const missing = values.get(deleted);
		missing.splice(index, 1);
		values.set(deleted, missing);
		expect(() => validate(deleted)).toThrow(`${label} is missing ${member}`);

		const duplicated = factory();
		const repeated = values.get(duplicated);
		repeated.splice(index, 0, member);
		values.set(duplicated, repeated);
		expect(() => validate(duplicated)).toThrow(`${label} has duplicate ${member}`);
	}
	const added = factory();
	values.set(added, [...values.get(added), unknown]);
	expect(() => validate(added)).toThrow(`${label} has extra ${unknown}`);
	if (expected.length < 2) return;
	const reordered = factory();
	const swapped = values.get(reordered);
	[swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
	values.set(reordered, swapped);
	expect(() => validate(reordered)).toThrow(`${label} reordered ${expected[0]}`);
}

export function expectRowCollectionAttacks(
	select: (root: JsonRecord) => JsonRecord[],
	expected: readonly JsonRecord[],
	key: (row: JsonRecord) => string,
	unknown: JsonRecord,
	label: string,
): void {
	for (const [index, row] of expected.entries()) {
		const deleted = cloneManifest();
		select(deleted).splice(index, 1);
		expect(() => validateManifest(deleted)).toThrow(`${label} is missing ${key(row)}`);

		const duplicated = cloneManifest();
		select(duplicated).push(structuredClone(select(duplicated)[index]!));
		expect(() => validateManifest(duplicated)).toThrow(`${label} has duplicate ${key(row)}`);
	}
	const added = cloneManifest();
	select(added).push(unknown);
	expect(() => validateManifest(added)).toThrow(`${label} has extra ${key(unknown)}`);
	const reordered = cloneManifest();
	const rows = select(reordered);
	[rows[0], rows[1]] = [rows[1]!, rows[0]!];
	expect(() => validateManifest(reordered)).toThrow(`${label} reordered ${key(expected[0]!)}`);
}

export function expectRowFieldAttacks(
	select: (root: JsonRecord) => JsonRecord[],
	expected: readonly JsonRecord[],
	key: (row: JsonRecord) => string,
	label: string,
): void {
	for (const [index, row] of expected.entries()) {
		const rowLabel = `${label} ${key(row)}`;
		const fields = Object.keys(row);
		for (const field of fields) {
			const deleted = cloneManifest();
			const deletedRow = select(deleted)[index]!;
			delete deletedRow[field];
			const diagnostic =
				key(deletedRow) !== key(row)
					? `${label} is missing ${key(row)}`
					: `${rowLabel} fields is missing ${field}`;
			expect(() => validateManifest(deleted)).toThrow(diagnostic);
			const changedRow = structuredClone(row);
			changedRow[field] = "unreviewed_value";
			if (typeof row[field] !== "string" || key(changedRow) !== key(row)) continue;
			const changed = cloneManifest();
			select(changed)[index]![field] = "unreviewed_value";
			expect(() => validateManifest(changed)).toThrow(`${rowLabel}.${field} changed`);
		}
		const added = cloneManifest();
		select(added)[index]!.unreviewed_field = true;
		expect(() => validateManifest(added)).toThrow(`${rowLabel} fields has extra unreviewed_field`);
		const reordered = cloneManifest();
		const target = select(reordered)[index]!;
		const entries = Object.entries(target);
		[entries[0], entries[1]] = [entries[1]!, entries[0]!];
		replaceFields(target, entries);
		expect(() => validateManifest(reordered)).toThrow(`${rowLabel} fields reordered ${fields[0]}`);
		expect(() =>
			validateOrderedValues(`${rowLabel} fields`, [...fields, fields[0]!], fields),
		).toThrow(`${rowLabel} fields has duplicate ${fields[0]}`);
	}
}

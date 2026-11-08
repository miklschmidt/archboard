// How a person reads an answer (TASK-602). The global `--text` prints this text in place of the
// JSON that agents read: each field named in words, nested values indented, records with short
// fields as a table, multi-line text kept, and a refusal said to be one. The paint that the
// caller passes colours it, and leaves the colour out where the output shows none.

import type { Paint } from "#cli/contract/protocol/contract.ts";

/** A JSON object. */
type Fields = Readonly<Record<string, unknown>>;

/** The indent of one level. */
const INDENT = "  ";

/** The widest list of plain values that stays on the line of its name. */
const INLINE_WIDTH = 60;

/** The most columns of a table. A record with more fields renders as a block. */
const TABLE_COLUMNS = 6;

/** The widest table. The records of a wider one render as blocks, which wrap less in a terminal. */
const TABLE_WIDTH = 100;

/** A fraction to six significant digits, as a person reads a measurement such as `31.4531`. */
const FRACTION = new Intl.NumberFormat("en-US", {
	maximumSignificantDigits: 6,
	useGrouping: false,
});

/** A path or an address, which the text colours as a place. */
const PLACE = /^(?:\/|~\/|[a-z][\d+.a-z-]*:\/\/)/iu;

/** A code such as `CLAIM_REQUIRED`, which the text colours as a code. */
const CODE = /^[A-Z][\dA-Z]*(?:_[\dA-Z]+)+$/u;

/**
 * Whether a value is a JSON object.
 * @param value - The value.
 * @returns True for an object that is no array.
 */
function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value fits on one line by itself.
 * @param value - The value.
 * @returns True for null, a boolean, a number, or a string of one line.
 */
function isPlain(value: unknown): boolean {
	return typeof value === "string"
		? !value.includes("\n")
		: value === null || typeof value !== "object";
}

/**
 * A field name in words: `vaultCreated` and `vault-created` read "Vault created".
 * @param key - The field name.
 * @returns The words.
 */
function words(key: string): string {
	const spaced = key
		.replaceAll(/([\da-z])([A-Z])/gu, "$1 $2")
		.replaceAll(/[_-]+/gu, " ")
		.toLowerCase();
	return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

/**
 * One line of text, coloured as a place, a code, or nothing.
 * @param text - The text.
 * @param paint - Colours a part of the text.
 * @returns The text.
 */
function plainText(text: string, paint: Paint): string {
	if (text === "") return paint("dim", "(empty)");
	if (PLACE.test(text)) return paint("cyan", text);
	return CODE.test(text) ? paint("magenta", text) : text;
}

/**
 * One plain value, coloured by what it is.
 * @param value - The value: null, a boolean, a number or a string of one line.
 * @param paint - Colours a part of the text.
 * @returns The value as text.
 */
function plain(value: unknown, paint: Paint): string {
	if (typeof value === "string") return plainText(value, paint);
	if (typeof value === "number")
		return paint("yellow", Number.isInteger(value) ? String(value) : FRACTION.format(value));
	if (typeof value === "boolean") return value ? paint("green", "yes") : paint("dim", "no");
	return paint("dim", "none");
}

/**
 * A list of plain values on one line, when it is short enough.
 * @param items - The list.
 * @param paint - Colours a part of the text.
 * @returns The text, or null when the list needs lines of its own.
 */
function inlineList(items: readonly unknown[], paint: Paint): string | null {
	if (items.length === 0) return paint("dim", "none");
	if (!items.every(isPlain)) return null;
	const joined = items.map((item) => plain(item, paint)).join(", ");
	return Bun.stringWidth(joined) <= INLINE_WIDTH ? joined : null;
}

/**
 * A value that fits on the line of its name, as text.
 * @param value - The value.
 * @param paint - Colours a part of the text.
 * @returns The text, or null when the value needs lines of its own.
 */
function inline(value: unknown, paint: Paint): string | null {
	if (isPlain(value)) return plain(value, paint);
	if (Array.isArray(value)) return inlineList(value, paint);
	return isFields(value) && Object.keys(value).length === 0 ? paint("dim", "none") : null;
}

/**
 * One field: its name and its value on one line, or its name above its indented lines.
 * @param key - The field name.
 * @param value - The value.
 * @param width - The width the names of the one-line fields are padded to.
 * @param paint - Colours a part of the text.
 * @returns The lines: one for a short value, more for a block.
 */
function fieldBlock(key: string, value: unknown, width: number, paint: Paint): string[] {
	const short = inline(value, paint);
	if (short !== null) return [`${paint("bold", words(key).padEnd(width))}  ${short}`];
	return [paint("bold", words(key)), ...valueLines(value, paint).map((line) => `${INDENT}${line}`)];
}

/**
 * The fields of an object, each named in words, with the short values aligned.
 * @param fields - The object.
 * @param paint - Colours a part of the text.
 * @param spaced - Whether a blank line sets off each block.
 * @returns The lines.
 */
function fieldLines(fields: Fields, paint: Paint, spaced = false): string[] {
	const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
	const width = Math.max(0, ...entries.map(([key]) => words(key).length));
	const blocks = entries.map(([key, value]) => fieldBlock(key, value, width, paint));
	const tall = blocks.map((block) => block.length > 1);
	return blocks.flatMap((block, index) =>
		spaced && index > 0 && (tall[index] === true || tall[index - 1] === true)
			? ["", ...block]
			: block,
	);
}

/**
 * Records whose fields each fit on one line, as a table with a bold header and a row each.
 * @param records - The records.
 * @param paint - Colours a part of the text.
 * @returns The lines, or null when the records do not fit a table.
 */
function tableLines(records: readonly Fields[], paint: Paint): string[] | null {
	const keys = [...new Set(records.flatMap((record) => Object.keys(record)))];
	if (keys.length > TABLE_COLUMNS) return null;
	const cells = records.map((record) =>
		keys.map((key) => (key in record ? inline(record[key], paint) : paint("dim", "-"))),
	);
	const rows = cells.filter((row): row is string[] => !row.includes(null));
	if (rows.length !== cells.length) return null;
	const headers = keys.map(words);
	const widths = keys.map((_, column) =>
		Math.max(...[headers, ...rows].map((row) => Bun.stringWidth(row[column] ?? ""))),
	);
	if (widths.reduce((sum, width) => sum + width + 2, -2) > TABLE_WIDTH) return null;
	/**
	 * One row with each cell but the last padded to its column.
	 * @param row - The cells.
	 * @returns The row.
	 */
	const line = (row: readonly string[]): string =>
		row
			.map((cell, column) =>
				column === row.length - 1
					? cell
					: `${cell}${" ".repeat((widths[column] ?? 0) - Bun.stringWidth(cell))}`,
			)
			.join("  ");
	return [paint("bold", line(headers)), ...rows.map(line)];
}

/**
 * A list, as a table when it holds records with short fields, else as one bullet for each item.
 * @param items - The list.
 * @param paint - Colours a part of the text.
 * @returns The lines.
 */
function listLines(items: readonly unknown[], paint: Paint): string[] {
	const records = items.filter(isFields);
	const table = records.length === items.length ? tableLines(records, paint) : null;
	if (table !== null) return table;
	const blocks = items.map((item) => {
		const short = inline(item, paint);
		return short === null ? valueLines(item, paint) : [short];
	});
	const spaced = blocks.some((block) => block.length > 1);
	return blocks.flatMap((block, index) => [
		...(spaced && index > 0 ? [""] : []),
		`${paint("dim", "•")} ${block[0] ?? ""}`,
		...block.slice(1).map((line) => `${INDENT}${line}`),
	]);
}

/**
 * Records keyed by their ids, with exact keys in tables or block headings.
 * @param fields - The object.
 * @param paint - Colours a part of the text.
 * @returns The lines, or null when the object is no such object.
 */
function keyedRecordLines(fields: Fields, paint: Paint): string[] | null {
	const entries = Object.entries(fields);
	const records = entries.flatMap(([key, record]) =>
		isFields(record) ? [{ id: key, ...record }] : [],
	);
	if (entries.length === 0 || records.length !== entries.length) return null;
	return (
		tableLines(records, paint) ??
		entries.flatMap(([key, record]) => [
			paint("bold", key),
			...valueLines(record, paint).map((line) => `${INDENT}${line}`),
		])
	);
}

/**
 * A value that takes lines of its own.
 * @param value - The value.
 * @param paint - Colours a part of the text.
 * @returns The lines.
 */
function valueLines(value: unknown, paint: Paint): string[] {
	if (typeof value === "string") return value.split("\n");
	if (Array.isArray(value))
		return value.length === 0 ? [paint("dim", "none")] : listLines(value, paint);
	if (!isFields(value)) return [plain(value, paint)];
	return keyedRecordLines(value, paint) ?? fieldLines(value, paint);
}

/**
 * A command's answer as a person reads it. A refusal starts with a line that says so, with its
 * code and message; `success: true` says nothing that the answer does not.
 * @param answer - The answer that an agent reads as JSON.
 * @param paint - Colours a part of the text.
 * @returns The text.
 */
function answerText(answer: unknown, paint: Paint): string {
	if (!isFields(answer)) return valueLines(answer, paint).join("\n");
	const { success, ...fields } = answer;
	if (success !== false) {
		const lines = fieldLines(fields, paint, true);
		return lines.length === 0 ? paint("green", "Done.") : lines.join("\n");
	}
	const { code, error, ...rest } = fields;
	const head = [
		paint(["bold", "red"], "Refused"),
		...(typeof code === "string" ? [paint("magenta", code)] : []),
		...(typeof error === "string" ? [error] : []),
	].join("  ");
	return [head, ...fieldLines(rest, paint, true)].join("\n");
}

export { answerText };

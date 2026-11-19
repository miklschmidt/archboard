// Where the code view marks what the model says about a file (TASK-648). A module bound to a
// symbol marks the name of its definition and the lines the definition spans. A relationship
// anchored in the file marks its symbol on the line the server found it on. The name is found only
// inside what the code facts already located: a definition's declaration, or the anchor's line. It
// is never searched for in the rest of the file, because a name that matches elsewhere is only a
// candidate (ADR 0046). A symbol the facts cannot find marks nothing, and its module stays in the
// list of owners.

import type { CodeFile } from "#ui/architecture-drawing/code-browser/clients/code-files.ts";

type Definition = Extract<CodeFile["source"], { status: "quoted" }>["definitions"][number];

/** What a mark stands for: a module's binding, or a relationship's anchor. */
type MarkKind = "binding" | "anchor";

/** One name marked on one line, by its characters in that line. */
interface NameMark {
	readonly kind: MarkKind;
	readonly subject: string;
	readonly symbol: string;
	/** The first character, from 0, in UTF-16 code units. */
	readonly start: number;
	/** One past the last character. */
	readonly end: number;
}

/** The lines a module's bound definition spans, from 1. */
interface BoundSpan {
	readonly subject: string;
	readonly start: number;
	readonly end: number;
}

/** What the code view marks on a file. */
interface FileMarks {
	/** The marked names, by line number from 1. */
	readonly names: ReadonlyMap<number, readonly NameMark[]>;
	readonly spans: readonly BoundSpan[];
}

/** One binding or anchor, where the facts located it. */
interface Located {
	readonly kind: MarkKind;
	readonly subject: string;
	readonly symbol: string;
	/** Where to look for the name: from this offset of the text up to `to`. */
	readonly from: number;
	readonly to: number;
}

/**
 * The offset at which each line of a text starts.
 * @param lines The lines.
 * @returns One offset for each line, and one past the end.
 */
function lineStarts(lines: readonly string[]): readonly number[] {
	const starts = [0];
	for (const line of lines) starts.push(starts.at(-1)! + line.length + 1);
	return starts;
}

/**
 * The name a qualified symbol is written with at its definition: `post` for `Ledger.post`.
 * @param symbol The symbol.
 * @returns Its last name.
 */
function lastName(symbol: string): string {
	return symbol.split(/[.:]/u).at(-1) ?? symbol;
}

/**
 * The line an offset falls on.
 * @param starts The offsets of the lines.
 * @param offset The offset.
 * @returns The line, from 1.
 */
function lineAt(starts: readonly number[], offset: number): number {
	let low = 0;
	let high = starts.length - 2;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (starts[middle]! <= offset) low = middle;
		else high = middle - 1;
	}
	return low + 1;
}

/**
 * Where each binding and anchor of a file is located, as a stretch of the text to find its name in.
 * @param owners The file's owners.
 * @param starts The offsets of the lines.
 * @returns The located marks.
 */
function locatedMarks(owners: CodeFile["owners"], starts: readonly number[]): readonly Located[] {
	const bindings = owners.symbols.flatMap(({ subject, symbol, definition }): Located[] =>
		definition === null
			? []
			: [{ kind: "binding", subject, symbol, ...declarationOf(definition, starts) }],
	);
	const anchors = owners.anchors.flatMap(({ subject, symbol, line }): Located[] =>
		line === null ? [] : [{ kind: "anchor", subject, symbol, ...linesOf(line, line, starts) }],
	);
	return [...bindings, ...anchors];
}

/**
 * Locate a bound definition in the quoted checkout. The owner can come from a pinned version
 * whose offsets refer to different text.
 * @param pinned The owner's definition in the reading.
 * @param definitions The definitions in the quoted file.
 * @returns The matching definition when its location can be identified.
 */
function quotedDefinition(
	pinned: Definition,
	definitions: readonly Definition[],
): Definition | null {
	const matches = definitions.filter(
		({ symbol, kind }) => symbol === pinned.symbol && kind === pinned.kind,
	);
	if (matches.length === 1) return matches[0]!;
	return (
		matches.find(
			(one) =>
				one.start === pinned.start &&
				one.end === pinned.end &&
				sameOffsets(one.source, pinned.source),
		) ?? null
	);
}

/**
 * Compare two declaration ranges within the file's text.
 * @param one One set of offsets.
 * @param other The other set.
 * @returns Whether the ranges match.
 */
function sameOffsets(one: Definition["source"], other: Definition["source"]): boolean {
	return one?.start === other?.start && one?.end === other?.end;
}

/**
 * The stretch of text a definition's declaration covers: its offsets where the facts give them,
 * else its whole lines.
 * @param definition The definition.
 * @param starts The offsets of the lines.
 * @returns Where it starts, and one past where it ends.
 */
function declarationOf(
	definition: NonNullable<CodeFile["owners"]["symbols"][number]["definition"]>,
	starts: readonly number[],
): { readonly from: number; readonly to: number } {
	return definition.source === undefined
		? linesOf(definition.start, definition.end, starts)
		: { from: definition.source.start, to: definition.source.end };
}

/**
 * The stretch of text some whole lines cover.
 * @param first The first line, from 1.
 * @param last The last line.
 * @param starts The offsets of the lines.
 * @returns Where it starts, and one past where it ends.
 */
function linesOf(
	first: number,
	last: number,
	starts: readonly number[],
): { readonly from: number; readonly to: number } {
	const end = starts.at(-1) ?? 0;
	return { from: starts[first - 1] ?? end, to: starts[last] ?? end };
}

/**
 * The name of one located mark, by its line and characters, or nothing when the stretch lacks it.
 * @param mark The located mark.
 * @param text The file's text.
 * @param starts The offsets of the lines.
 * @returns The line and the mark.
 */
function nameOf(
	mark: Located,
	text: string,
	starts: readonly number[],
): readonly [number, NameMark] | null {
	const name = lastName(mark.symbol);
	const at = name === "" ? -1 : text.slice(mark.from, mark.to).search(wordPattern(name));
	if (at === -1) return null;
	const offset = mark.from + at;
	const line = lineAt(starts, offset);
	const start = offset - starts[line - 1]!;
	const { kind, subject, symbol } = mark;
	return [line, { kind, subject, symbol, start, end: start + name.length }];
}

/**
 * The pattern of a name standing as a word of its own.
 * @param name The name.
 * @returns A pattern that matches it and not a longer name that holds it.
 */
function wordPattern(name: string): RegExp {
	const escaped = name.replaceAll(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
	return new RegExp(`(?<![\\p{L}\\p{N}_$])${escaped}(?![\\p{L}\\p{N}_$])`, "u");
}

/**
 * What the code view marks on a file.
 * @param text The file's text.
 * @param owners The file's owners.
 * @param definitions The definitions in the quoted text.
 * @returns The marked names by line, and the lines of each bound definition.
 */
function fileMarks(
	text: string,
	owners: CodeFile["owners"],
	definitions: readonly Definition[],
): FileMarks {
	const lines = text.split("\n");
	const starts = lineStarts(lines);
	const symbols = owners.symbols.map((owner) => ({
		...owner,
		definition: owner.definition === null ? null : quotedDefinition(owner.definition, definitions),
	}));
	const names = new Map<number, NameMark[]>();
	for (const mark of locatedMarks({ ...owners, symbols }, starts)) {
		const found = nameOf(mark, text, starts);
		if (found === null) continue;
		const [line, name] = found;
		names.set(
			line,
			[...(names.get(line) ?? []), name].toSorted((a, b) => a.start - b.start),
		);
	}
	const spans = symbols.flatMap(({ subject, definition }) =>
		definition === null ? [] : [{ subject, start: definition.start, end: definition.end }],
	);
	return { names, spans };
}

export { fileMarks, type BoundSpan, type FileMarks, type MarkKind, type NameMark };

// The facts of a `go.mod` (ADR 0046, TASK-575): each module it requires is a
// use of that module, as `build-dependency` evidence. A module of the
// checkout, which a `go.work` uses or a `replace` leads to, is built from the
// modules it requires, so the resolver leads such a use to the required
// module's directory where the checkout holds it (go-resolution.ts). The file
// defines nothing. A `go.mod` is line-based: a directive and its arguments, or
// a directive with a block of lines in parentheses.

import type { ParsedFacts, Reference } from "#runtime/operations/code-facts/facts.ts";

/** One `require` line: the module path, and its version after it. */
const REQUIRE = /^\s*(?:require\s+)?"?([^\s"()]+)"?\s+v\d\S*/u;

/**
 * The block each line of a `go.mod` stands in: the directive whose
 * parentheses hold it, else none.
 * @param lines The lines, without comments.
 * @returns The directive of each line's block.
 */
function blocksOf(lines: readonly string[]): (string | undefined)[] {
	let open: string | undefined;
	return lines.map((line) => {
		if (open !== undefined && line === ")") open = undefined;
		const inside = open;
		open ??= /^(\w+)\s*\($/u.exec(line)?.[1];
		return inside;
	});
}

/**
 * The facts of a `go.mod`.
 * @param text The file's text.
 * @returns Its facts.
 */
function goModFacts(text: string): ParsedFacts {
	const lines = text.split("\n").map((line) => line.replace(/\/\/.*$/u, "").trim());
	const blocks = blocksOf(lines);
	const references = lines.flatMap((line, index) => {
		const required = blocks[index] === "require" || line.startsWith("require ");
		return required ? requireOf(line, index + 1) : [];
	});
	return { definitions: [], references, imports: [], unparsed: [] };
}

/**
 * The use of the module one `require` line names.
 * @param line The line, without its comment.
 * @param number Its line number.
 * @returns The use, or none for a line that names no module.
 */
function requireOf(line: string, number: number): Reference[] {
	const module = REQUIRE.exec(line)?.[1];
	if (module === undefined) return [];
	return [{ symbol: module, line: number, via: "code", kind: "build-dependency", typeOnly: false }];
}

export { goModFacts };

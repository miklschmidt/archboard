// Which parts own a piece of code (ADR 0046). The bound code of a part is the
// definition its symbol names, else its file, or every file below its
// directory, and of the parts whose bound code holds some code, the narrowest
// owns it: a part bound to a symbol before one bound to the file, and that
// before one bound to the deepest directory above it. A part bound to a C or
// C++ file owns its pair too, where no part binds that file itself
// (TASK-367.09). A definition that a file passes on, as an `index.ts` passes
// on a re-export, belongs to the part bound to that file where no part binds
// the defining file. The evidence of each board (evidence.ts), the
// infrastructure's (terraform-evidence.ts, kubernetes-evidence.ts) and the
// interface judgement (interfaces.ts) go between these owners.

import {
	definitionsIn,
	pairsOf,
	type PartCode,
	type ReadPart,
} from "@/runtime/code-check/lib/part-code";
import type { Definition, DefinitionSite } from "@/runtime/code-facts/index";

/** The parts that bind code in one repository, by how narrowly. */
interface Owners {
	readonly symbols: ReadonlyMap<string, readonly ReadPart[]>;
	readonly files: ReadonlyMap<string, readonly ReadPart[]>;
	readonly directories: readonly ReadPart[];
}

/**
 * Add a part to the list of a key.
 * @param map The lists.
 * @param key The key.
 * @param part The part.
 */
function addTo(map: Map<string, ReadPart[]>, key: string, part: ReadPart): void {
	map.set(key, [...(map.get(key) ?? []), part]);
}

/**
 * The parts of one repository, by how narrowly they bind.
 * @param parts The parts.
 * @returns The owners.
 */
function ownersOf(parts: readonly ReadPart[]): Owners {
	const symbols = new Map<string, ReadPart[]>();
	const files = new Map<string, ReadPart[]>();
	const directories: ReadPart[] = [];
	for (const part of parts) {
		const { grain } = part;
		if (grain.kind === "symbol") part.files.forEach((file) => addTo(symbols, file, part));
		else if (grain.kind === "file") addTo(files, grain.file, part);
		else directories.push(part);
	}
	for (const [file, owners] of pairsOf(parts)) if (!files.has(file)) files.set(file, owners);
	return { symbols, files, directories };
}

/**
 * The parts with the narrowest definition among those that hold code.
 * @param parts Parts bound to a symbol in the file.
 * @param file The file.
 * @param holds Whether a part's definition holds the code.
 * @returns The parts whose definition spans the fewest lines.
 */
function narrowestSymbols(
	parts: readonly ReadPart[],
	file: string,
	holds: (definition: Definition) => boolean,
): ReadPart[] {
	const holding = parts.flatMap((part) =>
		definitionsIn(part, file).flatMap((definition) =>
			holds(definition) ? [{ part, span: definition.end - definition.start }] : [],
		),
	);
	const least = Math.min(...holding.map((each) => each.span));
	return holding.filter((each) => each.span === least).map((each) => each.part);
}

/**
 * The deepest directories that hold a file.
 * @param directories Parts bound to a directory.
 * @param file The file.
 * @returns The parts bound to the deepest such directory.
 */
function deepestDirectories(directories: readonly ReadPart[], file: string): ReadPart[] {
	const holding = directories.flatMap((part) => {
		if (part.grain.kind !== "directory") return [];
		const { directory } = part.grain;
		if (directory !== "" && !file.startsWith(`${directory}/`)) return [];
		return [{ part, depth: directory === "" ? 0 : directory.split("/").length }];
	});
	const most = Math.max(...holding.map((each) => each.depth));
	return holding.filter((each) => each.depth === most).map((each) => each.part);
}

/**
 * The parts that own one line of a file.
 * @param owners The repository's parts.
 * @param file The file.
 * @param line The line.
 * @returns The narrowest parts whose bound code holds it.
 */
function ownersAtLine(owners: Owners, file: string, line: number): ReadPart[] {
	const symbols = narrowestSymbols(
		owners.symbols.get(file) ?? [],
		file,
		(definition) => definition.start <= line && line <= definition.end,
	);
	if (symbols.length > 0) return symbols;
	return [...(owners.files.get(file) ?? deepestDirectories(owners.directories, file))];
}

/**
 * The parts that own a file as a whole.
 * @param owners The repository's parts.
 * @param file The file.
 * @returns The narrowest parts bound to it or a directory above it.
 */
function ownersOfFile(owners: Owners, file: string): ReadPart[] {
	return [...(owners.files.get(file) ?? deepestDirectories(owners.directories, file))];
}

/**
 * The parts that own a definition: a part bound to it or to a definition
 * around it, else to its file, else to a file that passes it on, nearest to
 * the definition first, else to a directory above its file.
 * @param owners The repository's parts.
 * @param site Where the definition is.
 * @returns The narrowest parts.
 */
function ownersOfSite(
	owners: Owners,
	site: Pick<DefinitionSite, "path" | "via"> & {
		readonly definition: Pick<DefinitionSite["definition"], "start" | "end">;
	},
): ReadPart[] {
	const symbols = narrowestSymbols(
		owners.symbols.get(site.path) ?? [],
		site.path,
		(definition) =>
			definition.start <= site.definition.start && site.definition.end <= definition.end,
	);
	if (symbols.length > 0) return symbols;
	const own = owners.files.get(site.path);
	if (own !== undefined) return [...own];
	const passing = site.via.toReversed().find((file) => owners.files.has(file));
	if (passing !== undefined) return [...(owners.files.get(passing) ?? [])];
	return deepestDirectories(owners.directories, site.path);
}

/**
 * Each part and every part that holds it, the part first.
 * @param codes The board's parts.
 * @returns For each part's id, the ids of it and its containers.
 */
function lineagesOf(codes: ReadonlyMap<string, PartCode>): Map<string, Set<string>> {
	const parentOf = new Map([...codes].map(([id, code]) => [id, code.node.parent]));
	return new Map(
		[...codes.keys()].map((id) => {
			const chain = new Set<string>();
			for (let at: string | undefined = id; at !== undefined && !chain.has(at);) {
				chain.add(at);
				at = parentOf.get(at);
			}
			return [id, chain];
		}),
	);
}

export { type Owners, lineagesOf, ownersAtLine, ownersOf, ownersOfFile, ownersOfSite };

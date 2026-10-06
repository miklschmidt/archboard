// The evidence that joins the bound parts of one board, read from the code
// facts of every bound file (ADR 0046).
//
// In code, a use at run time of a name that another part defines is a call: a
// call, a construction, a rendered component or the name passed on as a
// value. A use only as a type is an import. A use that reaches its name
// through an import is resolved, because the import path names the file, and
// the check follows every re-export to the file that defines the name. A use
// of a name the same file defines at module level is matched by name only, so
// it is a candidate. A use the code reaches only through a value, such as
// `ledger.post()`, gives no evidence until a language server resolves it
// (TASK-367.13). An `import()`, a `require()` or an import for its side
// effects loads the whole file at run time, so it is a call to the file.
//
// Each piece goes from the part whose code makes the use to the part whose
// code holds what it reaches, each the narrowest binding (part-code.ts).
// Evidence never joins a part to a part inside it, and never two parts that
// bind the same code: the board already says that the one holds the other,
// and the check cannot tell the code of the two apart. A file read as text
// gives no evidence.

import type { PartCode, ReadPart, RepoCheckout } from "@/runtime/code-check/lib/part-code";
import {
	definitionSite,
	findSymbol,
	type Definition,
	type DefinitionSite,
	type FactsPass,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import type { CodeEvidence } from "@/shared/code-check/index";

/** One piece of evidence between two parts of a board, by their ids. */
type Piece = CodeEvidence & { readonly from: string; readonly to: string };

/** The evidence between the parts of one board, and the files a grammar read. */
interface BoardEvidence {
	readonly pieces: readonly Piece[];
	/** For each repository, the files the pass read through code facts rather than as text. */
	readonly parsed: ReadonlyMap<string, ReadonlySet<string>>;
}

/** What reading the evidence needs. */
interface EvidenceReading {
	readonly facts: FactsPass;
	/**
	 * Note a file read as text.
	 * @param checkout Its checkout.
	 * @param file The file, relative to the checkout.
	 */
	readonly readAsText: (checkout: RepoCheckout, file: string) => void;
}

/** The parts that bind code in one repository, by how narrowly. */
interface Owners {
	readonly symbols: ReadonlyMap<string, readonly ReadPart[]>;
	readonly files: ReadonlyMap<string, readonly ReadPart[]>;
	readonly directories: readonly ReadPart[];
}

/** What a use reaches: the parts that hold it, and whether the code named its file. */
interface Reached {
	readonly to: readonly ReadPart[];
	readonly resolution: CodeEvidence["resolution"];
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
		if (grain.kind === "symbol") addTo(symbols, grain.file, part);
		else if (grain.kind === "file") addTo(files, grain.file, part);
		else directories.push(part);
	}
	return { symbols, files, directories };
}

/**
 * The parts with the narrowest definition among those that hold code.
 * @param parts Parts bound to a symbol.
 * @param holds Whether a part's definition holds the code.
 * @returns The parts whose definition spans the fewest lines.
 */
function narrowestSymbols(
	parts: readonly ReadPart[],
	holds: (definition: Definition) => boolean,
): ReadPart[] {
	const holding = parts.flatMap((part) =>
		part.grain.kind === "symbol" && holds(part.grain.definition)
			? [{ part, span: part.grain.definition.end - part.grain.definition.start }]
			: [],
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
function ownersOfSite(owners: Owners, site: DefinitionSite): ReadPart[] {
	const symbols = narrowestSymbols(
		owners.symbols.get(site.path) ?? [],
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

/** What reading one repository's evidence needs beside the reading. */
interface RepoReading {
	readonly reading: EvidenceReading;
	readonly checkout: RepoCheckout;
	readonly owners: Owners;
	/** Each part and its containers. */
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
	readonly sites: Map<string, Promise<DefinitionSite | undefined>>;
}

/**
 * Where a name a file uses is defined, asked once in a pass.
 * @param repo The repository's reading.
 * @param file The file.
 * @param symbol The name as the file spells it.
 * @returns The site, or undefined.
 */
function siteOf(
	repo: RepoReading,
	file: string,
	symbol: string,
): Promise<DefinitionSite | undefined> {
	const key = `${file}\0${symbol}`;
	let site = repo.sites.get(key);
	if (site === undefined) {
		site = definitionSite(repo.reading.facts, repo.checkout, file, symbol);
		repo.sites.set(key, site);
	}
	return site;
}

/**
 * What one use in a file reaches.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @param reference The use.
 * @param imported The names the file's imports bring in.
 * @returns The parts that hold what it reaches, or undefined when the check cannot tell.
 */
async function reachedBy(
	repo: RepoReading,
	facts: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
	imported: ReadonlySet<string>,
): Promise<Reached | undefined> {
	if (reference.target !== undefined) {
		const site = await siteOf(repo, facts.path, reference.symbol);
		const to =
			site === undefined || site.path === facts.path
				? ownersOfFile(repo.owners, reference.target.path)
				: ownersOfSite(repo.owners, site);
		return { to, resolution: "resolved" };
	}
	const definition = moduleLevelDefinition(facts, reference.symbol, imported);
	if (definition === undefined) return undefined;
	const site = { path: facts.path, definition, via: [] };
	return { to: ownersOfSite(repo.owners, site), resolution: "candidate" };
}

/**
 * The definition a file gives a name exactly, as a module-level declaration
 * spells it or as `Holder.member`.
 * @param facts The file's facts.
 * @param name The name.
 * @returns The definition, or undefined.
 */
function definedAs(facts: SyntaxFacts, name: string): Definition | undefined {
	const found = findSymbol(facts, name, "definition");
	return found.status === "found" && found.definition?.symbol === name
		? found.definition
		: undefined;
}

/**
 * The definition of the same file that a use names by its first name: a
 * declaration at module level, or the member of one that the rest of the
 * spelling names. A first name that an import brings in, or that no
 * module-level declaration has, such as a parameter or a local, names none.
 * @param facts The file's facts.
 * @param symbol The use as the file spells it.
 * @param imported The names the file's imports bring in.
 * @returns The definition, or undefined.
 */
function moduleLevelDefinition(
	facts: SyntaxFacts,
	symbol: string,
	imported: ReadonlySet<string>,
): Definition | undefined {
	const first = symbol.split(".")[0] ?? "";
	if (imported.has(first)) return undefined;
	const declared = definedAs(facts, first);
	return declared === undefined ? undefined : (definedAs(facts, symbol) ?? declared);
}

/**
 * The pieces from the parts that own a use to the parts that hold what it
 * reaches, leaving out a part and a part inside it, and two parts that bind
 * the same code.
 * @param from The parts that make the use.
 * @param reached What it reaches.
 * @param lineages Each part and its containers.
 * @param evidence The rest of each piece.
 * @returns The pieces.
 */
function piecesBetween(
	from: readonly ReadPart[],
	reached: Reached,
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
	evidence: Omit<CodeEvidence, "from" | "to" | "resolution">,
): Piece[] {
	return from.flatMap((start) =>
		reached.to.flatMap((end): Piece[] => {
			const a = start.node.id;
			const b = end.node.id;
			const nested = lineages.get(a)?.has(b) === true || lineages.get(b)?.has(a) === true;
			if (nested || start.key === end.key) return [];
			return [{ ...evidence, resolution: reached.resolution, from: a, to: b }];
		}),
	);
}

/**
 * The pieces one use in a file gives.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @param reference The use.
 * @param imported The names the file's imports bring in.
 * @returns Its pieces.
 */
async function piecesOfUse(
	repo: RepoReading,
	facts: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
	imported: ReadonlySet<string>,
): Promise<Piece[]> {
	const { kind, line, symbol } = reference;
	const from = kind === undefined ? [] : ownersAtLine(repo.owners, facts.path, line);
	if (kind === undefined || from.length === 0) return [];
	const reached = await reachedBy(repo, facts, reference, imported);
	if (reached === undefined) return [];
	const evidence = { repo: repo.checkout.repo, path: facts.path, kind, line, symbol };
	return piecesBetween(from, reached, repo.lineages, evidence);
}

/**
 * The pieces of the imports that load a whole file at run time: an
 * `import()`, a `require()`, or an import for its side effects.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @returns Their pieces.
 */
function piecesOfLoads(repo: RepoReading, facts: SyntaxFacts): Piece[] {
	return facts.imports.flatMap((found) => {
		const loads = !found.reexport && !found.typeOnly && found.names.length === 0;
		if (!loads || found.resolved === undefined) return [];
		const to = ownersOfFile(repo.owners, found.resolved);
		const from = ownersAtLine(repo.owners, facts.path, found.line);
		const evidence = {
			repo: repo.checkout.repo,
			path: facts.path,
			kind: "call" as const,
			line: found.line,
			symbol: found.specifier,
		};
		return piecesBetween(from, { to, resolution: "resolved" }, repo.lineages, evidence);
	});
}

/**
 * The evidence one file gives, in the order of its uses, then its loads.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @returns Its pieces.
 */
async function piecesOfFile(repo: RepoReading, facts: SyntaxFacts): Promise<Piece[]> {
	const imported = new Set(
		facts.imports.flatMap((found) => (found.reexport ? [] : found.names.map((name) => name.local))),
	);
	const uses = await Promise.all(
		facts.references.map((reference) => piecesOfUse(repo, facts, reference, imported)),
	);
	return [...uses.flat(), ...piecesOfLoads(repo, facts)];
}

/**
 * The evidence one bound file gives, noting how the pass read it.
 * @param repo The repository's reading.
 * @param file The file, relative to its checkout.
 * @param parsed The files read through code facts, which this adds to.
 * @returns Its pieces; none for a file read as text or not read.
 */
async function piecesOfPath(
	repo: RepoReading,
	file: string,
	parsed: Set<string>,
): Promise<Piece[]> {
	const facts = await repo.reading.facts.read(repo.checkout, file);
	if (facts === undefined) return [];
	if (facts.adapter === "text") {
		repo.reading.readAsText(repo.checkout, file);
		return [];
	}
	parsed.add(file);
	return piecesOfFile(repo, facts);
}

/**
 * Keep the first piece of each kind and resolution between two parts.
 * @param pieces The pieces, in the order the files were read.
 * @returns One piece for each.
 */
function firstOfEach(pieces: readonly Piece[]): Piece[] {
	const seen = new Map<string, Piece>();
	for (const piece of pieces) {
		const key = `${piece.from}\0${piece.to}\0${piece.kind}\0${piece.resolution}`;
		if (!seen.has(key)) seen.set(key, piece);
	}
	return [...seen.values()];
}

/**
 * The evidence the bound code of one repository gives.
 * @param parts The repository's read parts.
 * @param reading The pass.
 * @param lineages Each part and its containers.
 * @returns The pieces, and the files read through code facts.
 */
async function evidenceInRepo(
	parts: readonly [ReadPart, ...ReadPart[]],
	reading: EvidenceReading,
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<{ pieces: Piece[]; parsed: Set<string> }> {
	const repo: RepoReading = {
		reading,
		checkout: parts[0].checkout,
		owners: ownersOf(parts),
		lineages,
		sites: new Map(),
	};
	const parsed = new Set<string>();
	const pieces: Piece[] = [];
	for (const file of [...new Set(parts.flatMap((part) => part.files))].toSorted()) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses and the evidence keeps the files' order
		pieces.push(...(await piecesOfPath(repo, file, parsed)));
	}
	return { pieces, parsed };
}

/**
 * The evidence between the bound parts of one board.
 * @param codes Each part's bound code, by its id.
 * @param reading The pass.
 * @returns The evidence, and the files read through code facts.
 */
async function evidenceOf(
	codes: ReadonlyMap<string, PartCode>,
	reading: EvidenceReading,
): Promise<BoardEvidence> {
	const byRepo = new Map<string, [ReadPart, ...ReadPart[]]>();
	for (const code of codes.values()) {
		if (code.status !== "read") continue;
		const parts = byRepo.get(code.checkout.repo);
		if (parts === undefined) byRepo.set(code.checkout.repo, [code]);
		else parts.push(code);
	}
	const lineages = lineagesOf(codes);
	const pieces: Piece[] = [];
	const parsed = new Map<string, ReadonlySet<string>>();
	for (const [repo, parts] of byRepo) {
		// oxlint-disable-next-line no-await-in-loop -- one repository at a time, in board order
		const read = await evidenceInRepo(parts, reading, lineages);
		pieces.push(...read.pieces);
		parsed.set(repo, read.parsed);
	}
	return { pieces: firstOfEach(pieces), parsed };
}

export { type BoardEvidence, type EvidenceReading, type Piece, evidenceOf, lineagesOf };

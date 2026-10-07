// The evidence that joins the bound parts of one board, read from the code
// facts of every bound file (ADR 0046).
//
// In code, a use at run time of a name that another part defines is a call: a
// call, a construction, a rendered component or the name passed on as a
// value. A use only as a type is an import. A use that reaches its name
// through an import is resolved, because the import path names the file, and
// the check follows every re-export to the file that defines the name. A use
// of a name the same file defines at module level is matched by name only, so
// it is a candidate. Where a candidate joins two parts, the language server of
// the file resolves it (TASK-367.13, resolution.ts): a definition in a file of
// the checkout makes the evidence resolved, one only outside the checkout
// reaches no part, and with no answer it stays a candidate. A use through a
// value, such as `ledger.post()`, gives no evidence. The server is asked about
// one only for an anchor (anchor-kind.ts, support.ts): asking about every one
// cost 3 to 5 s of each pass on the dogfood vault and changed no finding. An
// `import()`, a `require()` or an import for its side effects loads the whole
// file at run time, so it is a call to the file.
//
// A constant read, a name passed on or an `instanceof` test supports call
// evidence but does not make a relationship undrawn: the evidence keeps it
// apart as a value. A known function passed as an argument can run later,
// so it counts as running evidence (TASK-436.15).
//
// Each piece goes from the part whose code makes the use to the part whose
// code holds what it reaches, each the narrowest binding (ownership.ts). Code
// facts keep only the first line of each spelling in a file, so where two
// parts bind two symbols of one file and both use one name, only the part
// whose definition holds that first line is credited with the use.
// Evidence never joins a part to a part inside it, and never two parts that
// bind the same code: the board already says that the one holds the other,
// and the check cannot tell the code of the two apart. A file read as text
// gives no evidence.
//
// In a Nix flake, the code of a part may hold an expression the static
// reading cannot follow, such as a package `callPackage` builds from another
// file: what that code is built from is unknown there (TASK-367.22). The
// evidence notes, for each part that owns a line of such an expression, the
// first one in each flake, so that a relationship it starts to an output of
// that flake is not judged unsupported.

import { moduleLevelDefinition, passedDefinition } from "@/runtime/code-check/lib/module-level";
import {
	lineagesOf,
	ownersAtLine,
	ownersOf,
	ownersOfFile,
	ownersOfSite,
	type Owners,
} from "@/runtime/code-check/lib/ownership";
import type { PartCode, ReadPart, RepoCheckout } from "@/runtime/code-check/lib/part-code";
import type { Resolve } from "@/runtime/code-check/lib/resolution";
import {
	definitionSite,
	runsDefinition,
	type Definition,
	type DefinitionSite,
	type FactsPass,
	type SyntaxFacts,
	type Target,
	type Unparsed,
} from "@/runtime/code-facts/index";
import type { CodeEvidence } from "@/shared/code-check/index";

/** One piece of evidence between two parts of a board, by their ids. */
type Piece = CodeEvidence & { readonly from: string; readonly to: string };

/** The evidence between the parts of one board, and the files a grammar read. */
interface BoardEvidence {
	readonly pieces: readonly Piece[];
	/** For each repository, the files the pass read through code facts rather than as text. */
	readonly parsed: ReadonlyMap<string, ReadonlySet<string>>;
	/**
	 * For each part whose code holds a Nix expression the static reading cannot
	 * follow, by its id: each Nix file that holds one, by its repository and
	 * path, with the file and the lines of the first (`flake.nix:12-14`).
	 */
	readonly unfollowed: ReadonlyMap<string, ReadonlyMap<string, string>>;
	/** The pieces whose use runs none of the code it reaches: it uses the name as a value. */
	readonly values: ReadonlySet<Piece>;
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
	/** Where a language server says a use that no import resolves is defined. */
	readonly resolve: Resolve;
}

/** What a use reaches: the parts that hold it, and whether the code named its file. */
interface Reached {
	readonly to: readonly ReadPart[];
	readonly resolution: CodeEvidence["resolution"];
	readonly definition?: Pick<Definition, "kind"> | undefined;
}

/** What reading one repository's evidence needs beside the reading. */
interface RepoReading {
	readonly reading: EvidenceReading;
	readonly checkout: RepoCheckout;
	readonly owners: Owners;
	/** Each part and its containers. */
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
	/** The parts whose code holds a Nix expression the reading cannot follow, which the reading adds to. */
	readonly unfollowed: Map<string, Map<string, string>>;
	/** The pieces whose use runs none of the code it reaches, which the reading adds to. */
	readonly values: Set<Piece>;
}

/**
 * The definition sites each pass has asked for, by checkout, file and name. A
 * site depends on the files alone, so every board of a pass shares them.
 */
const SITES = new WeakMap<FactsPass, Map<string, Promise<DefinitionSite | undefined>>>();

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
	const { facts } = repo.reading;
	const sites = SITES.get(facts) ?? new Map<string, Promise<DefinitionSite | undefined>>();
	SITES.set(facts, sites);
	const key = `${repo.checkout.root}\0${file}\0${symbol}`;
	let site = sites.get(key);
	if (site === undefined) {
		site = definitionSite(facts, repo.checkout, file, symbol);
		sites.set(key, site);
	}
	return site;
}

/**
 * What a use that an import resolves reaches: the parts that hold its
 * definition, else those that own the file it leads to. A definition of the
 * same file is it only under the name the import leads to, as a compose file
 * defines the service that another of its services depends on. A C or C++
 * include that leads to a declaration whose code is in no file the check can
 * name matches by name only: a candidate. The declaration is often in the
 * header of the using part's own file, as Redis declares nearly everything in
 * `server.h`, so the match cannot say which part the code is in: where a part
 * makes the use, the language server of the file is asked.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @param reference The use.
 * @param target Where its import leads.
 * @returns The parts that hold what it reaches, or undefined when the server
 * names its definition only outside the checkout.
 */
async function targetReached(
	repo: RepoReading,
	facts: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
	target: Target,
): Promise<Reached | undefined> {
	const site = await siteOf(repo, facts.path, reference.symbol);
	const reached: Reached = {
		to: ownersOfTarget(repo, facts, site, target),
		resolution: resolutionAt(site),
		definition: site?.definition,
	};
	const made = ownersAtLine(repo.owners, facts.path, reference.line).length > 0;
	return reached.resolution === "candidate" && made
		? serverResolved(repo, facts, reference, reached)
		: reached;
}

/**
 * The parts that hold what an import leads to: those that hold its site, or
 * those that own its file where the site is none, or a definition of the same
 * file under another name.
 * @param repo The repository's reading.
 * @param facts The using file's facts.
 * @param site The site, if any.
 * @param target Where the import leads.
 * @returns The parts.
 */
function ownersOfTarget(
	repo: RepoReading,
	facts: SyntaxFacts,
	site: DefinitionSite | undefined,
	target: Target,
): readonly ReadPart[] {
	const other = site?.path === facts.path && site.definition.symbol !== target.symbol;
	return site === undefined || other
		? ownersOfFile(repo.owners, target.path)
		: ownersOfSite(repo.owners, site);
}

/**
 * How sure a use is that an import leads to a site: resolved, unless the site
 * only declares the name and no file the check can name holds its code.
 * @param site The site, if any.
 * @returns The resolution.
 */
function resolutionAt(site: DefinitionSite | undefined): CodeEvidence["resolution"] {
	return site?.definition.declaration === true ? "candidate" : "resolved";
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
		return targetReached(repo, facts, reference, reference.target);
	}
	if (imported.has(reference.symbol.split(".")[0] ?? "")) return undefined;
	return serverReached(repo, facts, reference, imported);
}

/**
 * What a use that no import resolves reaches. A name the file defines at
 * module level is matched by name, a candidate. Where that match joins two
 * parts, the language server of the file says where the name is defined: the
 * parts that hold the definition it names in the checkout, resolved, or
 * nothing when it names one only outside; with no answer the candidate stays.
 * Only there can the answer change a finding, since a match that joins a part
 * to itself is no evidence, and asking about every candidate cost 3 to 5 s of
 * each pass on the dogfood vault and changed no finding. Any other use gives
 * no evidence: a bare name the file does not define at module level is a
 * local, a parameter or a global, whose definition is in the same function or
 * outside the checkout, and a use through a value is asked about only for an
 * anchor.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @param reference The use.
 * @param imported The names the file's imports bring in.
 * @returns The parts that hold what it reaches, or undefined when the check cannot tell.
 */
async function serverReached(
	repo: RepoReading,
	facts: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
	imported: ReadonlySet<string>,
): Promise<Reached | undefined> {
	const candidate = candidateReached(repo, facts, reference, imported);
	if (candidate === undefined) return undefined;
	const from = ownersAtLine(repo.owners, facts.path, reference.line);
	const lineages = repo.lineages;
	if (!from.some((start) => candidate.to.some((end) => joins(start, end, lineages)))) {
		return candidate;
	}
	return serverResolved(repo, facts, reference, candidate);
}

/**
 * A candidate as the language server of its file resolves it: the parts that
 * hold the definition the server names in the checkout, resolved, or nothing
 * when it names one only outside; with no answer the candidate stays.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @param reference The use.
 * @param candidate What the use reaches by name.
 * @returns What it reaches.
 */
async function serverResolved(
	repo: RepoReading,
	facts: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
	candidate: Reached,
): Promise<Reached | undefined> {
	const resolved = await repo.reading.resolve(repo.checkout, facts.path, reference);
	if (resolved.status === "unknown") return candidate;
	if (resolved.status === "elsewhere") return undefined;
	const definition = { start: resolved.line, end: resolved.line };
	const site = { path: resolved.path, definition, via: [] };
	return {
		to: ownersOfSite(repo.owners, site),
		resolution: "resolved",
		definition: await passedDefinition(repo.reading.facts, repo.checkout, resolved.path, reference),
	};
}

/**
 * What a use no server resolved reaches by name: the definition of a
 * module-level name of the same file, a candidate.
 * @param repo The repository's reading.
 * @param facts The file's facts.
 * @param reference The use.
 * @param imported The names the file's imports bring in.
 * @returns The parts that hold it, or undefined when the file defines no such name.
 */
function candidateReached(
	repo: RepoReading,
	facts: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
	imported: ReadonlySet<string>,
): Reached | undefined {
	const definition = moduleLevelDefinition(facts, reference.symbol, imported);
	if (definition === undefined) return undefined;
	const site = { path: facts.path, definition, via: [] };
	return { to: ownersOfSite(repo.owners, site), resolution: "candidate", definition };
}

/**
 * Whether evidence can join one part to another: never a part to a part
 * inside it, and never two parts that bind the same code.
 * @param start The part that makes a use.
 * @param end The part that holds what it reaches.
 * @param lineages Each part and its containers.
 * @returns True when a piece can go from the one to the other.
 */
function joins(
	start: ReadPart,
	end: ReadPart,
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
	const a = start.node.id;
	const b = end.node.id;
	const nested = lineages.get(a)?.has(b) === true || lineages.get(b)?.has(a) === true;
	return !nested && start.key !== end.key;
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
		reached.to.flatMap((end): Piece[] =>
			joins(start, end, lineages)
				? [{ ...evidence, resolution: reached.resolution, from: start.node.id, to: end.node.id }]
				: [],
		),
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
	return noteValues(
		repo,
		reference,
		reached,
		piecesBetween(from, reached, repo.lineages, evidence),
	);
}

/**
 * Keep evidence that runs no code among the values, after its definition is known.
 * @param repo The repository's reading.
 * @param reference The use.
 * @param reached What it reaches.
 * @param pieces Its pieces.
 * @returns The pieces.
 */
function noteValues(
	repo: RepoReading,
	reference: SyntaxFacts["references"][number],
	reached: Reached,
	pieces: Piece[],
): Piece[] {
	if (!runsDefinition(reference, reached.definition))
		for (const piece of pieces) repo.values.add(piece);
	return pieces;
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
	noteUnfollowed(repo, facts);
	return piecesOfFile(repo, facts);
}

/**
 * The pathful site of a static expression the reading cannot follow.
 * @param origin Its source path and lines.
 * @param origin.path Its path.
 * @param origin.start Its first line.
 * @param origin.end Its last line.
 * @returns The site as file:lines.
 */
function unfollowedSite(origin: NonNullable<Unparsed["source"]>): string {
	return `${origin.path}:${origin.start === origin.end ? origin.start : `${origin.start}-${origin.end}`}`;
}

/**
 * Note the parts that own a line of a part of a Nix file that the static
 * reading cannot follow, or that did not parse: what that code is built from
 * is unknown there, and a piece of evidence at any of its lines would be
 * theirs.
 * @param repo The repository's reading, which this adds to.
 * @param facts The file's facts.
 */
function noteUnfollowed(repo: RepoReading, facts: SyntaxFacts): void {
	if (facts.adapter !== "nix") return;
	for (const { start, end, source } of facts.unparsed) {
		const at = unfollowedSite(source ?? { path: facts.path, start, end });
		const file = `${repo.checkout.repo}\0${facts.path}`;
		for (const owner of ownersOfLines(repo.owners, facts.path, start, end)) {
			const files = repo.unfollowed.get(owner.node.id) ?? new Map<string, string>();
			repo.unfollowed.set(owner.node.id, new Map([[file, at], ...files]));
		}
	}
}

/**
 * The parts that own some line of a file.
 * @param owners The repository's parts.
 * @param file The file.
 * @param start The first line.
 * @param end The last line.
 * @returns Each part that owns one of the lines, once.
 */
function ownersOfLines(owners: Owners, file: string, start: number, end: number): Set<ReadPart> {
	const found = new Set<ReadPart>();
	for (let line = start; line <= end; line += 1) {
		for (const owner of ownersAtLine(owners, file, line)) found.add(owner);
	}
	return found;
}

/**
 * Keep the first piece of each kind and resolution between two parts, and
 * of each way of use: one that runs code, and one that uses a value.
 * @param pieces The pieces, in the order the files were read.
 * @param values The pieces that use a value.
 * @returns One piece for each.
 */
function firstOfEach(pieces: readonly Piece[], values: ReadonlySet<Piece>): Piece[] {
	const seen = new Map<string, Piece>();
	for (const piece of pieces) {
		const key = `${piece.from}\0${piece.to}\0${piece.kind}\0${piece.resolution}\0${String(values.has(piece))}`;
		if (!seen.has(key)) seen.set(key, piece);
	}
	return [...seen.values()];
}

/**
 * The evidence the bound code of one repository gives.
 * @param parts The repository's read parts.
 * @param reading The pass.
 * @param lineages Each part and its containers.
 * @param found What the reading adds to: the parts whose code holds a Nix
 * expression it cannot follow, and the pieces that use a value.
 * @param found.unfollowed The parts whose code holds such an expression.
 * @param found.values The pieces that use a value.
 * @returns The pieces, and the files read through code facts.
 */
async function evidenceInRepo(
	parts: readonly [ReadPart, ...ReadPart[]],
	reading: EvidenceReading,
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
	found: Pick<RepoReading, "unfollowed" | "values">,
): Promise<{ pieces: Piece[]; parsed: Set<string> }> {
	const repo: RepoReading = {
		reading,
		checkout: parts[0].checkout,
		owners: ownersOf(parts),
		lineages,
		...found,
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
	const unfollowed = new Map<string, Map<string, string>>();
	const values = new Set<Piece>();
	for (const [repo, parts] of byRepo) {
		// oxlint-disable-next-line no-await-in-loop -- one repository at a time, in board order
		const read = await evidenceInRepo(parts, reading, lineages, { unfollowed, values });
		pieces.push(...read.pieces);
		parsed.set(repo, read.parsed);
	}
	return { pieces: firstOfEach(pieces, values), parsed, unfollowed, values };
}

export { type BoardEvidence, type EvidenceReading, type Piece, evidenceOf, piecesBetween };

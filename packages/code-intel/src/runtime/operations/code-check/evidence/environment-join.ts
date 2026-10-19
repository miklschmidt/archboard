// The join of code and infrastructure across a network hop (ADR 0046,
// TASK-367.23). Code shows that a part reads an environment value, such as
// `QUEUE_URL`. Infrastructure shows that the value is set, for the code that
// reads it, to the address of another part. Together they prove a
// relationship that neither proves alone: configured-path evidence from the
// part that reads the value to the part the value names.
//
// The seam is a runner: an infrastructure declaration that runs code and sets
// its environment, such as a compose service. Each infrastructure reader
// gives its runners (compose-runners.ts): the directories whose code it runs
// as its files say, the parts bound to the declaration, and each value it
// sets with the parts that value names. A declaration runs the code that
// reads a value in two cases:
//
// - Its files say so: it builds the deepest directory that holds the file
//   that reads it, as a compose service's `build` does. A service that builds
//   the whole repository runs only the code that no deeper build holds.
// - The board says so: the part that owns the read is, or is inside, a part
//   bound to the declaration. This is how an image built elsewhere, such as a
//   Kubernetes workload's, says which code it runs.
//
// A value reaches the parts whose code the declaration it names runs, by the
// same two rules (its build, else the parts drawn inside a part bound to it),
// and otherwise the parts that own that declaration.
//
// A read of a name that a runner of its code sets to the address of a part is
// one piece from the part that owns the read (the narrowest binding, as all
// code evidence) to that part, with its partner: the piece where the
// infrastructure sets it. Both are configured-path evidence. They are
// resolved where the files leave no choice: the name, the service and the
// build directory are all written in files. They are candidates where the
// files leave a choice, because then a right board cannot clear a warning:
// the address names a declaration whose code is several parts, and nothing
// says which of them it reaches; or more than one runner runs the code that
// reads the name, and they do not set it to the same parts, as two services
// that build one directory to different targets. Evidence never joins a part
// to a part inside it.
//
// The reads and runners also say which side of an unsupported relationship
// has evidence: the infrastructure sets a value to the address of its end
// for the code of its start, and that code reads none of those names; or the
// code of its start reads names that nothing the check reads sets for it.

import { piecesBetween, type Piece } from "#runtime/operations/code-check/evidence/evidence.ts";
import {
	lineagesOf,
	ownersAtLine,
	ownersOf,
	type Owners,
} from "#runtime/operations/code-check/evidence/ownership.ts";
import type { PartCode, ReadPart } from "#runtime/operations/code-check/part-code.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";
import type { FileFacts } from "#runtime/operations/code-facts/facts.ts";
import type { CodeEvidence } from "#shared/protocol/code-check.ts";

/**
 * The adapters that read infrastructure, where an environment name is set,
 * never read: compose files and the env files they name, Kubernetes
 * manifests, Terraform and OpenTofu.
 */
const INFRASTRUCTURE: ReadonlySet<string> = new Set(["compose", "env", "kubernetes", "terraform"]);

/**
 * The parts a value reaches through one declaration it names, and whether the
 * files name them for sure.
 */
type Reach = Parameters<typeof piecesBetween>[1];

/** One environment value an infrastructure declaration sets, and the parts its value names. */
interface Setting {
	readonly name: string;
	readonly repo: string;
	readonly path: string;
	readonly line: number;
	/**
	 * The parts the value names, one reach for each declaration it names.
	 * None for a value that names no part, such as a host outside the project
	 * or a name an env file sets, whose value the check never reads.
	 */
	readonly reaches: readonly Reach[];
}

/**
 * An infrastructure declaration that runs code and sets its environment: a
 * compose service, a Kubernetes workload, a Terraform resource.
 */
interface Runner {
	readonly repo: string;
	/** The directories of its repository whose code it runs, as its files say; the empty string is the whole checkout. */
	readonly directories: readonly string[];
	/** The parts bound to the declaration: it runs their code and that of the parts inside them. */
	readonly parts: readonly ReadPart[];
	readonly settings: readonly Setting[];
}

/** One environment value that code reads. */
interface Read {
	/** The part that owns the line. */
	readonly part: ReadPart;
	readonly name: string;
	readonly repo: string;
	readonly path: string;
	readonly line: number;
}

/** The evidence each side of a relationship across a network hop has where nothing joins them. */
interface HopSides {
	/** Where the infrastructure sets a value to the address of its end, for the code of its start. */
	readonly settings: readonly CodeEvidence[];
	/** Where the code of its start reads a name that nothing the check reads sets for it. */
	readonly unset: readonly CodeEvidence[];
}

/** What the join gives the judgement of one board's relationships. */
interface EnvironmentJoin {
	/** The pieces from the part that reads a value to each part the value names. */
	readonly pieces: readonly Piece[];
	/** For each piece at a read, its partner: the piece where the value is set. */
	readonly partners: ReadonlyMap<Piece, Piece>;
	/**
	 * Which side of a relationship has evidence of a network hop.
	 * @param start The ids of its start and the parts inside it.
	 * @param end The ids of its end and the parts inside it.
	 * @returns The evidence of each side.
	 */
	readonly sides: (start: ReadonlySet<string>, end: ReadonlySet<string>) => HopSides;
}

/**
 * The environment values one file of code reads.
 * @param found The file's facts.
 * @param owners The repository's parts, by how narrowly they bind.
 * @param repo The repository.
 * @returns Each read, owned by the narrowest part that holds its line; none in infrastructure.
 */
function readsInFile(found: FileFacts | undefined, owners: Owners, repo: string): Read[] {
	if (found === undefined || found.adapter === "text" || INFRASTRUCTURE.has(found.adapter)) {
		return [];
	}
	return found.references.flatMap(({ symbol: name, line, via }) =>
		via === "environment"
			? ownersAtLine(owners, found.path, line).map((part) => ({
					part,
					name,
					repo,
					path: found.path,
					line,
				}))
			: [],
	);
}

/**
 * The environment values the code of a board's parts reads, file by file.
 * @param parts The read parts of one repository.
 * @param facts The pass.
 * @returns Each read, owned by the narrowest part that holds its line.
 */
async function readsIn(
	parts: readonly [ReadPart, ...ReadPart[]],
	facts: FactsPass,
): Promise<Read[]> {
	const owners = ownersOf(parts);
	const { checkout } = parts[0];
	const reads: Read[] = [];
	for (const file of [...new Set(parts.flatMap((part) => part.files))].toSorted()) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses and the reads keep the files' order
		reads.push(...readsInFile(await facts.read(checkout, file), owners, checkout.repo));
	}
	return reads;
}

/**
 * The read parts of a board, by repository.
 * @param codes Each part's bound code, by its id.
 * @returns The read parts of each repository, in board order.
 */
function partsByRepo(codes: ReadonlyMap<string, PartCode>): [ReadPart, ...ReadPart[]][] {
	const byTree = new Map<string, [ReadPart, ...ReadPart[]]>();
	for (const code of codes.values()) {
		if (code.status !== "read") continue;
		const parts = byTree.get(code.checkout.root);
		if (parts === undefined) byTree.set(code.checkout.root, [code]);
		else parts.push(code);
	}
	return [...byTree.values()];
}

/**
 * How a value reaches the parts whose code a declaration runs: for sure when
 * that code is one part's, and a candidate for each of several, because the
 * address names the declaration and nothing says which of them it reaches.
 * @param parts The parts.
 * @returns The reach.
 */
function reachOf(parts: readonly ReadPart[]): Reach {
	return { to: parts, resolution: parts.length > 1 ? "candidate" : "resolved" };
}

/**
 * The parts a value that names a declaration reaches, when no build says
 * which code the declaration runs: the parts the board draws inside a part
 * bound to it, whose code it runs, else the parts that own it.
 * @param codes Each part's bound code, by its id.
 * @param owners The parts that own the declaration.
 * @returns The reach.
 */
function runningParts(codes: ReadonlyMap<string, PartCode>, owners: readonly ReadPart[]): Reach {
	const bound = new Set(
		owners.flatMap((part) => (part.grain.kind === "symbol" ? [part.node.id] : [])),
	);
	const inside = [...codes.values()].filter(
		(code): code is ReadPart =>
			code.status === "read" && code.node.parent !== undefined && bound.has(code.node.parent),
	);
	return inside.length > 0 ? reachOf(inside) : { to: owners, resolution: "resolved" };
}

/**
 * The directory that holds a path.
 * @param path A file or directory of the checkout.
 * @returns Its directory; the empty string is the whole checkout.
 */
function parentOf(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? "" : path.slice(0, slash);
}

/**
 * Add a runner to the list of a key.
 * @param map The lists.
 * @param key The key.
 * @param runner The runner.
 */
function addRunner(map: Map<string, Runner[]>, key: string, runner: Runner): void {
	map.set(key, [...(map.get(key) ?? []), runner]);
}

/** Which runners run a file or a part. */
interface Running {
	/**
	 * The runners that run the code of a file that a part owns.
	 * @param repo The file's repository.
	 * @param file The file.
	 * @param part The part that owns it.
	 * @returns Them, each once.
	 */
	readonly ofFile: (repo: string, file: string, part: ReadPart) => Runner[];
	/**
	 * The runners that run some of the code of a part.
	 * @param part The part.
	 * @returns Them, each once.
	 */
	readonly ofPart: (part: ReadPart) => Runner[];
}

/**
 * Which runners run what: the runners that build the deepest built directory
 * that holds a file, and the runners bound to a part that is, or holds, its
 * owner. Both are looked up, so a pass over many compose files and a part of
 * many files costs the files times the depth of their directories.
 * @param runners Every runner.
 * @param lineages Each part and the parts that hold it, the part first.
 * @returns The lookups.
 */
function runningOf(
	runners: readonly Runner[],
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): Running {
	const building = new Map<string, Runner[]>();
	const bound = new Map<string, Runner[]>();
	for (const runner of runners) {
		runner.directories.forEach((directory) =>
			addRunner(building, `${runner.repo}\0${directory}`, runner),
		);
		runner.parts.forEach((part) => addRunner(bound, part.node.id, runner));
	}
	/**
	 * The runners that build the deepest built directory that holds a file.
	 * @param repo The file's repository.
	 * @param file The file.
	 * @returns Them; none where no build holds it.
	 */
	const builders = (repo: string, file: string): readonly Runner[] => {
		for (let directory = parentOf(file); ; directory = parentOf(directory)) {
			const found = building.get(`${repo}\0${directory}`);
			if (found !== undefined || directory === "") return found ?? [];
		}
	};
	/**
	 * The runners bound to a part or to a part that holds it.
	 * @param part The part.
	 * @returns Them.
	 */
	const holding = (part: ReadPart): Runner[] =>
		[...(lineages.get(part.node.id) ?? [])].flatMap((id) => bound.get(id) ?? []);
	return {
		/**
		 * The runners that run the code of a file that a part owns.
		 * @param repo The file's repository.
		 * @param file The file.
		 * @param part The part that owns it.
		 * @returns Them, each once.
		 */
		ofFile: (repo, file, part) => [...new Set([...builders(repo, file), ...holding(part)])],
		/**
		 * The runners that run some of the code of a part.
		 * @param part The part.
		 * @returns Them, each once.
		 */
		ofPart: (part) => [
			...new Set([
				...holding(part),
				...part.files.flatMap((file) => builders(part.checkout.repo, file)),
			]),
		],
	};
}

/**
 * Where a read or a setting stands, as one side of a configured path.
 * @param where Its place.
 * @param where.repo Its repository.
 * @param where.path Its file.
 * @param where.line Its line.
 * @param name The environment value's name.
 * @returns The evidence, which joins no part on its own.
 */
function sideEvidence(
	where: { readonly repo: string; readonly path: string; readonly line: number },
	name: string,
): CodeEvidence {
	const { repo, path, line } = where;
	return { kind: "configured-path", resolution: "resolved", repo, path, line, symbol: name };
}

/**
 * Keep the first piece of evidence of each place and name.
 * @param evidence The evidence.
 * @param keyOf What makes two the same.
 * @returns One of each.
 */
function firstOf(evidence: readonly CodeEvidence[], keyOf: (each: CodeEvidence) => string) {
	const kept = new Map<string, CodeEvidence>();
	for (const each of evidence) if (!kept.has(keyOf(each))) kept.set(keyOf(each), each);
	return [...kept.values()];
}

/** A read, and the runners that run its code. */
interface RunRead {
	readonly read: Read;
	readonly runners: readonly Runner[];
}

/**
 * What the settings of one runner reach for a name, as one key.
 * @param settings The runner's settings of the name.
 * @returns The ids of the parts reached, sorted.
 */
function reachedKey(settings: readonly Setting[]): string {
	const ids = settings.flatMap((setting) =>
		setting.reaches.flatMap((reach) => reach.to.map((part) => part.node.id)),
	);
	return [...new Set(ids)].toSorted().join("\0");
}

/**
 * The pieces a read gives through the runners of its code, each with its
 * partner. Where the runners do not set the name to the same parts, the check
 * cannot tell which of them runs the code, so every piece is a candidate.
 * @param run The read and the runners of its code.
 * @param lineages Each part and the parts that hold it.
 * @returns Each piece at the read and its partner at the setting.
 */
function joinedAt(
	run: RunRead,
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): [Piece, Piece][] {
	const { read } = run;
	const evidence = sideEvidence(read, read.name);
	const named = run.runners.map((runner) =>
		runner.settings.filter((setting) => setting.name === read.name),
	);
	const sure = new Set(named.map(reachedKey)).size === 1;
	return named
		.flat()
		.flatMap((setting) =>
			setting.reaches.flatMap((reach) =>
				piecesBetween(
					[read.part],
					sure ? reach : { ...reach, resolution: "candidate" },
					lineages,
					evidence,
				).map((piece): [Piece, Piece] => [
					piece,
					{ ...piece, repo: setting.repo, path: setting.path, line: setting.line },
				]),
			),
		);
}

/** What the sides of a relationship are read from. */
interface Joined {
	readonly codes: ReadonlyMap<string, PartCode>;
	readonly runners: readonly Runner[];
	readonly runs: readonly RunRead[];
	readonly running: Running;
}

/**
 * Which side of a relationship has evidence of a network hop: where the
 * infrastructure sets a value to the address of its end for the code of its
 * start, and where the code of its start reads a name that nothing sets for it.
 * @param joined The reads and the runners.
 * @param start The ids of its start and the parts inside it.
 * @param end The ids of its end and the parts inside it.
 * @returns The evidence of each side.
 */
function sidesOf(joined: Joined, start: ReadonlySet<string>, end: ReadonlySet<string>): HopSides {
	const running = new Set(
		[...start].flatMap((id) => {
			const code = joined.codes.get(id);
			return code?.status === "read" ? joined.running.ofPart(code) : [];
		}),
	);
	const settings = joined.runners
		.filter((runner) => running.has(runner))
		.flatMap((runner) => runner.settings)
		.filter((setting) =>
			setting.reaches.some((reach) => reach.to.some((part) => end.has(part.node.id))),
		)
		.map((setting) => sideEvidence(setting, setting.name));
	const unset = joined.runs
		.filter(
			({ read, runners }) =>
				start.has(read.part.node.id) &&
				!runners.some((runner) => runner.settings.some((setting) => setting.name === read.name)),
		)
		.map(({ read }) => sideEvidence(read, read.name));
	return {
		settings: firstOf(settings, (each) => `${each.path}\0${each.line}\0${each.symbol}`),
		unset: firstOf(unset, (each) => each.symbol),
	};
}

/**
 * The first join of each pair of parts, a resolved one before a candidate.
 * @param joins Each piece at a read and its partner, in the order of the reads.
 * @returns One of each pair.
 */
function firstJoins(joins: readonly [Piece, Piece][]): [Piece, Piece][] {
	const kept = new Map<string, [Piece, Piece]>();
	for (const join of joins) {
		const [piece] = join;
		const key = `${piece.from}\0${piece.to}`;
		const held = kept.get(key)?.[0];
		if (
			held === undefined ||
			(held.resolution === "candidate" && piece.resolution === "resolved")
		) {
			kept.set(key, join);
		}
	}
	return [...kept.values()];
}

/**
 * Join the environment values the code of a board's parts reads with the
 * values the infrastructure that runs that code sets.
 * @param codes Each part's bound code, by its id.
 * @param facts The pass.
 * @param runners Every runner the infrastructure readers found for the board.
 * @returns The pieces, their partners, and the sides of a relationship.
 */
async function joinEnvironment(
	codes: ReadonlyMap<string, PartCode>,
	facts: FactsPass,
	runners: readonly Runner[],
): Promise<EnvironmentJoin> {
	const lineages = lineagesOf(codes);
	const running = runningOf(runners, lineages);
	const runs: RunRead[] = [];
	for (const parts of partsByRepo(codes)) {
		// oxlint-disable-next-line no-await-in-loop -- one repository at a time, in board order
		for (const read of await readsIn(parts, facts)) {
			runs.push({ read, runners: running.ofFile(read.repo, read.path, read.part) });
		}
	}
	const partners = new Map(firstJoins(runs.flatMap((run) => joinedAt(run, lineages))));
	return {
		pieces: [...partners.keys()],
		partners,
		/**
		 * Which side of a relationship has evidence of a network hop.
		 * @param start The ids of its start and the parts inside it.
		 * @param end The ids of its end and the parts inside it.
		 * @returns The evidence of each side.
		 */
		sides: (start, end) => sidesOf({ codes, runners, runs, running }, start, end),
	};
}

export {
	type EnvironmentJoin,
	type HopSides,
	type Reach,
	type Runner,
	type Setting,
	joinEnvironment,
	partsByRepo,
	reachOf,
	runningParts,
};

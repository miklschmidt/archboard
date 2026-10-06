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
// infrastructure sets it. Both are configured-path evidence and resolved,
// because the name, the service and the build directory are all written in
// files. Evidence never joins a part to a part inside it.
//
// The reads and runners also say which side of an unsupported relationship
// has evidence: the infrastructure sets a value to the address of its end
// for the code of its start, and that code reads none of those names; or the
// code of its start reads names that nothing the check reads sets for it.

import { piecesBetween, type Piece } from "@/runtime/code-check/lib/evidence";
import {
	lineagesOf,
	ownersAtLine,
	ownersOf,
	type Owners,
} from "@/runtime/code-check/lib/ownership";
import type { PartCode, ReadPart } from "@/runtime/code-check/lib/part-code";
import type { FactsPass, FileFacts } from "@/runtime/code-facts/index";
import type { CodeEvidence } from "@/shared/code-check/index";

/**
 * The adapters that read infrastructure, where an environment name is set,
 * never read: compose files and the env files they name, Kubernetes
 * manifests, Terraform and OpenTofu.
 */
const INFRASTRUCTURE: ReadonlySet<string> = new Set(["compose", "env", "kubernetes", "terraform"]);

/** One environment value an infrastructure declaration sets, and the parts its value names. */
interface Setting {
	readonly name: string;
	readonly repo: string;
	readonly path: string;
	readonly line: number;
	/**
	 * The parts the value names. None for a value that names no part, such as
	 * a host outside the project or a name an env file sets, whose value the
	 * check never reads.
	 */
	readonly reaches: readonly ReadPart[];
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
	const byRepo = new Map<string, [ReadPart, ...ReadPart[]]>();
	for (const code of codes.values()) {
		if (code.status !== "read") continue;
		const parts = byRepo.get(code.checkout.repo);
		if (parts === undefined) byRepo.set(code.checkout.repo, [code]);
		else parts.push(code);
	}
	return [...byRepo.values()];
}

/**
 * The parts a value that names a declaration reaches, when no build says
 * which code the declaration runs: the parts the board draws inside a part
 * bound to it, whose code it runs, else the parts that own it.
 * @param codes Each part's bound code, by its id.
 * @param owners The parts that own the declaration.
 * @returns The parts.
 */
function runningParts(
	codes: ReadonlyMap<string, PartCode>,
	owners: readonly ReadPart[],
): ReadPart[] {
	const bound = new Set(
		owners.flatMap((part) => (part.grain.kind === "symbol" ? [part.node.id] : [])),
	);
	const inside = [...codes.values()].filter(
		(code): code is ReadPart =>
			code.status === "read" && code.node.parent !== undefined && bound.has(code.node.parent),
	);
	return inside.length > 0 ? inside : [...owners];
}

/**
 * Whether a directory holds a file.
 * @param directory The directory; the empty string is the whole checkout.
 * @param file The file.
 * @returns True when it does.
 */
function holds(directory: string, file: string): boolean {
	return directory === "" || file.startsWith(`${directory}/`);
}

/** Which runners run a file or a part. */
interface Running {
	/**
	 * Whether a runner runs the code of a file that a part owns.
	 * @param runner The runner.
	 * @param repo The file's repository.
	 * @param file The file.
	 * @param part The part that owns it.
	 * @returns True when it does.
	 */
	readonly file: (runner: Runner, repo: string, file: string, part: ReadPart) => boolean;
	/**
	 * Whether a runner runs some of the code of a part.
	 * @param runner The runner.
	 * @param part The part.
	 * @returns True when it does.
	 */
	readonly part: (runner: Runner, part: ReadPart) => boolean;
}

/**
 * Which runners run what: the runner that builds the deepest directory that
 * holds a file, and a runner bound to a part that is, or holds, its owner.
 * @param runners Every runner.
 * @param lineages Each part and the parts that hold it, the part first.
 * @returns The tests.
 */
function runningOf(
	runners: readonly Runner[],
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): Running {
	const directories = new Map<string, Set<string>>();
	for (const runner of runners) {
		const own = directories.get(runner.repo) ?? new Set();
		runner.directories.forEach((directory) => own.add(directory));
		directories.set(runner.repo, own);
	}
	/**
	 * The deepest directory a runner builds that holds a file.
	 * @param repo The file's repository.
	 * @param file The file.
	 * @returns The directory, or undefined when none holds it.
	 */
	const deepest = (repo: string, file: string): string | undefined =>
		[...(directories.get(repo) ?? [])]
			.filter((directory) => holds(directory, file))
			.toSorted((left, right) => right.length - left.length)[0];
	/**
	 * Whether a runner is bound to a part that is, or holds, a part.
	 * @param runner The runner.
	 * @param part The part.
	 * @returns True when it is.
	 */
	const contains = (runner: Runner, part: ReadPart): boolean => {
		const lineage = lineages.get(part.node.id);
		return runner.parts.some((bound) => lineage?.has(bound.node.id) === true);
	};
	/**
	 * Whether a runner builds the deepest directory that holds a file.
	 * @param runner The runner.
	 * @param repo The file's repository.
	 * @param file The file.
	 * @returns True when it does.
	 */
	const builds = (runner: Runner, repo: string, file: string): boolean => {
		const directory = runner.repo === repo ? deepest(repo, file) : undefined;
		return directory !== undefined && runner.directories.includes(directory);
	};
	return {
		/**
		 * Whether a runner runs the code of a file that a part owns.
		 * @param runner The runner.
		 * @param repo The file's repository.
		 * @param file The file.
		 * @param part The part that owns it.
		 * @returns True when it does.
		 */
		file: (runner, repo, file, part) => builds(runner, repo, file) || contains(runner, part),
		/**
		 * Whether a runner runs some of the code of a part.
		 * @param runner The runner.
		 * @param part The part.
		 * @returns True when it does.
		 */
		part: (runner, part) =>
			contains(runner, part) || part.files.some((file) => builds(runner, part.checkout.repo, file)),
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

/**
 * The pieces a read gives through the runners of its code, each with its partner.
 * @param read The read.
 * @param runners The runners that run its code.
 * @param lineages Each part and the parts that hold it.
 * @returns Each piece at the read and its partner at the setting.
 */
function joinedAt(
	read: Read,
	runners: readonly Runner[],
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): [Piece, Piece][] {
	const evidence = sideEvidence(read, read.name);
	return runners.flatMap((runner) =>
		runner.settings
			.filter((setting) => setting.name === read.name)
			.flatMap((setting) =>
				piecesBetween(
					[read.part],
					{ to: setting.reaches, resolution: "resolved" },
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
	readonly reads: readonly Read[];
	readonly running: Running;
	/**
	 * The runners that run the code of a read.
	 * @param read The read.
	 * @returns Them.
	 */
	readonly runnersOf: (read: Read) => Runner[];
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
	const starting = [...start].flatMap((id) => {
		const code = joined.codes.get(id);
		return code?.status === "read" ? [code] : [];
	});
	const settings = joined.runners
		.filter((runner) => starting.some((part) => joined.running.part(runner, part)))
		.flatMap((runner) => runner.settings)
		.filter((setting) => setting.reaches.some((part) => end.has(part.node.id)))
		.map((setting) => sideEvidence(setting, setting.name));
	const unset = joined.reads
		.filter(
			(read) =>
				start.has(read.part.node.id) &&
				!joined
					.runnersOf(read)
					.some((runner) => runner.settings.some((setting) => setting.name === read.name)),
		)
		.map((read) => sideEvidence(read, read.name));
	return {
		settings: firstOf(settings, (each) => `${each.path}\0${each.line}\0${each.symbol}`),
		unset: firstOf(unset, (each) => each.symbol),
	};
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
	const reads: Read[] = [];
	for (const parts of partsByRepo(codes)) {
		// oxlint-disable-next-line no-await-in-loop -- one repository at a time, in board order
		reads.push(...(await readsIn(parts, facts)));
	}
	const running = runningOf(runners, lineages);
	/**
	 * The runners that run the code of a read.
	 * @param read The read.
	 * @returns Them.
	 */
	const runnersOf = (read: Read) =>
		runners.filter((runner) => running.file(runner, read.repo, read.path, read.part));
	const partners = new Map<Piece, Piece>();
	const pairs = new Set<string>();
	for (const [piece, partner] of reads.flatMap((read) =>
		joinedAt(read, runnersOf(read), lineages),
	)) {
		const pair = `${piece.from}\0${piece.to}`;
		if (!pairs.has(pair)) partners.set(piece, partner);
		pairs.add(pair);
	}
	return {
		pieces: [...partners.keys()],
		partners,
		/**
		 * Which side of a relationship has evidence of a network hop.
		 * @param start The ids of its start and the parts inside it.
		 * @param end The ids of its end and the parts inside it.
		 * @returns The evidence of each side.
		 */
		sides: (start, end) => sidesOf({ codes, runners, reads, runnersOf, running }, start, end),
	};
}

export {
	type EnvironmentJoin,
	type HopSides,
	type Runner,
	type Setting,
	joinEnvironment,
	partsByRepo,
	runningParts,
};

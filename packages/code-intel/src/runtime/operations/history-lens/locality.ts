// Locality: which parts of a board change most often, and which change
// together (ADR 0045).
//
// A hotspot is a part that many commits of a period changed. Change coupling
// pairs the parts that the same commits changed (`coupling.ts`). The period of a
// repository is the commits on the HEAD of its checkout that were committed
// from a start up to the commit time of HEAD, the year before it by default.
// It ends at HEAD and not at the clock, so one HEAD always gives one answer.
// The lens counts commits only, not the size or the complexity of the code,
// and it leaves out large commits and says how many.
//
// One walk of each repository serves every part of the board. The walk keeps
// large commits so that a rename inside one still carries a bound file's
// history; they are left out only when each part's commits are listed.
//
// The answer is kept in memory, keyed on everything it derives from: the
// vault, the board and its version, the variant, the start of the period, and
// each checkout with its HEAD. A request that arrives while it is made waits for
// that work. Nothing is written anywhere.

import { snapshotCheckoutAccess, type CheckoutSnapshot } from "@archboard/code-binding/resolution";
import {
	attributeCommits,
	type AttributedCommits,
} from "#runtime/operations/history-lens/attribution.ts";
import { answerCommit, isoTime } from "#runtime/operations/history-lens/answer-commit.ts";
import { createAnswerMemory } from "#runtime/services/history-lens/answer-memory.ts";
import {
	isLargeCommit,
	walkCommits,
	type WalkedCommit,
} from "#runtime/operations/history-lens/commits.ts";
import { couplePairs, type CountedPart } from "#runtime/operations/history-lens/coupling.ts";
import { gitText, type GitRunOptions } from "#runtime/clients/history-lens/git.ts";
import { partReading, type ReadPart } from "#runtime/operations/history-lens/parts.ts";
import type { BehindSkip } from "#shared/protocol/code-check.ts";
import type {
	Hotspot,
	LocalityAnswer,
	LocalityCommit,
	LocalityPeriod,
} from "#shared/protocol/locality.ts";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import { LOCALITY_DEFAULT_PERIOD_MS } from "@archboard/timing";

/** How many answers the server keeps: the boards that somebody selects parts on. */
const KEPT_ANSWERS = 32;

/** The parts the lens reads in one repository, and the HEAD it reads them at. */
interface RepositoryToRead {
	readonly root: string;
	readonly head: string;
	readonly parts: ReadPart[];
}

/** One repository's period, and what it holds for each bound path. */
interface WalkedPeriod {
	readonly period: LocalityPeriod;
	readonly commits: ReadonlyMap<string, WalkedCommit>;
	readonly byPart: ReadonlyMap<string, AttributedCommits>;
}

/**
 * Sort the parts the lens read by the repository they are bound into. A part
 * whose checkout has no commit has no history to read, so it is skipped.
 * @param read The parts the lens read.
 * @param snapshot The registered checkouts.
 * @returns The repositories to walk, and the parts that have nothing to walk.
 */
function repositoriesOf(
	read: readonly ReadPart[],
	snapshot: CheckoutSnapshot,
): { repositories: Map<string, RepositoryToRead>; skipped: BehindSkip[] } {
	const repositories = new Map<string, RepositoryToRead>();
	const skipped: BehindSkip[] = [];
	for (const part of read) {
		const head = snapshot.inspection(part.repo)?.head?.commit;
		if (head === undefined) {
			skipped.push({
				subject: { kind: "node", id: part.node.id, name: part.node.name },
				reason: "checkout-unavailable",
				repo: part.repo,
				detail: "The checkout has no commit.",
			});
			continue;
		}
		const repository = repositories.get(part.repo) ?? { root: part.root, head, parts: [] };
		repository.parts.push(part);
		repositories.set(part.repo, repository);
	}
	return { repositories, skipped };
}

/**
 * Walk one repository over its period, once for every part bound into it.
 * @param repo The repository's identity.
 * @param repository What to read there.
 * @param since The start the caller named, or undefined for the year before HEAD.
 * @param options The caller's signal.
 * @returns The period, and the commits that changed each bound path.
 */
async function walkPeriod(
	repo: string,
	repository: RepositoryToRead,
	since: Date | undefined,
	options: GitRunOptions,
): Promise<WalkedPeriod> {
	const { root, head, parts } = repository;
	const untilSeconds = Number(
		(await gitText(root, ["log", "-1", "--format=%ct", head], options)).trim(),
	);
	const sinceSeconds =
		since === undefined
			? untilSeconds - Math.floor(LOCALITY_DEFAULT_PERIOD_MS / 1000)
			: Math.floor(since.getTime() / 1000);
	// `--max-age` takes the seconds as they are. Git's date parser reads
	// `--since=@<seconds>` as a time only from 100000000 (1973) on, and a start
	// before that would read as now and count nothing. A start at or before
	// 1970 limits nothing.
	const limit = sinceSeconds > 0 ? [`--max-age=${sinceSeconds}`] : [];
	const walked = await walkCommits(root, [...limit, head], options);
	return {
		period: { repo, head, since: isoTime(sinceSeconds), until: isoTime(untilSeconds) },
		commits: new Map(walked.map((commit) => [commit.commit, commit])),
		byPart: await attributeCommits(root, head, walked, parts, options),
	};
}

/** What one part's commits are, split at the size filter. */
interface PartCommits {
	/** The commits that count, newest first. */
	readonly counted: readonly WalkedCommit[];
	/** How many large commits changed the part and so were left out. */
	readonly large: readonly string[];
}

/**
 * Split the commits of one part into those that count and large ones.
 * @param part The part.
 * @param walk The walk of its repository.
 * @returns The commits that count, and the large ones.
 */
function commitsOfPart(part: ReadPart, walk: WalkedPeriod): PartCommits {
	const counted: WalkedCommit[] = [];
	const large: string[] = [];
	for (const id of walk.byPart.get(part.node.id)?.commits ?? []) {
		const commit = walk.commits.get(id);
		if (commit === undefined) continue;
		if (isLargeCommit(commit)) large.push(id);
		else counted.push(commit);
	}
	return { counted, large };
}

/**
 * Keep precision about the commits locality actually counts. A large commit's
 * fallback must not make precise ordinary commits look path-wide to coupling.
 * @param attribution The unfiltered history attribution.
 * @param counted The commits left after the size filter.
 * @returns Attribution for the counted commits.
 */
function countedAttribution(
	attribution: AttributedCommits["attribution"],
	counted: readonly WalkedCommit[],
): AttributedCommits["attribution"] {
	if (attribution.fallback === undefined) return attribution;
	const ids = new Set(counted.map((commit) => commit.commit));
	const fallback = attribution.fallback.map((entry) => ({
		...entry,
		commits: entry.commits.filter((id) => ids.has(id)),
	}));
	if (attribution.mode === "mixed" && fallback.every((entry) => entry.commits.length === 0))
		return { mode: "symbol", symbol: attribution.symbol };
	return { ...attribution, fallback };
}

/** Every part the lens read, ranked, with the commits the ranking lists. */
interface Ranking {
	readonly hotspots: Hotspot[];
	readonly commits: LocalityCommit[];
	readonly large: number;
}

/**
 * Rank the parts by the commits that count, and note every large commit that
 * the ranking left out.
 * @param split Each part the lens read, in the variant's order, with its commits split at the size filter.
 * @returns The ranking.
 */
function rank(split: readonly (CountedPart & PartCommits)[]): Ranking {
	const commits = new Map(
		split.flatMap(({ part, counted }) =>
			counted.map((commit): [string, LocalityCommit] => [
				`${part.repo}\0${commit.commit}`,
				answerCommit(part.repo, commit),
			]),
		),
	);
	return {
		hotspots: split
			.map(({ part, counted, attribution }) => ({
				subject: { kind: "node" as const, id: part.node.id, name: part.node.name },
				repo: part.repo,
				path: part.node.binding?.path ?? part.path,
				commits: counted.map((commit) => commit.commit),
				count: counted.length,
				attribution,
			}))
			.toSorted((left, right) => right.count - left.count),
		commits: [...commits.values()].toSorted((left, right) =>
			right.committedAt.localeCompare(left.committedAt),
		),
		large: new Set(split.flatMap(({ part, large }) => large.map((id) => `${part.repo}\0${id}`)))
			.size,
	};
}

/**
 * Read locality: every part the lens reads, ranked by the commits of the
 * period that changed its bound files, and the pairs those commits couple.
 * @param board The board.
 * @param variant The variant to read.
 * @param snapshot The registered checkouts and what each has out.
 * @param since The start of the period, or undefined for the year before each HEAD.
 * @param options The caller's signal.
 * @returns The answer.
 */
async function readLocality(
	board: SemanticBoard,
	variant: SemanticVariant,
	snapshot: CheckoutSnapshot,
	since: Date | undefined,
	options: GitRunOptions,
): Promise<LocalityAnswer> {
	const reading = partReading(variant.content, snapshot);
	const { repositories, skipped } = repositoriesOf(reading.read, snapshot);
	const walks = new Map(
		await Promise.all(
			[...repositories].map(async ([repo, repository]): Promise<[string, WalkedPeriod]> => [
				repo,
				await walkPeriod(repo, repository, since, options),
			]),
		),
	);
	const split = reading.read.flatMap((part) => {
		const walk = walks.get(part.repo);
		if (walk === undefined) return [];
		const commits = commitsOfPart(part, walk);
		const attributed = walk.byPart.get(part.node.id);
		return [
			{
				part,
				...commits,
				attribution: countedAttribution(
					attributed?.attribution ?? { mode: "path" },
					commits.counted,
				),
				sites: attributed?.sites ?? [],
			},
		];
	});
	const ranking = rank(split);
	return {
		board: board.name,
		version: board.version,
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		periods: [...walks.values()].map((walk) => walk.period),
		commits: ranking.commits,
		hotspots: ranking.hotspots,
		coupling: couplePairs(split, variant.content),
		leftOut: { largeCommits: ranking.large },
		skipped: [...reading.skipped, ...skipped],
	};
}

/** The reading of locality of a variant already chosen (`locality-reading.ts`), with the memory of its answers. */
interface VariantLocality {
	/**
	 * The hotspots and change coupling of one variant of one board.
	 * @param vault The vault directory the board is in: its own checkout is read for its own repository.
	 * @param board The board as the store read it.
	 * @param variant The variant to read: the current one, or a draft.
	 * @param since The start of the period, or undefined for the year before each HEAD.
	 * @param signal Cancels the reading and every Git command it runs, once no other request waits for it.
	 * @returns The answer.
	 */
	read(
		vault: string,
		board: SemanticBoard,
		variant: SemanticVariant,
		since: Date | undefined,
		signal?: AbortSignal,
	): Promise<LocalityAnswer>;
}

/**
 * A reading of locality that keeps its answers while nothing they derive from
 * has moved: the vault, the board's version, the variant, the start of the
 * period, and each checkout with its HEAD.
 * @returns The reading.
 */
function createVariantLocality(): VariantLocality {
	const memory = createAnswerMemory<LocalityAnswer>(KEPT_ANSWERS);
	return {
		/**
		 * Read, or answer from memory.
		 * @param vault The vault directory.
		 * @param board The board.
		 * @param variant The variant.
		 * @param since The start of the period.
		 * @param signal Cancels the reading.
		 * @returns The answer.
		 */
		async read(vault, board, variant, since, signal) {
			const bindings = variant.content.nodes.flatMap((node) =>
				node.binding === undefined ? [] : [node.binding],
			);
			const snapshot = await snapshotCheckoutAccess({
				vault,
				...(signal === undefined ? {} : { signal }),
				bindings,
			});
			// Only the checkouts the parts are bound into: a commit in another
			// registered repository changes nothing this answer says.
			const repos = [...new Set(bindings.map((binding) => binding.repo))].toSorted();
			// A board's id and version name its content within one vault only: two
			// worktrees of one repository hold copies that can each have moved on.
			const key = JSON.stringify({
				vault,
				board: board.id,
				version: board.version,
				variant: variant.id,
				since: since?.toISOString() ?? null,
				checkouts: repos.map((repo) => [repo, snapshot.inspection(repo) ?? null]),
			});
			return await memory.answer(
				key,
				(stop) => readLocality(board, variant, snapshot, since, { signal: stop }),
				signal,
			);
		},
	};
}

export { type VariantLocality, createVariantLocality };

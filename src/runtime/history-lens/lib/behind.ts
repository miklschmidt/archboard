// How far each board is behind its code (ADR 0045).
//
// A board is behind by the commits that changed a part's bound files after its
// last change. The last change carries into each bound repository in one of
// two ways. If the checkout has that commit, the board is behind by the
// commits on its HEAD that are not in the commit's history: a vault in the
// repository it describes reads it this way, and a commit that carries a board
// change with its code counts for nothing. Otherwise it is behind by the
// commits on HEAD committed after the time of that commit, because time is the
// only order two repositories share.
//
// One walk of each repository serves every board of one request. The answer is
// kept in memory, keyed on everything it derives from: the version of each
// board, each checkout with its HEAD, and the HEAD of the vault's checkout.
// Nothing is written anywhere, and the memory goes with the process.

import fs from "node:fs";
import { snapshotCheckoutAccess, type CheckoutSnapshot } from "@archboard/code-binding/resolution";
import { isoTime, markedCommit } from "@/runtime/history-lens/lib/answer-commit";
import {
	commitsByBoundPath,
	walkCommits,
	type WalkedCommit,
} from "@/runtime/history-lens/lib/commits";
import { gitAnswer, gitSays, gitText, type GitRunOptions } from "@/runtime/history-lens/lib/git";
import { lastChangeOf, type LastChange } from "@/runtime/history-lens/lib/last-change";
import { partReading, type PartReading, type ReadPart } from "@/runtime/history-lens/lib/parts";
import type { BehindCommit, BoardBehind } from "@/shared/code-check/index";
import type { CodeBinding } from "@archboard/code-binding/bindings";
import { currentVariant, type SemanticBoard } from "@archboard/board/document";

/** One board to read, as the store read it, and the file it lives in. */
interface BoardToRead {
	readonly board: SemanticBoard;
	readonly file: string;
}

/** One board on its way to an answer. */
interface BoardInProgress {
	readonly board: SemanticBoard;
	readonly variant: string;
	readonly lastChange: LastChange;
	readonly parts: PartReading;
}

/** What the boards of one request read in one repository. */
interface RepositoryRead {
	readonly root: string;
	readonly paths: Set<string>;
	/** Each distinct last change of a board that reads the repository, with its time. */
	readonly lastChanges: Map<string, number>;
}

/** One repository, walked once for every board of a request. */
interface WalkedRepository {
	readonly commits: ReadonlyMap<string, WalkedCommit>;
	readonly byPath: ReadonlyMap<string, readonly string[]>;
	/** For each last change, the commits that count after it. */
	readonly counted: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * The commits on a checkout's HEAD that count after one last change: those
 * not in its history when the checkout has it, else those committed after its
 * time. Merges count for nothing of their own.
 * @param root The checkout.
 * @param commit The last change's commit.
 * @param committedAt Its time, in seconds.
 * @param options The caller's signal.
 * @returns The ids of the commits.
 */
async function countedAfter(
	root: string,
	commit: string,
	committedAt: number,
	options: GitRunOptions,
): Promise<Set<string>> {
	if (await gitSays(root, ["cat-file", "-e", `${commit}^{commit}`], options)) {
		const listed = await gitText(root, ["rev-list", "--no-merges", "HEAD", `^${commit}`], options);
		return new Set(listed.split("\n").filter((line) => line !== ""));
	}
	const listed = await gitText(
		root,
		["log", "--no-merges", "--format=%H %ct", `--since=@${committedAt}`, "HEAD"],
		options,
	);
	return new Set(
		listed.split("\n").flatMap((line) => {
			const [id = "", time = "0"] = line.split(" ");
			return id !== "" && Number(time) > committedAt ? [id] : [];
		}),
	);
}

/**
 * What the boards read in each repository.
 * @param boards The boards, with their last changes and parts.
 * @returns Each repository by identity.
 */
function repositoriesOf(boards: readonly BoardInProgress[]): Map<string, RepositoryRead> {
	const repositories = new Map<string, RepositoryRead>();
	for (const { lastChange, parts } of boards) {
		for (const part of parts.read) {
			const read = repositories.get(part.repo) ?? {
				root: part.root,
				paths: new Set<string>(),
				lastChanges: new Map<string, number>(),
			};
			read.paths.add(part.path);
			if (lastChange.kind === "commit")
				read.lastChanges.set(lastChange.commit, lastChange.committedAt);
			repositories.set(part.repo, read);
		}
	}
	return repositories;
}

/**
 * Walk one repository once, over every commit any board counts there.
 * @param read What the boards read there.
 * @param hasHead Whether its checkout has a commit out at all.
 * @param options The caller's signal.
 * @returns The walk.
 */
async function walkRepository(
	read: RepositoryRead,
	hasHead: boolean,
	options: GitRunOptions,
): Promise<WalkedRepository> {
	const counted = new Map(
		await Promise.all(
			[...read.lastChanges].map(async ([commit, time]): Promise<[string, Set<string>]> => [
				commit,
				hasHead ? await countedAfter(read.root, commit, time, options) : new Set(),
			]),
		),
	);
	const union = new Set([...counted.values()].flatMap((ids) => [...ids]));
	const walked =
		union.size === 0
			? []
			: await walkCommits(read.root, ["--no-walk", "--stdin"], {
					...options,
					input: `${[...union].join("\n")}\n`,
				});
	return {
		commits: new Map(walked.map((commit) => [commit.commit, commit])),
		byPath: commitsByBoundPath(walked, read.paths),
		counted,
	};
}

/**
 * Walk every repository the boards read, each once and all at the same time.
 * @param boards The boards.
 * @param snapshot The registered checkouts.
 * @param options The caller's signal.
 * @returns Each repository's walk, by identity.
 */
async function walkRepositories(
	boards: readonly BoardInProgress[],
	snapshot: CheckoutSnapshot,
	options: GitRunOptions,
): Promise<Map<string, WalkedRepository>> {
	return new Map(
		await Promise.all(
			[...repositoriesOf(boards)].map(async ([repo, read]): Promise<[string, WalkedRepository]> => [
				repo,
				await walkRepository(read, snapshot.inspection(repo)?.head?.commit !== undefined, options),
			]),
		),
	);
}

/**
 * The commits that count against one part, newest first.
 * @param walk The walk of its repository.
 * @param part The part.
 * @param lastChange The commit of the board's last change, or undefined when no commit holds it yet.
 * @returns The commits.
 */
function countedAgainst(
	walk: WalkedRepository | undefined,
	part: ReadPart,
	lastChange: string | undefined,
): WalkedCommit[] {
	const counted = lastChange === undefined ? undefined : walk?.counted.get(lastChange);
	return (walk?.byPath.get(part.path) ?? []).flatMap((id) => {
		const commit = walk?.commits.get(id);
		return commit !== undefined && counted?.has(id) === true ? [commit] : [];
	});
}

/**
 * One board's answer, from the walks.
 * @param board The board on its way.
 * @param walks Every repository's walk.
 * @returns How far it is behind, per board and per part.
 */
function answerFor(
	board: BoardInProgress,
	walks: ReadonlyMap<string, WalkedRepository>,
): BoardBehind {
	const { lastChange, parts, variant } = board;
	if (lastChange.kind === "unknown") return { board: board.board.name, variant, lastChange };
	const since = lastChange.kind === "commit" ? lastChange.commit : undefined;
	const commits = new Map<string, BehindCommit>();
	const answerParts = parts.read.map((part) => {
		const counted = countedAgainst(walks.get(part.repo), part, since);
		for (const commit of counted) {
			commits.set(`${part.repo}\0${commit.commit}`, markedCommit(part.repo, commit));
		}
		return {
			subject: { kind: "node" as const, id: part.node.id, name: part.node.name },
			repo: part.repo,
			path: part.node.binding?.path ?? part.path,
			commits: counted.map((commit) => commit.commit),
		};
	});
	return {
		board: board.board.name,
		variant,
		lastChange:
			lastChange.kind === "commit"
				? {
						kind: "commit",
						commit: lastChange.commit,
						committedAt: isoTime(lastChange.committedAt),
					}
				: lastChange,
		commits: [...commits.values()].toSorted((left, right) =>
			right.committedAt.localeCompare(left.committedAt),
		),
		parts: answerParts,
		skipped: [...parts.skipped],
	};
}

/**
 * The root of the Git checkout that holds the vault.
 * @param vault The vault directory.
 * @param options The caller's signal.
 * @returns The root, or undefined when the vault is in no repository.
 */
async function vaultCheckoutOf(vault: string, options: GitRunOptions): Promise<string | undefined> {
	const root = await gitAnswer(vault, ["rev-parse", "--show-toplevel"], options);
	return root === undefined || root === "" ? undefined : fs.realpathSync.native(root);
}

/**
 * Read how far boards are behind, with every Git command this needs.
 * @param boards The boards, each with a current variant.
 * @param vaultRoot The vault's checkout, or undefined.
 * @param snapshot The registered checkouts.
 * @param options The caller's signal.
 * @returns One answer per board, in the order given.
 */
async function readBehind(
	boards: readonly BoardToRead[],
	vaultRoot: string | undefined,
	snapshot: CheckoutSnapshot,
	options: GitRunOptions,
): Promise<BoardBehind[]> {
	const inProgress = await Promise.all(
		boards.flatMap(({ board, file }) => {
			const variant = currentVariant(board);
			if (variant === undefined) return [];
			return [
				(async (): Promise<BoardInProgress> => ({
					board,
					variant: variant.id,
					lastChange: await lastChangeOf(board, fs.realpathSync.native(file), vaultRoot, options),
					parts: partReading(variant.content, snapshot),
				}))(),
			];
		}),
	);
	const repositories = await walkRepositories(inProgress, snapshot, options);
	return inProgress.map((board) => answerFor(board, repositories));
}

/**
 * Every binding of the current variants, so one snapshot holds their paths.
 * @param boards The boards.
 * @returns The bindings.
 */
function bindingsOf(boards: readonly BoardToRead[]): CodeBinding[] {
	return boards.flatMap(({ board }) =>
		(currentVariant(board)?.content.nodes ?? []).flatMap((node) =>
			node.binding === undefined ? [] : [node.binding],
		),
	);
}

/**
 * Everything an answer derives from: the version of each board, each checkout
 * with its HEAD, and the HEAD of the vault's checkout.
 * @param boards The boards.
 * @param vaultRoot The vault's checkout.
 * @param snapshot The registered checkouts.
 * @param options The caller's signal.
 * @returns The key.
 */
async function memoryKey(
	boards: readonly BoardToRead[],
	vaultRoot: string | undefined,
	snapshot: CheckoutSnapshot,
	options: GitRunOptions,
): Promise<string> {
	const vaultHead =
		vaultRoot === undefined
			? undefined
			: await gitAnswer(vaultRoot, ["rev-parse", "--verify", "--quiet", "HEAD"], options);
	return JSON.stringify({
		vaultRoot,
		vaultHead,
		boards: boards.map(({ board, file }) => [file, board.version]),
		checkouts: snapshot.entries.map((entry) => [entry.repo, snapshot.inspection(entry.repo)]),
	});
}

/** The reading of behind, with the memory of its last answer. */
interface BehindReading {
	/**
	 * How far each board is behind its code.
	 * @param vault The vault directory.
	 * @param boards The boards to read, each with a current variant.
	 * @param signal Cancels the reading and every Git command it runs.
	 * @returns One answer per board with a current variant, in the order given.
	 */
	read(vault: string, boards: readonly BoardToRead[], signal?: AbortSignal): Promise<BoardBehind[]>;
}

/**
 * A reading of behind that keeps its last answer while nothing it derives
 * from has moved: no board's version, no checkout or its HEAD, and not the
 * HEAD of the vault's checkout.
 * @returns The reading.
 */
function createBehindReading(): BehindReading {
	let memory: { readonly key: string; readonly answer: BoardBehind[] } | undefined;
	return {
		/**
		 * Read, or answer from memory when nothing the answer derives from moved.
		 * @param vault The vault directory.
		 * @param boards The boards to read.
		 * @param signal Cancels the reading.
		 * @returns One answer per board with a current variant.
		 */
		async read(vault, boards, signal) {
			const options = { signal };
			const [vaultRoot, snapshot] = await Promise.all([
				vaultCheckoutOf(vault, options),
				snapshotCheckoutAccess({
					vault,
					...(signal === undefined ? {} : { signal }),
					bindings: bindingsOf(boards),
					timeoutMs: null,
				}),
			]);
			const key = await memoryKey(boards, vaultRoot, snapshot, options);
			if (memory?.key === key) return memory.answer;
			const answer = await readBehind(boards, vaultRoot, snapshot, options);
			memory = { key, answer };
			return answer;
		},
	};
}

export { type BehindReading, type BoardToRead, createBehindReading };

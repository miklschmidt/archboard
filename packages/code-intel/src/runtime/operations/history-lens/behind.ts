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
import { isoTime, markedCommit } from "#runtime/operations/history-lens/answer-commit.ts";
import {
	commitsByBoundPath,
	walkCommits,
	type WalkedCommit,
} from "#runtime/operations/history-lens/commits.ts";
import {
	gitAnswer,
	gitSays,
	gitText,
	type GitRunOptions,
} from "#runtime/clients/history-lens/git.ts";
import { lastChangeOf, type LastChange } from "#runtime/operations/history-lens/last-change.ts";
import {
	partReading,
	type PartReading,
	type ReadPart,
} from "#runtime/operations/history-lens/parts.ts";
import type { BehindCommit, ModelBehind } from "#shared/protocol/code-check.ts";
import type { CodeBinding } from "@archboard/code-binding/bindings";
import { currentVariant, type LegacyBoard } from "@archboard/model/legacy-board";

/** One board to read, as the store read it, and the file it lives in. */
interface StateToRead {
	readonly document: LegacyBoard;
	readonly file: string;
}

/** One board on its way to an answer. */
interface StateInProgress {
	readonly document: LegacyBoard;
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
 * @param states The boards, with their last changes and parts.
 * @returns Each repository by identity.
 */
function repositoriesOf(states: readonly StateInProgress[]): Map<string, RepositoryRead> {
	const repositories = new Map<string, RepositoryRead>();
	for (const { lastChange, parts } of states) {
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
 * @param states The boards.
 * @param snapshot The registered checkouts.
 * @param options The caller's signal.
 * @returns Each repository's walk, by identity.
 */
async function walkRepositories(
	states: readonly StateInProgress[],
	snapshot: CheckoutSnapshot,
	options: GitRunOptions,
): Promise<Map<string, WalkedRepository>> {
	return new Map(
		await Promise.all(
			[...repositoriesOf(states)].map(async ([repo, read]): Promise<[string, WalkedRepository]> => [
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
 * @param document The board on its way.
 * @param walks Every repository's walk.
 * @returns How far it is behind, per board and per part.
 */
function answerFor(
	document: StateInProgress,
	walks: ReadonlyMap<string, WalkedRepository>,
): ModelBehind {
	const { lastChange, parts, variant } = document;
	if (lastChange.kind === "unknown") return { model: document.document.name, variant, lastChange };
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
		model: document.document.name,
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
 * @param states The boards, each with a current variant.
 * @param vaultRoot The vault's checkout, or undefined.
 * @param snapshot The registered checkouts.
 * @param options The caller's signal.
 * @returns One answer per board, in the order given.
 */
async function readBehind(
	states: readonly StateToRead[],
	vaultRoot: string | undefined,
	snapshot: CheckoutSnapshot,
	options: GitRunOptions,
): Promise<ModelBehind[]> {
	const inProgress = await Promise.all(
		states.flatMap(({ document, file }) => {
			const variant = currentVariant(document);
			if (variant === undefined) return [];
			return [
				(async (): Promise<StateInProgress> => ({
					document,
					variant: variant.id,
					lastChange: await lastChangeOf(
						document,
						fs.realpathSync.native(file),
						vaultRoot,
						options,
					),
					parts: partReading(variant.content, snapshot),
				}))(),
			];
		}),
	);
	const repositories = await walkRepositories(inProgress, snapshot, options);
	return inProgress.map((document) => answerFor(document, repositories));
}

/**
 * Every binding of the current variants, so one snapshot holds their paths.
 * @param states The boards.
 * @returns The bindings.
 */
function bindingsOf(states: readonly StateToRead[]): CodeBinding[] {
	return states.flatMap(({ document }) =>
		(currentVariant(document)?.content.nodes ?? []).flatMap((node) =>
			node.binding === undefined ? [] : [node.binding],
		),
	);
}

/**
 * Everything an answer derives from: the version of each board, each checkout
 * with its HEAD, and the HEAD of the vault's checkout.
 * @param states The boards.
 * @param vaultRoot The vault's checkout.
 * @param snapshot The registered checkouts.
 * @param options The caller's signal.
 * @returns The key.
 */
async function memoryKey(
	states: readonly StateToRead[],
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
		states: states.map(({ document, file }) => [file, document.version]),
		checkouts: snapshot.entries.map((entry) => [entry.repo, snapshot.inspection(entry.repo)]),
	});
}

/** The reading of behind, with the memory of its last answer. */
interface BehindReading {
	/**
	 * How far each board is behind its code.
	 * @param vault The vault directory.
	 * @param states The boards to read, each with a current variant.
	 * @param signal Cancels the reading and every Git command it runs.
	 * @returns One answer per board with a current variant, in the order given.
	 */
	read(vault: string, states: readonly StateToRead[], signal?: AbortSignal): Promise<ModelBehind[]>;
}

/**
 * A reading of behind that keeps its last answer while nothing it derives
 * from has moved: no board's version, no checkout or its HEAD, and not the
 * HEAD of the vault's checkout.
 * @returns The reading.
 */
function createBehindReading(): BehindReading {
	let memory: { readonly key: string; readonly answer: ModelBehind[] } | undefined;
	return {
		/**
		 * Read, or answer from memory when nothing the answer derives from moved.
		 * @param vault The vault directory.
		 * @param states The boards to read.
		 * @param signal Cancels the reading.
		 * @returns One answer per board with a current variant.
		 */
		async read(vault, states, signal) {
			const options = { signal };
			const [vaultRoot, snapshot] = await Promise.all([
				vaultCheckoutOf(vault, options),
				snapshotCheckoutAccess({
					vault,
					...(signal === undefined ? {} : { signal }),
					bindings: bindingsOf(states),
					timeoutMs: null,
				}),
			]);
			const key = await memoryKey(states, vaultRoot, snapshot, options);
			if (memory?.key === key) return memory.answer;
			const answer = await readBehind(states, vaultRoot, snapshot, options);
			memory = { key, answer };
			return answer;
		},
	};
}

export { type BehindReading, type StateToRead, createBehindReading };

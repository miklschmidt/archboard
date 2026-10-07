// One attribution policy serves both locality and footprint. Large commits
// remain in this walk; each caller applies its existing counting policy.
import { posix } from "node:path";
import { commitsByBoundPath, type WalkedCommit } from "@/runtime/history-lens/lib/commits";
import { gitText, type GitRunOptions } from "@/runtime/history-lens/lib/git";
import type { ReadPart } from "@/runtime/history-lens/lib/parts";
import { sourceHistory, type SourceRevision } from "@/runtime/history-lens/lib/source-history";
import {
	readSymbol,
	type DeclarationSource,
	type SymbolReading,
} from "@/runtime/history-lens/lib/symbol-attribution";
import type { HistoryAttribution } from "@/shared/history-attribution/index";
import { filesOfBinding } from "@/shared/code-target/index";

interface AttributedCommits {
	readonly commits: readonly string[];
	readonly attribution: HistoryAttribution;
	/**
	 * Historical declaration ranges, used to exclude duplicate ownership in coupling.
	 */
	readonly sites: readonly DeclarationSource[];
}

/**
 * Historical names of bound files and Terraform roots, without rewriting bindings.
 * @param paths The names after the commit.
 * @param commit The changes, including renames.
 * @returns Names to read before the commit.
 */
function formerPaths(paths: readonly string[], commit: WalkedCommit): string[] {
	const former = new Set(paths);
	for (const change of commit.changes) {
		if (change.from === undefined) continue;
		for (const path of paths) {
			if (path === change.path) {
				former.delete(path);
				former.add(change.from);
			} else if (path === posix.dirname(change.path)) former.add(posix.dirname(change.from));
		}
	}
	return [...former];
}

/**
 * Whether a commit changes a binding's names at this point in its history.
 * @param paths The binding's current historical names.
 * @param commit The commit's changes.
 * @returns Whether any named file changed or moved.
 */
function changesBoundPath(paths: readonly string[], commit: WalkedCommit): boolean {
	const files = commit.changes.flatMap((change) =>
		change.from === undefined ? [change.path] : [change.path, change.from],
	);
	return paths.some((path) => filesOfBinding(path, files).length > 0);
}

/**
 * Whether two resolved readings show an actual declaration change.
 * @param before The parent declaration.
 * @param after The commit declaration.
 * @returns Whether source or path changed.
 */
function declarationChanged(before: SymbolReading, after: SymbolReading): boolean {
	if (before.kind === "found" && after.kind === "found") {
		return before.site.path !== after.site.path || before.site.text !== after.site.text;
	}
	return before.kind === "found" || after.kind === "found";
}

/**
 * Mutable reading of one symbol during a newest-first walk.
 */
interface SymbolState {
	readonly part: ReadPart;
	readonly symbol: string;
	readonly pathCommits: ReadonlySet<string>;
	paths: string[];
	found: boolean;
	unsupportedSource: boolean;
	readonly commits: Set<string>;
	readonly unsupported: Set<string>;
	readonly sites: Map<string, DeclarationSource>;
}

/**
 * Remember resolved ownership and whether any revision needs fallback.
 * @param state The symbol reading.
 * @param reading Its declaration in a revision.
 */
function remember(state: SymbolState, reading: SymbolReading): void {
	if (reading.kind === "unsupported") state.unsupportedSource = true;
	if (reading.kind !== "found") return;
	state.found = true;
	state.sites.set(`${reading.site.path}\0${reading.site.symbol}`, reading.site);
}

/**
 * Read the first parent of every non-merge commit in one process.
 * @param root The checkout.
 * @param walked The commits.
 * @param options Cancellation.
 * @returns Each commit with its parent, absent for an initial commit.
 */
async function parentsOf(
	root: string,
	walked: readonly WalkedCommit[],
	options: GitRunOptions,
): Promise<Map<string, string | undefined>> {
	if (walked.length === 0) return new Map();
	const lines = await gitText(root, ["rev-list", "--parents", "--no-walk", "--stdin"], {
		...options,
		input: `${walked.map((commit) => commit.commit).join("\n")}\n`,
	});
	return new Map(
		lines
			.trim()
			.split("\n")
			.map((line) => {
				const [id = "", parent] = line.split(" ");
				return [id, parent];
			}),
	);
}

/**
 * Compare a declaration across one commit.
 * @param state Its history so far.
 * @param commit The commit.
 * @param before The parent sources.
 * @param after The commit sources.
 */
async function readChange(
	state: SymbolState,
	commit: WalkedCommit,
	before: SourceRevision,
	after: SourceRevision,
): Promise<void> {
	const [previous, next] = await Promise.all([
		readSymbol(before, formerPaths(state.paths, commit), state.symbol),
		readSymbol(after, state.paths, state.symbol),
	]);
	remember(state, previous);
	remember(state, next);
	if (previous.kind === "unsupported" || next.kind === "unsupported") {
		if (changesBoundPath(state.paths, commit)) state.unsupported.add(commit.commit);
	} else if (declarationChanged(previous, next)) state.commits.add(commit.commit);
}

/**
 * A Terraform change can affect local modules outside a bound root.
 * @param commit The changed paths.
 * @returns Whether a configuration file changed.
 */
function terraformChanged(commit: WalkedCommit): boolean {
	return commit.changes.some(
		(change) => /\.(tf|tofu)$/u.test(change.path) || /\.(tf|tofu)$/u.test(change.from ?? ""),
	);
}

/**
 * Walk in order so renames advance each binding's historical names.
 * @param states The bound symbols.
 * @param walked The commits, newest first.
 * @param history The shared source reader.
 * @param parents Each commit's first parent.
 * @param options Cancellation.
 */
async function readChanges(
	states: readonly SymbolState[],
	walked: readonly WalkedCommit[],
	history: ReturnType<typeof sourceHistory>,
	parents: ReadonlyMap<string, string | undefined>,
	options: GitRunOptions,
): Promise<void> {
	await walked.reduce(async (previous, commit) => {
		await previous;
		options.signal?.throwIfAborted();
		const terraform = terraformChanged(commit);
		const candidates = states.filter((state) => changesBoundPath(state.paths, commit) || terraform);
		if (candidates.length > 0) {
			const after = await history.read(commit.commit);
			const before = await history.read(parents.get(commit.commit));
			await Promise.all(candidates.map((state) => readChange(state, commit, before, after)));
		}
		for (const state of states) state.paths = formerPaths(state.paths, commit);
	}, Promise.resolve());
}

/**
 * Describe the precision of a completed symbol walk.
 * @param state The completed reading.
 * @param fallback Its fallback commit ids.
 * @returns Machine-readable attribution.
 */
function precision(state: SymbolState, fallback: readonly string[]): HistoryAttribution {
	if (state.found && fallback.length === 0) return { mode: "symbol", symbol: state.symbol };
	return {
		mode: state.found ? "mixed" : "path",
		symbol: state.symbol,
		fallback: [
			{ reason: state.unsupportedSource ? "unsupported" : "unresolved", commits: [...fallback] },
		],
	};
}

/**
 * Finish one symbol's answer, preserving Git's order.
 * @param state The completed reading.
 * @param walked The commits.
 * @returns Attributed commits and declaration ownership.
 */
function symbolAnswer(state: SymbolState, walked: readonly WalkedCommit[]): AttributedCommits {
	const fallback = state.found ? [...state.unsupported] : [...state.pathCommits];
	const commits = new Set([...state.commits, ...fallback]);
	return {
		commits: walked.filter((commit) => commits.has(commit.commit)).map((commit) => commit.commit),
		attribution: precision(state, fallback),
		sites: [...state.sites.values()],
	};
}

/**
 * Start a symbol reading; path-only parts need no parsing.
 * @param part The bound part.
 * @param byPath The existing path attribution.
 * @returns One reading or none for a symbol-less binding.
 */
function symbolState(
	part: ReadPart,
	byPath: ReadonlyMap<string, readonly string[]>,
): SymbolState[] {
	const symbol = part.node.binding?.symbol;
	if (symbol === undefined) return [];
	return [
		{
			part,
			symbol,
			pathCommits: new Set(byPath.get(part.path) ?? []),
			paths: [part.path],
			found: false,
			unsupportedSource: false,
			commits: new Set(),
			unsupported: new Set(),
			sites: new Map(),
		},
	];
}

/**
 * Assign commits to bound declarations, using the same policy for both commands.
 * @param root The checkout.
 * @param head Its immutable HEAD.
 * @param walked The commits, including large commits.
 * @param parts The bound parts.
 * @param options Cancellation.
 * @returns Attribution for every part id.
 */
async function attributeCommits(
	root: string,
	head: string,
	walked: readonly WalkedCommit[],
	parts: readonly ReadPart[],
	options: GitRunOptions,
): Promise<Map<string, AttributedCommits>> {
	const byPath = commitsByBoundPath(
		walked,
		parts.map((part) => part.path),
	);
	const answers = new Map<string, AttributedCommits>(
		parts.map((part) => [
			part.node.id,
			{
				commits: byPath.get(part.path) ?? [],
				attribution: { mode: "path" },
				sites: [],
			},
		]),
	);
	const states = parts.flatMap((part) => symbolState(part, byPath));
	if (states.length === 0) return answers;
	const allPaths = states.flatMap((state) =>
		walked.reduce(
			(paths, commit) => [...new Set([...paths, ...formerPaths(paths, commit)])],
			state.paths,
		),
	);
	const history = sourceHistory(root, allPaths, options);
	const headRevision = await history.read(head);
	await Promise.all(
		states.map(async (state) =>
			remember(state, await readSymbol(headRevision, state.paths, state.symbol)),
		),
	);
	await readChanges(states, walked, history, await parentsOf(root, walked, options), options);
	for (const state of states) answers.set(state.part.node.id, symbolAnswer(state, walked));
	return answers;
}

export { attributeCommits, type AttributedCommits };

// One attribution policy serves both locality and footprint. Large commits
// remain in this walk; each caller applies its existing counting policy.
import { posix } from "node:path";
import {
	commitsByBoundPath,
	netChange,
	type WalkedCommit,
} from "#runtime/history-lens/operations/commits.ts";
import { gitText, type GitRunOptions } from "#runtime/history-lens/clients/git.ts";
import type { ReadPart } from "#runtime/history-lens/operations/parts.ts";
import {
	sourceHistory,
	type SourceRevision,
} from "#runtime/history-lens/clients/source-history.ts";
import {
	readSymbol,
	type DeclarationSource,
	type SymbolReading,
} from "#runtime/history-lens/operations/symbol-attribution.ts";
import type { HistoryAttribution } from "#shared/schemas/history-attribution.ts";
import { filesOfBinding } from "@archboard/code-binding/bindings";

interface AttributedCommits {
	readonly commits: readonly string[];
	readonly attribution: HistoryAttribution;
	/**
	 * Historical declaration ranges, used to exclude duplicate ownership in coupling.
	 */
	readonly sites: readonly DeclarationSource[];
	/**
	 * Whether a walked commit's parent lacks the bound declaration and the commit has it. Over the
	 * net change of a range, whether the range adds the declaration. False for a path binding.
	 */
	readonly introduced: boolean;
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
	introduced: boolean;
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
 * Remember both readings of a commit, and whether the commit added the declaration.
 * @param state The symbol reading.
 * @param previous Its declaration in the parent.
 * @param next Its declaration in the commit.
 */
function rememberChange(state: SymbolState, previous: SymbolReading, next: SymbolReading): void {
	remember(state, previous);
	remember(state, next);
	if (previous.kind === "absent" && next.kind === "found") state.introduced = true;
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
	rememberChange(state, previous, next);
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
		introduced: state.introduced,
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
			introduced: false,
			commits: new Set(),
			unsupported: new Set(),
			sites: new Map(),
		},
	];
}

/**
 * Assign commits to bound declarations, given each commit's parent.
 * @param root The checkout.
 * @param head Its immutable HEAD.
 * @param walked The commits, including large commits.
 * @param parts The bound parts.
 * @param parents Each commit's parent, which its declarations are compared with.
 * @param options Cancellation.
 * @returns Attribution for every part id.
 */
async function attribute(
	root: string,
	head: string,
	walked: readonly WalkedCommit[],
	parts: readonly ReadPart[],
	parents: ReadonlyMap<string, string | undefined>,
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
				introduced: false,
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
	await readChanges(states, walked, history, parents, options);
	for (const state of states) answers.set(state.part.node.id, symbolAnswer(state, walked));
	return answers;
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
	return attribute(root, head, walked, parts, await parentsOf(root, walked, options), options);
}

/**
 * Whether a range adds source to a part: a file inside its binding that the merge base lacks, or,
 * for a declaration it reads, the declaration. A rename moves source and adds none.
 * @param part The bound part.
 * @param answer Its attribution over the net change.
 * @param net The net change of the range.
 * @returns True when the range adds source to the part.
 */
function addsSource(part: ReadPart, answer: AttributedCommits, net: WalkedCommit): boolean {
	if (answer.attribution.mode === "symbol") return answer.introduced;
	const added = net.changes.flatMap((change) => (change.status === "A" ? [change.path] : []));
	return answer.introduced || filesOfBinding(part.path, added).length > 0;
}

/**
 * The parts whose bound paths or declarations differ between the two ends of a range, by the
 * policy that attributes each commit (ADR 0045), and the parts that the range adds source to.
 * @param root The checkout.
 * @param range The commit the range starts from and the one it ends at.
 * @param range.from The commit the range starts from: the merge base.
 * @param range.to The commit it ends at: the head.
 * @param parts The bound parts.
 * @param options Cancellation.
 * @returns The ids of the parts that the range changed, the ids of those it adds source to, and
 * every file it changed under each name.
 */
async function netChangedParts(
	root: string,
	range: { readonly from: string; readonly to: string },
	parts: readonly ReadPart[],
	options: GitRunOptions,
): Promise<{ parts: Set<string>; adds: Set<string>; files: string[] }> {
	const net = await netChange(root, range.from, range.to, options);
	const answers = await attribute(
		root,
		range.to,
		[net],
		parts,
		new Map([[net.commit, range.from]]),
		options,
	);
	return {
		parts: new Set(
			[...answers].filter(([, answer]) => answer.commits.length > 0).map(([id]) => id),
		),
		adds: new Set(
			parts
				.filter((part) => {
					const answer = answers.get(part.node.id);
					return answer !== undefined && addsSource(part, answer, net);
				})
				.map((part) => part.node.id),
		),
		files: net.changes.flatMap((change) =>
			change.from === undefined ? [change.path] : [change.path, change.from],
		),
	};
}

export { attributeCommits, netChangedParts, type AttributedCommits };

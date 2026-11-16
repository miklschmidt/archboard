// The refs a branch footprint can be read between (ADR 0045).
//
// It lists the local branches and the remote-tracking branches of each bound repository, in the
// checkout that the footprint reads that repository in (`checkoutsReadFrom`, ADR 0049), and merges
// them by name. It runs `git for-each-ref` and nothing that reaches a remote: a ref is listed only
// when the checkout already has it, and a tag is never listed. A repository whose checkout cannot be
// read is named with the reason instead of being dropped.

import { existsSync } from "node:fs";
import { checkoutsReadFrom, vaultIdentity } from "@archboard/code-binding/resolution";
import { gitAnswer, type GitRunOptions } from "#runtime/history-lens/clients/git.ts";
import { commitOf } from "#runtime/history-lens/clients/source-history.ts";
import type { SourceRef, SourceRefsAnswer } from "#shared/protocol/source-refs.ts";

type Repository = SourceRefsAnswer["repositories"][number];
type Checkout = ReturnType<typeof checkoutsReadFrom>[number];

/** Every ref of one checkout, as a person types it. */
interface CheckoutRefs {
	readonly local: readonly string[];
	readonly remote: readonly string[];
}

const LOCAL = "refs/heads/";
const REMOTE = "refs/remotes/";

/**
 * The local and the remote-tracking branches of one checkout. `*\/HEAD` entries are symbolic
 * pointers to a branch, not branches.
 * @param root The checkout.
 * @param options The caller's signal.
 * @returns Its branches, or undefined when Git cannot list them there.
 */
async function refsOf(root: string, options: GitRunOptions): Promise<CheckoutRefs | undefined> {
	const listed = await gitAnswer(
		root,
		["for-each-ref", "--format=%(refname)", LOCAL, REMOTE],
		options,
	);
	if (listed === undefined) return undefined;
	const names = listed.split("\n").filter((name) => name !== "");
	return {
		local: names.filter((name) => name.startsWith(LOCAL)).map((name) => name.slice(LOCAL.length)),
		remote: names
			.filter((name) => name.startsWith(REMOTE) && !name.endsWith("/HEAD"))
			.map((name) => name.slice(REMOTE.length)),
	};
}

/**
 * Whether a checkout has a ref.
 * @param root The checkout.
 * @param ref The full ref name.
 * @param options The caller's signal.
 * @returns True when it resolves to a commit.
 */
async function hasRef(root: string, ref: string, options: GitRunOptions): Promise<boolean> {
	const found = await gitAnswer(
		root,
		["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
		options,
	);
	return found !== undefined;
}

/**
 * The branch that new work is set against by default in a checkout: where `origin/HEAD` points,
 * else `main`.
 * @param root The checkout.
 * @param options The caller's signal.
 * @returns The short name, or null when the checkout has neither.
 */
async function defaultBaseOf(root: string, options: GitRunOptions): Promise<string | null> {
	const origin = await gitAnswer(
		root,
		["symbolic-ref", "--quiet", "--short", `${REMOTE}origin/HEAD`],
		options,
	);
	if (origin !== undefined && (await hasRef(root, `${REMOTE}${origin}`, options))) return origin;
	return (await hasRef(root, `${LOCAL}main`, options)) ? "main" : null;
}

/**
 * The vault's own repository in the checkout that holds the vault.
 * @param repo The repository identity.
 * @param root The checkout.
 * @param options The caller's signal.
 * @returns The default base and where the checkout stands.
 */
async function vaultOf(
	repo: string,
	root: string,
	options: GitRunOptions,
): Promise<NonNullable<SourceRefsAnswer["vault"]>> {
	const [defaultBase, branch, commit] = await Promise.all([
		defaultBaseOf(root, options),
		gitAnswer(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], options),
		gitAnswer(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], options),
	]);
	return { repo, defaultBase, branch: branch ?? null, commit: commit ?? null };
}

/**
 * Why a repository's checkout is not read, or its refs.
 * @param repo The repository.
 * @param checkout The checkout the footprint reads it in, if any is registered.
 * @param options The caller's signal.
 * @returns What the repository holds, or why it was not read.
 */
async function readCheckout(
	repo: string,
	checkout: Checkout | undefined,
	options: GitRunOptions,
): Promise<{ repository: Repository; refs?: CheckoutRefs }> {
	if (checkout === undefined) {
		return {
			repository: {
				status: "unread",
				repo,
				reason: "repository-unregistered",
				detail: `No checkout is registered for ${repo}.`,
			},
		};
	}
	const refs = existsSync(checkout.root) ? await refsOf(checkout.root, options) : undefined;
	if (refs === undefined) {
		return {
			repository: {
				status: "unread",
				repo,
				reason: "checkout-unavailable",
				detail: `The checkout at ${checkout.root} is not a Git repository that can be read.`,
			},
		};
	}
	return { repository: { status: "read", repo }, refs };
}

/** The refs of a range as the caller named them. */
interface SourceRange {
	readonly base: string;
	readonly head: string;
}

/**
 * Where a range runs in the vault's repository, resolving each ref as the footprint does.
 * @param root The checkout that holds the vault.
 * @param range The base and the head as asked.
 * @param options The caller's signal.
 * @returns The merge base and the head commit, or null when a ref does not resolve or no history is shared.
 */
async function mergeBaseIn(
	root: string | undefined,
	range: SourceRange,
	options: GitRunOptions,
): Promise<SourceRefsAnswer["range"]> {
	if (root === undefined) return null;
	// The footprint resolves its base as Git names it, without the `origin` fallback of a head.
	const [base, head] = await Promise.all([
		gitAnswer(
			root,
			["rev-parse", "--verify", "--quiet", "--end-of-options", `${range.base}^{commit}`],
			options,
		),
		commitOf(root, range.head, options),
	]);
	if (base === undefined || head === undefined) return null;
	const mergeBase = await gitAnswer(root, ["merge-base", base, head], options);
	return mergeBase === undefined ? null : { mergeBase, head };
}

/**
 * The answer's `range`: absent unless the caller named a range.
 * @param root The checkout that holds the vault.
 * @param range The base and the head as asked, when both were.
 * @param options The caller's signal.
 * @returns An empty object, or the range.
 */
async function rangeAnswer(
	root: string | undefined,
	range: SourceRange | undefined,
	options: GitRunOptions,
): Promise<Pick<SourceRefsAnswer, "range">> {
	return range === undefined ? {} : { range: await mergeBaseIn(root, range, options) };
}

/**
 * The vault's own repository, when a checkout holds it and its refs were read.
 * @param own The vault's repository identity.
 * @param read What that repository's checkout held.
 * @param root The checkout that holds the vault.
 * @param options The caller's signal.
 * @returns Where the checkout stands, or null.
 */
async function vaultStanding(
	own: string | undefined,
	read: { refs?: CheckoutRefs } | undefined,
	root: string | undefined,
	options: GitRunOptions,
): Promise<SourceRefsAnswer["vault"]> {
	if (own === undefined || root === undefined || read?.refs === undefined) return null;
	return vaultOf(own, root, options);
}

const KINDS = ["local", "remote"] as const;

/**
 * Add the refs of one checkout to the merged entries.
 * @param held The entries so far, by kind and name.
 * @param repo The repository whose checkout held the refs.
 * @param refs What the checkout held.
 */
function addRefs(held: Map<string, SourceRef>, repo: string, refs: CheckoutRefs): void {
	for (const kind of KINDS) {
		for (const name of refs[kind]) {
			const key = `${kind}\0${name}`;
			const entry = held.get(key) ?? { name, kind, repos: [] };
			entry.repos.push(repo);
			held.set(key, entry);
		}
	}
}

/**
 * Order refs: local before remote, then by name.
 * @param left One ref.
 * @param right Another ref.
 * @returns Negative when `left` comes first.
 */
function byKindThenName(left: SourceRef, right: SourceRef): number {
	const kinds = KINDS.indexOf(left.kind) - KINDS.indexOf(right.kind);
	if (kinds !== 0) return kinds;
	return left.name < right.name ? -1 : Number(left.name > right.name);
}

/**
 * Merge the refs of each checkout by kind and name.
 * @param read What each repository held.
 * @returns The refs, local first, then remote, alphabetically within each.
 */
function merged(read: readonly { repo: string; refs?: CheckoutRefs }[]): SourceRef[] {
	const held = new Map<string, SourceRef>();
	for (const { repo, refs } of read) if (refs !== undefined) addRefs(held, repo, refs);
	return [...held.values()]
		.map((entry) => ({ ...entry, repos: entry.repos.toSorted() }))
		.toSorted(byKindThenName);
}

/**
 * List the refs of the repositories that a state binds.
 * @param vault The vault directory: its own checkout is read for its own repository.
 * @param repos The identities of the bound repositories. The vault's own repository is read too,
 * because the default base is chosen in it.
 * @param options The caller's signal.
 * @param range The base and the head to find the merge base of in the vault's repository, when asked.
 * @returns The merged refs, what each repository was read for, the vault checkout's standing, and
 * the range when one was asked.
 */
async function readSourceRefs(
	vault: string,
	repos: readonly string[],
	options: GitRunOptions = {},
	range?: SourceRange,
): Promise<SourceRefsAnswer> {
	const checkouts = checkoutsReadFrom(vault);
	const own = vaultIdentity(vault);
	const identities = [...new Set(own === undefined ? repos : [...repos, own])].toSorted();
	const read = await Promise.all(
		identities.map(async (repo) => ({
			repo,
			...(await readCheckout(
				repo,
				checkouts.find((checkout) => checkout.repo === repo),
				options,
			)),
		})),
	);
	const ownRead = read.find((one) => one.repo === own);
	const ownRoot = checkouts.find((one) => one.repo === own)?.root;
	return {
		refs: merged(read),
		repositories: read.map((one) => one.repository),
		vault: await vaultStanding(own, ownRead, ownRoot, options),
		...(await rangeAnswer(ownRoot, range, options)),
	};
}

export { readSourceRefs };

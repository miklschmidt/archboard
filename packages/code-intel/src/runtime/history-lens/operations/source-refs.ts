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
 * @returns The merged refs, what each repository was read for, and the vault checkout's standing.
 */
async function readSourceRefs(
	vault: string,
	repos: readonly string[],
	options: GitRunOptions = {},
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
	return {
		refs: merged(read),
		repositories: read.map((one) => one.repository),
		vault:
			own === undefined || ownRead?.refs === undefined
				? null
				: await vaultOf(own, checkouts.find((one) => one.repo === own)!.root, options),
	};
}

export { readSourceRefs };

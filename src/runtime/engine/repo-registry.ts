// The checkout registry: which repositories exist on this machine, and where.
//
// A binding is a logical address, a repository identity plus a path inside it
// (CONTEXT.md), so that a vault's boards can describe any repository, not only
// the one whose checkout holds the vault (ADR 0049). That leaves one thing
// unanswered on every machine that opens a board: where
// `github.com/acme/payments` actually is here. ADR 0004 promised a
// machine-local registry for it and never built one; this is it, and ADR 0011
// says why it is the thing that replaces resolving against a working
// directory.
//
// ADR 0049 widens it. It holds every checkout known here, each with its
// identity, and every untracked vault, each with a registry name. For each
// identity it keeps one chosen checkout: the one this machine reads. Only a
// person's choice changes it (`repo use`). Registering a checkout never does,
// except that the first known checkout of an identity becomes its chosen one.
// Readers that turn an identity into a directory ask for `chosenCheckouts()`
// and so never see the others.
//
// A checkout becomes known when a person declares it. Its worktrees, as
// `git worktree list` reports them, become known with it. Nothing is
// discovered by scanning the filesystem: a registry that guesses is the
// ambient working directory again with extra steps, and each entry traces back
// to a checkout somebody registered.
//
// An entry also holds the language servers that an agent configured for that
// checkout (`repo language-server`, ADR 0046). They belong to the checkout, so
// they stay while the same root registers again and go with `repo forget`.
// The file and its lock are in `lib/registry-file.ts`.

import fs from "fs";
import path from "path";
import {
	inspectCheckout,
	repoRootOf,
	worktreePaths,
	type CheckoutGitInspection,
} from "@/runtime/engine/git";
import {
	changeRegistry,
	isDirectory,
	readRegistry,
	RegistryWriteError,
	RepoRegistryError,
	registryPath,
	type RegisteredRepo,
	type RegisteredRepoStatus,
	type Registry,
	type UntrackedVault,
	type UntrackedVaultStatus,
} from "@/runtime/engine/lib/registry-file";
import type {
	ConfigurableLanguage,
	ConfiguredServer,
	LanguageServers,
} from "@/shared/language-servers/index";

/** A vault is the `.archboard/vault` of a directory (ADR 0049). */
const VAULT_DIRECTORY = path.join(".archboard", "vault");

/** How a caller cancels the git calls a declaration has to make. */
interface DeclareOptions {
	signal?: AbortSignal;
	/** Make a checkout the chosen one of its identity: `repo use`. */
	choose?: boolean;
}

/** What a declaration of a directory recorded. */
type Declared =
	| {
			kind: "checkout";
			checkout: RegisteredRepo;
			/** Whether the checkout was unknown before. */
			added: boolean;
			/** The checkout that the choice replaced, when `choose` changed the chosen one. */
			replaced?: RegisteredRepo;
			/** The worktrees of the checkout that were unknown before. */
			worktrees: RegisteredRepo[];
	  }
	| { kind: "vault"; vault: UntrackedVault; added: boolean };

/** What forgetting a directory removed. */
type Forgotten =
	| { kind: "checkout"; checkout: RegisteredRepo; unchosen: boolean; others: string[] }
	| { kind: "vault"; vault: UntrackedVault };

/** Every entry plus whether its directory is still there. */
interface RegistryListing {
	checkouts: RegisteredRepoStatus[];
	vaults: UntrackedVaultStatus[];
	/** Identities that have known checkouts and no chosen one, until `repo use`. */
	unchosen: string[];
}

/**
 * Every entry, with whether its directory is still on this machine.
 * @returns The checkouts, the untracked vaults and the identities with no chosen checkout.
 */
function listRegistry(): RegistryListing {
	const { checkouts, vaults } = readRegistry();
	const chosen = new Set(checkouts.filter((each) => each.chosen).map((each) => each.repo));
	return {
		checkouts: checkouts.map((entry) => ({ ...entry, exists: isDirectory(entry.root) })),
		vaults: vaults.map((entry) => ({ ...entry, exists: isDirectory(entry.root) })),
		unchosen: [...new Set(checkouts.map((each) => each.repo))]
			.filter((repo) => !chosen.has(repo))
			.toSorted(),
	};
}

/**
 * The checkouts that this machine reads: the chosen checkout of each identity,
 * whether or not its directory is still there. This is what resolves an
 * identity to a directory, so an identity without one resolves as unregistered.
 * @returns One checkout for each identity that has a chosen one.
 */
function chosenCheckouts(): RegisteredRepoStatus[] {
	return listRegistry().checkouts.filter((entry) => entry.chosen);
}

/**
 * The nearest directory at or above this one that holds a vault.
 * @param dir The directory to start from.
 * @returns The directory that holds `.archboard/vault`, or undefined.
 */
function vaultHolder(dir: string): string | undefined {
	for (let holder = dir; ; holder = path.dirname(holder)) {
		if (isDirectory(path.join(holder, VAULT_DIRECTORY))) return holder;
		if (path.dirname(holder) === holder) return undefined;
	}
}

/**
 * A name that nothing else on this machine's registry has: the base name, then
 * `-2`, `-3` and so on. A remoteless repository is named by the directory of its
 * main checkout, so its identity counts as taken too.
 * @param base The directory's base name.
 * @param registry The registry the name goes in.
 * @returns The name.
 */
function uniqueName(base: string, registry: Registry): string {
	const taken = new Set([
		...registry.vaults.map((vault) => vault.name),
		...registry.checkouts.map((checkout) => checkout.repo),
	]);
	let name = base;
	for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
	return name;
}

/**
 * Whether a recorded checkout is the chosen one of its identity. It is when
 * the person chose it, when it already was, or when it is the first known
 * checkout of its identity.
 * @param previous What the registry held for this directory and identity.
 * @param siblings The other known checkouts of the identity.
 * @param choose Whether the person chose it.
 * @returns Whether it is chosen.
 */
function isChosen(
	previous: RegisteredRepo | undefined,
	siblings: readonly RegisteredRepo[],
	choose: boolean,
): boolean {
	return choose || (previous === undefined ? siblings.length === 0 : previous.chosen);
}

/**
 * What a re-registered directory keeps: when it was added and the servers an
 * agent configured for it.
 * @param previous What the registry held for this directory and identity.
 * @returns The fields to carry over.
 */
function keptFrom(
	previous: RegisteredRepo | undefined,
): Pick<RegisteredRepo, "addedAt" | "servers"> {
	const addedAt = previous?.addedAt ?? new Date().toISOString();
	return previous?.servers === undefined ? { addedAt } : { addedAt, servers: previous.servers };
}

/**
 * Record one checkout in a registry, replacing what it held for that
 * directory. Choosing a checkout unchooses the others of its identity.
 * @param registry The registry to change.
 * @param inspected The checkout as Git reports it.
 * @param choose Whether to make it the chosen checkout of its identity.
 * @returns The entry, and whether the directory was unknown before.
 */
function recordCheckout(
	registry: Registry,
	inspected: Pick<CheckoutGitInspection, "root" | "identity">,
	choose: boolean,
): { entry: RegisteredRepo; added: boolean } {
	const found = registry.checkouts.find((each) => each.root === inspected.root);
	const previous = found?.repo === inspected.identity ? found : undefined;
	const others = registry.checkouts.filter((each) => each.root !== inspected.root);
	const siblings = others.filter((each) => each.repo === inspected.identity);
	const entry: RegisteredRepo = {
		repo: inspected.identity,
		root: inspected.root,
		source: "declared",
		chosen: isChosen(previous, siblings, choose),
		...keptFrom(previous),
	};
	registry.checkouts = [
		...others.map((each) =>
			choose && siblings.includes(each) ? { ...each, chosen: false } : each,
		),
		entry,
	];
	return { entry, added: found === undefined };
}

/**
 * The worktrees of a checkout other than the checkout itself, as Git reports
 * them for it, that are checkouts of its identity. Every worktree has the
 * identity of the main checkout, so this leaves out only one that overrides
 * `origin` for itself (`extensions.worktreeConfig`): it is another repository.
 * @param checkout The checkout.
 * @param options Cancellation.
 * @returns Each worktree's root and identity.
 */
async function worktreesOf(
	checkout: Pick<CheckoutGitInspection, "root" | "identity">,
	options: DeclareOptions,
): Promise<Readonly<CheckoutGitInspection>[]> {
	const paths = (await worktreePaths(checkout.root, options)).filter(
		(each) => path.resolve(each) !== checkout.root && isDirectory(each),
	);
	const inspected = await Promise.all(paths.map((each) => inspectCheckout(each, options)));
	return inspected.flatMap((each) =>
		each === undefined || each.root === checkout.root || each.identity !== checkout.identity
			? []
			: each,
	);
}

/**
 * Declare a checkout: record it and the worktrees that Git lists for it.
 * @param inspected The checkout as Git reports it.
 * @param options Whether to choose it, and how to cancel the git calls.
 * @returns What was recorded.
 */
async function declareCheckout(
	inspected: CheckoutGitInspection,
	options: DeclareOptions,
): Promise<Declared> {
	const worktrees = await worktreesOf(inspected, options);
	return changeRegistry((registry) => {
		const before = registry.checkouts.find(
			(each) => each.repo === inspected.identity && each.chosen,
		);
		const { entry, added } = recordCheckout(registry, inspected, options.choose === true);
		const known = new Set(registry.checkouts.map((each) => each.root));
		const recorded = worktrees
			.filter((each) => !known.has(each.root))
			.map((each) => recordCheckout(registry, each, false).entry);
		return {
			kind: "checkout" as const,
			checkout: entry,
			added,
			...(before !== undefined && before.root !== entry.root && entry.chosen
				? { replaced: before }
				: {}),
			worktrees: recorded,
		};
	});
}

/**
 * Declare an untracked vault under a registry name. A directory that is
 * already registered keeps its name.
 * @param holder The directory that holds `.archboard/vault`.
 * @returns What was recorded.
 */
function declareUntrackedVault(holder: string): Declared {
	return changeRegistry((registry) => {
		const known = registry.vaults.find((each) => each.root === holder);
		if (known !== undefined) return { kind: "vault" as const, vault: known, added: false };
		const vault = {
			name: uniqueName(path.basename(holder), registry),
			root: holder,
			addedAt: new Date().toISOString(),
		};
		registry.vaults.push(vault);
		return { kind: "vault" as const, vault, added: true };
	});
}

/**
 * "This directory is that repository." Register a checkout, or an untracked
 * vault, explicitly.
 *
 * The identity comes from git rather than from the caller: two people naming
 * the same clone differently is the one thing that would make the address
 * space useless, and git already has an answer that is the same everywhere.
 * @param dir The directory to register: a git checkout, or outside any
 * checkout the directory that holds `.archboard/vault`.
 * @param options Whether to make the checkout the chosen one, and how to cancel the git calls.
 * @returns What was recorded.
 * @throws {RepoRegistryError} When the directory is missing, is neither inside
 * a git repository nor inside a directory that holds a vault, or is a vault
 * and so has no repository identity to choose.
 * @throws {RegistryWriteError} When the registry cannot be written.
 */
async function declareDirectory(dir: string, options: DeclareOptions = {}): Promise<Declared> {
	const target = path.resolve(dir);
	if (!isDirectory(target)) {
		throw new RepoRegistryError(`${target} is not a directory on this machine.`);
	}
	const checkout = await inspectCheckout(target, options);
	if (checkout) {
		return declareCheckout(checkout, options);
	}
	const holder = vaultHolder(target);
	if (holder === undefined) {
		throw new RepoRegistryError(
			`${target} is not inside a git repository and holds no ${VAULT_DIRECTORY}, so there is nothing to register it as. ` +
				"A binding names a repo plus a path inside it; a bare directory cannot be either.",
		);
	}
	if (options.choose === true) {
		throw new RepoRegistryError(
			`${holder} is an untracked vault: it has no repository identity, so there is no checkout to choose. Register it with repo add.`,
		);
	}
	return declareUntrackedVault(holder);
}

/**
 * The directories a person may mean by a path: the path itself, where it
 * leads, and the root of the checkout it is inside or, outside any checkout,
 * the directory that holds the vault it is inside, as `repo add` registers it.
 * A directory that is gone (a deleted worktree) is only the path.
 * @param dir The path.
 * @param options How to cancel the git call.
 * @returns The candidates.
 */
async function directoriesNamedBy(
	dir: string,
	options: Pick<DeclareOptions, "signal">,
): Promise<Set<string>> {
	const target = path.resolve(dir);
	const named = new Set([target]);
	if (!isDirectory(target)) return named;
	named.add(fs.realpathSync.native(target));
	const root = (await repoRootOf(target, options)) ?? vaultHolder(target);
	if (root !== undefined) named.add(root);
	return named;
}

/**
 * Forget a checkout or an untracked vault. Forgetting the chosen checkout of
 * an identity that has other known checkouts leaves it with none chosen until
 * `repo use`.
 * @param dir The directory it was registered under.
 * @param options How to cancel the git call.
 * @returns What was removed, or undefined when nothing was registered there.
 * @throws {RegistryWriteError} When the registry cannot be written.
 */
async function forgetDirectory(
	dir: string,
	options: Pick<DeclareOptions, "signal"> = {},
): Promise<Forgotten | undefined> {
	const named = await directoriesNamedBy(dir, options);
	return changeRegistry((registry): Forgotten | undefined => {
		const checkout = registry.checkouts.find((each) => named.has(each.root));
		if (checkout !== undefined) {
			registry.checkouts = registry.checkouts.filter((each) => each !== checkout);
			const others = registry.checkouts.filter((each) => each.repo === checkout.repo);
			return {
				kind: "checkout",
				checkout,
				unchosen: checkout.chosen && others.length > 0,
				others: others.map((each) => each.root),
			};
		}
		const vault = registry.vaults.find((each) => named.has(each.root));
		if (vault === undefined) return undefined;
		registry.vaults = registry.vaults.filter((each) => each !== vault);
		return { kind: "vault", vault };
	});
}

/**
 * Set the server of one language for a registered checkout, or remove it.
 * @param root The checkout's root.
 * @param language The language.
 * @param server Its command and arguments, or undefined to remove it.
 * @returns The entry as it now stands, or undefined when the directory is not a known checkout.
 * @throws {RegistryWriteError} When the registry cannot be written: the caller
 * asked for the change, so it hears that nothing changed.
 */
function setLanguageServer(
	root: string,
	language: ConfigurableLanguage,
	server: ConfiguredServer | undefined,
): RegisteredRepo | undefined {
	return changeRegistry((registry) => {
		const entry = registry.checkouts.find((candidate) => candidate.root === root);
		if (entry === undefined) return undefined;
		const { [language]: _replaced, ...others } = entry.servers ?? {};
		const servers: LanguageServers =
			server === undefined ? others : { ...others, [language]: server };
		const { servers: _before, ...bare } = entry;
		const updated = Object.keys(servers).length === 0 ? bare : { ...bare, servers };
		registry.checkouts = registry.checkouts.map((each) => (each === entry ? updated : each));
		return updated;
	});
}

export {
	type RegisteredRepo,
	type RegisteredRepoStatus,
	type UntrackedVault,
	type UntrackedVaultStatus,
	type Declared,
	type Forgotten,
	type RegistryListing,
	RepoRegistryError,
	RegistryWriteError,
	registryPath,
	readRegistry,
	listRegistry,
	chosenCheckouts,
	declareDirectory,
	forgetDirectory,
	setLanguageServer,
};

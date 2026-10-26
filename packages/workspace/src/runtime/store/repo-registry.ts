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
// identity it keeps one chosen checkout: the one this machine reads. Only
// `repo use`, the navigator's menu and an agent's `browser show` from another
// checkout change it (ADR 0050). Registering a checkout never does, except
// that the first known checkout of an identity becomes its chosen one.
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
// The file and its lock are in `runtime/store/registry-file.ts`.

import fs from "fs";
import path from "path";
import {
	inspectCheckout,
	repoRootOf,
	worktreePaths,
	type CheckoutGitInspection,
} from "#runtime/clients/git.ts";
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
} from "#runtime/store/registry-file.ts";
import { VAULT_DIRECTORY, vaultHolder } from "#runtime/services/vault-finder.ts";
import type { ConfiguredServer, LanguageServers } from "#runtime/store/language-servers.ts";
import type { ConfigurableLanguage } from "#shared/schemas/configurable-languages.ts";

/** How a caller cancels the git calls a declaration has to make. */
interface DeclareOptions {
	signal?: AbortSignal;
	/** Make a checkout the chosen one of its identity: `repo use`. */
	choose?: boolean;
}

/** An untracked vault that took a new registry name, because a repository identity now has its old one. */
interface RenamedVault {
	readonly root: string;
	readonly from: string;
	readonly to: string;
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
			/** The worktrees of the checkout that were not known under its identity before. */
			worktrees: RegisteredRepo[];
			/** The untracked vault whose name the checkout's identity took, when one had it. */
			renamed?: RenamedVault;
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
 * Give an untracked vault a name of its own when a repository identity has its
 * name. A remoteless repository is named by its directory, as an untracked
 * vault is, so the two can meet. The identity keeps its name, because
 * drill-downs and bindings name it, and the vault takes the next free one. So
 * the registry never lists two entries under one name, and the browser never
 * opens one for the other.
 * @param registry The registry the identity was recorded in.
 * @param identity The identity.
 * @returns The rename, or undefined when no vault had that name.
 */
function renameClashingVault(registry: Registry, identity: string): RenamedVault | undefined {
	const clash = registry.vaults.find((vault) => vault.name === identity);
	if (clash === undefined) return undefined;
	const name = uniqueName(path.basename(clash.root), registry);
	registry.vaults = registry.vaults.map((vault) => (vault === clash ? { ...clash, name } : vault));
	return { root: clash.root, from: clash.name, to: name };
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
	const inspected: (CheckoutGitInspection | undefined)[] = [];
	// Each inspection owns several Git processes. A large worktree family must not
	// exhaust the command deadlines before Git starts. Settle each bounded group
	// before returning a refusal, so its other inspections do not outlive this call.
	for (let start = 0; start < paths.length; start += 8) {
		// oxlint-disable-next-line no-await-in-loop -- each batch must settle before the next can own Git processes
		const results = await Promise.allSettled(
			paths.slice(start, start + 8).map((each) => inspectCheckout(each, options)),
		);
		for (const result of results) {
			if (result.status === "rejected") throw result.reason;
			inspected.push(result.value);
		}
	}
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
		// A worktree known under another identity, such as its own directory name
		// before every worktree had the identity of its main checkout, is recorded again.
		const known = new Set(
			registry.checkouts
				.filter((each) => each.repo === inspected.identity)
				.map((each) => each.root),
		);
		const recorded = worktrees
			.filter((each) => !known.has(each.root))
			.map((each) => recordCheckout(registry, each, false).entry);
		const renamed = renameClashingVault(registry, entry.repo);
		return {
			kind: "checkout" as const,
			checkout: entry,
			added,
			...(before !== undefined && before.root !== entry.root && entry.chosen
				? { replaced: before }
				: {}),
			worktrees: recorded,
			...(renamed === undefined ? {} : { renamed }),
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
	const named = path.resolve(dir);
	if (!isDirectory(named)) {
		throw new RepoRegistryError(`${named} is not a directory on this machine.`);
	}
	// A checkout root is the real path Git reports, and an untracked vault is
	// recorded the same way, so the directory a command finds a vault in is
	// the one the registry holds.
	const target = fs.realpathSync.native(named);
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

/** What choosing a known checkout did. */
interface Chosen {
	/** The checkout, chosen now. */
	readonly checkout: RegisteredRepo;
	/** Whether it was not the chosen one before. */
	readonly changed: boolean;
	/** The root of the checkout it replaced, or null when its identity had none chosen or nothing changed. */
	readonly replaced: string | null;
}

/**
 * Make a known checkout the chosen one of its identity, as `repo use` does, in
 * the registry alone: the checkout is known, so Git has nothing to add. The
 * navigator's menu and `browser show` choose through here (ADR 0050).
 * @param root The checkout's root, as the registry holds it.
 * @returns What the choice did, or undefined when the root is not a known checkout.
 * @throws {RegistryWriteError} When the registry cannot be written.
 */
function chooseKnownCheckout(root: string): Chosen | undefined {
	return changeRegistry((registry): Chosen | undefined => {
		const checkout = registry.checkouts.find((each) => each.root === root);
		if (checkout === undefined) return undefined;
		if (checkout.chosen) return { checkout, changed: false, replaced: null };
		const before = registry.checkouts.find((each) => each.repo === checkout.repo && each.chosen);
		registry.checkouts = registry.checkouts.map((each) =>
			each.repo === checkout.repo ? { ...each, chosen: each === checkout } : each,
		);
		return {
			checkout: { ...checkout, chosen: true },
			changed: true,
			replaced: before?.root ?? null,
		};
	});
}

/**
 * Register the checkout or the untracked vault a command found its vault in,
 * unless the registry already knows that directory (ADR 0049).
 * @param holder The checkout root, or the directory that holds an untracked vault.
 * @param options How to cancel the git calls.
 * @returns What was recorded, or undefined when the registry knew the directory.
 * @throws {RepoRegistryError} When the directory is neither a checkout nor holds a vault.
 * @throws {RegistryWriteError} When the registry cannot be written.
 */
async function declareIfUnknown(
	holder: string,
	options: Pick<DeclareOptions, "signal"> = {},
): Promise<Declared | undefined> {
	const { checkouts, vaults } = readRegistry();
	// A finder names the holder by its real path, and an entry written before
	// the registry stored real paths can name it through a link.
	const known = [...checkouts, ...vaults].some((entry) => realRoot(entry.root) === holder);
	return known ? undefined : declareDirectory(holder, options);
}

/**
 * A registered root as its real path.
 * @param root The root as the registry spells it.
 * @returns Its real path, or the root itself when it is gone.
 */
function realRoot(root: string): string {
	try {
		return fs.realpathSync.native(root);
	} catch {
		return root;
	}
}

/** The repository a vault is in, as the browser names it. */
interface VaultRepository {
	/** The repository identity, or the registry name of an untracked vault. */
	readonly name: string;
	/** The checkout root, or the directory that holds the untracked vault. */
	readonly root: string;
	/** Whether the browser reads this checkout for its identity; an untracked vault always is. */
	readonly chosen: boolean;
}

/**
 * The registered repository whose `.archboard/vault` a vault is.
 * @param vault The vault directory, as its real path.
 * @returns The repository, or undefined when no registered directory holds that vault.
 */
function repositoryOfVault(vault: string): VaultRepository | undefined {
	const { checkouts, vaults } = readRegistry();
	/**
	 * Whether a registered directory holds the vault. Its `.archboard/vault` is
	 * compared by real path, as a command names a vault and the server lists one,
	 * so a checkout reached through a symbolic link still holds its vault. A vault
	 * whose own link leads out of the layout is refused before it is listed. A
	 * directory that is gone, such as a deleted worktree, is compared by where its
	 * vault was, so a pane still in that vault is known to be of its repository.
	 * @param root The directory.
	 * @returns True when its `.archboard/vault` is the vault.
	 */
	const holds = (root: string): boolean => {
		const held = path.join(root, VAULT_DIRECTORY);
		try {
			return fs.realpathSync.native(held) === vault;
		} catch {
			return held === vault;
		}
	};
	const checkout = checkouts.find((entry) => holds(entry.root));
	if (checkout !== undefined) {
		return { name: checkout.repo, root: checkout.root, chosen: checkout.chosen };
	}
	const untracked = vaults.find((entry) => holds(entry.root));
	return untracked === undefined
		? undefined
		: { name: untracked.name, root: untracked.root, chosen: true };
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
	type Chosen,
	type Declared,
	type Forgotten,
	type RenamedVault,
	type RegistryListing,
	type VaultRepository,
	RepoRegistryError,
	RegistryWriteError,
	registryPath,
	readRegistry,
	listRegistry,
	chosenCheckouts,
	chooseKnownCheckout,
	declareDirectory,
	declareIfUnknown,
	forgetDirectory,
	repositoryOfVault,
	setLanguageServer,
};

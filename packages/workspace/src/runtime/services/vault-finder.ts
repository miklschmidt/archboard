// Which vault a command addresses, found the way git finds its repository
// (ADR 0049).
//
// A vault is the `.archboard/vault` of one directory. A command starts from
// the directory that `-C` names, or else from its working directory. Inside a
// git checkout only the vault at the checkout root counts: a vault above the
// root belongs to another repository, or to none, and using it would put this
// repository's boards somewhere its clones never see. Outside any checkout the
// nearest enclosing directory that holds a vault is an untracked vault.
//
// A checkout with no vault of its own can have its architecture in another
// repository's vault, whose canonical models bind its code. A command can give the search
// a lookup of those vaults, and the refusal then names each one as the `-C` to
// give (TASK-480). The lookup reads boards, which this module cannot import:
// the registry imports it, and the board store imports the registry.

import fs from "fs";
import path from "path";
import { repoIdentityAt, repoRootOf } from "#runtime/clients/git.ts";
import { isDirectory } from "#runtime/store/registry-file.ts";

/** A vault is the `.archboard/vault` of a directory (ADR 0049). */
const VAULT_DIRECTORY = path.join(".archboard", "vault");

/** How a command came to the vault it addresses. */
const VAULT_ORIGINS = ["-C", "working-directory"] as const;
type VaultOrigin = (typeof VAULT_ORIGINS)[number];

/** Where the search starts, and what a command was given. */
interface VaultSearch {
	/** What `-C` named, as the person wrote it, or null when it was not given. */
	readonly directory: string | null;
	/**
	 * The option that named the directory, as a refusal names it back: `-C`
	 * unless said, or `--to` for the vault a board moves to.
	 */
	readonly option?: string;
	/** The working directory, which a relative `-C` resolves against. */
	readonly cwd: string;
	/**
	 * The known vaults whose canonical models bind a repository, asked when the search
	 * stops in a checkout with no vault. Without it, the refusal names none.
	 */
	readonly vaultsBoundTo?: (repo: string) => readonly BoundVault[] | Promise<readonly BoundVault[]>;
}

/** A known vault whose canonical models bind a repository's code. */
interface BoundVault {
	/** The directory that holds the vault: what `-C` names. */
	readonly holder: string;
	/** The names of its models that bind the repository. */
	readonly models: readonly string[];
}

/** The vault a command addresses. */
interface FoundVault {
	/** The vault directory, as its real path. */
	readonly path: string;
	readonly origin: VaultOrigin;
	/**
	 * The directory whose `.archboard/vault` it is: the checkout root, or the
	 * directory that holds an untracked vault.
	 */
	readonly holder: string;
}

/** Why no vault was found. */
type VaultNotFoundReason =
	| "directory-missing"
	| "checkout-without-vault"
	| "none-enclosing"
	| "vault-outside-layout";

/** A search that found no vault, and what the person can do next. */
interface VaultNotFound {
	readonly code: "VAULT_NOT_FOUND";
	readonly reason: VaultNotFoundReason;
	/** The directory the search started from, absolute. */
	readonly directory: string;
	readonly origin: VaultOrigin;
	/** The root of the checkout the directory is in, when it is in one. */
	readonly checkoutRoot?: string;
	/**
	 * The repository of a checkout with no vault, and the known vaults whose
	 * boards bind it, when the search was given a lookup and it found some.
	 */
	readonly boundElsewhere?: {
		readonly repository: string;
		readonly vaults: readonly BoundVault[];
	};
	/**
	 * The vault a link leads out of the layout: its `.archboard/vault` and the real directory it
	 * leads to, which the server does not serve (`isVaultLayout`).
	 */
	readonly link?: { readonly vault: string; readonly target: string };
	readonly message: string;
}

type VaultFinding =
	| { readonly ok: true; readonly found: FoundVault }
	| ({ readonly ok: false } & VaultNotFound);

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
 * Whether a path is a vault: the `.archboard/vault` of a directory (ADR 0049). The server serves
 * no other directory, because a vault outside the layout has no checkout for a workhorse to work in.
 * @param vault A directory, absolute.
 * @returns True when it is in the layout.
 */
function isVaultLayout(vault: string): boolean {
	return path.resolve(vault).endsWith(`${path.sep}${VAULT_DIRECTORY}`);
}

/**
 * The directory a vault's agents work in (ADR 0050): the one that holds the vault as its
 * `.archboard/vault`, which is a checkout root or the holder of an untracked vault.
 * @param vault The vault directory, absolute and in the layout (see `isVaultLayout`).
 * @returns The directory.
 */
function checkoutOfVault(vault: string): string {
	return path.dirname(path.dirname(path.resolve(vault)));
}

/**
 * Where a search started, in words.
 * @param origin How the start directory was given.
 * @param directory The start directory.
 * @param option The option that named it, when one did.
 * @returns The phrase.
 */
function startPhrase(origin: VaultOrigin, directory: string, option: string): string {
	return origin === "-C"
		? `The directory ${option} names, ${directory},`
		: `The working directory, ${directory},`;
}

/**
 * A refusal for a search that found nothing.
 * @param refusal What the search found instead.
 * @param option The option that named the directory, when it was not `-C`.
 * @returns The finding.
 */
function notFound(
	refusal: Omit<VaultNotFound, "code" | "message">,
	option: string | undefined,
): VaultFinding {
	return {
		ok: false,
		code: "VAULT_NOT_FOUND",
		...refusal,
		message:
			refusal.link === undefined
				? notFoundMessage(refusal, option)
				: linkedOutMessage(refusal.link),
	};
}

/**
 * What a refusal of a vault that a link leads out of the layout says.
 * @param link The vault and where its link leads.
 * @returns The message.
 */
function linkedOutMessage(link: NonNullable<VaultNotFound["link"]>): string {
	return (
		`${link.vault} leads through a link to ${link.target}, which is not the ${VAULT_DIRECTORY} of a directory. ` +
		`The server serves only a vault whose real directory is <dir>/${VAULT_DIRECTORY}, because its agents work in <dir>. ` +
		`Move the boards from ${link.target} to ${link.vault} in place of the link. Nothing was done.`
	);
}

/**
 * What a refusal says: what happened, the rule, and the ways out.
 * @param refusal The refusal.
 * @param named The option that named the directory, and the one that names another, when it was not `-C`.
 * @returns The message.
 */
function notFoundMessage(
	refusal: Omit<VaultNotFound, "code" | "message">,
	named: string | undefined,
): string {
	const { directory, origin, checkoutRoot, boundElsewhere } = refusal;
	const option = named ?? "-C";
	if (refusal.reason === "directory-missing") {
		return `${option} names ${directory}, which is not a directory. Nothing was done.`;
	}
	const start = startPhrase(origin, directory, option);
	if (refusal.reason === "checkout-without-vault") {
		const root = checkoutRoot ?? directory;
		if (boundElsewhere !== undefined) {
			return (
				`${start} is inside the git checkout ${root}, which has no ${VAULT_DIRECTORY} at its root. ` +
				`The boards of its repository, ${boundElsewhere.repository}, are in another vault. ` +
				`Run the command with ${option} <dir>: ${boundElsewhere.vaults.map(holdsPhrase).join(" ")} ` +
				`Nothing was done.`
			);
		}
		return (
			`${start} is inside the git checkout ${root}, which has no ${VAULT_DIRECTORY} at its root. ` +
			`Inside a checkout a command uses only the vault at the checkout root, and a vault above the checkout is never used. ` +
			`Set the repository up with \`archboard install-skill\` in ${root}, or create ${path.join(root, VAULT_DIRECTORY)}, ` +
			`or name another directory with ${option} <dir>. Nothing was done.`
		);
	}
	return (
		`${start} is not inside a git checkout, and neither it nor any directory above it holds ${VAULT_DIRECTORY}. ` +
		`Inside a checkout a command uses the vault at the checkout root; outside any checkout it uses the ${VAULT_DIRECTORY} ` +
		`of the nearest enclosing directory. Run the command inside a checkout that has a vault, create ` +
		`<dir>/${VAULT_DIRECTORY} in the directory that should hold the boards, or name one with ${option} <dir>. Nothing was done.`
	);
}

/** How many board names a refusal gives for one vault. It counts the rest. */
const NAMED_BOARDS = 5;

/**
 * One vault a refusal names, in words.
 * @param vault The vault and its boards that bind the repository.
 * @returns The phrase.
 */
function holdsPhrase(vault: BoundVault): string {
	const named = vault.models.slice(0, NAMED_BOARDS).map((board) => JSON.stringify(board));
	const more = vault.models.length - named.length;
	return `${vault.holder} holds ${named.join(", ")}${more > 0 ? ` and ${String(more)} more` : ""}.`;
}

/**
 * The known vaults whose canonical models bind a checkout's repository.
 * @param root The checkout root.
 * @param lookup The lookup the search was given.
 * @returns The repository and its vaults, or undefined when there are none or the lookup failed.
 */
async function boundElsewhereOf(
	root: string,
	lookup: VaultSearch["vaultsBoundTo"],
): Promise<VaultNotFound["boundElsewhere"]> {
	if (lookup === undefined) return undefined;
	try {
		const repository = await repoIdentityAt(root);
		const vaults = await lookup(repository);
		return vaults.length === 0 ? undefined : { repository, vaults };
	} catch {
		// The vaults are a hint on a refusal. A lookup that cannot read leaves the refusal as it was.
		return undefined;
	}
}

/**
 * A directory as its real path, or as it is when it cannot be resolved.
 * @param directory An absolute path.
 * @returns The real path.
 */
function realPath(directory: string): string {
	try {
		return fs.realpathSync.native(directory);
	} catch {
		return directory;
	}
}

/**
 * The vault a directory holds, as its real path, when the server serves it.
 * @param holder The directory that holds `.archboard/vault`.
 * @param start Where the search started, and how, for a refusal.
 * @param start.directory The start directory, as its real path.
 * @param start.origin How it was given.
 * @param start.checkoutRoot The root of the checkout it is in, when it is in one.
 * @param option The option that named it, when it was not `-C`.
 * @returns The finding: a link out of the layout is refused here, not by every server call.
 */
function heldVault(
	holder: string,
	start: { directory: string; origin: VaultOrigin; checkoutRoot?: string },
	option: string | undefined,
): VaultFinding {
	const vault = path.join(holder, VAULT_DIRECTORY);
	const target = realPath(vault);
	return isVaultLayout(target)
		? { ok: true, found: { path: target, origin: start.origin, holder } }
		: notFound({ reason: "vault-outside-layout", ...start, link: { vault, target } }, option);
}

/**
 * The vault of the directory a search starts from.
 * @param start The start directory, absolute and existing.
 * @param origin How it was given.
 * @param search What the command was given: the option that named it, and the lookup of bound vaults.
 * @returns The finding.
 */
async function vaultFrom(
	start: string,
	origin: VaultOrigin,
	search: VaultSearch,
): Promise<VaultFinding> {
	const { option } = search;
	const directory = realPath(start);
	const root = await repoRootOf(directory);
	if (root !== undefined) {
		if (isDirectory(path.join(root, VAULT_DIRECTORY))) {
			return heldVault(root, { directory, origin, checkoutRoot: root }, option);
		}
		const boundElsewhere = await boundElsewhereOf(root, search.vaultsBoundTo);
		return notFound(
			{
				reason: "checkout-without-vault",
				directory,
				origin,
				checkoutRoot: root,
				...(boundElsewhere === undefined ? {} : { boundElsewhere }),
			},
			option,
		);
	}
	const holder = vaultHolder(directory);
	return holder === undefined
		? notFound({ reason: "none-enclosing", directory, origin }, option)
		: heldVault(holder, { directory, origin }, option);
}

/**
 * Find the vault a command addresses: from `-C` when it is given, else from
 * the working directory.
 * @param search What the command was given, and where it runs.
 * @returns The vault, or why there is none.
 */
async function findVault(search: VaultSearch): Promise<VaultFinding> {
	const { option } = search;
	if (search.directory !== null) {
		const start = path.resolve(search.cwd, search.directory);
		return isDirectory(start)
			? vaultFrom(start, "-C", search)
			: notFound({ reason: "directory-missing", directory: start, origin: "-C" }, option);
	}
	return vaultFrom(search.cwd, "working-directory", search);
}

export {
	VAULT_DIRECTORY,
	VAULT_ORIGINS,
	type VaultOrigin,
	type VaultSearch,
	type BoundVault,
	type FoundVault,
	type VaultNotFound,
	type VaultNotFoundReason,
	type VaultFinding,
	checkoutOfVault,
	findVault,
	isVaultLayout,
	vaultHolder,
};

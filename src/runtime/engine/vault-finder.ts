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
// A set `ARCHBOARD_VAULT` still decides when `-C` is absent, as it did before
// the finder: that is the expand step of the migration, and TASK-472.09
// refuses the variable.

import fs from "fs";
import path from "path";
import { repoRootOf } from "@/runtime/engine/git";
import { isDirectory } from "@/runtime/engine/lib/registry-file";

/** A vault is the `.archboard/vault` of a directory (ADR 0049). */
const VAULT_DIRECTORY = path.join(".archboard", "vault");

/** How a command came to the vault it addresses. */
const VAULT_ORIGINS = ["-C", "environment", "working-directory"] as const;
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
	/** The value of `ARCHBOARD_VAULT`, or undefined when it is not set. */
	readonly environment: string | undefined;
	/** The working directory, which a relative `-C` or `ARCHBOARD_VAULT` resolves against. */
	readonly cwd: string;
}

/** The vault a command addresses. */
interface FoundVault {
	/** The vault directory, as its real path. */
	readonly path: string;
	readonly origin: VaultOrigin;
	/**
	 * The directory whose `.archboard/vault` it is: the checkout root, or the
	 * directory that holds an untracked vault. Null for a vault the environment
	 * names, which is used as it is.
	 */
	readonly holder: string | null;
}

/** Why no vault was found. */
type VaultNotFoundReason = "directory-missing" | "checkout-without-vault" | "none-enclosing";

/** A search that found no vault, and what the person can do next. */
interface VaultNotFound {
	readonly code: "VAULT_NOT_FOUND";
	readonly reason: VaultNotFoundReason;
	/** The directory the search started from, absolute. */
	readonly directory: string;
	readonly origin: VaultOrigin;
	/** The root of the checkout the directory is in, when it is in one. */
	readonly checkoutRoot?: string;
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
 * The directory a vault's agents work in (ADR 0050): the one that holds the vault as its
 * `.archboard/vault`, which is a checkout root or the holder of an untracked vault. A vault that
 * is not the `.archboard/vault` of a directory, as `ARCHBOARD_VAULT` can name one, is its own.
 * @param vault The vault directory, absolute.
 * @returns The directory.
 */
function checkoutOfVault(vault: string): string {
	const resolved = path.resolve(vault);
	return resolved.endsWith(`${path.sep}${VAULT_DIRECTORY}`)
		? path.dirname(path.dirname(resolved))
		: resolved;
}

/**
 * Where a search started, in words.
 * @param origin How the start directory was given.
 * @param directory The start directory.
 * @param option The option that named it, when one did.
 * @returns The phrase.
 */
function startPhrase(
	origin: Exclude<VaultOrigin, "environment">,
	directory: string,
	option: string,
): string {
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
		message: notFoundMessage(refusal, option),
	};
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
	const { directory, origin, checkoutRoot } = refusal;
	const option = named ?? "-C";
	if (origin === "environment") {
		return (
			`ARCHBOARD_VAULT names ${directory}, which is not a directory. A set ARCHBOARD_VAULT decides the vault ` +
			`of every command that names no -C. Unset it, so a command finds its vault from the directory it runs in, ` +
			`or set it to a vault directory. Nothing was done.`
		);
	}
	if (refusal.reason === "directory-missing") {
		return `${option} names ${directory}, which is not a directory. Nothing was done.`;
	}
	const start = startPhrase(origin, directory, option);
	if (refusal.reason === "checkout-without-vault") {
		const root = checkoutRoot ?? directory;
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
 * The vault of the directory a search starts from.
 * @param start The start directory, absolute and existing.
 * @param origin How it was given.
 * @param option The option that named it, when it was not `-C`.
 * @returns The finding.
 */
async function vaultFrom(
	start: string,
	origin: Exclude<VaultOrigin, "environment">,
	option: string | undefined,
): Promise<VaultFinding> {
	const directory = realPath(start);
	const root = await repoRootOf(directory);
	if (root !== undefined) {
		const vault = path.join(root, VAULT_DIRECTORY);
		return isDirectory(vault)
			? { ok: true, found: { path: realPath(vault), origin, holder: root } }
			: notFound(
					{ reason: "checkout-without-vault", directory, origin, checkoutRoot: root },
					option,
				);
	}
	const holder = vaultHolder(directory);
	return holder === undefined
		? notFound({ reason: "none-enclosing", directory, origin }, option)
		: {
				ok: true,
				found: {
					path: realPath(path.join(holder, VAULT_DIRECTORY)),
					origin,
					holder,
				},
			};
}

/**
 * Find the vault a command addresses: from `-C` when it is given, else the
 * vault `ARCHBOARD_VAULT` names, used as it is when it is a directory, else
 * from the working directory.
 * @param search What the command was given, and where it runs.
 * @returns The vault, or why there is none.
 */
async function findVault(search: VaultSearch): Promise<VaultFinding> {
	const { option } = search;
	if (search.directory !== null) {
		const start = path.resolve(search.cwd, search.directory);
		return isDirectory(start)
			? vaultFrom(start, "-C", option)
			: notFound({ reason: "directory-missing", directory: start, origin: "-C" }, option);
	}
	if (search.environment !== undefined && search.environment !== "") {
		const named = path.resolve(search.cwd, search.environment);
		return isDirectory(named)
			? { ok: true, found: { path: realPath(named), origin: "environment", holder: null } }
			: notFound({ reason: "directory-missing", directory: named, origin: "environment" }, option);
	}
	return vaultFrom(search.cwd, "working-directory", option);
}

export {
	VAULT_DIRECTORY,
	VAULT_ORIGINS,
	type VaultOrigin,
	type VaultSearch,
	type FoundVault,
	type VaultNotFound,
	type VaultNotFoundReason,
	type VaultFinding,
	checkoutOfVault,
	findVault,
	vaultHolder,
};

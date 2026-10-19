// The vault a call names (ADR 0049).
//
// One server serves several vaults and has no working directory, so it cannot
// know which vault a call means. The call says: `?vault=<directory>` on a
// request, or a `vault` field in its JSON body, exactly as it names its board.
// There is no default. A call that names none is refused with how to name one,
// and a vault the server cannot read is refused before anything is created.
//
// The value on the wire is the vault's own directory on this machine, as the
// caller's configuration spells it. It is one opaque string to the caller. The
// server turns it into the canonical path once, here, and every key it files
// memory under uses that path, so two spellings of one directory are one vault.

import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { isVaultLayout } from "@archboard/workspace/vault";
import { bodyOf, queryString } from "@/server/archboard/lib/request-board";

/** The query parameter, and the body field, that name the vault. */
const VAULT_PARAMETER = "vault";

/** Why a call's vault cannot be used. */
interface VaultRefusal {
	readonly status: number;
	readonly code: "VAULT_REQUIRED" | "VAULT_UNREADABLE";
	readonly error: string;
}

type NamedVault =
	| { readonly ok: true; readonly vault: string }
	| { readonly ok: false; readonly refusal: VaultRefusal };

const HOW_TO_NAME =
	"Name it: `?vault=<absolute path of the vault directory>` on the API, or a `vault` field in the " +
	"request body. A command line finds its vault from the directory it runs in, or from `-C <dir>`.";

/**
 * The refusal for a call that named no vault.
 * @returns The refusal, which says how to name one.
 */
function vaultRequiredRefusal(): VaultRefusal {
	return {
		status: 400,
		code: "VAULT_REQUIRED",
		error:
			`This call names no vault, so there is no telling which boards it means. Nothing was done. ` +
			`${HOW_TO_NAME} There is no default vault on purpose: one server serves every vault (ADR 0049).`,
	};
}

/** What a caller does with a readable directory in no layout. */
const HOW_TO_LAY_OUT =
	"The server serves only a vault at <dir>/.archboard/vault, because its agents work in <dir>. " +
	"Move the boards to <dir>/.archboard/vault and name that directory.";

/**
 * The refusal for a vault the server cannot read.
 * @param named What the call named.
 * @param why What is wrong with it.
 * @param next What the caller can do next.
 * @returns The refusal.
 */
function vaultUnreadableRefusal(named: string, why: string, next = HOW_TO_NAME): VaultRefusal {
	return {
		status: 404,
		code: "VAULT_UNREADABLE",
		error:
			`The vault "${named}" is ${why}, so the server cannot read boards from it. Nothing was done ` +
			`and nothing was created. ${next}`,
	};
}

/**
 * Whether a path is a directory the server can reach.
 * @param candidate An absolute path.
 * @returns Its canonical path, or why it is not a directory.
 */
function directoryAt(candidate: string): { ok: true; real: string } | { ok: false; why: string } {
	try {
		const real = fs.realpathSync(candidate);
		return fs.statSync(real).isDirectory()
			? { ok: true, real }
			: { ok: false, why: "not a directory" };
	} catch {
		return { ok: false, why: "no such directory" };
	}
}

/**
 * The vault a call names, made canonical, or why it cannot be used.
 *
 * Read only: a path that is not a directory is refused here and never made one.
 * @param raw What the call stated: the vault's absolute directory, or nothing.
 * @returns The canonical vault, or the refusal.
 */
function namedVault(raw: unknown): NamedVault {
	if (typeof raw !== "string" || raw.trim() === "") {
		return { ok: false, refusal: vaultRequiredRefusal() };
	}
	if (!path.isAbsolute(raw)) {
		return {
			ok: false,
			refusal: vaultUnreadableRefusal(raw, "not an absolute path"),
		};
	}
	const found = directoryAt(raw);
	if (!found.ok) {
		return { ok: false, refusal: vaultUnreadableRefusal(raw, found.why) };
	}
	// The server serves only a vault in the layout: a workhorse works in the directory that holds
	// the vault (ADR 0050), and a directory in no layout has none.
	return isVaultLayout(found.real)
		? { ok: true, vault: found.real }
		: {
				ok: false,
				refusal: vaultUnreadableRefusal(
					raw,
					"not the .archboard/vault of a directory",
					HOW_TO_LAY_OUT,
				),
			};
}

/** The vault each request named, once the requirement has run on it. */
const requestVaults = new WeakMap<Request, string>();

/**
 * Refuse a call that names no usable vault, and remember the one it names.
 * @param req The request.
 * @param res Its response.
 * @param next Continues to the route.
 */
function requireVault(req: Request, res: Response, next: NextFunction): void {
	const named = namedVault(queryString(req, VAULT_PARAMETER) ?? bodyOf(req)[VAULT_PARAMETER]);
	if (!named.ok) {
		const { status, code, error } = named.refusal;
		res.status(status).json({ success: false, code, error });
		return;
	}
	requestVaults.set(req, named.vault);
	next();
}

/**
 * The vault a request names, when it names one the server can read, for a
 * route that reads no board and answers either way.
 * @param req The request.
 * @returns The canonical vault, or null when the request names none that can be read.
 */
function statedVault(req: Request): string | null {
	const named = namedVault(queryString(req, VAULT_PARAMETER) ?? bodyOf(req)[VAULT_PARAMETER]);
	return named.ok ? named.vault : null;
}

/**
 * The vault a request named. Every route that reads or writes a board mounts
 * `requireVault` before its handler, so a request that reaches one has named a vault.
 * @param req The request.
 * @returns The canonical vault.
 * @throws {Error} When the route was mounted without the requirement.
 */
function vaultOfRequest(req: Request): string {
	const vault = requestVaults.get(req);
	if (vault === undefined) {
		throw new Error(
			`${req.method} ${req.path} reads a vault but was mounted without requireVault.`,
		);
	}
	return vault;
}

export { VAULT_PARAMETER, namedVault, requireVault, statedVault, vaultOfRequest, type NamedVault };

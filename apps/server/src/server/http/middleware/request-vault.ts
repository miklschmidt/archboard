// The vault a request names (ADR 0049), read the one way every route of this server reads it:
// `?vault=` first, else the `vault` field of the JSON body. The rule that makes it canonical or
// refuses it is the server-requests package's. The server lends these to the workbench's routes,
// so a route it mounts and a route the server mounts read the same remembered vault.

import type { NextFunction, Request, Response } from "express";
import { resolveVault } from "@archboard/server-requests/server";

/** The query parameter, and the body field, that name the vault. */
const VAULT_PARAMETER = "vault";

/** The vault each request named, once the requirement has run on it. */
const requestVaults = new WeakMap<Request, string>();

/**
 * One string field of a request's query string.
 * @param req The request.
 * @param key The field.
 * @returns The value, or undefined when it is absent or repeated.
 */
function queryString(req: Request, key: string): string | undefined {
	const value = req.query[key];
	return typeof value === "string" ? value : undefined;
}

/**
 * What a request states as its vault: its query first, then its JSON body.
 * @param req The request.
 * @returns The stated value, or null when it states nothing a vault can be.
 */
function statedValue(req: Request): string | null {
	const body: unknown = req.body;
	const field =
		typeof body === "object" && body !== null && !Array.isArray(body)
			? Reflect.get(body, VAULT_PARAMETER)
			: undefined;
	const stated: unknown = queryString(req, VAULT_PARAMETER) ?? field;
	return typeof stated === "string" ? stated : null;
}

/**
 * Refuse a call that names no usable vault, and remember the one it names.
 * @param req The request.
 * @param res Its response.
 * @param next Continues to the route.
 */
function requireVault(req: Request, res: Response, next: NextFunction): void {
	const named = resolveVault(statedValue(req));
	if (!named.ok) {
		const { status, code, error } = named.refusal;
		res.status(status).json({ success: false, code, error });
		return;
	}
	requestVaults.set(req, named.vault);
	next();
}

/**
 * The vault a request named. Every route that reads or writes a model mounts
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

/**
 * The vault a request names, when it names one the server can read, for a route that reads no
 * model and answers either way.
 * @param req The request.
 * @returns The canonical vault, or null in place of the refusal.
 */
function statedVault(req: Request): string | null {
	const named = resolveVault(statedValue(req));
	return named.ok ? named.vault : null;
}

export { queryString, requireVault, statedVault, vaultOfRequest };

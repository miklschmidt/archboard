import fs from "node:fs";
import path from "node:path";

import type { ResponsePayloads } from "../../codex-protocol/index.js";
import { CodexSessionStorageError, type CodexSessionStorage } from "./contract.js";

type InitializeResponse = ResponsePayloads["initialize"];
type ConfigResponse = ResponsePayloads["config/read"];
type RequirementsResponse = ResponsePayloads["configRequirements/read"];

function fail(detail: string): never {
	throw new CodexSessionStorageError(`Codex storage proof refused: ${detail}`);
}

function isWithin(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return (
		relative.length > 0 &&
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}

function requireAbsolutePath(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0"))
		return fail(`${label} must be a nonempty absolute path`);
	if (!path.isAbsolute(value) || path.resolve(value) !== value)
		return fail(`${label} must be an absolute canonical path`);
	return value;
}

function assertNoSymlinkComponents(candidate: string, label: string): void {
	const parsed = path.parse(candidate);
	let current = parsed.root;
	for (const component of candidate.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
		current = path.join(current, component);
		let stats: fs.Stats;
		try {
			stats = fs.lstatSync(current);
		} catch {
			return fail(`${label} contains a missing or unreadable path component`);
		}
		if (stats.isSymbolicLink()) return fail(`${label} contains a symbolic-link component`);
	}
}

function canonicalPath(value: unknown, label: string): string {
	const candidate = requireAbsolutePath(value, label);
	assertNoSymlinkComponents(candidate, label);
	let canonical: string;
	try {
		canonical = fs.realpathSync(candidate);
	} catch {
		return fail(`${label} does not resolve to an existing path`);
	}
	if (!path.isAbsolute(canonical) || canonical !== candidate)
		return fail(`${label} is redirected from its prepared canonical path`);
	return canonical;
}

function currentUserId(): number | undefined {
	if (process.platform === "win32") return undefined;
	return process.getuid?.();
}

function assertOwnerAndMode(stats: fs.Stats, label: string, mode: number): void {
	const owner = currentUserId();
	if (process.platform !== "win32" && owner === undefined)
		return fail(`could not prove ownership of ${label}`);
	if (owner !== undefined && stats.uid !== owner)
		return fail(`${label} is not owned by the current user`);
	if (process.platform !== "win32" && (stats.mode & 0o777) !== mode)
		return fail(`${label} is not restrictive`);
}

function assertDirectory(value: unknown, label: string): string {
	const canonical = canonicalPath(value, label);
	let stats: fs.Stats;
	try {
		stats = fs.lstatSync(canonical);
	} catch {
		return fail(`${label} could not be inspected`);
	}
	if (!stats.isDirectory()) return fail(`${label} is not a directory`);
	assertOwnerAndMode(stats, label, 0o700);
	return canonical;
}

function assertConfigFile(value: unknown, label: string): string {
	const canonical = canonicalPath(value, label);
	let stats: fs.Stats;
	try {
		stats = fs.lstatSync(canonical);
	} catch {
		return fail(`${label} could not be inspected`);
	}
	if (!stats.isFile()) return fail(`${label} is not a regular file`);
	assertOwnerAndMode(stats, label, 0o600);
	return canonical;
}

function assertRootAgreement(value: unknown, label: string, prepared: string): void {
	if (canonicalPath(value, label) !== prepared)
		return fail(`${label} does not match the prepared storage root`);
}

function assertSqliteValue(value: unknown, label: string, prepared: string): void {
	if (typeof value !== "string") return fail(`${label} is missing or null`);
	assertRootAgreement(value, label, prepared);
}

function assertOrigin(config: ConfigResponse, configPath: string): void {
	const origin = config.origins.sqlite_home;
	if (origin?.name.type !== "user") return fail("sqlite_home origin is not the user layer");
	if (origin.name.file !== configPath || origin.name.profile !== null)
		return fail("sqlite_home origin is not the prepared CODEX_HOME/config.toml");
}

function assertRequirements(requirements: RequirementsResponse, sqliteHome: string): void {
	const managed = requirements.requirements;
	if (managed === null) return;
	if (managed.sqliteHome !== null)
		assertRootAgreement(managed.sqliteHome, "managed sqliteHome", sqliteHome);
}

/** Verify server-reported storage without creating, rewriting, or locking anything. */
export function proveCodexStorage(input: {
	readonly storage: CodexSessionStorage;
	readonly initialize: InitializeResponse;
	readonly config: ConfigResponse;
	readonly requirements: RequirementsResponse;
}): void {
	const codexHome = assertDirectory(input.storage.codexHome, "prepared CODEX_HOME");
	const sqliteHome = assertDirectory(input.storage.sqliteHome, "prepared CODEX_SQLITE_HOME");
	const configPath = assertConfigFile(input.storage.configPath, "prepared config.toml");
	if (configPath !== path.join(codexHome, "config.toml"))
		return fail("prepared config.toml is outside CODEX_HOME");
	if (
		codexHome === sqliteHome ||
		isWithin(codexHome, sqliteHome) ||
		isWithin(sqliteHome, codexHome)
	)
		return fail("prepared Codex roots collide");

	assertRootAgreement(input.initialize.codexHome, "initialize.codexHome", codexHome);
	const configValues = input.config.config as Record<string, unknown>;
	assertSqliteValue(configValues.sqlite_home, "config.sqlite_home", sqliteHome);
	assertOrigin(input.config, configPath);
	assertRequirements(input.requirements, sqliteHome);
}

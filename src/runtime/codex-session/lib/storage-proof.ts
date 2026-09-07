import fs from "node:fs";
import path from "node:path";

import type { ResponsePayloads } from "@/runtime/codex-protocol";
import {
	CodexSessionStorageError,
	type CodexSessionStorage,
} from "@/runtime/codex-session/lib/contract";

type InitializeResponse = ResponsePayloads["initialize"];
type ConfigResponse = ResponsePayloads["config/read"];
type RequirementsResponse = ResponsePayloads["configRequirements/read"];

/** What the storage proof compares: the prepared facts and the three handshake responses. */
interface StorageProofInput {
	readonly storage: CodexSessionStorage;
	readonly initialize: InitializeResponse;
	readonly config: ConfigResponse;
	readonly requirements: RequirementsResponse;
}

/**
 * Refuses the storage proof with one uniform error class.
 * @param detail - What was refused.
 */
function fail(detail: string): never {
	throw new CodexSessionStorageError(`Codex storage proof refused: ${detail}`);
}

/**
 * Tests strict containment of one path inside another.
 * @param parent - The candidate ancestor directory.
 * @param child - The path that may lie inside it.
 * @returns Whether child is strictly inside parent.
 */
function isWithin(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return (
		relative.length > 0 &&
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}

/**
 * Accepts only a nonempty, NUL-free, absolute path that is already in resolved form.
 * @param value - The candidate path.
 * @param label - Names the path in refusal messages.
 * @returns The accepted path.
 */
function requireAbsolutePath(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
		fail(`${label} must be a nonempty absolute path`);
	}
	if (!path.isAbsolute(value) || path.resolve(value) !== value) {
		fail(`${label} must be an absolute canonical path`);
	}
	return value;
}

/**
 * Walks every component of a path and refuses a symbolic link anywhere along it, so a
 * prepared storage root cannot be redirected after preparation.
 * @param candidate - The absolute path to inspect.
 * @param label - Names the path in refusal messages.
 */
function assertNoSymlinkComponents(candidate: string, label: string): void {
	const parsed = path.parse(candidate);
	let current = parsed.root;
	for (const component of candidate.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
		current = path.join(current, component);
		let stats: fs.Stats;
		try {
			stats = fs.lstatSync(current);
		} catch {
			fail(`${label} contains a missing or unreadable path component`);
		}
		if (stats.isSymbolicLink()) {
			fail(`${label} contains a symbolic-link component`);
		}
	}
}

/**
 * Resolves a path and requires that resolution changes nothing, proving the path is exactly
 * the one that was prepared.
 * @param value - The candidate path.
 * @param label - Names the path in refusal messages.
 * @returns The canonical path.
 */
function canonicalPath(value: unknown, label: string): string {
	const candidate = requireAbsolutePath(value, label);
	assertNoSymlinkComponents(candidate, label);
	let canonical: string;
	try {
		canonical = fs.realpathSync(candidate);
	} catch {
		fail(`${label} does not resolve to an existing path`);
	}
	if (!path.isAbsolute(canonical) || canonical !== candidate) {
		fail(`${label} is redirected from its prepared canonical path`);
	}
	return canonical;
}

/**
 * Reads the current user id where the platform has one.
 * @returns The uid, or undefined on Windows or when it cannot be read.
 */
function currentUserId(): number | undefined {
	if (process.platform === "win32") {
		return undefined;
	}
	return process.getuid?.();
}

/**
 * Requires a POSIX mode to be exactly the prepared restrictive mode.
 * @param stats - The inspected file or directory.
 * @param label - Names the path in refusal messages.
 * @param mode - The required permission bits.
 */
function assertRestrictiveMode(stats: fs.Stats, label: string, mode: number): void {
	if (process.platform !== "win32" && (stats.mode & 0o777) !== mode) {
		fail(`${label} is not restrictive`);
	}
}

/**
 * Requires a storage path to be owned by the current user and, on POSIX, to carry exactly
 * the prepared restrictive mode.
 * @param stats - The inspected file or directory.
 * @param label - Names the path in refusal messages.
 * @param mode - The required permission bits.
 */
function assertOwnerAndMode(stats: fs.Stats, label: string, mode: number): void {
	const owner = currentUserId();
	if (process.platform !== "win32" && owner === undefined) {
		fail(`could not prove ownership of ${label}`);
	}
	if (owner !== undefined && stats.uid !== owner) {
		fail(`${label} is not owned by the current user`);
	}
	assertRestrictiveMode(stats, label, mode);
}

/**
 * Proves a prepared storage root is a private directory owned by the current user.
 * @param value - The candidate directory path.
 * @param label - Names the path in refusal messages.
 * @returns The canonical directory path.
 */
function assertDirectory(value: unknown, label: string): string {
	const canonical = canonicalPath(value, label);
	let stats: fs.Stats;
	try {
		stats = fs.lstatSync(canonical);
	} catch {
		fail(`${label} could not be inspected`);
	}
	if (!stats.isDirectory()) {
		fail(`${label} is not a directory`);
	}
	assertOwnerAndMode(stats, label, 0o700);
	return canonical;
}

/**
 * Proves the prepared config file is a private regular file owned by the current user.
 * @param value - The candidate file path.
 * @param label - Names the path in refusal messages.
 * @returns The canonical file path.
 */
function assertConfigFile(value: unknown, label: string): string {
	const canonical = canonicalPath(value, label);
	let stats: fs.Stats;
	try {
		stats = fs.lstatSync(canonical);
	} catch {
		fail(`${label} could not be inspected`);
	}
	if (!stats.isFile()) {
		fail(`${label} is not a regular file`);
	}
	assertOwnerAndMode(stats, label, 0o600);
	return canonical;
}

/**
 * Requires a server-reported path to canonicalize to the prepared root.
 * @param value - The path the server reported.
 * @param label - Names the path in refusal messages.
 * @param prepared - The canonical prepared root.
 */
function assertRootAgreement(value: unknown, label: string, prepared: string): void {
	if (canonicalPath(value, label) !== prepared) {
		fail(`${label} does not match the prepared storage root`);
	}
}

/**
 * Requires the effective sqlite_home config value to be present and to agree with the
 * prepared root.
 * @param value - The effective config value.
 * @param label - Names the value in refusal messages.
 * @param prepared - The canonical prepared root.
 */
function assertSqliteValue(value: unknown, label: string, prepared: string): void {
	if (typeof value !== "string") {
		fail(`${label} is missing or null`);
	}
	assertRootAgreement(value, label, prepared);
}

/**
 * Requires sqlite_home to originate from the prepared user config file and no other layer.
 * @param config - The decoded config/read response.
 * @param configPath - The canonical prepared config.toml path.
 */
function assertOrigin(config: ConfigResponse, configPath: string): void {
	const origin = config.origins["sqlite_home"];
	if (origin?.name.type !== "user") {
		fail("sqlite_home origin is not the user layer");
	}
	if (origin.name.file !== configPath || origin.name.profile !== null) {
		fail("sqlite_home origin is not the prepared CODEX_HOME/config.toml");
	}
}

/**
 * Requires any managed sqliteHome requirement to agree with the prepared root.
 * @param requirements - The decoded configRequirements/read response.
 * @param sqliteHome - The canonical prepared sqlite root.
 */
function assertRequirements(requirements: RequirementsResponse, sqliteHome: string): void {
	const managed = requirements.requirements;
	if (managed === null) {
		return;
	}
	if (managed.sqliteHome !== null) {
		assertRootAgreement(managed.sqliteHome, "managed sqliteHome", sqliteHome);
	}
}

/**
 * Verify server-reported storage without creating, rewriting, or locking anything.
 * @param input - The prepared storage facts and the three decoded handshake responses.
 */
export function proveCodexStorage(input: StorageProofInput): void {
	const codexHome = assertDirectory(input.storage.codexHome, "prepared CODEX_HOME");
	const sqliteHome = assertDirectory(input.storage.sqliteHome, "prepared CODEX_SQLITE_HOME");
	const configPath = assertConfigFile(input.storage.configPath, "prepared config.toml");
	if (configPath !== path.join(codexHome, "config.toml")) {
		fail("prepared config.toml is outside CODEX_HOME");
	}
	if (
		codexHome === sqliteHome ||
		isWithin(codexHome, sqliteHome) ||
		isWithin(sqliteHome, codexHome)
	) {
		fail("prepared Codex roots collide");
	}

	assertRootAgreement(input.initialize.codexHome, "initialize.codexHome", codexHome);
	const configValues = input.config.config as Record<string, unknown>;
	assertSqliteValue(configValues["sqlite_home"], "config.sqlite_home", sqliteHome);
	assertOrigin(input.config, configPath);
	assertRequirements(input.requirements, sqliteHome);
}

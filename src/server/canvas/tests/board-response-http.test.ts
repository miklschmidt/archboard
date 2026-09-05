import { afterAll, beforeAll, expect, test } from "bun:test";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const redirectedEnvironment = [
	"ARCHBOARD_VAULT",
	"HOME",
	"XDG_CONFIG_HOME",
	"XDG_STATE_HOME",
	"XDG_CACHE_HOME",
	"CODEX_HOME",
	"LOCALAPPDATA",
	"LOG_FILE_PATH",
	"ARCHBOARD_REPOS",
	"EXCALIDRAW_NO_AUTOSTART",
] as const;

const inheritedEnvironment = new Map(
	redirectedEnvironment.map((name) => [name, process.env[name]] as const),
);
const disposablePrefix = path.join(realpathSync(tmpdir()), "archboard-board-response-http-");
const ownedRoot = mkdtempSync(disposablePrefix);
const vault = path.join(ownedRoot, "vault");
const home = path.join(ownedRoot, "home");
const config = path.join(ownedRoot, "config");
const state = path.join(ownedRoot, "state");
const cache = path.join(ownedRoot, "cache");
const codexHome = path.join(ownedRoot, "codex-home");
const localAppData = path.join(ownedRoot, "local-app-data");
const logFile = path.join(ownedRoot, "logs", "archboard.log");
const repoRegistry = path.join(ownedRoot, "registry", "repos.json");

for (const directory of [
	vault,
	home,
	config,
	state,
	cache,
	codexHome,
	localAppData,
	path.dirname(logFile),
	path.dirname(repoRegistry),
]) {
	mkdirSync(directory, { recursive: true });
}

Object.assign(process.env, {
	ARCHBOARD_VAULT: vault,
	HOME: home,
	XDG_CONFIG_HOME: config,
	XDG_STATE_HOME: state,
	XDG_CACHE_HOME: cache,
	CODEX_HOME: codexHome,
	LOCALAPPDATA: localAppData,
	LOG_FILE_PATH: logFile,
	ARCHBOARD_REPOS: repoRegistry,
	EXCALIDRAW_NO_AUTOSTART: "1",
});

function restoreEnvironmentAndRemoveOwnedRoot(): void {
	for (const [name, value] of inheritedEnvironment) {
		if (value === undefined) {
			Reflect.deleteProperty(process.env, name);
		} else {
			process.env[name] = value;
		}
	}
	if (!ownedRoot.startsWith(disposablePrefix)) {
		throw new Error("Refusing to remove an unrecognised board response test directory.");
	}
	rmSync(ownedRoot, { recursive: true, force: true });
}

const canonicalVault = realpathSync(vault);
const canonicalLibrary = path.resolve(canonicalVault, ".archboard", "library.excalidrawlib");
try {
	if (!canonicalLibrary.startsWith(`${canonicalVault}${path.sep}`)) {
		throw new Error("Board response test did not select a library inside its disposable vault.");
	}
	const { libraryFilePath } = await import("../../../runtime/engine/library.js");
	if (libraryFilePath() !== canonicalLibrary) {
		throw new Error("Board response test product modules did not select the disposable library.");
	}
} catch (error) {
	restoreEnvironmentAndRemoveOwnedRoot();
	throw error;
}

let server: Server | undefined;
let baseUrl = "";

beforeAll(async () => {
	const { default: application } = await import("../index.js");
	server = application.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Board response test server did not expose a TCP port.");
	}
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	if (server !== undefined) {
		const closed = once(server, "close");
		server.close();
		await closed;
	}
	restoreEnvironmentAndRemoveOwnedRoot();
});

test("returns the public board-required response when board info has no target", async () => {
	const response = await fetch(`${baseUrl}/api/boards/info`);

	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		success: false,
		error:
			"board info needs a board, and none was named. Nothing was done. Pass one — `--board <key>` on the command line or `?board=<key>` on the API. The vault currently holds no named board. `board list` shows what the vault holds. There is no default board on purpose: a board is part of what you are asking for (ADR 0020).",
		code: "BOARD_REQUIRED",
		available: [],
	});
});

test("returns the public board-resolution response for a missing preview", async () => {
	const response = await fetch(`${baseUrl}/api/boards/preview?board=missing`);

	expect(response.status).toBe(404);
	expect(await response.json()).toEqual({
		success: false,
		error: `Board "missing" was not found in the vault at ${canonicalVault}. Run \`board list\` to see what exists, or \`board new missing\` to create it.`,
		code: "BOARD_RESOLUTION_FAILED",
		board: "missing",
		reason: "missing",
	});
	expect(readdirSync(canonicalVault)).toEqual([]);
});

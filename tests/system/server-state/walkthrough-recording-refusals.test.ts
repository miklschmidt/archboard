// Refusing a recording (TASK-304): `archboard semantic record` against a real Archboard server, with no
// browser and no voice. What is guarded: a recording that cannot happen keeps the board even when
// --discard asked for it gone, and writes no file; and what the command can tell before a browser
// starts it refuses before one does. The recorder is named as /bin/false throughout, so a refusal
// that came only after trying to record would exit as the recorder's instead.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const vault = mkdtempSync(join(tmpdir(), "archboard-recording-refusals-"));
const BOARD = "tour";
const boardFile = join(vault, `${BOARD}.semantic.json`);
const out = join(vault, "tour.mp4");
let server: OwnedServer;

/**
 * Record the board, with a browser that can never start.
 * @param args What follows the board's name.
 * @returns How the command exited and what it printed.
 */
const record = (args: readonly string[]) =>
	runServerCli({
		repoRoot,
		vault,
		base: server.base,
		args: ["semantic", "record", BOARD, ...args],
		input: undefined,
		env: { ARCHBOARD_RENDERER_CHROMIUM: "/bin/false" },
	});

/**
 * Whether nothing a recording writes is in the vault: no video and no partial one.
 * @returns True when there is neither.
 */
const nothingWritten = () =>
	!readdirSync(vault).some((name) => name.endsWith(".mp4") || name.endsWith(".partial"));

beforeAll(async () => {
	server = await startOwnedServer({ serverPath: join(repoRoot, "src/server.ts"), vault });
	const created = runServerCli({
		repoRoot,
		vault,
		base: server.base,
		args: ["semantic", "new", BOARD, "--doing", "making a board to record"],
		input: JSON.stringify({
			level: "system",
			nodes: [{ name: "Gateway", kind: "service" }],
			walkthroughs: [
				{ name: "How a request lands", beats: [{ heading: "The front door", body: "It enters." }] },
			],
		}),
	});
	expect(created.status, created.stderr).toBe(0);
});

afterAll(async () => {
	await server?.dispose();
	rmSync(vault, { recursive: true, force: true });
});

test("a recorder that cannot start is RECORDER_UNAVAILABLE and keeps the board --discard named", () => {
	const refused = record(["--out", out, "--discard", "--doing", "recording the tour"]);
	expect(refused.status).toBe(4);
	expect(refused.stdout).toBe("");
	expect(existsSync(boardFile)).toBe(true);
	expect(nothingWritten()).toBe(true);
});

test("--discard without --doing is refused before a browser is started", () => {
	const refused = record(["--out", out, "--discard"]);
	expect(refused.status).toBe(1);
	expect(existsSync(boardFile)).toBe(true);
	expect(nothingWritten()).toBe(true);
});

test("a walkthrough the board does not state is a usage error", () => {
	const refused = record(["--walkthrough", "Nowhere", "--out", out]);
	expect(refused.status).toBe(2);
	expect(nothingWritten()).toBe(true);
});

test("an --out whose directory does not exist is a usage error before anything starts", () => {
	const refused = record(["--out", join(vault, "missing", "tour.mp4")]);
	expect(refused.status).toBe(2);
	expect(existsSync(join(vault, "missing"))).toBe(false);
});

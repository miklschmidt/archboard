// Refusing a recording (TASK-304): `archboard semantic record` against a real Archboard server, with no
// browser and no voice. What is guarded: a recording that cannot happen keeps the board even when
// --discard asked for it gone, and writes no file; and what the command can tell before a browser
// starts it refuses before one does. The recorder is a script that leaves a mark when started and
// fails, so a refusal that came only after trying to record shows in the mark, and the two
// unavailable refusals (both exit 4) are told apart by it. ffmpeg is a fake that can encode,
// except where the encoder is what is refused (TASK-381). `semantic replay` is refused the same
// way: a talk that cannot be rendered is a usage error before any browser starts.

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import { prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const holder = mkdtempSync(join(tmpdir(), "archboard-recording-refusals-"));
const vault = vaultIn(holder);
const BOARD = "tour";
const boardFile = join(vault, `${BOARD}.semantic.json`);
const out = join(vault, "tour.mp4");
const started = join(vault, "browser-started");
const browser = join(vault, "browser.sh");
const ffmpeg = prepareFakeFfmpeg(vault).executablePath;
let server: OwnedServer;

/**
 * Record the board, with a browser that marks that it started and can never record.
 * @param args What follows the board's name.
 * @param env What the command's environment has besides the browser and a working ffmpeg.
 * @returns How the command exited and what it printed.
 */
const record = (args: readonly string[], env: Readonly<Record<string, string>> = {}) => {
	rmSync(started, { force: true });
	return runServerCli({
		repoRoot,
		server,
		args: ["semantic", "record", BOARD, ...args],
		input: undefined,
		env: { ARCHBOARD_RENDERER_CHROMIUM: browser, ARCHBOARD_FFMPEG: ffmpeg, ...env },
	});
};

/**
 * Whether nothing a recording writes is in the vault: no video and no partial one.
 * @returns True when there is neither.
 */
const nothingWritten = () =>
	!readdirSync(vault).some((name) => name.endsWith(".mp4") || name.endsWith(".partial"));

beforeAll(async () => {
	// A shell builtin, so the browser starts whatever PATH holds.
	writeFileSync(browser, `#!/bin/sh\n: > '${started}'\nexit 1\n`);
	chmodSync(browser, 0o700);
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	const created = runServerCli({
		repoRoot,
		server,
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
	rmSync(holder, { recursive: true, force: true });
});

test("a recorder that cannot start is RECORDER_UNAVAILABLE and keeps the board --discard named", () => {
	const refused = record(["--out", out, "--discard", "--doing", "recording the tour"]);
	expect(refused.status).toBe(4);
	expect(refused.stdout).toBe("");
	// It was the browser that could not record, so it was started.
	expect(existsSync(started)).toBe(true);
	expect(existsSync(boardFile)).toBe(true);
	expect(nothingWritten()).toBe(true);
});

test("no ffmpeg and no nix is ENCODER_UNAVAILABLE before a browser is started", () => {
	// A PATH with only what bin/archboard runs on and the git that finds the vault, so the
	// CLI starts and there is neither ffmpeg nor nix.
	const bin = join(vault, "only-bun");
	mkdirSync(bin);
	symlinkSync(process.execPath, join(bin, "bun"));
	for (const tool of ["bash", "realpath", "dirname", "git"]) {
		symlinkSync(Bun.which(tool) ?? `/usr/bin/${tool}`, join(bin, tool));
	}
	const refused = record(["--out", out, "--discard", "--doing", "recording the tour"], {
		PATH: bin,
		ARCHBOARD_FFMPEG: "",
	});
	expect(refused.status).toBe(4);
	expect(refused.stdout).toBe("");
	expect(existsSync(started)).toBe(false);
	expect(existsSync(boardFile)).toBe(true);
	expect(nothingWritten()).toBe(true);
});

test("a named ffmpeg that cannot run is ENCODER_UNAVAILABLE and does not fall back", () => {
	const refused = record(["--out", out], { ARCHBOARD_FFMPEG: join(vault, "missing-ffmpeg") });
	expect(refused.status).toBe(4);
	expect(existsSync(started)).toBe(false);
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

/**
 * Replay a talk, with the same browser that marks that it started and can never render.
 * @param talk The talk's directory.
 * @returns How the command exited and what it printed.
 */
const replay = (talk: string) => {
	rmSync(started, { force: true });
	return runServerCli({
		repoRoot,
		server,
		args: ["semantic", "replay", talk, "--out", out],
		input: undefined,
		env: { ARCHBOARD_RENDERER_CHROMIUM: browser, ARCHBOARD_FFMPEG: ffmpeg },
	});
};

test("a talk that is missing or malformed is a usage error before a browser is started", () => {
	const malformed = join(vault, "malformed-talk");
	mkdirSync(malformed);
	writeFileSync(join(malformed, "talk.json"), "{}");
	for (const talk of [malformed, join(vault, "no-such-talk")]) {
		const refused = replay(talk);
		expect(refused.status).toBe(2);
		expect(refused.stdout).toBe("");
		expect(existsSync(started)).toBe(false);
		expect(nothingWritten()).toBe(true);
	}
});

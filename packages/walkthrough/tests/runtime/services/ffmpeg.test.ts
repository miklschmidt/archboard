// Finding and proving the ffmpeg a recording is encoded with (TASK-381).
//
// What is guarded: the environment's ARCHBOARD_FFMPEG wins and is never passed over, even when it
// is broken; then ffmpeg on PATH; then nixpkgs' through nix; and with none of these the
// recording is refused as ENCODER_UNAVAILABLE. A probe runs the command and refuses, before a
// browser starts, one that does not run, or lacks an encoder its container needs, by name.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findFfmpeg, probeFfmpeg, type FfmpegCommand } from "#runtime/services/ffmpeg.ts";

const signal = new AbortController().signal;
let root: string;

/** What `ffmpeg -encoders` lists: a header, then a row per encoder. */
const listing = (names: readonly string[]): string =>
	[
		"Encoders:",
		" ------",
		...names.map((name) => ` V....D ${name.padEnd(20)} ${name} encoder (codec)`),
	].join("\n");

const MP4 = ["libx264", "aac", "libvpx-vp9"];
const WEBM = ["libvpx-vp9", "libopus"];

/**
 * A fake executable in the temporary directory.
 * @param name Its file name.
 * @param body Its shell script.
 * @returns Its path.
 */
function executable(name: string, body: string): string {
	const path = join(root, name);
	writeFileSync(path, `#!/bin/sh\n${body}\n`);
	chmodSync(path, 0o700);
	return path;
}

/**
 * A fake ffmpeg that offers some encoders.
 * @param name Its file name.
 * @param names The encoders it lists.
 * @returns Its path.
 */
const fakeFfmpeg = (name: string, names: readonly string[]): string =>
	executable(name, `cat <<'EOF'\n${listing(names)}\nEOF`);

/**
 * The refusal a promise or call ends in.
 * @param attempt What refuses.
 * @returns The error's code and message.
 */
async function refusal(attempt: () => unknown): Promise<{ code: unknown; message: string }> {
	try {
		await attempt();
	} catch (error) {
		return {
			code: (error as { code?: unknown }).code,
			message: error instanceof Error ? error.message : String(error),
		};
	}
	throw new Error("It did not refuse.");
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-ffmpeg-"));
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

const lookups = (env: Record<string, string>, on: Record<string, string>) => ({
	env,
	which: (name: string) => on[name] ?? null,
});

test("resolution prefers the named ffmpeg, then PATH, then nix", () => {
	const both = { ffmpeg: "/bin/ffmpeg", nix: "/bin/nix" };
	expect(findFfmpeg(lookups({ ARCHBOARD_FFMPEG: "/opt/ff" }, both))).toEqual({
		argv: ["/opt/ff"],
		via: "ARCHBOARD_FFMPEG",
	});
	expect(findFfmpeg(lookups({}, both))).toEqual({ argv: ["/bin/ffmpeg"], via: "PATH" });
	// An empty variable names nothing.
	expect(findFfmpeg(lookups({ ARCHBOARD_FFMPEG: "" }, both)).via).toBe("PATH");
	const nix = findFfmpeg(lookups({}, { nix: "/bin/nix" }));
	expect(nix.via).toBe("nix");
	expect(nix.argv[0]).toBe("nix");
	expect(nix.argv).toContain("nixpkgs#ffmpeg-headless");
	// The features a default Nix install needs, and the end of nix's own options.
	expect(nix.argv.slice(1, 3)).toEqual(["--extra-experimental-features", "nix-command flakes"]);
	expect(nix.argv.at(-1)).toBe("--");
});

test("no ffmpeg and no nix is refused as ENCODER_UNAVAILABLE naming both ways out", async () => {
	const refused = await refusal(() => findFfmpeg(lookups({}, {})));
	expect(refused.code).toBe("ENCODER_UNAVAILABLE");
	expect(refused.message).toContain("ARCHBOARD_FFMPEG");
	expect(refused.message).toContain("nix");
});

test("a named ffmpeg that does not run is refused naming the variable, not passed over", async () => {
	const good = fakeFfmpeg("path-ffmpeg", MP4);
	// A good ffmpeg on PATH and nix are both there: neither is the one that was asked for.
	const command = findFfmpeg(
		lookups({ ARCHBOARD_FFMPEG: join(root, "missing") }, { ffmpeg: good, nix: "/bin/nix" }),
	);
	expect(command.via).toBe("ARCHBOARD_FFMPEG");
	const missing = await refusal(() => probeFfmpeg(command, "mp4", signal));
	expect(missing).toMatchObject({ code: "ENCODER_UNAVAILABLE" });
	expect(missing.message).toContain("ARCHBOARD_FFMPEG");
	const broken: FfmpegCommand = {
		argv: [executable("broken", "echo nope >&2; exit 3")],
		via: "ARCHBOARD_FFMPEG",
	};
	const failed = await refusal(() => probeFfmpeg(broken, "mp4", signal));
	expect(failed).toMatchObject({ code: "ENCODER_UNAVAILABLE" });
	expect(failed.message).toContain("ARCHBOARD_FFMPEG");
});

test("a probe accepts the encoders a container needs and refuses one that lacks any by name", async () => {
	const ffmpeg: FfmpegCommand = { argv: [fakeFfmpeg("ff", MP4)], via: "PATH" };
	await probeFfmpeg(ffmpeg, "mp4", signal);
	const noAac = { argv: [fakeFfmpeg("no-aac", ["libx264", "libvpx-vp9"])], via: "PATH" } as const;
	expect(await refusal(() => probeFfmpeg(noAac, "mp4", signal))).toMatchObject({
		code: "ENCODER_UNAVAILABLE",
		message: expect.stringContaining("aac"),
	});
	const noX264 = { argv: [fakeFfmpeg("no-x264", ["aac", "libvpx-vp9"])], via: "PATH" } as const;
	expect(await refusal(() => probeFfmpeg(noX264, "mp4", signal))).toMatchObject({
		code: "ENCODER_UNAVAILABLE",
		message: expect.stringContaining("libx264"),
	});
	// Each container is judged by its own encoders: this one is fine for WebM and not for MP4.
	const webmOnly = { argv: [fakeFfmpeg("webm-only", WEBM)], via: "PATH" } as const;
	await probeFfmpeg(webmOnly, "webm", signal);
	expect(await refusal(() => probeFfmpeg(webmOnly, "mp4", signal))).toMatchObject({
		message: expect.stringContaining("libx264"),
	});
	expect(await refusal(() => probeFfmpeg(ffmpeg, "webm", signal))).toMatchObject({
		message: expect.stringContaining("libopus"),
	});
});

test("a nix probe runs the nix command line and refuses with the tail of nix's stderr", async () => {
	const argvFile = join(root, "nix.argv");
	const found = findFfmpeg(lookups({}, { nix: "/bin/nix" }));
	// Only the program differs from what the recorder would run: the fake nix is named by path.
	const withFake = (fake: string): FfmpegCommand => ({
		argv: [fake, ...found.argv.slice(1)],
		via: "nix",
	});
	const fake = executable(
		"nix-ok",
		`printf '%s\\n' "$@" > '${argvFile}'\ncat <<'EOF'\n${listing(MP4)}\nEOF`,
	);
	await probeFfmpeg(withFake(fake), "mp4", signal);
	// It ran what findFfmpeg resolved, then asked ffmpeg for its encoders.
	expect(readFileSync(argvFile, "utf8").trimEnd().split("\n")).toEqual([
		...found.argv.slice(1),
		"-hide_banner",
		"-encoders",
	]);
	const offline = executable(
		"nix-offline",
		"echo 'error: unable to download cache.nixos.org: could not resolve host' >&2\nexit 1",
	);
	const refused = await refusal(() => probeFfmpeg(withFake(offline), "mp4", signal));
	expect(refused.code).toBe("ENCODER_UNAVAILABLE");
	expect(refused.message).toContain("could not resolve host");
});

test("a cancelled probe rejects with the cancellation, not a refusal", async () => {
	const stuck = { argv: [executable("stuck", "exec sleep 30")], via: "PATH" } as const;
	const controller = new AbortController();
	const probing = probeFfmpeg(stuck, "mp4", controller.signal);
	controller.abort();
	expect(await refusal(() => probing)).not.toMatchObject({ code: "ENCODER_UNAVAILABLE" });
});

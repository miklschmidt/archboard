import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OpenerSelection } from "#shared/schemas/opener-settings.ts";
import { planOpenerCommand } from "#server/projections/planning.ts";
import {
	readOpenerSelection,
	resetOpenerSelection,
	saveOpenerSelection,
} from "#server/store/configuration.ts";

let root: string;
let config: string;
let previous: string | undefined;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-opener-config-"));
	config = join(root, "missing", "opener.json");
	previous = process.env["ARCHBOARD_OPENER_CONFIG"];
	process.env["ARCHBOARD_OPENER_CONFIG"] = config;
});

afterEach(() => {
	if (previous === undefined) {
		delete process.env["ARCHBOARD_OPENER_CONFIG"];
	} else {
		process.env["ARCHBOARD_OPENER_CONFIG"] = previous;
	}
	rmSync(root, { recursive: true });
});

describe("machine opener state", () => {
	test("defaults without writing, then creates the parent on first atomic save", () => {
		expect(readOpenerSelection()).toEqual({
			ok: true,
			selection: { version: 1, kind: "platform" },
		});
		expect(existsSync(config)).toBeFalse();
		expect(saveOpenerSelection({ version: 1, kind: "preset", preset: "cursor" })).toEqual({
			ok: true,
			selection: { version: 1, kind: "preset", preset: "cursor" },
		});
		expect(JSON.parse(readFileSync(config, "utf8"))).toEqual({
			version: 1,
			kind: "preset",
			preset: "cursor",
		});
	});

	test("reports corrupt state and reset atomically recovers it", () => {
		saveOpenerSelection({ version: 1, kind: "platform" });
		const corrupt = Buffer.from("not-json\n");
		writeFileSync(config, corrupt);
		expect(readOpenerSelection()).toMatchObject({ ok: false, code: "OPENER_CONFIG_INVALID" });
		expect(saveOpenerSelection({ version: 1, kind: "preset", preset: "zed" })).toMatchObject({
			ok: false,
			code: "OPENER_CONFIG_INVALID",
		});
		expect(readFileSync(config)).toEqual(corrupt);
		expect(resetOpenerSelection()).toEqual({
			ok: true,
			selection: { version: 1, kind: "platform" },
		});
		expect(readOpenerSelection()).toEqual({
			ok: true,
			selection: { version: 1, kind: "platform" },
		});
	});
});

/**
 * A custom opener selection.
 * @param argv Its arguments.
 * @returns The selection.
 */
const custom = (argv: string[]): OpenerSelection => ({
	version: 1,
	kind: "custom",
	executable: "/opt/editor",
	argv,
});

describe("pure opener plans", () => {
	test.each([
		["darwin", "open"],
		["linux", "xdg-open"],
		["win32", "explorer.exe"],
	] as const)("uses the %s native default", (platform, executable) => {
		expect(planOpenerCommand({ version: 1, kind: "platform" }, "/repo/a b", { platform })).toEqual({
			ok: true,
			command: { executable, argv: ["/repo/a b"] },
		});
	});

	test("returns a typed unsupported-platform result", () => {
		expect(
			planOpenerCommand({ version: 1, kind: "platform" }, "/repo", { platform: "freebsd" }),
		).toMatchObject({
			ok: false,
			code: "OPENER_PLATFORM_UNSUPPORTED",
		});
	});

	test.each([
		["vscode", "code"],
		["cursor", "cursor"],
		["zed", "zed"],
	] as const)("plans the %s preset", (preset, executable) => {
		expect(
			planOpenerCommand({ version: 1, kind: "preset", preset }, "/repo", { platform: "linux" }),
		).toEqual({
			ok: true,
			command: { executable, argv: ["/repo"] },
		});
	});

	test.each([
		["vscode", ["--goto", "/repo/a b.ts:42"]],
		["cursor", ["--goto", "/repo/a b.ts:42"]],
		["zed", ["/repo/a b.ts:42"]],
	] as const)("opens the %s preset at the line", (preset, argv) => {
		const plan = planOpenerCommand({ version: 1, kind: "preset", preset }, "/repo/a b.ts", {
			line: 42,
		});
		expect(plan).toMatchObject({ ok: true, command: { argv } });
	});

	test("the native opener has no line, and a custom one gets it only where it writes {line}", () => {
		expect(
			planOpenerCommand({ version: 1, kind: "platform" }, "/repo/a.ts", {
				line: 7,
				platform: "linux",
			}),
		).toMatchObject({ ok: true, command: { argv: ["/repo/a.ts"] } });
		const goto = custom(["--goto", "{path}:{line}", "--again={line}"]);
		expect(planOpenerCommand(goto, "/repo/a.ts", { line: 7 })).toMatchObject({
			command: { argv: ["--goto", "/repo/a.ts:7", "--again=7"] },
		});
		expect(planOpenerCommand(goto, "/repo/a.ts")).toMatchObject({
			command: { argv: ["--goto", "/repo/a.ts:1", "--again=1"] },
		});
		// A path that spells the token is a path, not a second substitution.
		expect(
			planOpenerCommand(custom(["{path}", "{line}"]), "/repo/{line}.ts", { line: 3 }),
		).toMatchObject({ command: { argv: ["/repo/{line}.ts", "3"] } });
	});

	test("substitutes one custom path without shell parsing", () => {
		expect(
			planOpenerCommand(
				{
					version: 1,
					kind: "custom",
					executable: "/opt/editor",
					argv: ["--literal=$HOME;touch /tmp/no", "prefix={path}"],
				},
				"/repo/a b",
				{ platform: "linux" },
			),
		).toEqual({
			ok: true,
			command: {
				executable: "/opt/editor",
				argv: ["--literal=$HOME;touch /tmp/no", "prefix=/repo/a b"],
			},
		});
	});

	test("rejects a cwd-relative executable containing separators", () => {
		expect(
			planOpenerCommand(
				{ version: 1, kind: "custom", executable: "./editor", argv: ["{path}"] },
				"/repo",
				{ platform: "linux" },
			),
		).toMatchObject({ ok: false, code: "OPENER_CONFIG_INVALID" });
	});
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	planOpenerCommand,
	readOpenerSelection,
	resetOpenerSelection,
	saveOpenerSelection,
} from "../index.ts";

let root: string;
let config: string;
let previous: string | undefined;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-opener-config-"));
	config = join(root, "missing", "opener.json");
	previous = process.env.ARCHBOARD_OPENER_CONFIG;
	process.env.ARCHBOARD_OPENER_CONFIG = config;
});

afterEach(() => {
	if (previous === undefined) delete process.env.ARCHBOARD_OPENER_CONFIG;
	else process.env.ARCHBOARD_OPENER_CONFIG = previous;
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
		writeFileSync(config, "not-json");
		expect(readOpenerSelection()).toMatchObject({ ok: false, code: "OPENER_CONFIG_INVALID" });
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

describe("pure opener plans", () => {
	test.each([
		["darwin", "open"],
		["linux", "xdg-open"],
		["win32", "explorer.exe"],
	] as const)("uses the %s native default", (platform, executable) => {
		expect(planOpenerCommand({ version: 1, kind: "platform" }, "/repo/a b", platform)).toEqual({
			ok: true,
			command: { executable, argv: ["/repo/a b"] },
		});
	});

	test("returns a typed unsupported-platform result", () => {
		expect(planOpenerCommand({ version: 1, kind: "platform" }, "/repo", "freebsd")).toMatchObject({
			ok: false,
			code: "OPENER_PLATFORM_UNSUPPORTED",
		});
	});

	test.each([
		["vscode", "code"],
		["cursor", "cursor"],
		["zed", "zed"],
	] as const)("plans the %s preset", (preset, executable) => {
		expect(planOpenerCommand({ version: 1, kind: "preset", preset }, "/repo", "linux")).toEqual({
			ok: true,
			command: { executable, argv: ["/repo"] },
		});
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
				"linux",
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
				"linux",
			),
		).toMatchObject({ ok: false, code: "OPENER_CONFIG_INVALID" });
	});
});

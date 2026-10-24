import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
	CODEX_RETAINED_ENVIRONMENT_KEYS,
	CodexEnvironmentError,
	buildCodexChildEnvironment,
	type CodexChildEnvironmentInput,
} from "#runtime/services/environment.ts";

const roots = { codexHome: "/tmp/dedicated home", sqliteHome: "/tmp/dedicated sqlite" };

describe("Codex child environment", () => {
	test("retains only allowlisted ambient values without host additions", () => {
		const ambient = {
			...Object.fromEntries(CODEX_RETAINED_ENVIRONMENT_KEYS.map((key) => [key, `value:${key}`])),
			PWD: "poisoned-pwd",
			CODEX_HOME: "poisoned-home",
			CODEX_SQLITE_HOME: "poisoned-sqlite",
			CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "poisoned-originator",
			OPENAI_API_KEY: "poisoned-secret",
			AWS_PROFILE: "poisoned-aws",
			ELECTRON_RUN_AS_NODE: "poisoned-electron",
			ARCHBOARD_URL: "http://ambient.invalid",
			ARCHBOARD_NO_AUTOSTART: "0",
			ARCHBOARD_VAULT: "/poisoned/vault",
		};
		const child = buildCodexChildEnvironment({ ...roots, ambient });
		expect(Object.keys(child)).toEqual([
			...CODEX_RETAINED_ENVIRONMENT_KEYS,
			"CODEX_HOME",
			"CODEX_SQLITE_HOME",
		]);
		expect(child["PATH"]).toBe("value:PATH");
		expect(child["CODEX_HOME"]).toBe(roots.codexHome);
		expect(child["CODEX_SQLITE_HOME"]).toBe(roots.sqliteHome);
		expect(Object.isFrozen(child)).toBe(true);
		expect(buildCodexChildEnvironment({ ...roots, ambient: { PATH: undefined } })).toEqual({
			CODEX_HOME: roots.codexHome,
			CODEX_SQLITE_HOME: roots.sqliteHome,
		});
	});

	test("applies host additions and ordered PATH prefixes but protects private roots", () => {
		const child = buildCodexChildEnvironment({
			...roots,
			ambient: { PATH: "/ambient/bin", ARCHBOARD_VAULT: "/poisoned/vault" },
			hostEnvironment: {
				PATH: "/host/bin",
				APP_ENDPOINT: "http://host.invalid",
				CODEX_HOME: "/host/codex-home",
				CODEX_SQLITE_HOME: "/host/sqlite-home",
			},
			pathPrefixes: ["/first/bin", "/second/bin"],
		});
		expect(child).toEqual({
			PATH: ["/first/bin", "/second/bin", "/host/bin"].join(path.delimiter),
			APP_ENDPOINT: "http://host.invalid",
			CODEX_HOME: roots.codexHome,
			CODEX_SQLITE_HOME: roots.sqliteHome,
		});
		expect(
			buildCodexChildEnvironment({ ...roots, ambient: {}, pathPrefixes: ["/host/bin"] }),
		).toEqual({
			PATH: "/host/bin",
			CODEX_HOME: roots.codexHome,
			CODEX_SQLITE_HOME: roots.sqliteHome,
		});
	});

	test("rejects invalid ambient values, host entries, roots and PATH prefixes", () => {
		const invalid: readonly Partial<CodexChildEnvironmentInput>[] = [
			{ ambient: { PATH: "bad\0value" } },
			{ hostEnvironment: { APP_ENDPOINT: "bad\0value" } },
			{ hostEnvironment: { "": "value" } },
			{ hostEnvironment: { "BAD=KEY": "value" } },
			{ hostEnvironment: { "BAD\0KEY": "value" } },
			{ codexHome: "relative" },
			{ sqliteHome: "" },
			{ pathPrefixes: ["relative"] },
			{ pathPrefixes: ["/bad\0path"] },
		];
		for (const input of invalid) {
			expect(() => buildCodexChildEnvironment({ ...roots, ambient: {}, ...input })).toThrow(
				CodexEnvironmentError,
			);
		}
	});

	test("reads each host value once and copies only the validated value", () => {
		let reads = 0;
		const child = buildCodexChildEnvironment({
			...roots,
			ambient: {},
			hostEnvironment: {
				get APP_ENDPOINT() {
					reads += 1;
					return reads === 1 ? "http://host.invalid" : "bad\0value";
				},
			},
		});
		expect(child["APP_ENDPOINT"]).toBe("http://host.invalid");
		expect(reads).toBe(1);
	});

	test("rejects PATH prefixes that introduce additional or empty search entries", () => {
		const sparse: string[] = [];
		sparse[1] = "/host/bin";
		for (const pathPrefixes of [[`/host/bin${path.delimiter}relative`], sparse]) {
			expect(() => buildCodexChildEnvironment({ ...roots, ambient: {}, pathPrefixes })).toThrow(
				CodexEnvironmentError,
			);
		}
	});
});

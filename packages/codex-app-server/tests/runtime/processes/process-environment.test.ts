import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import path from "node:path";

import {
	CODEX_APP_SERVER_ARGUMENTS,
	createCodexProcessForTesting,
} from "#runtime/processes/process.ts";
import {
	fixture,
	processOptions,
	removeRoot,
	temporaryRoot,
} from "#tests/runtime/support/process-support.ts";

describe("Codex process environment", () => {
	test("starts without host additions and excludes ambient Archboard variables", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcessForTesting> | undefined;
		try {
			const executable = fixture(
				root,
				`console.log(JSON.stringify({ argv: process.argv.slice(2), home: process.env.CODEX_HOME, sqlite: process.env.CODEX_SQLITE_HOME, pwd: process.env.PWD, secret: process.env.OPENAI_API_KEY, archboard: Object.keys(process.env).filter(key => key.startsWith("ARCHBOARD_")) })); process.stdin.resume(); process.on("SIGTERM", () => process.exit(0));`,
			);
			const processOwner = createCodexProcessForTesting({
				...processOptions(root, executable),
				dependencies: {
					spawn(command, args, options) {
						// Measure the supplied environment before the executable's runtime starts.
						// On NixOS the ELF loader adds LD_LIBRARY_PATH to an ordinary Bun child.
						expect(Object.keys(options.env ?? {})).toEqual([
							"HOME",
							"PATH",
							"CODEX_HOME",
							"CODEX_SQLITE_HOME",
						]);
						return spawn(command, args, options);
					},
				},
			});
			owner = processOwner;
			const output = new Promise<Record<string, unknown>>((resolve) => {
				const unsubscribe = processOwner.onChild((child) => {
					child.lifecycle.markAppServerReady();
					child.stdout.once("data", (chunk) => {
						unsubscribe();
						resolve(JSON.parse(chunk.toString()) as Record<string, unknown>);
					});
				});
			});
			const started = await processOwner.start();
			const observed = await output;
			expect(started.state).toBe("running");
			expect(started.ready).toBe(true);
			expect(started.argv).toEqual([executable, ...CODEX_APP_SERVER_ARGUMENTS]);
			expect(observed["argv"]).toEqual([...CODEX_APP_SERVER_ARGUMENTS]);
			expect(observed["home"]).toBe(path.join(root, "storage", "codex-home"));
			expect(observed["sqlite"]).toBe(path.join(root, "storage", "sqlite-home"));
			expect(observed["archboard"]).toEqual([]);
			expect(observed["pwd"]).toBeUndefined();
			expect(observed["secret"]).toBeUndefined();
			expect(processOwner.snapshot().stderr.totalBytes).toBe(0);
			expect(processOwner.snapshot().stderr.redacted).toBe(true);
			const stopped = await processOwner.stop();
			expect(stopped.state).toBe("stopped");
			expect(stopped.lastExit?.classification).toBe("requested");
			expect(await processOwner.stop()).toBe(stopped);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("passes explicit host additions and PATH prefixes while protecting prepared storage", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcessForTesting> | undefined;
		try {
			const executable = fixture(
				root,
				`console.log(JSON.stringify({ endpoint: process.env.APP_ENDPOINT, path: process.env.PATH, home: process.env.CODEX_HOME, sqlite: process.env.CODEX_SQLITE_HOME })); process.stdin.resume();`,
			);
			const processOwner = createCodexProcessForTesting({
				...processOptions(root, executable),
				hostEnvironment: {
					APP_ENDPOINT: "http://host.invalid",
					PATH: "/host/bin",
					CODEX_HOME: "/host/codex-home",
					CODEX_SQLITE_HOME: "/host/sqlite-home",
				},
				pathPrefixes: ["/first/bin", "/second/bin"],
			});
			owner = processOwner;
			const output = new Promise<Record<string, unknown>>((resolve) => {
				processOwner.onChild((child) => {
					child.lifecycle.markAppServerReady();
					child.stdout.once("data", (chunk) => {
						resolve(JSON.parse(chunk.toString()) as Record<string, unknown>);
					});
				});
			});
			expect((await processOwner.start()).state).toBe("running");
			expect(await output).toEqual({
				endpoint: "http://host.invalid",
				path: ["/first/bin", "/second/bin", "/host/bin"].join(path.delimiter),
				home: path.join(root, "storage", "codex-home"),
				sqlite: path.join(root, "storage", "sqlite-home"),
			});
		} finally {
			try {
				if (owner) await owner.stop();
			} finally {
				removeRoot(root);
			}
		}
	});
});

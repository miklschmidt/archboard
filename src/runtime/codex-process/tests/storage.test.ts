import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	CODEX_RETAINED_ENVIRONMENT_KEYS,
	buildCodexChildEnvironment,
	CodexStorageError,
	prepareCodexStorage,
} from "../index.js";
import type { CodexStorageFileSystem } from "../index.js";

function temporaryRoot(): string {
	return mkdtempSync(path.join(tmpdir(), "archboard-codex-process-test-"));
}

function removeRoot(root: string): void {
	fs.rmSync(root, { recursive: true, force: true });
}

function fileSystem(): CodexStorageFileSystem {
	return {
		lstatSync: fs.lstatSync.bind(fs),
		statSync: fs.statSync.bind(fs),
		mkdirSync: fs.mkdirSync.bind(fs),
		openSync: fs.openSync.bind(fs),
		writeFileSync: fs.writeFileSync.bind(fs),
		fsyncSync: fs.fsyncSync.bind(fs),
		closeSync: fs.closeSync.bind(fs),
		renameSync: fs.renameSync.bind(fs),
		unlinkSync: fs.unlinkSync.bind(fs),
		readFileSync: fs.readFileSync.bind(fs),
		realpathSync: fs.realpathSync.bind(fs),
	};
}

describe("Codex child environment", () => {
	test("copies only the authored keys in order and overwrites both roots", () => {
		const ambient: Record<string, string> = Object.fromEntries(
			CODEX_RETAINED_ENVIRONMENT_KEYS.map((key) => [key, `value:${key}`]),
		);
		Object.assign(ambient, {
			PWD: "poisoned-pwd",
			CODEX_HOME: "poisoned-home",
			CODEX_SQLITE_HOME: "poisoned-sqlite",
			OPENAI_API_KEY: "poisoned-secret",
			AWS_PROFILE: "poisoned-aws",
			ELECTRON_RUN_AS_NODE: "poisoned-electron",
		});

		const child = buildCodexChildEnvironment({
			ambient,
			codexHome: "/tmp/dedicated home",
			sqliteHome: "/tmp/dedicated sqlite",
		});
		expect(Object.keys(child)).toEqual([
			...CODEX_RETAINED_ENVIRONMENT_KEYS,
			"CODEX_HOME",
			"CODEX_SQLITE_HOME",
		]);
		expect(child.CODEX_HOME).toBe("/tmp/dedicated home");
		expect(child.CODEX_SQLITE_HOME).toBe("/tmp/dedicated sqlite");
		expect(child.PWD).toBeUndefined();
		expect(child.OPENAI_API_KEY).toBeUndefined();
		expect(child.CODEX_HOME).not.toBe("poisoned-home");
		expect(child.PATH).toBe("value:PATH");

		const optional = buildCodexChildEnvironment({
			ambient: { HOME: "home", PATH: undefined },
			codexHome: "/tmp/home",
			sqliteHome: "/tmp/sqlite",
		});
		expect(Object.keys(optional)).toEqual(["HOME", "CODEX_HOME", "CODEX_SQLITE_HOME"]);
	});

	test("rejects a NUL in a retained value without falling through", () => {
		expect(() =>
			buildCodexChildEnvironment({
				ambient: { HOME: "safe", PATH: "bad\0value" },
				codexHome: "/tmp/home",
				sqliteHome: "/tmp/sqlite",
			}),
		).toThrow(/PATH.*NUL/);
	});
});

describe("dedicated Codex storage", () => {
	test("creates private roots and one exact, quoted config line", () => {
		const root = temporaryRoot();
		try {
			const prepared = prepareCodexStorage({ rootDirectory: root });
			expect(prepared.configText).toBe(`sqlite_home = ${JSON.stringify(prepared.sqliteHome)}\n`);
			expect(readFileSync(prepared.configPath, "utf8")).toBe(prepared.configText);
			expect(fs.statSync(prepared.codexHome).mode & 0o777).toBe(0o700);
			expect(fs.statSync(prepared.sqliteHome).mode & 0o777).toBe(0o700);
			expect(fs.statSync(prepared.configPath).mode & 0o777).toBe(0o600);
			prepared.release();

			const repeat = prepareCodexStorage({ rootDirectory: root });
			repeat.release();

			const escapedRoot = path.join(root, "escaped");
			const escaped = prepareCodexStorage({
				rootDirectory: escapedRoot,
				codexHome: path.join(escapedRoot, "codex-home"),
				sqliteHome: path.join(escapedRoot, 'sqlite "home"'),
			});
			expect(readFileSync(escaped.configPath, "utf8")).toBe(escaped.configText);
			escaped.release();
		} finally {
			removeRoot(root);
		}
	});

	test("refuses conflicts, symlink escapes, permissions, and a second owner", () => {
		const root = temporaryRoot();
		try {
			const first = prepareCodexStorage({ rootDirectory: root });
			expect(() => prepareCodexStorage({ rootDirectory: root })).toThrow(/locked or colliding/);
			first.release();

			fs.writeFileSync(first.configPath, 'sqlite_home = "/tmp/other"\n', { mode: 0o600 });
			let conflict: unknown;
			try {
				prepareCodexStorage({ rootDirectory: root });
			} catch (error) {
				conflict = error;
			}
			expect(conflict).toBeInstanceOf(CodexStorageError);
			expect((conflict as CodexStorageError).code).toBe("config_conflict");

			fs.writeFileSync(first.configPath, first.configText, { mode: 0o600 });
			fs.chmodSync(first.codexHome, 0o755);
			expect(() => prepareCodexStorage({ rootDirectory: root })).toThrow(/mode 0700/);
			fs.chmodSync(first.codexHome, 0o700);

			fs.unlinkSync(first.configPath);
			const configTarget = path.join(root, "config-target");
			fs.writeFileSync(configTarget, first.configText, { mode: 0o600 });
			symlinkSync(configTarget, first.configPath);
			expect(() => prepareCodexStorage({ rootDirectory: root })).toThrow(/symlink/);
			fs.unlinkSync(first.configPath);
			fs.writeFileSync(first.configPath, first.configText, { mode: 0o600 });

			const symlinkRoot = path.join(root, "symlink-home");
			const target = path.join(root, "target-home");
			fs.mkdirSync(target, { mode: 0o700 });
			symlinkSync(target, symlinkRoot);
			expect(() =>
				prepareCodexStorage({
					codexHome: symlinkRoot,
					sqliteHome: path.join(root, "other-sqlite"),
				}),
			).toThrow(/symlink/);
		} finally {
			removeRoot(root);
		}
	});

	test("cleans a lock file when lock initialization fails", () => {
		const root = temporaryRoot();
		try {
			const failingFileSystem = {
				...fileSystem(),
				writeFileSync: (() => {
					throw new Error("injected lock write failure");
				}) as typeof fs.writeFileSync,
			} satisfies CodexStorageFileSystem;
			let thrown: unknown;
			try {
				prepareCodexStorage({ rootDirectory: root }, { fileSystem: failingFileSystem });
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexStorageError);
			expect((thrown as CodexStorageError).code).toBe("lock");
			expect(fs.readdirSync(path.join(root, "codex-home"))).toEqual([]);
		} finally {
			removeRoot(root);
		}
	});

	test("leaves no temp file or lock after config write, fsync, or rename failure", () => {
		const root = temporaryRoot();
		try {
			const failures = [
				{
					code: "config_write",
					fileSystem: {
						...fileSystem(),
						writeFileSync: (() => {
							let writes = 0;
							return ((target: string | number | URL, data: string | NodeJS.ArrayBufferView) => {
								writes += 1;
								if (writes === 2) throw new Error("injected config write failure");
								return fs.writeFileSync(target, data);
							}) as typeof fs.writeFileSync;
						})(),
					} satisfies CodexStorageFileSystem,
				},
				{
					code: "config_fsync",
					fileSystem: {
						...fileSystem(),
						fsyncSync: (() => {
							throw new Error("injected config fsync failure");
						}) as typeof fs.fsyncSync,
					} satisfies CodexStorageFileSystem,
				},
				{
					code: "config_rename",
					fileSystem: {
						...fileSystem(),
						renameSync: (() => {
							throw new Error("injected config rename failure");
						}) as typeof fs.renameSync,
					} satisfies CodexStorageFileSystem,
				},
			] as const;
			for (const failure of failures) {
				let thrown: unknown;
				try {
					prepareCodexStorage(
						{ rootDirectory: path.join(root, failure.code) },
						{ fileSystem: failure.fileSystem },
					);
				} catch (error) {
					thrown = error;
				}
				expect(thrown).toBeInstanceOf(CodexStorageError);
				expect((thrown as CodexStorageError).code).toBe(failure.code);
				expect(fs.readdirSync(path.join(root, failure.code, "codex-home"))).toEqual([]);
			}
		} finally {
			removeRoot(root);
		}
	});
});

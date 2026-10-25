import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CodexStorageError, prepareCodexStorage } from "#runtime/store/storage.ts";
import type { CodexStorageFileSystem } from "#runtime/store/storage.ts";
import { removeRoot, temporaryRoot } from "#tests/runtime/support/process-support.ts";

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

/**
 * The code of the storage refusal a preparation throws.
 * @param prepare The preparation.
 * @returns The refusal's code, or null when it did not refuse.
 */
function refusalCode(prepare: () => unknown): string | null {
	try {
		prepare();
		return null;
	} catch (refusal) {
		return (refusal as CodexStorageError).code;
	}
}

describe("dedicated Codex storage", () => {
	test("creates private roots and a config naming the sqlite home exactly", () => {
		const root = temporaryRoot();
		try {
			const prepared = prepareCodexStorage({ rootDirectory: root });
			expect(prepared.configText).toStartWith(
				`sqlite_home = ${JSON.stringify(prepared.sqliteHome)}\n`,
			);
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

	test("servers with their own owner directories share one Codex home, and each directory has one server", () => {
		const root = temporaryRoot();
		try {
			/**
			 * The private owner directory of the server on one port.
			 * @param port The server's port.
			 * @returns The directory.
			 */
			const ownerOf = (port: string): string => {
				const directory = path.join(root, "canvases", port);
				fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
				return directory;
			};
			const [docs, dogfood] = [ownerOf("3100"), ownerOf("3000")];
			const first = prepareCodexStorage({ rootDirectory: root, ownerDirectory: docs });
			const second = prepareCodexStorage({ rootDirectory: root, ownerDirectory: dogfood });
			expect(first.codexHome).toBe(second.codexHome);
			expect(
				refusalCode(() => prepareCodexStorage({ rootDirectory: root, ownerDirectory: docs })),
			).toBe("lock");
			first.release();
			second.release();
		} finally {
			removeRoot(root);
		}
	});

	test("refuses conflicts, symlink escapes, permissions, and a second owner", () => {
		const root = temporaryRoot();
		try {
			const first = prepareCodexStorage({ rootDirectory: root });
			expect(refusalCode(() => prepareCodexStorage({ rootDirectory: root }))).toBe("lock");
			first.release();

			// Another store that still exists, and a file Codex could not read either.
			for (const foreign of [`sqlite_home = ${JSON.stringify(root)}\n`, "model = [\n"]) {
				fs.writeFileSync(first.configPath, foreign, { mode: 0o600 });
				let conflict: unknown;
				try {
					prepareCodexStorage({ rootDirectory: root });
				} catch (error) {
					conflict = error;
				}
				expect(conflict).toBeInstanceOf(CodexStorageError);
				expect((conflict as CodexStorageError).code).toBe("config_conflict");
				expect(readFileSync(first.configPath, "utf8")).toBe(foreign);
			}

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

	test("takes over a lock whose owner is gone and keeps it beside the new one", () => {
		const root = temporaryRoot();
		try {
			const first = prepareCodexStorage({ rootDirectory: root });
			const lockPath = path.join(first.codexHome, ".archboard-codex-process.lock");
			const ownRecord = readFileSync(lockPath, "utf8");
			first.release();
			const exitedPid = Bun.spawnSync(["true"]).pid;
			const reusedPid = `${process.pid} ${Number(ownRecord.split(" ")[1]) + 1}\n`;

			for (const dead of [`${exitedPid}\n`, reusedPid]) {
				fs.writeFileSync(lockPath, dead, { mode: 0o600 });
				const prepared = prepareCodexStorage({ rootDirectory: root });
				expect(readFileSync(lockPath, "utf8")).toBe(ownRecord);
				const stale = fs
					.readdirSync(first.codexHome)
					.filter((name) => name.startsWith(".archboard-codex-process.lock.stale-"))
					.map((name) => readFileSync(path.join(first.codexHome, name), "utf8"));
				expect(stale).toContain(dead);
				prepared.release();
			}
		} finally {
			removeRoot(root);
		}
	});

	test("refuses a lock whose owner is alive, naming it, and leaves it in place", () => {
		const root = temporaryRoot();
		try {
			const first = prepareCodexStorage({ rootDirectory: root });
			first.release();
			const lockPath = path.join(first.codexHome, ".archboard-codex-process.lock");
			const live = `${process.pid}\n`;
			fs.writeFileSync(lockPath, live, { mode: 0o600 });
			let refusal: unknown;
			try {
				prepareCodexStorage({ rootDirectory: root });
			} catch (error) {
				refusal = error;
			}
			expect(refusal).toBeInstanceOf(CodexStorageError);
			expect((refusal as CodexStorageError).code).toBe("lock");
			expect((refusal as CodexStorageError).message).toContain(String(process.pid));
			expect(readFileSync(lockPath, "utf8")).toBe(live);
			expect(fs.readdirSync(first.codexHome).filter((name) => name.includes(".stale-"))).toEqual(
				[],
			);
		} finally {
			removeRoot(root);
		}
	});

	test("keeps what Codex and a person put in its config, and fills in only what is missing", () => {
		const root = temporaryRoot();
		try {
			const first = prepareCodexStorage({ rootDirectory: root });
			first.release();
			// What Codex appends when a thread starts in a folder its sandbox can write.
			const trusted = `${first.configText}\n[projects."/work/checkout"]\ntrust_level = "trusted"\n`;
			fs.writeFileSync(first.configPath, trusted, { mode: 0o600 });
			const kept = prepareCodexStorage({ rootDirectory: root });
			expect(readFileSync(kept.configPath, "utf8")).toBe(trusted);
			kept.release();

			// A person chose never to be asked and a model: both stay, the rest is filled in.
			const chosen = `sqlite_home = ${JSON.stringify(first.sqliteHome)}\napproval_policy = "never"\nmodel = "o3"\n`;
			fs.writeFileSync(first.configPath, chosen, { mode: 0o600 });
			const completed = prepareCodexStorage({ rootDirectory: root });
			expect(Bun.TOML.parse(readFileSync(completed.configPath, "utf8"))).toMatchObject({
				sqlite_home: first.sqliteHome,
				approval_policy: "never",
				model: "o3",
				approvals_reviewer: "auto_review",
				sandbox_mode: "workspace-write",
				sandbox_workspace_write: { network_access: true },
			});
			completed.release();
		} finally {
			removeRoot(root);
		}
	});

	test("replaces its own earlier config, and its config naming a sqlite home that moved", () => {
		const root = temporaryRoot();
		try {
			const first = prepareCodexStorage({ rootDirectory: root });
			first.release();
			for (const own of [
				`sqlite_home = ${JSON.stringify(first.sqliteHome)}\n`,
				`sqlite_home = ${JSON.stringify(path.join(root, "moved", "sqlite-home"))}\n`,
			]) {
				fs.writeFileSync(first.configPath, own, { mode: 0o600 });
				const prepared = prepareCodexStorage({ rootDirectory: root });
				expect(readFileSync(prepared.configPath, "utf8")).toBe(prepared.configText);
				prepared.release();
			}
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

	test("preserves cleanup when lock initialization and unwind unlink both fail", () => {
		const root = temporaryRoot();
		try {
			let unlinkFailures = 1;
			const hostileFileSystem = {
				...fileSystem(),
				writeFileSync: (() => {
					throw new Error("injected lock write failure");
				}) as typeof fs.writeFileSync,
				unlinkSync: ((target: string | Buffer | URL) => {
					if (String(target).endsWith(".archboard-codex-process.lock") && unlinkFailures > 0) {
						unlinkFailures -= 1;
						throw new Error("injected unwind unlink failure");
					}
					fs.unlinkSync(target as Parameters<typeof fs.unlinkSync>[0]);
				}) as typeof fs.unlinkSync,
			} satisfies CodexStorageFileSystem;
			let thrown: unknown;
			try {
				prepareCodexStorage({ rootDirectory: root }, { fileSystem: hostileFileSystem });
			} catch (error) {
				thrown = error;
			}
			const lockPath = path.join(root, "codex-home", ".archboard-codex-process.lock");
			expect(thrown).toBeInstanceOf(CodexStorageError);
			expect((thrown as CodexStorageError).code).toBe("lock");
			expect((thrown as CodexStorageError).retryCleanup).toBeFunction();
			expect(fs.existsSync(lockPath)).toBe(true);
			expect(refusalCode(() => prepareCodexStorage({ rootDirectory: root }))).toBe("lock");
			(thrown as CodexStorageError).retryCleanup!();
			expect(fs.existsSync(lockPath)).toBe(false);
			const recovered = prepareCodexStorage({ rootDirectory: root });
			recovered.release();
		} finally {
			removeRoot(root);
		}
	});

	test("retains the lock after an unlink failure and permits an explicit release retry", () => {
		const root = temporaryRoot();
		try {
			let failures = 1;
			const injected = {
				...fileSystem(),
				unlinkSync: ((target: string | Buffer | URL) => {
					if (String(target).endsWith(".archboard-codex-process.lock") && failures > 0) {
						failures -= 1;
						throw new Error("injected lock unlink failure");
					}
					fs.unlinkSync(target as Parameters<typeof fs.unlinkSync>[0]);
				}) as typeof fs.unlinkSync,
			} satisfies CodexStorageFileSystem;
			const prepared = prepareCodexStorage({ rootDirectory: root }, { fileSystem: injected });
			const lockPath = path.join(prepared.codexHome, ".archboard-codex-process.lock");
			expect(() => prepared.release()).toThrow(CodexStorageError);
			expect(fs.existsSync(lockPath)).toBe(true);
			expect(() => prepared.release()).not.toThrow();
			expect(fs.existsSync(lockPath)).toBe(false);
		} finally {
			removeRoot(root);
		}
	});

	test("preserves preparation cleanup when a config conflict meets an unlink failure", () => {
		const root = temporaryRoot();
		try {
			const initial = prepareCodexStorage({ rootDirectory: root });
			initial.release();
			writeFileSync(initial.configPath, `sqlite_home = ${JSON.stringify(root)}\n`, { mode: 0o600 });
			let failures = 1;
			const injected = {
				...fileSystem(),
				unlinkSync: ((target: string | Buffer | URL) => {
					if (String(target).endsWith(".archboard-codex-process.lock") && failures > 0) {
						failures -= 1;
						throw new Error("injected preparation lock unlink failure");
					}
					fs.unlinkSync(target as Parameters<typeof fs.unlinkSync>[0]);
				}) as typeof fs.unlinkSync,
			} satisfies CodexStorageFileSystem;
			let thrown: unknown;
			try {
				prepareCodexStorage({ rootDirectory: root }, { fileSystem: injected });
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexStorageError);
			expect((thrown as CodexStorageError).code).toBe("config_conflict");
			expect((thrown as CodexStorageError).retryCleanup).toBeFunction();
			expect((thrown as CodexStorageError).message).toContain("retryCleanup");
			expect(refusalCode(() => prepareCodexStorage({ rootDirectory: root }))).toBe("lock");
			(thrown as CodexStorageError).retryCleanup!();

			writeFileSync(initial.configPath, initial.configText, { mode: 0o600 });
			const recovered = prepareCodexStorage({ rootDirectory: root }, { fileSystem: injected });
			recovered.release();
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
								if (writes === 2) {
									throw new Error("injected config write failure");
								}
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

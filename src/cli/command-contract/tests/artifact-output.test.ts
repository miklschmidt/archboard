import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs, { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PendingArtifactSchema } from "../schemas.js";
import { runCommand } from "../runner.js";
import {
	cleanupCommandContractTest,
	executePublic,
	proofContract,
	temporaryPath,
} from "./support.js";

afterEach(cleanupCommandContractTest);

describe("command-contract artifact output", () => {
	test("file output validates, writes, then emits its public receipt", async () => {
		const path = temporaryPath("result.txt");
		const execution = await executePublic(
			proofContract({
				result: { ok: true },
				resultSchema: z.object({ ok: z.boolean() }),
				file: true,
				artifact: { path, content: "content", encoding: "utf8" },
			}),
		);
		expect(execution.error).toBeUndefined();
		expect(readFileSync(path, "utf8")).toBe("content");
		expect(JSON.parse(execution.stdout)).toEqual({ ok: true });
	});

	test("ordered file sets commit their manifest last and before stdout", async () => {
		const directory = temporaryPath("finding-set");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		const contract = proofContract({
			result: { complete: true },
			resultSchema: z.object({ complete: z.literal(true) }),
			file: true,
			artifact: {
				path: directory,
				encoding: "files",
				files: [
					{ name: "0001-A.png", content: Uint8Array.from([1]) },
					{ name: "0002-B.png", content: Uint8Array.from([2]) },
				],
				manifest: { name: "manifest.json", content: "{}\n" },
			},
		});
		let committedAtOutput = false;
		const stdout = spyOn(process.stdout, "write").mockImplementation(() => {
			committedAtOutput =
				existsSync(join(directory, "0001-A.png")) &&
				existsSync(join(directory, "0002-B.png")) &&
				readFileSync(join(directory, "manifest.json"), "utf8") === "{}\n";
			return true;
		});
		try {
			await runCommand(contract, []);
		} finally {
			stdout.mockRestore();
		}
		expect(committedAtOutput).toBeTrue();
	});

	test("a transient manifest temp cleanup failure succeeds after the post-link retry", async () => {
		const directory = temporaryPath("manifest-cleanup-retry");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		const nativeUnlink = fs.unlinkSync.bind(fs);
		let manifestTempAttempts = 0;
		const unlink = spyOn(fs, "unlinkSync").mockImplementation((file) => {
			if (String(file).includes(".manifest.json.") && manifestTempAttempts++ === 0)
				throw new Error("synthetic post-link cleanup failure");
			return nativeUnlink(file);
		});
		let execution;
		try {
			execution = await executePublic(
				proofContract({
					result: { complete: true },
					resultSchema: z.object({ complete: z.literal(true) }),
					file: true,
					artifact: {
						path: directory,
						encoding: "files",
						files: [],
						manifest: { name: "manifest.json", content: "{}\n" },
					},
				}),
			);
		} finally {
			unlink.mockRestore();
		}
		expect(execution?.error).toBeUndefined();
		expect(execution?.stdout).toBe('{\n  "complete": true\n}\n');
		expect(readFileSync(join(directory, "manifest.json"), "utf8")).toBe("{}\n");
		expect(manifestTempAttempts).toBe(2);
		expect(fs.readdirSync(directory)).toEqual(["manifest.json"]);
	});

	test("persistent manifest temp cleanup succeeds only while the destination keeps its inode", async () => {
		const directory = temporaryPath("manifest-cleanup-owned");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		const nativeUnlink = fs.unlinkSync.bind(fs);
		let manifestTempAttempts = 0;
		let manifestDestinationAttempts = 0;
		const unlink = spyOn(fs, "unlinkSync").mockImplementation((file) => {
			if (String(file).endsWith("manifest.json")) {
				manifestDestinationAttempts++;
				throw new Error("the committed destination must not be cleanup");
			}
			if (String(file).includes(".manifest.json.")) {
				manifestTempAttempts++;
				throw new Error("synthetic persistent post-link cleanup failure");
			}
			return nativeUnlink(file);
		});
		let execution;
		try {
			execution = await executePublic(
				proofContract({
					result: { complete: true },
					resultSchema: z.object({ complete: z.literal(true) }),
					file: true,
					artifact: {
						path: directory,
						encoding: "files",
						files: [],
						manifest: { name: "manifest.json", content: "{}\n" },
					},
				}),
			);
		} finally {
			unlink.mockRestore();
		}
		expect(execution?.error).toBeUndefined();
		expect(execution?.stdout).toBe('{\n  "complete": true\n}\n');
		expect(readFileSync(join(directory, "manifest.json"), "utf8")).toBe("{}\n");
		expect(manifestTempAttempts).toBe(3);
		expect(manifestDestinationAttempts).toBe(0);
		const manifestStats = fs.statSync(join(directory, "manifest.json"));
		const tempName = fs.readdirSync(directory).find((name) => name.includes(".manifest.json."));
		expect(tempName).toBeDefined();
		const tempStats = fs.statSync(join(directory, tempName!));
		expect([manifestStats.dev, manifestStats.ino]).toEqual([tempStats.dev, tempStats.ino]);
	});

	test("a vanished manifest destination fails after persistent temp cleanup", async () => {
		const directory = temporaryPath("manifest-cleanup-vanished");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		const destination = join(directory, "manifest.json");
		const nativeUnlink = fs.unlinkSync.bind(fs);
		let manifestTempAttempts = 0;
		const unlink = spyOn(fs, "unlinkSync").mockImplementation((file) => {
			if (String(file).includes(".manifest.json.")) {
				manifestTempAttempts++;
				if (manifestTempAttempts === 2) nativeUnlink(destination);
				if (manifestTempAttempts <= 2)
					throw new Error("synthetic persistent post-link cleanup failure");
			}
			return nativeUnlink(file);
		});
		let execution;
		try {
			execution = await executePublic(
				proofContract({
					result: { complete: true },
					resultSchema: z.object({ complete: z.literal(true) }),
					file: true,
					artifact: {
						path: directory,
						encoding: "files",
						files: [],
						manifest: { name: "manifest.json", content: "{}\n" },
					},
				}),
			);
		} finally {
			unlink.mockRestore();
		}
		expect(execution?.error).toBeDefined();
		expect(execution?.stdout).toBe("");
		expect(existsSync(destination)).toBeFalse();
		expect(fs.readdirSync(directory)).toEqual([]);
	});

	test("a foreign manifest replacement survives persistent temp cleanup failure", async () => {
		const directory = temporaryPath("manifest-cleanup-replaced");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		const destination = join(directory, "manifest.json");
		const nativeUnlink = fs.unlinkSync.bind(fs);
		let manifestTempAttempts = 0;
		const unlink = spyOn(fs, "unlinkSync").mockImplementation((file) => {
			if (String(file).includes(".manifest.json.")) {
				manifestTempAttempts++;
				if (manifestTempAttempts === 2) {
					nativeUnlink(destination);
					writeFileSync(destination, "foreign\n");
				}
				if (manifestTempAttempts <= 2)
					throw new Error("synthetic persistent post-link cleanup failure");
			}
			return nativeUnlink(file);
		});
		let execution;
		try {
			execution = await executePublic(
				proofContract({
					result: { complete: true },
					resultSchema: z.object({ complete: z.literal(true) }),
					file: true,
					artifact: {
						path: directory,
						encoding: "files",
						files: [],
						manifest: { name: "manifest.json", content: "{}\n" },
					},
				}),
			);
		} finally {
			unlink.mockRestore();
		}
		expect(execution?.error).toBeDefined();
		expect(execution?.stdout).toBe("");
		expect(readFileSync(destination, "utf8")).toBe("foreign\n");
		expect(fs.readdirSync(directory)).toEqual(["manifest.json"]);
	});

	test("a mid-set artifact failure leaves no manifest or stdout", async () => {
		const directory = temporaryPath("partial-finding-set");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		mkdirSync(join(directory, "0002-B.png"));
		const execution = await executePublic(
			proofContract({
				result: { complete: true },
				resultSchema: z.object({ complete: z.literal(true) }),
				file: true,
				artifact: {
					path: directory,
					encoding: "files",
					files: [
						{ name: "0001-A.png", content: Uint8Array.from([1]) },
						{ name: "0002-B.png", content: Uint8Array.from([2]) },
					],
					manifest: { name: "manifest.json", content: "{}\n" },
				},
			}),
		);
		expect(execution.error).toBeDefined();
		expect(execution.stdout).toBe("");
		expect(existsSync(join(directory, "0001-A.png"))).toBeTrue();
		expect(existsSync(join(directory, "manifest.json"))).toBeFalse();
	});

	test("a publish-time collision never replaces the raced destination", async () => {
		const directory = temporaryPath("raced-finding-set");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		const artifact = {
			path: directory,
			encoding: "files",
			files: [
				{ name: "0001-A.png", content: Uint8Array.from([1]) },
				{ name: "0002-B.png", content: Uint8Array.from([2]) },
			],
			manifest: { name: "manifest.json", content: "{}\n" },
		};
		const execution = await executePublic(
			proofContract({
				result: { complete: true },
				resultSchema: z.object({ complete: z.literal(true) }),
				file: true,
				artifact,
				artifactSchema: PendingArtifactSchema.transform((validated) => {
					writeFileSync(join(directory, "0002-B.png"), Uint8Array.from([9, 9]));
					return validated;
				}),
			}),
		);
		expect(execution.error).toBeDefined();
		expect(execution.stdout).toBe("");
		expect(readFileSync(join(directory, "0002-B.png"))).toEqual(Buffer.from([9, 9]));
		expect(existsSync(join(directory, "0001-A.png"))).toBeTrue();
		expect(existsSync(join(directory, "manifest.json"))).toBeFalse();
	});

	test("an unexpected directory member appearing before publish refuses the set", async () => {
		const directory = temporaryPath("unexpected-finding-member");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(directory);
		const artifact = {
			path: directory,
			encoding: "files",
			files: [{ name: "0001-A.png", content: Uint8Array.from([1]) }],
			manifest: { name: "manifest.json", content: "{}\n" },
		};
		const execution = await executePublic(
			proofContract({
				result: { complete: true },
				resultSchema: z.object({ complete: z.literal(true) }),
				file: true,
				artifact,
				artifactSchema: PendingArtifactSchema.transform((validated) => {
					writeFileSync(join(directory, "surprise.txt"), "keep");
					return validated;
				}),
			}),
		);
		expect(execution.error).toBeDefined();
		expect(execution.stdout).toBe("");
		expect(readFileSync(join(directory, "surprise.txt"), "utf8")).toBe("keep");
		expect(existsSync(join(directory, "0001-A.png"))).toBeFalse();
		expect(existsSync(join(directory, "manifest.json"))).toBeFalse();
	});
});

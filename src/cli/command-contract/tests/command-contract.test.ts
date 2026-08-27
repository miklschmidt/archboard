import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
	closeSync,
	existsSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCommand, type AnyCommandContract } from "../contract.js";
import { introspectContracts } from "../introspection.js";
import { runCommand } from "../runner.js";
import { PendingArtifactSchema } from "../schemas.js";

const heldCompatibility = JSON.parse(
	readFileSync(join(import.meta.dir, "held-output-compatibility.json"), "utf8"),
) as {
	fixedBase: string;
	held: { board: string; message: string; writes: number };
	cases: Array<{
		name: string;
		path: string;
		outputCase: string;
		result: unknown;
		artifact?: unknown;
		stdout: string;
		stderr: string;
		events: string[];
	}>;
};

const temporaryDirectories: string[] = [];

afterEach(() => {
	process.exitCode = 0;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function proofContract(options: {
	result: unknown;
	resultSchema?: z.ZodType;
	file?: boolean;
	artifact?: unknown;
}) {
	return defineCommand({
		path: ["proof"],
		summary: "proof",
		usage: "proof",
		description: "proof",
		examples: [],
		parameters: [
			{
				kind: "option",
				key: "name",
				spellings: ["--name"],
				value: "required",
				description: "name",
			},
		],
		input: { ingress: z.object({ name: z.string().default("value") }) },
		result: options.resultSchema ?? z.unknown(),
		output: {
			cases: [
				options.file
					? {
							id: "file",
							when: {},
							mode: "file-receipt",
							held: "none",
							description: "file",
							artifact: PendingArtifactSchema,
						}
					: {
							id: "json",
							when: {},
							mode: "json",
							held: "none",
							description: "json",
						},
			],
			select: () => (options.file ? "file" : "json"),
		},
		prerequisites: [],
		effects: options.file ? ["local-write"] : [],
		refusals: [],
		relationships: [],
		async handler() {
			return {
				result: options.result,
				...(options.artifact === undefined ? {} : { pendingArtifact: options.artifact }),
			};
		},
	});
}

async function executePublic(contract: AnyCommandContract, argv: readonly string[] = []) {
	let stdout = "";
	let stderr = "";
	let error: unknown;
	const stdoutSpy = spyOn(process.stdout, "write").mockImplementation((value) => {
		stdout += String(value);
		return true;
	});
	const stderrSpy = spyOn(process.stderr, "write").mockImplementation((value) => {
		stderr += String(value);
		return true;
	});
	try {
		await runCommand(contract, argv);
	} catch (caught) {
		error = caught;
	} finally {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
	}
	return { stdout, stderr, error };
}

function temporaryPath(name: string) {
	const directory = mkdtempSync(join(tmpdir(), "archboard-contract-"));
	temporaryDirectories.push(directory);
	return join(directory, name);
}

function runPublicFixture(
	record: Record<string, unknown>,
	artifactPath: string,
	merged = false,
): Promise<{
	status: number | null;
	stdout: string;
	stderr: string;
	merged: string;
	artifactExistedAtFirstOutput: boolean | null;
}> {
	const fixturePath = temporaryPath("record.json");
	writeFileSync(fixturePath, JSON.stringify(record));
	const mergedPath = temporaryPath("merged.log");
	const descriptor = merged ? openSync(mergedPath, "w+") : undefined;
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[join(import.meta.dir, "public-runner-fixture.mjs"), fixturePath],
			{
				cwd: process.cwd(),
				env: { ...process.env, EXCALIDRAW_NO_AUTOSTART: "1" },
				stdio: merged ? ["ignore", descriptor!, descriptor!] : ["ignore", "pipe", "pipe"],
			},
		);
		let stdout = "";
		let stderr = "";
		let artifactExistedAtFirstOutput: boolean | null = null;
		if (!merged) {
			child.stdout!.setEncoding("utf8");
			child.stderr!.setEncoding("utf8");
			child.stdout!.on("data", (chunk) => {
				if (artifactExistedAtFirstOutput === null) {
					artifactExistedAtFirstOutput = existsSync(artifactPath);
				}
				stdout += chunk;
			});
			child.stderr!.on("data", (chunk) => {
				if (artifactExistedAtFirstOutput === null) {
					artifactExistedAtFirstOutput = existsSync(artifactPath);
				}
				stderr += chunk;
			});
		}
		child.on("close", (status) => {
			if (descriptor !== undefined) closeSync(descriptor);
			resolve({
				status,
				stdout,
				stderr,
				merged: merged ? readFileSync(mergedPath, "utf8") : "",
				artifactExistedAtFirstOutput,
			});
		});
	});
}

describe("command-contract public interface", () => {
	test("fixed-base held policies keep exact bytes and write order for every affected mode", async () => {
		expect(heldCompatibility.fixedBase).toBe("6c42fca6c0d5b9ecaa5ad40fde14ede684722d5a");
		for (const record of heldCompatibility.cases) {
			const artifactPath = temporaryPath(`${record.name}.artifact`);
			const expand = (value: unknown): unknown =>
				JSON.parse(JSON.stringify(value).replaceAll("{{ARTIFACT}}", artifactPath));
			const expectedStdout = record.stdout.replaceAll("{{ARTIFACT}}", artifactPath);
			const fixture = {
				...record,
				result: expand(record.result),
				...(record.artifact === undefined ? {} : { artifact: expand(record.artifact) }),
				held: heldCompatibility.held,
			};
			const normal = await runPublicFixture(fixture, artifactPath);
			expect(normal.status, record.name).toBe(0);
			expect(normal.stdout, record.name).toBe(expectedStdout);
			expect(normal.stderr, record.name).toBe(record.stderr);
			if (record.artifact !== undefined) {
				expect(readFileSync(artifactPath, "utf8"), record.name).toBe("<svg/>");
				expect(normal.artifactExistedAtFirstOutput, record.name).toBeTrue();
			}
			const merged = await runPublicFixture(fixture, artifactPath, true);
			const expectedMerged = record.events
				.filter((event) => !event.startsWith("artifact:"))
				.map((event) =>
					event
						.replace(/^stdout:|^stderr:/, "")
						.replaceAll("{{ARTIFACT}}", artifactPath)
						.replaceAll("{{STDOUT}}", expectedStdout),
				)
				.join("");
			expect(merged.status, record.name).toBe(0);
			expect(merged.merged, record.name).toBe(expectedMerged);
		}
	});

	test("the concrete Commander parser owns aliases and optional token arity", async () => {
		const contract = defineCommand({
			...proofContract({ result: null, resultSchema: z.object({ name: z.unknown().optional() }) }),
			parameters: [
				{
					kind: "option",
					key: "name",
					spellings: ["-n", "--name"],
					value: "optional",
					description: "name",
				},
			],
			input: { ingress: z.object({ name: z.union([z.string(), z.boolean()]).optional() }) },
			async handler(input) {
				return { result: input };
			},
		});
		expect(JSON.parse((await executePublic(contract, ["-n", "alice"])).stdout)).toEqual({
			name: "alice",
		});
		expect(JSON.parse((await executePublic(contract, ["--name"])).stdout)).toEqual({
			name: true,
		});
		expect(JSON.parse((await executePublic(contract)).stdout)).toEqual({});
	});

	test("the concrete Commander parser maps an attribute name to a distinct contract key", async () => {
		const contract = defineCommand({
			...proofContract({ result: null }),
			parameters: [
				{
					kind: "option",
					key: "recipient",
					spellings: ["--name"],
					value: "required",
					description: "recipient",
				},
			],
			input: { ingress: z.object({ recipient: z.string() }) },
			result: z.object({ recipient: z.string() }),
			async handler(input) {
				return { result: input };
			},
		});
		const execution = await executePublic(contract, ["--name", "Ada"]);
		expect(execution.error).toBeUndefined();
		expect(JSON.parse(execution.stdout)).toEqual({ recipient: "Ada" });
	});

	test("an invalid public result reaches neither stdout nor a file", async () => {
		const path = temporaryPath("result.txt");
		const execution = await executePublic(
			proofContract({
				result: { ok: "no" },
				resultSchema: z.object({ ok: z.boolean() }),
				file: true,
				artifact: { path, content: "content", encoding: "utf8" },
			}),
		);
		expect(execution.error).toBeInstanceOf(z.ZodError);
		expect(execution.stdout).toBe("");
		expect(existsSync(path)).toBeFalse();
	});

	test("an invalid private artifact reaches neither stdout nor a file", async () => {
		const path = temporaryPath("result.txt");
		const execution = await executePublic(
			proofContract({
				result: { ok: true },
				resultSchema: z.object({ ok: z.boolean() }),
				file: true,
				artifact: { path, content: 42, encoding: "utf8" },
			}),
		);
		expect(execution.error).toBeInstanceOf(z.ZodError);
		expect(execution.stdout).toBe("");
		expect(existsSync(path)).toBeFalse();
	});

	test("a JSON output rejects a stray private artifact before stdout", async () => {
		const path = temporaryPath("stray.txt");
		const execution = await executePublic(
			proofContract({
				result: { ok: true },
				resultSchema: z.object({ ok: z.boolean() }),
				artifact: { path, content: "must not write", encoding: "utf8" },
			}),
		);
		expect(execution.error).toBeInstanceOf(z.ZodError);
		expect(execution.stdout).toBe("");
		expect(existsSync(path)).toBeFalse();
	});

	test("a JSON output rejects malformed private artifact data before stdout", async () => {
		const execution = await executePublic(
			proofContract({
				result: { ok: true },
				resultSchema: z.object({ ok: z.boolean() }),
				artifact: { content: 42 },
			}),
		);
		expect(execution.error).toBeInstanceOf(z.ZodError);
		expect(execution.stdout).toBe("");
	});

	test.each([
		{ encoding: "utf8", content: new Uint8Array([1, 2, 3]) },
		{ encoding: "binary", content: "not binary" },
	] as const)("artifact encoding and content must agree: %o", async ({ encoding, content }) => {
		const path = temporaryPath(`mismatch-${encoding}`);
		const execution = await executePublic(
			proofContract({
				result: { ok: true },
				resultSchema: z.object({ ok: z.boolean() }),
				file: true,
				artifact: { path, content, encoding },
			}),
		);
		expect(execution.error).toBeInstanceOf(z.ZodError);
		expect(execution.stdout).toBe("");
		expect(execution.stderr).toBe("");
		expect(existsSync(path)).toBeFalse();
	});

	test("an undeclared outcome reaches no structured output", async () => {
		const contract = defineCommand({
			...proofContract({ result: { ok: true }, resultSchema: z.object({ ok: z.boolean() }) }),
			async handler() {
				return { result: { ok: true }, outcome: "missing" };
			},
		});
		const execution = await executePublic(contract);
		expect(execution.error).toEqual(new Error("proof: undeclared outcome missing"));
		expect(execution.stdout).toBe("");
		expect(execution.stderr).toBe("");
	});

	test("a declared outcome validates before ordered presentation and sets exit last", async () => {
		const events: string[] = [];
		const contract = defineCommand({
			...proofContract({ result: { ok: true }, resultSchema: z.object({ ok: z.boolean() }) }),
			outcomes: [
				{
					id: "refused",
					exit: 5,
					description: "refused proof",
					stream: "stdout-and-stderr",
					held: "none",
					presentation: ["diagnostics", "result"],
				},
			],
			async handler() {
				return { result: { ok: true }, outcome: "refused", diagnostics: ["refused"] };
			},
		});
		const stdoutSpy = spyOn(process.stdout, "write").mockImplementation((value) => {
			events.push(`stdout:${String(value)}`);
			expect(process.exitCode).not.toBe(5);
			return true;
		});
		const stderrSpy = spyOn(process.stderr, "write").mockImplementation((value) => {
			events.push(`stderr:${String(value)}`);
			expect(process.exitCode).not.toBe(5);
			return true;
		});
		try {
			await runCommand(contract, []);
		} finally {
			stdoutSpy.mockRestore();
			stderrSpy.mockRestore();
		}
		expect(events).toEqual(["stderr:refused\n", 'stdout:{\n  "ok": true\n}\n']);
		expect(process.exitCode).toBe(5);
	});

	test("an invalid declared-outcome result emits neither deferred diagnostics nor output", async () => {
		const contract = defineCommand({
			...proofContract({ result: null, resultSchema: z.object({ ok: z.boolean() }) }),
			outcomes: [
				{
					id: "unavailable",
					exit: 3,
					description: "unavailable proof",
					stream: "stdout-and-stderr",
					held: "none",
					presentation: ["diagnostics", "result"],
				},
			],
			async handler() {
				return { result: { ok: "no" }, outcome: "unavailable", diagnostics: ["hidden"] };
			},
		});
		const execution = await executePublic(contract);
		expect(execution.error).toBeInstanceOf(z.ZodError);
		expect(execution.stdout).toBe("");
		expect(execution.stderr).toBe("");
	});

	test("immediate diagnostics are the only prevalidation stream lane", async () => {
		const contract = defineCommand({
			...proofContract({ result: null, resultSchema: z.object({ ok: z.boolean() }) }),
			async handler(_input, context) {
				context.diagnostic("contacted local boundary");
				return { result: { ok: "no" }, diagnostics: ["deferred stays hidden"] };
			},
		});
		const execution = await executePublic(contract);
		expect(execution.error).toBeInstanceOf(z.ZodError);
		expect(execution.stdout).toBe("");
		expect(execution.stderr).toBe("contacted local boundary\n");
	});

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

	test("a handler's network effect and result are observable through the two-argument runner", async () => {
		const requests: string[] = [];
		const server = Bun.serve({
			port: 0,
			fetch(request) {
				requests.push(new URL(request.url).pathname);
				return Response.json({ answer: 42 });
			},
		});
		try {
			const contract = defineCommand({
				...proofContract({ result: null }),
				result: z.object({ answer: z.number() }),
				async handler() {
					const result = await fetch(`http://127.0.0.1:${server.port}/proof`).then((response) =>
						response.json(),
					);
					return { result };
				},
			});
			const execution = await executePublic(contract);
			expect(execution.error).toBeUndefined();
			expect(requests).toEqual(["/proof"]);
			expect(JSON.parse(execution.stdout)).toEqual({ answer: 42 });
		} finally {
			server.stop(true);
		}
	});

	test("introspection omits adapter and private execution types", () => {
		const contract = proofContract({
			result: { ok: true },
			resultSchema: z.object({ ok: z.boolean() }),
			file: true,
			artifact: { path: "/tmp/result", content: "content", encoding: "utf8" },
		});
		const json = JSON.stringify(introspectContracts([{ name: "proof", contract }]));
		expect(json).not.toContain("pendingArtifact");
		expect(json).not.toContain("content");
		expect(json).not.toContain("encoding");
		expect(json).not.toContain("commander");
		expect(json).not.toContain("diagnostics");
	});

	test("introspection rejects a registry entry without an executable contract", () => {
		expect(() => introspectContracts([{ name: "broken", contract: undefined }] as never)).toThrow(
			"broken: registry entry has no executable command contract",
		);
	});

	test("staged metadata owns viewport id coercion and export format inference", async () => {
		const { viewportContract } = await import("../viewport.js");
		const { exportContract } = await import("../export.js");
		const proof = introspectContracts([
			{ name: "viewport", contract: viewportContract },
			{ name: "export", contract: exportContract },
		]);
		const viewportIds = proof[0]?.input.stages.find((stage) => stage.name === "ids");
		const exportFormat = proof[1]?.input.stages.find((stage) => stage.name === "format");
		expect(viewportIds?.when).toBe("after-browser");
		expect(viewportIds?.rules.join(" ")).toContain("Split on commas");
		expect(exportFormat?.when).toBe("before-server");
		expect(exportFormat?.rules.join(" ")).toContain("obsidian for an --out path ending in .md");
	});

	test("board and injection result schemas accept the protected server response shapes", async () => {
		const { BoardInfoResultSchema, BoardNewResultSchema, BoardOpenResultSchema } =
			await import("../../commands/board.js");
		const { PaneOpenResultSchema } = await import("../../commands/pane.js");
		const { InjectStatusResultSchema, InjectTestResultSchema } =
			await import("../../commands/inject.js");
		const identityState = {
			board: "payments",
			identity: {
				board: "payments",
				variant: "current",
				level: "system",
				displayName: "Payments",
			},
			elementCount: 4,
			version: 7,
			placeholder: false,
			file: "/vault/payments.excalidraw.md",
			savedAt: "2026-08-26T10:00:00.000Z",
			loadedAt: "2026-08-26T09:00:00.000Z",
		};
		const pane = { paneId: "pane-2", clientId: "client-2", place: "right", position: 2 };
		const info = { success: true as const, ...identityState };
		const created = {
			...info,
			version: null,
			elementCount: 0,
			created: true as const,
			saved: false as const,
			pane: null,
		};
		const opened = { ...info, source: "vault" as const, pane };
		expect(BoardInfoResultSchema.parse(info)).toEqual(info);
		expect(BoardNewResultSchema.parse(created)).toEqual(created);
		expect(BoardOpenResultSchema.parse(opened)).toEqual(opened);
		expect(
			PaneOpenResultSchema.parse({
				success: true,
				pane,
				paneCount: 2,
				onScreen: [{ paneId: pane.paneId, place: pane.place, board: "payments" }],
				board: opened,
			}),
		).toMatchObject({ board: { version: 7, placeholder: false, source: "vault" } });
		expect(BoardInfoResultSchema.safeParse({ ...info, version: undefined }).success).toBeFalse();
		expect(
			BoardInfoResultSchema.safeParse({ ...info, placeholder: undefined }).success,
		).toBeFalse();
		expect(BoardNewResultSchema.safeParse(info).success).toBeFalse();
		expect(BoardOpenResultSchema.safeParse(info).success).toBeFalse();

		const injectionStatus = {
			enabled: true,
			armed: true,
			loud: false,
			refusal: null,
			host: "127.0.0.1",
			socket: {
				path: "/tmp/app-server.sock",
				exists: true,
				isSocket: true,
				ownedByUs: true,
				mode: "600",
			},
			connected: true,
			lastError: null,
			target: {
				threadId: "thread-1",
				reason: "pinned" as const,
				explanation: "the fixture thread is pinned",
				activeTurnId: null,
			},
			threadsSeen: 1,
			pending: 0,
			debounceMs: 200,
			minIntervalMs: 500,
			injected: { quiet: 2, loud: 1, failed: 0 },
			lastInjectionAt: "2026-08-26T10:01:00.000Z",
			lastInjection: {
				channel: "quiet" as const,
				threadId: "thread-1",
				at: "2026-08-26T10:01:00.000Z",
				text: "fixture change",
			},
		};
		expect(InjectStatusResultSchema.parse(injectionStatus)).toEqual(injectionStatus);
		expect(
			InjectTestResultSchema.parse({ channel: "loud", threadId: "thread-1", text: "probe" }),
		).toEqual({ channel: "loud", threadId: "thread-1", text: "probe" });
		expect(
			InjectStatusResultSchema.safeParse({ held: { board: "x", message: "held" } }).success,
		).toBeFalse();
		expect(InjectTestResultSchema.safeParse({ channel: "quiet" }).success).toBeFalse();
	});

	test("named Zod schemas own migrated defaults, coercions, enums, and cross-field rules", async () => {
		const { ScreenshotInputSchema } = await import("../../commands/scene.js");
		const { ChangesInputSchema } = await import("../../commands/changes.js");
		const { ClaimInputSchema } = await import("../../commands/claim.js");
		const { LibraryInsertStageSchema } = await import("../../commands/library.js");
		const { ArrangeAlignStageSchema, ArrangeDistributeStageSchema, ArrangeDuplicateStageSchema } =
			await import("../../commands/arrange.js");

		expect(ScreenshotInputSchema.parse({}).format).toBe("png");
		expect(ScreenshotInputSchema.safeParse({ format: "pdf" }).success).toBeFalse();
		expect(ChangesInputSchema.parse({ since: "4" }).since).toBe(4);
		expect(ChangesInputSchema.parse({}).since).toBe(0);
		expect(ChangesInputSchema.safeParse({ since: "before" }).success).toBeFalse();
		expect(ClaimInputSchema.parse({ reason: "  redraw  ", for: "1.5m" })).toMatchObject({
			reason: "redraw",
			for: 90_000,
		});
		expect(ClaimInputSchema.safeParse({ reason: "", for: "5" }).success).toBeFalse();
		expect(LibraryInsertStageSchema.parse({ name: "Queue", x: "10.5", y: "-2" })).toMatchObject({
			name: "Queue",
			x: 10.5,
			y: -2,
		});
		expect(
			LibraryInsertStageSchema.safeParse({ name: "Queue", x: "x", y: "2" }).success,
		).toBeFalse();
		expect(ArrangeAlignStageSchema.parse({ ids: "a, b", to: "left" })).toEqual({
			ids: ["a", "b"],
			alignment: "left",
		});
		expect(
			ArrangeDistributeStageSchema.safeParse({ ids: "a,b", to: "diagonal" }).success,
		).toBeFalse();
		expect(ArrangeDuplicateStageSchema.parse({ ids: "a" })).toEqual({
			ids: ["a"],
			offsetX: 20,
			offsetY: 20,
		});
		expect(ArrangeDuplicateStageSchema.parse({ ids: "a", offset: "4,-3" })).toEqual({
			ids: ["a"],
			offsetX: 4,
			offsetY: -3,
		});
	});

	test("construction rejects token keys absent from the Zod ingress", () => {
		expect(() =>
			defineCommand({
				...proofContract({ result: null }),
				parameters: [
					{
						kind: "option",
						key: "missing",
						spellings: ["--missing"],
						value: "required",
						description: "missing",
					},
				],
			}),
		).toThrow("has no Zod ingress key");
	});
});

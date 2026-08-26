import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCommand, type AnyCommandContract } from "../contract.js";
import { introspectContracts } from "../introspection.js";
import { runCommand } from "../runner.js";
import { PendingArtifactSchema } from "../schemas.js";
import { commandContractTestHost } from "../testing.js";
import { cliContractRegistry } from "../../commands/run.js";

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

describe("command-contract public interface", () => {
	test("fixed-base held policies keep exact bytes and write order for every affected mode", async () => {
		expect(heldCompatibility.fixedBase).toBe("6c42fca6c0d5b9ecaa5ad40fde14ede684722d5a");
		const registry = new Map(cliContractRegistry().map((entry) => [entry.name, entry.contract]));
		for (const record of heldCompatibility.cases) {
			const source = registry.get(record.path);
			expect(source, record.name).toBeDefined();
			const outputCase = source!.output.cases.find(
				(candidate) => candidate.id === record.outputCase,
			);
			expect(outputCase, record.name).toBeDefined();
			const artifactPath = temporaryPath(`${record.name}.artifact`);
			const expand = (value: unknown): unknown =>
				JSON.parse(JSON.stringify(value).replaceAll("{{ARTIFACT}}", artifactPath));
			const expectedStdout = record.stdout.replaceAll("{{ARTIFACT}}", artifactPath);
			const expectedEvents = record.events.map((event) =>
				event.replaceAll("{{ARTIFACT}}", artifactPath).replaceAll("{{STDOUT}}", expectedStdout),
			);
			let stdout = "";
			let stderr = "";
			const events: string[] = [];
			const heldSpy = spyOn(commandContractTestHost, "held").mockReturnValue(
				heldCompatibility.held,
			);
			const stdoutSpy = spyOn(commandContractTestHost, "writeStdout").mockImplementation(
				(value) => {
					const text = String(value);
					stdout += text;
					events.push(`stdout:${text}`);
				},
			);
			const stderrSpy = spyOn(commandContractTestHost, "writeStderr").mockImplementation(
				(value) => {
					stderr += value;
					events.push(`stderr:${value}`);
				},
			);
			const artifactSpy = spyOn(commandContractTestHost, "writeArtifact").mockImplementation(
				(artifact) => {
					events.push(`artifact:${artifact.encoding}:${String(artifact.content)}`);
				},
			);
			try {
				await runCommand(
					{
						...source!,
						path: ["held-proof"],
						parameters: [],
						input: { ingress: z.object({}) },
						output: { cases: [outputCase!], select: () => outputCase!.id },
						async handler() {
							return {
								result: expand(record.result),
								...(record.artifact === undefined
									? {}
									: { pendingArtifact: expand(record.artifact) }),
							};
						},
					} as AnyCommandContract,
					[],
				);
			} finally {
				heldSpy.mockRestore();
				stdoutSpy.mockRestore();
				stderrSpy.mockRestore();
				artifactSpy.mockRestore();
			}
			expect(stdout, record.name).toBe(expectedStdout);
			expect(stderr, record.name).toBe(record.stderr);
			expect(events, record.name).toEqual(expectedEvents);
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

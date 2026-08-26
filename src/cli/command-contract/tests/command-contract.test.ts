import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCommand, type AnyCommandContract } from "../contract.js";
import { introspectContracts } from "../introspection.js";
import { runCommand } from "../runner.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

const artifactSchema = z.object({
	path: z.string(),
	content: z.string(),
	encoding: z.literal("utf8"),
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
							artifact: artifactSchema,
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

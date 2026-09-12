import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { z } from "zod";
import { defineCommand } from "../contract.js";
import { runCommand } from "../runner.js";
import {
	cleanupCommandContractTest,
	executePublic,
	proofContract,
	temporaryPath,
} from "./support.js";

afterEach(cleanupCommandContractTest);

describe("command-contract runner", () => {
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
			output: {
				cases: [
					{
						id: "json",
						when: {},
						mode: "json",
						description: "json",
					},
				],
				select: () => "json",
			},
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
			await server.stop(true);
		}
	});
});

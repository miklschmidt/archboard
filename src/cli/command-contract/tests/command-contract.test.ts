import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	defineCommand,
	type AnyCommandContract,
	type PendingArtifact,
	type TokenRecord,
} from "../contract.js";
import { introspectContracts } from "../introspection.js";
import {
	productionArgvParser,
	runCommand,
	type ArgvParser,
	type CommandHost,
	type PrerequisiteResolver,
} from "../runner.js";

class RecordingParser implements ArgvParser {
	readonly seen: AnyCommandContract[] = [];
	constructor(private readonly prepared: TokenRecord) {}
	async parse(contract: AnyCommandContract): Promise<TokenRecord> {
		this.seen.push(contract);
		return this.prepared;
	}
}

class RecordingHost implements CommandHost {
	stdout = "";
	stderr = "";
	writes: PendingArtifact[] = [];
	heldValue: unknown = null;
	stdin = "";
	files = new Map<string, string>();
	async readStdin() {
		return this.stdin;
	}
	readTextFile(path: string) {
		const found = this.files.get(path);
		if (found === undefined) throw new Error(`missing ${path}`);
		return found;
	}
	readOptionalTextFile(path: string) {
		return this.files.get(path);
	}
	resolvePath(path: string) {
		return `/resolved/${path}`;
	}
	writeArtifact(artifact: PendingArtifact) {
		this.writes.push(artifact);
	}
	writeStdout(value: string | Uint8Array) {
		this.stdout += typeof value === "string" ? value : new TextDecoder().decode(value);
	}
	writeStderr(value: string) {
		this.stderr += value;
	}
	held() {
		return this.heldValue;
	}
}

class RecordingPrerequisites implements PrerequisiteResolver {
	readonly seen: string[] = [];
	async require(prerequisite: "server" | "browser", description: string) {
		this.seen.push(`${prerequisite}:${description}`);
	}
}

const artifactSchema = z.object({
	path: z.string(),
	content: z.string(),
	encoding: z.literal("utf8"),
});

function proofContract(options: {
	result: unknown;
	resultSchema?: z.ZodType;
	file?: boolean;
	held?: "none" | "stderr-note" | "object-field-and-stderr-note";
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
							held: options.held ?? "none",
							description: "file",
							artifact: artifactSchema,
						}
					: {
							id: "json",
							when: {},
							mode: "json",
							held: options.held ?? "none",
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

async function execute(contract: AnyCommandContract, host = new RecordingHost()) {
	const parser = new RecordingParser({ name: "value" });
	const prerequisites = new RecordingPrerequisites();
	await runCommand(contract, [], { parser, host, prerequisites });
	return { host, parser, prerequisites };
}

describe("command-contract interface", () => {
	test("the real adapter owns aliases and optional token arity, not semantic defaults", async () => {
		const contract = defineCommand({
			...proofContract({ result: null }),
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
		});
		expect(await productionArgvParser.parse(contract, ["-n", "alice"])).toEqual({
			name: "alice",
		});
		expect(await productionArgvParser.parse(contract, ["--name"])).toEqual({ name: true });
		expect(await productionArgvParser.parse(contract, [])).toEqual({ name: undefined });
	});

	test("the recording parser returns a prepared invocation without parsing argv", async () => {
		const contract = proofContract({ result: { ok: true } });
		const { parser, host } = await execute(contract);
		expect(parser.seen).toEqual([contract]);
		expect(host.stdout).toBe('{\n  "ok": true\n}\n');
	});

	test("an invalid public result reaches neither stdout nor a file", async () => {
		const host = new RecordingHost();
		const contract = proofContract({
			result: { ok: "no" },
			resultSchema: z.object({ ok: z.boolean() }),
			file: true,
			artifact: { path: "/tmp/result", content: "content", encoding: "utf8" },
		});
		await expect(execute(contract, host)).rejects.toBeInstanceOf(z.ZodError);
		expect(host.stdout).toBe("");
		expect(host.writes).toEqual([]);
	});

	test("an invalid private artifact reaches neither stdout nor a file", async () => {
		const host = new RecordingHost();
		const contract = proofContract({
			result: { ok: true },
			resultSchema: z.object({ ok: z.boolean() }),
			file: true,
			artifact: { path: "/tmp/result", content: 42, encoding: "utf8" },
		});
		await expect(execute(contract, host)).rejects.toBeInstanceOf(z.ZodError);
		expect(host.stdout).toBe("");
		expect(host.writes).toEqual([]);
	});

	test("file output validates, writes, then emits its public receipt", async () => {
		const host = new RecordingHost();
		const artifact = { path: "/tmp/result", content: "content", encoding: "utf8" as const };
		const contract = proofContract({
			result: { ok: true },
			resultSchema: z.object({ ok: z.boolean() }),
			file: true,
			artifact,
		});
		await execute(contract, host);
		expect(host.writes).toEqual([artifact]);
		expect(host.stdout).toBe('{\n  "ok": true\n}\n');
	});

	test("held presentation is command-specific", async () => {
		const held = { board: "held", message: "held note" };
		const arrayHost = new RecordingHost();
		arrayHost.heldValue = held;
		await execute(
			proofContract({ result: [1], resultSchema: z.array(z.number()), held: "stderr-note" }),
			arrayHost,
		);
		expect(arrayHost.stdout).toBe("[\n  1\n]\n");
		expect(arrayHost.stderr).toBe("held note\n");

		const objectHost = new RecordingHost();
		objectHost.heldValue = held;
		await execute(
			proofContract({
				result: { ok: true },
				resultSchema: z.object({ ok: z.boolean(), held: z.unknown().optional() }),
				held: "object-field-and-stderr-note",
			}),
			objectHost,
		);
		expect(JSON.parse(objectHost.stdout).held).toEqual(held);
		expect(objectHost.stderr).toBe("held note\n");
	});

	test("introspection omits private artifact schemas and execution keys", () => {
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

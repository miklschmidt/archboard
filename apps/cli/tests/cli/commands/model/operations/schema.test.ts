// The schemas the skill names come from the installed CLI, with no server and no vault, and
// they accept and refuse what the runtime accepts and refuses.

import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ArchitectureInitializationRequestSchema,
	ArchitectureModuleEditSchema,
	ArchitectureImportRequestSchema,
} from "@archboard/model/contract";

const asked: string[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		asked.push(new URL(request.url).pathname);
		return Response.json({ success: false }, { status: 404 });
	},
});
const environment = {
	ARCHBOARD_URL: process.env["ARCHBOARD_URL"],
	ARCHBOARD_NO_AUTOSTART: process.env["ARCHBOARD_NO_AUTOSTART"],
};
process.env["ARCHBOARD_URL"] = `http://127.0.0.1:${server.port}`;
process.env["ARCHBOARD_NO_AUTOSTART"] = "1";
// Imported only now, because the CLI reads where its server is as it loads.
const [{ runCli }, { jsonSchema }] = await Promise.all([
	import("#cli/routing/operations/run.ts"),
	import("#cli/commands/model/operations/schema.ts"),
]);
const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-schema-")));

afterAll(async () => {
	for (const [key, value] of Object.entries(environment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await server.stop(true);
	fs.rmSync(outside, { recursive: true, force: true });
});

/**
 * Run the CLI in a directory that no checkout and no vault holds, and parse what it printed.
 * @param argv The arguments.
 * @returns The JSON answer and the exit code.
 */
async function answer(argv: string[]): Promise<{ json: unknown; exited: unknown }> {
	const cwd = process.cwd();
	const exitCode = process.exitCode;
	let stdout = "";
	const out = spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdout += String(chunk);
		return true;
	});
	process.exitCode = 0;
	process.chdir(outside);
	try {
		await runCli(argv);
		return { json: JSON.parse(stdout), exited: process.exitCode };
	} finally {
		process.chdir(cwd);
		out.mockRestore();
		process.exitCode = exitCode ?? 0;
	}
}

test("the CLI lists the schemas the skill names and prints each one, with no server and no vault", async () => {
	const listed = await answer(["model", "schema"]);
	expect(listed.exited).toBe(0);
	const names = (listed.json as { schemas: { name: string }[] }).schemas.map(({ name }) => name);
	expect(names).toEqual([
		"model-manifest",
		"module",
		"flows",
		"model-initialize",
		"model-edit",
		"model-import",
		"model-migrate",
		"vault-config",
	]);
	const ajv = new Ajv2020({ strict: false, validateFormats: false });
	for (const name of names) {
		const printed = await answer(["model", "schema", name]);
		expect(printed.exited, name).toBe(0);
		expect(() => ajv.compile(printed.json as object), name).not.toThrow();
	}
	expect(asked).toEqual([]);
});

test("the printed input schemas accept and refuse the same expressible input as the runtime", () => {
	const ajv = new Ajv2020({ strict: false, validateFormats: false });
	const cases = [
		{
			name: "model-initialize" as const,
			schema: ArchitectureInitializationRequestSchema,
			input: { name: "Shop", operationId: "init", writer: "agent", doing: "Initialize model" },
		},
		{
			name: "model-edit" as const,
			schema: ArchitectureModuleEditSchema,
			input: {
				target: { model: "Shop", state: null },
				expectedRevision: { digest: "abc", files: [] },
				operationId: "edit",
				writer: "agent",
				doing: "Add initial state",
				claim: "claim",
				proposal: { type: "create", name: "Initial" },
				changes: [],
			},
		},
	];
	for (const item of cases) {
		const validate = ajv.compile(jsonSchema(item.name));
		expect(item.schema.safeParse(item.input).success).toBe(true);
		expect(validate(item.input)).toBe(true);
		const invalid = { ...item.input, operationId: 42 };
		expect(item.schema.safeParse(invalid).success).toBe(false);
		expect(validate(invalid)).toBe(false);
	}
	const validatePortable = ajv.compile(jsonSchema("model-import"));
	const encodings = [
		["", true],
		["AAAA", true],
		["AA==", true],
		["AAA=", true],
		["AB==", true],
		["AAB=", true],
		["aZ09+/==", true],
		["A", false],
		["AAA", false],
		["AAAAA", false],
		["A===", false],
		["====", false],
		["AA=A", false],
		["AA==AAAA", false],
		["AAAA====", false],
		["AAAA\n", false],
		["AA A", false],
		["AA_A", false],
		["AA-A", false],
	] as const;
	for (const [bytes, accepted] of encodings) {
		const input = {
			bundle: {
				format: "archboard-model",
				schemaVersion: 1,
				model: "Shop",
				revision: { digest: "abc", files: [] },
				inputs: [{ path: "model.json", bytes }],
				history: { tips: [], bundle: null },
			},
			expectedRevision: { digest: "abc", files: [] },
			operationId: "portable",
			writer: "agent",
			doing: "Import model",
		};
		expect(ArchitectureImportRequestSchema.safeParse(input).success).toBe(accepted);
		expect(validatePortable(input)).toBe(accepted);
		input.bundle.inputs = [];
		const historyInput = {
			...input,
			bundle: { ...input.bundle, history: { tips: [], bundle: bytes } },
		};
		expect(ArchitectureImportRequestSchema.safeParse(historyInput).success).toBe(accepted);
		expect(validatePortable(historyInput)).toBe(accepted);
	}
});

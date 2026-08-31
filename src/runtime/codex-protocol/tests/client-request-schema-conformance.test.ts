import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { assertGeneratedClientRequestSchemaConformanceForTest } from "../conformance.js";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const methods = ["thread/read", "account/logout"] as const;

function temporaryConformanceDirectories(): string[] {
	return readdirSync(tmpdir())
		.filter((entry) => entry.startsWith("archboard-codex-request-conformance-"))
		.toSorted();
}

function writeGeneratedRequests(root: string): void {
	writeFileSync(
		join(root, "ClientRequest.ts"),
		[
			'import type { ThreadReadParams } from "./ThreadReadParams";',
			'import type { ThreadInjectItemsParams } from "./ThreadInjectItemsParams";',
			'import type { RequestId } from "./RequestId";',
			'export type ClientRequest = { "method": "thread/read", id: RequestId, params: ThreadReadParams, } | { "method": "account/logout", id: RequestId, params: undefined, } | { "method": "thread/inject_items", id: RequestId, params: ThreadInjectItemsParams, };',
			"",
		].join("\n"),
	);
	writeFileSync(
		join(root, "ThreadReadParams.ts"),
		"export type ThreadReadParams = { threadId: string; includeTurns?: boolean };\n",
	);
	writeFileSync(
		join(root, "ThreadInjectItemsParams.ts"),
		"type JsonValue = null | boolean | number | string | JsonValue[] | { [key in string]?: JsonValue };\nexport type ThreadInjectItemsParams = { threadId: string; items: JsonValue[] };\n",
	);
	writeFileSync(join(root, "RequestId.ts"), "export type RequestId = string | number;\n");
}

function runConformance(
	generatedRoot: string,
	localParamsModulePath: string,
	selectedMethods: readonly string[] = methods,
): void {
	assertGeneratedClientRequestSchemaConformanceForTest({
		generatedRoot,
		localParamsModulePath,
		methods: selectedMethods,
		repositoryTsconfigPath: join(repositoryRoot, "tsconfig.json"),
		typeScriptExecutablePath: join(repositoryRoot, "node_modules/typescript/bin/tsc"),
	});
}

function writeNarrowedProductionSchema(targetPath: string): void {
	const productionPath = join(
		repositoryRoot,
		"src/runtime/codex-protocol/lib/client-request-schemas.ts",
	);
	const source = readFileSync(productionPath, "utf8");
	const original = "includeTurns: z.boolean().optional(),";
	const narrowed = "includeTurns: z.literal(true).optional(),";
	if (!source.includes(original) || source.indexOf(original) !== source.lastIndexOf(original))
		throw new Error("expected one production thread/read includeTurns schema");
	const withNarrowing = source.replace(original, narrowed);
	const withAbsoluteImports = withNarrowing.replace(
		/from "(\.{1,2}\/[^"]+)\.js";/g,
		(_statement, specifier: string) =>
			`from ${JSON.stringify(resolve(dirname(productionPath), `${specifier}.ts`))};`,
	);
	const withAbsoluteZodImport = withAbsoluteImports.replace(
		'from "zod";',
		`from ${JSON.stringify(join(repositoryRoot, "node_modules/zod/index.js"))};`,
	);
	writeFileSync(targetPath, withAbsoluteZodImport);
}

describe("generated ClientRequest schema conformance", () => {
	test("accepts bidirectional payload equality including exact undefined params", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-exact-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root);
			writeFileSync(
				localParamsModulePath,
				'type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };\nexport type ClientRequestParams<Method extends "thread/read" | "account/logout" | "thread/inject_items"> = Method extends "thread/read" ? { threadId: string; includeTurns?: boolean } : Method extends "thread/inject_items" ? { threadId: string; items: JsonValue[] } : undefined;\nexport type ClientRequestInput<Method extends "thread/read" | "account/logout" | "thread/inject_items"> = ClientRequestParams<Method>;\n',
			);
			runConformance(root, localParamsModulePath);
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects an actual narrowing of the production runtime schema", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-hostile-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root);
			writeNarrowedProductionSchema(localParamsModulePath);
			let thrown: unknown;
			try {
				runConformance(root, localParamsModulePath, ["thread/read"]);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(Error);
			const message = (thrown as Error).message;
			expect(message).toContain("methods/thread/read/generated-to-schema-input.ts");
			expect(message).toContain("includeTurns");
			expect(message).toContain("boolean");
			expect(message).toContain("true");
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

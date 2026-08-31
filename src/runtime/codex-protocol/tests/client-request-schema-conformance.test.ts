import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { assertGeneratedClientRequestSchemaConformanceForTest } from "../conformance.js";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const methods = ["thread/read", "account/logout"] as const;
const focusedGeneratedThreadReadSource =
	"export type ThreadReadParams = { threadId: string; includeTurns?: boolean };\n";
const exactGeneratedJsonValueSource =
	"type JsonValue = null | boolean | number | string | JsonValue[] | { [key in string]?: JsonValue };";
const structuredGeneratedThreadReadSource = `export type ThreadReadParams = {
	threadId: string;
	includeTurns?: boolean;
	options?: {
		opaque: unknown;
		impossible: never;
		nested?: { enabled?: boolean };
		choice?: { type: "alpha"; alpha?: string } | { type: "beta"; beta?: number };
		entries?: { [key in string]?: { label?: string } };
		items?: Array<{ value?: string }>;
	};
};
`;
const exactLocalParamsSource = `
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type ThreadReadParams = {
	threadId: string;
	includeTurns?: boolean;
	options?: {
		opaque: unknown;
		impossible: never;
		nested?: { enabled?: boolean };
		choice?: { type: "alpha"; alpha?: string } | { type: "beta"; beta?: number };
		entries?: { [key: string]: { label?: string } };
		items?: Array<{ value?: string }>;
	};
};
export type ClientRequestParams<Method extends "thread/read" | "account/logout" | "thread/inject_items"> =
	Method extends "thread/read" ? ThreadReadParams :
	Method extends "thread/inject_items" ? { threadId: string; items: JsonValue[] } :
	undefined;
export type ClientRequestInput<Method extends "thread/read" | "account/logout" | "thread/inject_items"> =
	ClientRequestParams<Method>;
`;

function temporaryConformanceDirectories(): string[] {
	return readdirSync(tmpdir())
		.filter((entry) => entry.startsWith("archboard-codex-request-conformance-"))
		.toSorted();
}

function writeGeneratedRequests(
	root: string,
	threadReadSource = structuredGeneratedThreadReadSource,
	jsonValueSource = exactGeneratedJsonValueSource,
): void {
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
	writeFileSync(join(root, "ThreadReadParams.ts"), threadReadSource);
	writeFileSync(
		join(root, "ThreadInjectItemsParams.ts"),
		`${jsonValueSource}\nexport type ThreadInjectItemsParams = { threadId: string; items: JsonValue[] };\n`,
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

function replaceExactlyOnce(source: string, original: string, replacement: string): string {
	if (!source.includes(original) || source.indexOf(original) !== source.lastIndexOf(original))
		throw new Error(`expected exactly one fixture fragment ${JSON.stringify(original)}`);
	return source.replace(original, replacement);
}

function writeProductionSchema(
	targetPath: string,
	mutation?: "remove-generated-optional" | "invent-local-optional" | "replace-json-with-any",
): void {
	const productionPath = join(
		repositoryRoot,
		"src/runtime/codex-protocol/lib/client-request-schemas.ts",
	);
	const source = readFileSync(productionPath, "utf8");
	const mutated =
		mutation === undefined
			? source
			: mutation === "replace-json-with-any"
				? replaceExactlyOnce(source, "items: z.array(JsonValueSchema),", "items: z.array(z.any()),")
				: replaceExactlyOnce(
						source,
						"includeTurns: z.boolean().optional(),",
						mutation === "remove-generated-optional"
							? ""
							: "includeTurns: z.boolean().optional(),\n\tlocalOnlyForConformance: z.boolean().optional(),",
					);
	const withAbsoluteImports = mutated.replace(
		/from "(\.{1,2}\/[^"]+)\.js";/g,
		(_statement, specifier: string) =>
			`from ${JSON.stringify(resolve(dirname(productionPath), `${specifier}.ts`))};`,
	);
	const withAbsoluteZodImport = withAbsoluteImports.replace(
		'from "zod";',
		`from ${JSON.stringify(join(repositoryRoot, "node_modules/zod/index.cjs"))};`,
	);
	writeFileSync(targetPath, withAbsoluteZodImport);
}

function conformanceFailure(
	generatedRoot: string,
	localParamsModulePath: string,
	selectedMethods: readonly string[] = ["thread/read"],
): string {
	let thrown: unknown;
	try {
		runConformance(generatedRoot, localParamsModulePath, selectedMethods);
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBeInstanceOf(Error);
	return (thrown as Error).message;
}

function expectDeepExactFailure(message: string, method = "thread/read"): void {
	expect(message).toContain(`methods/${method}/schema-output-to-generated.ts`);
	expect(message).toContain(`methods/${method}/generated-to-schema-input.ts`);
	expect(message).toContain("does not satisfy the constraint 'true'");
}

describe("generated ClientRequest schema conformance", () => {
	test("accepts directional payload assignability with deep shape exactness", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-exact-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root);
			writeFileSync(localParamsModulePath, exactLocalParamsSource);
			runConformance(root, localParamsModulePath);
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	for (const hostile of [
		{
			name: "generated-only optional keys",
			source: replaceExactlyOnce(exactLocalParamsSource, "\tincludeTurns?: boolean;\n", ""),
		},
		{
			name: "local-only optional keys",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				"\tincludeTurns?: boolean;\n",
				"\tincludeTurns?: boolean;\n\tlocalOnly?: boolean;\n",
			),
		},
		{
			name: "nested optional keys",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				"nested?: { enabled?: boolean }",
				"nested?: {}",
			),
		},
		{
			name: "optional keys inside union branches",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				'{ type: "alpha"; alpha?: string }',
				'{ type: "alpha" }',
			),
		},
		{
			name: "optional keys inside record values",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				"{ [key: string]: { label?: string } }",
				"{ [key: string]: {} }",
			),
		},
		{
			name: "optional keys inside array elements",
			source: replaceExactlyOnce(exactLocalParamsSource, "Array<{ value?: string }>", "Array<{}>"),
		},
		{
			name: "any inside a nested object",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				"nested?: { enabled?: boolean }",
				"nested?: { enabled?: any }",
			),
		},
		{
			name: "any inside a union branch",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				'{ type: "alpha"; alpha?: string }',
				'{ type: "alpha"; alpha?: any }',
			),
		},
		{
			name: "any inside a record value",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				"{ [key: string]: { label?: string } }",
				"{ [key: string]: { label?: any } }",
			),
		},
		{
			name: "any inside an array element",
			source: replaceExactlyOnce(
				exactLocalParamsSource,
				"Array<{ value?: string }>",
				"Array<{ value?: any }>",
			),
		},
	] as const)
		test(`rejects ${hostile.name}`, () => {
			const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-hostile-"));
			const localParamsModulePath = join(root, "local.ts");
			const before = temporaryConformanceDirectories();
			try {
				writeGeneratedRequests(root);
				writeFileSync(localParamsModulePath, hostile.source);
				expectDeepExactFailure(conformanceFailure(root, localParamsModulePath));
				expect(temporaryConformanceDirectories()).toEqual(before);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});

	test("rejects any as the local JSON model", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-json-any-hostile-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root);
			writeFileSync(
				localParamsModulePath,
				replaceExactlyOnce(
					exactLocalParamsSource,
					"type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };",
					"type JsonValue = any;",
				),
			);
			expectDeepExactFailure(
				conformanceFailure(root, localParamsModulePath, ["thread/inject_items"]),
				"thread/inject_items",
			);
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	for (const hostile of [
		{
			name: "a widened scalar branch",
			source: replaceExactlyOnce(exactGeneratedJsonValueSource, ";", " | bigint;"),
		},
		{
			name: "any inside the array branch",
			source:
				"type JsonValue = null | boolean | number | string | any[] | { [key in string]?: JsonValue };",
		},
	] as const)
		test(`rejects generated JSON with ${hostile.name}`, () => {
			const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-generated-json-hostile-"));
			const localParamsModulePath = join(root, "local.ts");
			const before = temporaryConformanceDirectories();
			try {
				writeGeneratedRequests(root, structuredGeneratedThreadReadSource, hostile.source);
				writeFileSync(localParamsModulePath, exactLocalParamsSource);
				expectDeepExactFailure(
					conformanceFailure(root, localParamsModulePath, ["thread/inject_items"]),
					"thread/inject_items",
				);
				expect(temporaryConformanceDirectories()).toEqual(before);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});

	test("rejects an object for an exact undefined no-parameter request", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-undefined-hostile-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root);
			writeFileSync(
				localParamsModulePath,
				replaceExactlyOnce(exactLocalParamsSource, "\tundefined;", "\t{};"),
			);
			const message = conformanceFailure(root, localParamsModulePath, ["account/logout"]);
			expect(message).toContain("methods/account/logout/schema-output-to-generated.ts");
			expect(message).toContain("methods/account/logout/generated-to-schema-input.ts");
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts the unmodified production schema against the focused generated fixture", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-production-exact-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root, focusedGeneratedThreadReadSource);
			writeProductionSchema(localParamsModulePath);
			runConformance(root, localParamsModulePath, ["thread/read", "thread/inject_items"]);
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	for (const mutation of ["remove-generated-optional", "invent-local-optional"] as const)
		test(`rejects production schema mutation ${mutation}`, () => {
			const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-production-hostile-"));
			const localParamsModulePath = join(root, "local.ts");
			const before = temporaryConformanceDirectories();
			try {
				writeGeneratedRequests(root, focusedGeneratedThreadReadSource);
				writeProductionSchema(localParamsModulePath, mutation);
				expectDeepExactFailure(conformanceFailure(root, localParamsModulePath));
				expect(temporaryConformanceDirectories()).toEqual(before);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});

	test("rejects a production JsonValueSchema field weakened to z.any", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-production-any-hostile-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root, focusedGeneratedThreadReadSource);
			writeProductionSchema(localParamsModulePath, "replace-json-with-any");
			expectDeepExactFailure(
				conformanceFailure(root, localParamsModulePath, ["thread/inject_items"]),
				"thread/inject_items",
			);
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

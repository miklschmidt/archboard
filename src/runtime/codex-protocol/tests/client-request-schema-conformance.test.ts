import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
			'import type { RequestId } from "./RequestId";',
			'export type ClientRequest = { "method": "thread/read", id: RequestId, params: ThreadReadParams, } | { "method": "account/logout", id: RequestId, params: undefined, };',
			"",
		].join("\n"),
	);
	writeFileSync(
		join(root, "ThreadReadParams.ts"),
		"export type ThreadReadParams = { threadId: string; includeTurns?: boolean };\n",
	);
}

function runConformance(generatedRoot: string, localParamsModulePath: string): void {
	assertGeneratedClientRequestSchemaConformanceForTest({
		generatedRoot,
		localParamsModulePath,
		methods,
		repositoryTsconfigPath: join(repositoryRoot, "tsconfig.json"),
		typeScriptExecutablePath: join(repositoryRoot, "node_modules/typescript/bin/tsc"),
	});
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
				'export type ClientRequestParams<Method extends "thread/read" | "account/logout"> = Method extends "thread/read" ? { threadId: string; includeTurns?: boolean } : undefined;\n',
			);
			runConformance(root, localParamsModulePath);
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("names the method, direction, and conflicting types for hostile drift", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-request-schema-hostile-"));
		const localParamsModulePath = join(root, "local.ts");
		const before = temporaryConformanceDirectories();
		try {
			writeGeneratedRequests(root);
			writeFileSync(
				localParamsModulePath,
				'export type ClientRequestParams<Method extends "thread/read" | "account/logout"> = Method extends "thread/read" ? { threadId: string; includeTurns?: string } : {};\n',
			);
			let thrown: unknown;
			try {
				runConformance(root, localParamsModulePath);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(Error);
			const message = (thrown as Error).message;
			expect(message).toContain("methods/thread/read/archboard-schema-to-generated.ts");
			expect(message).toContain("methods/thread/read/generated-to-archboard-schema.ts");
			expect(message).toContain("includeTurns");
			expect(message).toContain("string");
			expect(message).toContain("boolean");
			expect(message).toContain("methods/account/logout/archboard-schema-to-generated.ts");
			expect(message).toContain("methods/account/logout/generated-to-archboard-schema.ts");
			expect(message).toContain("not assignable to type 'undefined'");
			expect(temporaryConformanceDirectories()).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

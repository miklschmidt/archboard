import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
	fileURLToPath(new URL("../../../src/server/canvas/lib/codex-workbench.ts", import.meta.url)),
	"utf8",
);

const FACTORY_CALLS = [
	"createCodexProcess",
	"createIdentityAuthorities",
	"createCodexEpochStore",
	"createCodexTransport",
	"createCodexSession",
	"createCodexThreadLink",
	"createCodexWorkhorseStart",
	"createCodexRealtimeAdapter",
	"createCodexApprovalBroker",
	"createCodexDynamicTools",
	"createCodexThreadContextDelivery",
	"createCodexCoordinator",
	"createCodexWorkhorseQueue",
	"createCodexWorkhorseOperations",
	"createCodexSpokenApprovalGate",
	"createCodexCoordinatorTools",
	"createCodexCoordinatorCallbacks",
	"createCodexWorkbenchGateway",
] as const;

const REQUEST_METHODS = [
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/tool/requestUserInput",
	"mcpServer/elicitation/request",
	"item/permissions/requestApproval",
	"applyPatchApproval",
	"execCommandApproval",
	"item/tool/call",
	"currentTime/read",
	"account/chatgptAuthTokens/refresh",
	"attestation/generate",
] as const;

function callCount(name: string): number {
	return SOURCE.match(new RegExp(`\\b${name}\\(`, "gu"))?.length ?? 0;
}

describe("production Codex workbench composition policy", () => {
	test("owns one call site for every production runtime constructor", () => {
		for (const factory of FACTORY_CALLS) expect(callCount(factory), factory).toBe(1);
		for (const adapter of ["approval", "threadAuthority", "context", "operationId", "lifecycle"])
			expect(callCount(`bindings.dynamicAdapters.${adapter}`), adapter).toBe(1);
	});

	test("names every generated server request exactly once in the exhaustive router", () => {
		for (const method of REQUEST_METHODS) {
			const matches = SOURCE.match(new RegExp(`case ${JSON.stringify(method)}`, "gu")) ?? [];
			expect(matches.length, method).toBe(1);
		}
		expect(SOURCE).toContain("return assertUnreachable(request)");
		expect(SOURCE).not.toMatch(/default:[\s\S]{0,240}respond/iu);
	});

	test("keeps only the process owner, scalar state, and replaceable closures", () => {
		const retained = SOURCE.slice(
			SOURCE.indexOf("export interface CodexWorkbenchRetainedState"),
			SOURCE.indexOf("export function emptyCodexWorkbenchRetainedState"),
		);
		expect(retained).toContain("process: CodexProcess | null");
		expect(retained).toContain("startCurrentGeneration:");
		expect(retained).toContain("stopCurrentGeneration:");
		for (const forbidden of [
			"identity:",
			"decoder:",
			"session:",
			"transport:",
			"gateway:",
			"approvals:",
			"callbacks:",
		]) {
			expect(retained, forbidden).not.toContain(forbidden);
		}
	});
});

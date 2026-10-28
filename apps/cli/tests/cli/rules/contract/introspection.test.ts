import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { introspectContracts } from "#cli/rules/contract/introspection.ts";
import {
	cleanupCommandContractTest,
	proofContract,
} from "#tests/cli/support/command-contract/support.ts";

afterEach(cleanupCommandContractTest);

describe("command-contract introspection", () => {
	test("introspection omits adapter and private execution types", () => {
		const contract = proofContract({
			result: { ok: true },
			resultSchema: z.object({ ok: z.boolean() }),
			file: true,
			artifact: { path: "/tmp/result", content: "content", encoding: "utf8" },
		});
		const json = JSON.stringify(
			introspectContracts([{ name: "proof", classification: "neither", contract }]),
		);
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

	test("staged metadata names when a stage runs and what it does", async () => {
		const { paneOpenContract } = await import("#cli/operations/pane/pane.ts");
		const proof = introspectContracts([
			{ name: "browser open", classification: "browser", contract: paneOpenContract },
		]);
		const openArguments = proof[0]?.input.stages.find((stage) => stage.name === "open-arguments");
		expect(openArguments?.when).toBe("after-server");
		expect(openArguments?.schema).toMatchObject({ type: "array", items: { type: "string" } });
	});
});

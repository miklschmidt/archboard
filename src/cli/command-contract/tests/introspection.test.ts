import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { introspectContracts } from "../introspection.js";
import { cleanupCommandContractTest, proofContract } from "./support.js";

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
		const { browserShowContract } = await import("../../commands/pane.js");
		const proof = introspectContracts([
			{ name: "browser show", classification: "browser", contract: browserShowContract },
		]);
		const showArguments = proof[0]?.input.stages.find((stage) => stage.name === "show-arguments");
		expect(showArguments?.when).toBe("after-server");
		expect(showArguments?.rules.join(" ")).toContain("board");
	});
});

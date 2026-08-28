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
		const json = JSON.stringify(introspectContracts([{ name: "proof", contract }]));
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
});

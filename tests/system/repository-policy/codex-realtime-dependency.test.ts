import { describe, expect, test } from "bun:test";
import path from "node:path";
import { forbiddenRealtimeModuleFinding } from "./support/codex-realtime-dependency.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const importer = path.join(repoRoot, "src/ui/codex-realtime/lib/contract.ts");
const finding = (specifier: string) =>
	forbiddenRealtimeModuleFinding(importer, { kind: "type import", specifier }, repoRoot);

describe("Codex realtime dependency exception", () => {
	test("allows only the exact resolved neutral host root", () => {
		expect(finding("../../../shared/codex-realtime-host/index.js")).toBeUndefined();
	});

	test("rejects Node masquerades, suffix matches, and generated runtime lookalikes", () => {
		for (const specifier of [
			"node:shared/codex-realtime-host/index.js",
			"./near/shared/codex-realtime-host/index.js",
			"./runtime/generated/codex-realtime-host/index.js",
		]) {
			expect(finding(specifier), specifier).toMatchObject({ reason: "forbidden dependency" });
		}
	});
});

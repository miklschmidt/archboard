import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { BROWSER_TEST_PATHS } from "../browser/support/agent-browser.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");

describe("legacy injection removal policy", () => {
	test("keeps the retired owner absent and the control client unreachable", async () => {
		for (const retired of [
			"src/runtime/engine/injection.ts",
			"src/runtime/engine/app-server-control.ts",
			"tests/system/canvas-state/injection.test.ts",
			"tests/system/canvas-state/support/injection-daemon.ts",
		])
			expect(existsSync(path.join(repoRoot, retired)), retired).toBeFalse();

		const forbiddenProductionReferences: string[] = [];
		const forbiddenTokens = [
			"injection.js",
			"app-server-control.js",
			"app-server-control.ts",
			"app-server-control.sock",
			"CONTROL_SOCKET_DIR",
			"CONTROL_SOCKET_FILE",
			"controlSocketPath",
			"ws+unix://",
		] as const;
		for (const area of ["src/server", "src/runtime", "src/ui"] as const) {
			for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({
				cwd: path.join(repoRoot, area),
			})) {
				const source = readFileSync(path.join(repoRoot, area, file), "utf8");
				for (const token of forbiddenTokens) {
					if (source.includes(token))
						forbiddenProductionReferences.push(`${area}/${file}: ${token}`);
				}
			}
		}
		expect(forbiddenProductionReferences).toEqual([]);
	});

	test("keeps all 19 canonical browser owners", () => {
		expect(BROWSER_TEST_PATHS).toHaveLength(19);
	});
});

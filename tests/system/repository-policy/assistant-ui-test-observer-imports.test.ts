import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");
const plugin = path.join(repoRoot, "tools/oxlint-plugin-archboard.js");
const source =
	'import { useAui } from "@assistant-ui/react";\nexport function observer() { return useAui(); }\n';

function lint(root: string, file: string) {
	const result = Bun.spawnSync({
		cmd: [oxlint, "--config=.oxlintrc.jsonc", "--format=default", file],
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

describe("assistant-ui test observer import policy", () => {
	test("allows only the exact useAui observer without widening production", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-use-aui-policy-"));
		try {
			fs.writeFileSync(
				path.join(root, ".oxlintrc.jsonc"),
				JSON.stringify({
					jsPlugins: [plugin],
					rules: { "archboard/assistant-ui-imports": "error" },
				}),
			);
			fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
			for (const file of [
				"src/ui/workbench-runtime/tests/provider-context-observer.ts",
				"src/ui/workbench-runtime/tests/other-observer.ts",
				"src/ui/workbench-runtime/runtime.ts",
			]) {
				const target = path.join(root, file);
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.writeFileSync(target, source);
			}
			const allowed = lint(root, "src/ui/workbench-runtime/tests/provider-context-observer.ts");
			expect(allowed.exitCode, allowed.output).toBe(0);
			for (const denied of [
				lint(root, "src/ui/workbench-runtime/tests/other-observer.ts"),
				lint(root, "src/ui/workbench-runtime/runtime.ts"),
			]) {
				expect(denied.exitCode, denied.output).not.toBe(0);
				expect(denied.output).toContain("belongs to a different Archboard module");
			}
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

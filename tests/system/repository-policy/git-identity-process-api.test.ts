import { expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const OXLINT = join(ROOT, "node_modules/.bin/oxlint");
const PLUGIN = join(ROOT, "tools/oxlint-plugin-archboard.js");

function lintGitFixture(source: string): { exitCode: number; output: string } {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-process-policy-"));
	try {
		const config = readFileSync(join(ROOT, ".oxlintrc.jsonc"), "utf8").replace(
			'"./tools/oxlint-plugin-archboard.js"',
			JSON.stringify(PLUGIN),
		);
		writeFileSync(join(root, ".oxlintrc.jsonc"), config);
		copyFileSync(join(ROOT, "tsconfig.json"), join(root, "tsconfig.json"));
		symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"), "dir");
		mkdirSync(join(root, "src/runtime/engine"), { recursive: true });
		writeFileSync(join(root, "src/runtime/engine/git.ts"), source);
		const result = Bun.spawnSync({
			cmd: [OXLINT, "--config=.oxlintrc.jsonc", "--format=default", "src/runtime/engine/git.ts"],
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		return {
			exitCode: result.exitCode,
			output: `${result.stdout.toString()}${result.stderr.toString()}`,
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test.each([
	[
		"computed synchronous child APIs",
		'const childProcess = { spawnSync() {} }; childProcess["spawnSync"]();\n',
	],
	["optional computed unref", 'const child = { unref() {} }; child?.["unref"]();\n'],
	[
		"alternate exit polling loops",
		"const child = { exitCode: null, signalCode: null }; for (; child.exitCode === null;) {} do {} while (child.signalCode === null);\n",
	],
	[
		"computed timers and sleeps",
		'globalThis["setInterval"](() => {}, 1); Bun["sleep"](1); Atomics["wait"](new Int32Array(), 0);\n',
	],
	[
		"discarded child ownership",
		'void Bun["spawn"](["git"]); const child = { exited: Promise.resolve(0) }; void child["exited"];\n',
	],
	[
		"aliased synchronous child imports",
		'import { spawnSync as run } from "node:child_process"; void run;\n',
	],
	["retained synchronous child references", "const run = Bun.spawnSync; void run;\n"],
	[
		"assigned children without an exit owner",
		'const child = Bun.spawn(["git"]); export { child };\n',
	],
] as const)("type-unaware Git lifecycle lint rejects %s", (_name, source) => {
	const result = lintGitFixture(source);
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).toContain("archboard(git-process-lifecycle)");
});

test("type-unaware Git lifecycle lint accepts an explicitly owned child exit", () => {
	const result = lintGitFixture(
		'const child = Bun.spawn(["git"]); const exited = child.exited; await exited;\n',
	);
	expect(result.exitCode, result.output).toBe(0);
});

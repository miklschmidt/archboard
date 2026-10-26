#!/usr/bin/env bun
// The declaration compiler of scripts/pack-codex-realtime-voice.ts. It runs the native TypeScript
// compiler with the arguments the bundler passes, then also writes the declarations of the
// generated protocol types where the bundler looks for them. TypeScript emits them under the
// `current` link that imports name, and the bundler follows that link to the version folder.
import { cpSync, existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const typescript = path.dirname(require.resolve("typescript/package.json"));
const exePath: unknown = require(path.join(typescript, "lib/getExePath.js"));
if (
	typeof exePath !== "object" ||
	exePath === null ||
	!("default" in exePath) ||
	typeof exePath.default !== "function"
)
	throw new Error("TypeScript names no native compiler.");
const args = process.argv.slice(2);
const compiled = Bun.spawnSync([String(exePath.default()), ...args], {
	stdio: ["ignore", "inherit", "inherit"],
});
if (compiled.exitCode !== 0) process.exit(compiled.exitCode);

/**
 * The value that the bundler passed for one compiler option.
 * @param name The option.
 * @returns Its value.
 */
function flag(name: string): string {
	const value = args[args.indexOf(name) + 1];
	if (value === undefined) throw new Error(`The declaration build received no ${name}.`);
	return value;
}
const outDir = flag("--outDir");
const rootDir = flag("--rootDir");
const link = path.join(rootDir, "packages/codex-app-server/src/shared/protocol/generated/current");
// TypeScript names a generated file by the path it reached first, so either tree can be the one.
const trees = [link, realpathSync(link)].map((tree) =>
	path.join(outDir, path.relative(rootDir, tree)),
);
for (const [from, to] of [trees, trees.toReversed()]) {
	if (from !== undefined && to !== undefined && existsSync(from)) {
		cpSync(from, to, { recursive: true, force: false });
	}
}

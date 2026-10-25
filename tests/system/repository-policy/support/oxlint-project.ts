// Real Oxlint subprocesses over temporary projects, for the boundary tests of the plugin: each
// project holds the files a test names plus the repository's own tests config as `.oxlintrc.jsonc`.
import { expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vp = path.join(repoRoot, "node_modules/.bin/vp");
const plugin = path.join(repoRoot, "tools/oxlint-plugin-archboard.ts");

interface CommandResult {
	exitCode: number;
	output: string;
}

function run(cwd: string, cmd: string[]): CommandResult {
	const result = Bun.spawnSync({
		cmd,
		cwd,
		env: {
			...process.env,
			PATH: `${path.join(repoRoot, "node_modules/.bin")}:${process.env["PATH"] ?? ""}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function repositoryOxlintConfig(): string {
	const authored = fs.readFileSync(path.join(repoRoot, ".oxlintrc.tests.jsonc"), "utf8");
	const relativePlugin = '"./tools/oxlint-plugin-archboard.ts"';
	if (!authored.includes(relativePlugin)) {
		throw new Error("repository Oxlint plugin path is missing");
	}
	return authored.replace(relativePlugin, JSON.stringify(plugin));
}

async function withProject<T>(
	files: Record<string, string>,
	check: (root: string) => T | Promise<T>,
): Promise<T> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-boundaries-"));
	try {
		fs.writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({ name: "lint-fixture", private: true }),
		);
		fs.writeFileSync(path.join(root, ".oxlintrc.jsonc"), repositoryOxlintConfig());
		for (const [relative, content] of Object.entries(files)) {
			const target = path.join(root, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content);
		}
		return await check(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

function lintCommand(relativePaths: string[]): string[] {
	return [vp, "lint", "--config=.oxlintrc.jsonc", "--format=default", ...relativePaths];
}

function lint(root: string, relativePaths: string[]): CommandResult {
	return run(root, lintCommand(relativePaths));
}

function expectPass(result: CommandResult): void {
	expect(result.exitCode, result.output).toBe(0);
}

function expectRule(result: CommandResult, rule: string): void {
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).toContain(rule);
}

/** One diagnostic of a lint run: the file, the rule as `plugin(rule)`, and the message. */
interface Diagnostic {
	file: string;
	code: string;
	message: string;
}

/**
 * Lint files and read every diagnostic, so a test names what each file earns.
 * @param root The project directory.
 * @param relativePaths The files to lint.
 * @returns The diagnostics of all the files.
 */
function diagnosticsOf(root: string, relativePaths: string[]): Diagnostic[] {
	const result = run(root, [
		vp,
		"lint",
		"--config=.oxlintrc.jsonc",
		"--format=json",
		...relativePaths,
	]);
	const parsed: unknown = JSON.parse(result.output);
	const list =
		typeof parsed === "object" && parsed !== null && "diagnostics" in parsed
			? parsed.diagnostics
			: [];
	return (Array.isArray(list) ? list : []).map((entry: Record<string, string>) => ({
		file: entry["filename"] ?? "",
		code: entry["code"] ?? "",
		message: entry["message"] ?? "",
	}));
}

/**
 * Lint files in one run and name what each refused file earns and what passes.
 * @param root The project directory.
 * @param refused Each file that must be refused, with its stable diagnostic rule code.
 * @param allowed The files that must earn no diagnostic.
 */
function expectJudged(
	root: string,
	refused: Record<string, string>,
	allowed: readonly string[] = [],
): void {
	const found = diagnosticsOf(root, [...Object.keys(refused), ...allowed]);
	for (const [file, code] of Object.entries(refused)) {
		const diagnostics = found.filter((entry) => entry.file === file);
		expect(
			diagnostics.map((entry) => entry.code),
			JSON.stringify(diagnostics),
		).toContain(code);
	}
	expect(found.filter((entry) => allowed.includes(entry.file))).toEqual([]);
}

/**
 * A file that imports `clip` from a specifier and re-exports it.
 * @param from The specifier.
 * @returns The file's text.
 */
function importing(from: string): string {
	return `import { clip } from "${from}";\nexport { clip };\n`;
}

/**
 * Link a path of the project to another one, as `bun install` links a workspace.
 * @param root The project directory.
 * @param link The path of the link.
 * @param target The path it names.
 */
function linkInto(root: string, link: string, target: string): void {
	fs.mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
	fs.symlinkSync(path.join(root, target), path.join(root, link));
}

export {
	diagnosticsOf,
	expectJudged,
	expectPass,
	expectRule,
	importing,
	linkInto,
	lint,
	plugin,
	repoRoot,
	withProject,
	type CommandResult,
	type Diagnostic,
};

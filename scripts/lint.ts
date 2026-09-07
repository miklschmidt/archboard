// Oxlint's --tsconfig controls imports, but tsgolint independently searches for
// projects. Refuse unmatched targets before starting it: an ancestor /tmp config
// previously made a copied-repository check consume 38 GiB (TASK-150).
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";

const repository = process.cwd();
const toolDirectory = resolve(import.meta.dir, "../node_modules/.bin");
const argumentsFromCaller = process.argv.slice(2);
const command = [
	join(toolDirectory, "oxlint"),
	...argumentsFromCaller,
	"--tsconfig",
	join(repository, "tsconfig.json"),
];
const metadataArguments = command.filter(
	(argument, index) =>
		argument !== "--debug" && !argument.startsWith("--debug=") && command[index - 1] !== "--debug",
);
const programSchema = z.object({ files: z.array(z.string()) });
const optionsSchema = z.object({
	options: z
		.object({ typeAware: z.boolean().optional(), typeCheck: z.boolean().optional() })
		.optional(),
});

/**
 * Run a tool for its output alone, before the real lint starts.
 * @param argv The command and its arguments.
 * @returns The tool's standard output.
 * @throws {Error} When the tool exits non-zero; the message carries both streams.
 */
function metadata(argv: string[]): string {
	const result = Bun.spawnSync(argv, { cwd: repository, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
	return result.stdout.toString();
}

/**
 * Whether this invocation will start the type-aware backend, either by a
 * command-line flag or through the resolved configuration.
 * @returns Whether project-scope checks must run first.
 */
function usesTypes(): boolean {
	if (
		argumentsFromCaller.some((argument) =>
			["--type-aware", "--type-check", "--type-check-only"].includes(argument),
		)
	)
		return true;
	const parsed = optionsSchema.parse(
		Bun.JSONC.parse(metadata([...metadataArguments, "--print-config"])),
	);
	return parsed.options?.typeAware === true || parsed.options?.typeCheck === true;
}

/**
 * Whether a nested tsconfig.json or jsconfig.json sits between a file and the
 * repository root, which would change which project tsgolint selects.
 * @param filename The absolute path of a lint target.
 * @returns Whether such a nested project file exists.
 */
function hasNestedProject(filename: string): boolean {
	for (
		let directory = dirname(filename);
		directory !== repository;
		directory = dirname(directory)
	) {
		if (["tsconfig.json", "jsconfig.json"].some((name) => existsSync(join(directory, name)))) {
			return true;
		}
	}
	return false;
}

/**
 * The reason one lint target cannot be linted type-aware, if any.
 * @param target The target as Oxlint lists it.
 * @param declared The absolute paths the repository tsconfig.json declares.
 * @returns The problem line, or undefined when the target is declared and unnested.
 */
function targetProblem(target: string, declared: ReadonlySet<string>): string | undefined {
	const filename = resolve(repository, target);
	const local = relative(repository, filename);
	if (local.startsWith("../") || isAbsolute(local) || !declared.has(filename)) {
		return `${target}: not a declared root in the repository tsconfig.json`;
	}
	if (hasNestedProject(filename)) {
		return `${target}: nested tsconfig.json or jsconfig.json would change project selection`;
	}
	return undefined;
}

/**
 * The absolute paths of every file the repository TypeScript project declares.
 * @returns The declared roots.
 */
function declaredRoots(): Set<string> {
	const project = programSchema.parse(
		JSON.parse(
			metadata([
				join(toolDirectory, "tsc"),
				"--showConfig",
				"--project",
				join(repository, "tsconfig.json"),
			]),
		),
	);
	return new Set(project.files.map((file) => resolve(repository, file)));
}

/**
 * Refuse stdin input and any target outside the declared repository project
 * before the type-aware backend can search for a project of its own.
 * @throws {Error} When an input is undeclared, nested under another project, or stdin.
 */
function checkProjectScope(): void {
	if (
		argumentsFromCaller.some(
			(argument) => argument === "--stdin" || argument.startsWith("--stdin-filename"),
		)
	) {
		throw new Error(
			"Type-aware lint requires declared repository files. Write stdin to a repository TypeScript input before linting it.",
		);
	}
	const declared = declaredRoots();
	const targets = metadata([...metadataArguments, "--debug", "files"])
		.trim()
		.split("\n")
		.filter(Boolean);
	const problems = targets.flatMap((target) => targetProblem(target, declared) ?? []);
	if (problems.length)
		throw new Error(
			`Type-aware lint refused before analyzer startup:\n${problems.join("\n")}\n` +
				"Declare these inputs in the repository TypeScript project and remove conflicting nested projects, " +
				"or omit them from this type-aware lint invocation. Ancestor and inferred project fallback is not allowed.",
		);
}

try {
	if (argumentsFromCaller.includes("--"))
		throw new Error(
			"Repository lint does not accept '--'. Pass file paths directly so project checks remain options.",
		);
	if (argumentsFromCaller.includes("--lsp"))
		throw new Error(
			"Repository lint checks one file inventory at a time; language-server mode is unsupported. Use the lint scripts.",
		);
	const metadataOnly = argumentsFromCaller.some((argument) =>
		["--print-config", "--rules", "--help", "-h", "--version", "-V"].includes(argument),
	);
	if (!metadataOnly && usesTypes()) checkProjectScope();
	const child = Bun.spawn(command, {
		cwd: repository,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exitCode = await child.exited;
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}

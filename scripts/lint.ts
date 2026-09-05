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

function metadata(argv: string[]): string {
	const result = Bun.spawnSync(argv, { cwd: repository, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
	return result.stdout.toString();
}

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
	const declared = new Set(project.files.map((file) => resolve(repository, file)));
	const targets = metadata([...metadataArguments, "--debug", "files"])
		.trim()
		.split("\n")
		.filter(Boolean);
	const problems: string[] = [];
	for (const target of targets) {
		const filename = resolve(repository, target);
		const local = relative(repository, filename);
		if (local.startsWith("../") || isAbsolute(local) || !declared.has(filename)) {
			problems.push(`${target}: not a declared root in the repository tsconfig.json`);
			continue;
		}
		for (
			let directory = dirname(filename);
			directory !== repository;
			directory = dirname(directory)
		) {
			if (["tsconfig.json", "jsconfig.json"].some((name) => existsSync(join(directory, name)))) {
				problems.push(
					`${target}: nested tsconfig.json or jsconfig.json would change project selection`,
				);
				break;
			}
		}
	}
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

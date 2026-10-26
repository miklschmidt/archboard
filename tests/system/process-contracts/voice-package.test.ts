// The npm build of @archboard/codex-realtime-voice works outside this repository: a Bun project
// installs the packed tarball, type-checks a file that imports every public entry together with
// the README's checked code blocks, and imports the server entry.
import { expect, test } from "bun:test";
import {
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../../..");
const packed = path.join(root, "dist/codex-realtime-voice");
/** The packages beside the tarball that the README's install line names for the quickstart page. */
const QUICKSTART_PACKAGES = [
	"react",
	"react-dom",
	"@types/react",
	"@types/react-dom",
	"@types/bun",
];

/**
 * Run a command to completion and require that it succeeds.
 * @param command The command and its arguments.
 * @param cwd Where it runs.
 * @returns Its standard output.
 */
function run(command: readonly string[], cwd: string): string {
	const result = Bun.spawnSync([...command], { cwd, stdout: "pipe", stderr: "pipe" });
	const output = `${result.stdout.toString()}${result.stderr.toString()}`;
	expect(result.exitCode, `${command.join(" ")}\n${output}`).toBe(0);
	return result.stdout.toString();
}

/**
 * The README's checked code blocks: each fenced block that follows a `<!-- checked: <file> -->`
 * line, as the file it is written to.
 * @returns Each block's file name and code.
 */
function checkedReadmeBlocks(): readonly { readonly file: string; readonly code: string }[] {
	const readme = readFileSync(path.join(root, "packages/codex-realtime-voice/README.md"), "utf8");
	return [...readme.matchAll(/^<!-- checked: (\S+) -->\n+```\w+\n([\s\S]*?)^```$/gm)].map(
		([, file, code]) => ({ file: file ?? "", code: code ?? "" }),
	);
}

/**
 * The exact versions this repository pins, so the consumer installs what the repository tests.
 * @param names The packages.
 * @returns Each as `name@version`.
 */
function pinned(names: readonly string[]): string[] {
	const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
		dependencies: Record<string, string>;
		devDependencies: Record<string, string>;
	};
	return names.map((name) => {
		const version = manifest.dependencies[name] ?? manifest.devDependencies[name];
		expect(version, `the repository pins ${name}`).toBeDefined();
		return `${name}@${version}`;
	});
}

/**
 * Every line of the packed package that names a concept of the host that publishes it: Archboard,
 * its boards, vaults, panes, walkthroughs, narration, dock and canvas, or a decision or task of
 * its backlog. The `@archboard/` npm scope and the URL of the repository that holds the source
 * are the two names the package keeps. The browser global `navigator` is not in the list: the
 * browser client reads it.
 * @returns Each hit as `file:line: text`.
 */
function archboardConceptsInPackedPackage(): string[] {
	const concept =
		/archboard|\b(?:boards?|vaults?|panes?|walkthroughs?|narration|dock|canvas)\b|ADR [0-9]{4}|TASK-[0-9]+/i;
	const kept = /@archboard\/|github\.com\/miklschmidt\/archboard/gi;
	const files = readdirSync(packed, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(entry.parentPath, entry.name))
		.filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));
	return files.flatMap((file) =>
		readFileSync(file, "utf8")
			.split("\n")
			.flatMap((line, index) =>
				concept.test(line.replace(kept, ""))
					? [`${path.relative(packed, file)}:${index + 1}: ${line.trim().slice(0, 160)}`]
					: [],
			),
	);
}

test("an outside Bun project installs the packed package, uses every public entry and the README's code", () => {
	const project = realpathSync(mkdtempSync(path.join(tmpdir(), "codex-realtime-voice-consumer-")));
	try {
		run(["bun", "run", "pack:voice"], root);
		expect(archboardConceptsInPackedPackage()).toEqual([]);
		const manifest = JSON.parse(readFileSync(path.join(packed, "package.json"), "utf8")) as {
			name: string;
			exports: Record<string, unknown>;
		};
		run(["bun", "pm", "pack", "--destination", project, "--quiet"], packed);
		const tarball = readdirSync(project).find((file) => file.endsWith(".tgz"));
		expect(tarball).toBeDefined();
		writeFileSync(
			path.join(project, "package.json"),
			JSON.stringify({ name: "consumer", private: true, type: "module" }),
		);
		// The Codex executable is a peer that the host installs. Type-checking and importing need none.
		run(
			[
				"bun",
				"add",
				"--omit",
				"peer",
				path.join(project, tarball ?? ""),
				...pinned(QUICKSTART_PACKAGES),
			],
			project,
		);

		const specifiers = Object.keys(manifest.exports).map(
			(subpath) => `${manifest.name}${subpath.slice(1)}`,
		);
		writeFileSync(
			path.join(project, "consumer.ts"),
			[
				...specifiers.map((specifier, index) => `import * as entry${index} from "${specifier}";`),
				`export const entries = [${specifiers.map((_, index) => `entry${index}`).join(", ")}];`,
				"",
			].join("\n"),
		);
		const blocks = checkedReadmeBlocks();
		expect(blocks.map(({ file }) => file)).toEqual(
			expect.arrayContaining(["server.ts", "page.tsx"]),
		);
		for (const { file, code } of blocks) writeFileSync(path.join(project, file), code);
		// The compiler options of `bun init`, which a developer who copies the README has.
		writeFileSync(
			path.join(project, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					target: "ESNext",
					module: "Preserve",
					moduleResolution: "bundler",
					moduleDetection: "force",
					lib: ["ESNext", "DOM", "DOM.Iterable"],
					types: ["bun"],
					jsx: "react-jsx",
					strict: true,
					noUncheckedIndexedAccess: true,
					noImplicitOverride: true,
					verbatimModuleSyntax: true,
					noEmit: true,
					skipLibCheck: false,
				},
				include: ["consumer.ts", ...blocks.map(({ file }) => file)],
			}),
		);
		run([path.join(root, "node_modules/.bin/tsc"), "-p", "tsconfig.json"], project);

		const imported = run(
			[
				"bun",
				"-e",
				`const server = await import("${manifest.name}/server"); console.log(typeof server.createVoiceAgent, typeof server.resolveCodexExecutable);`,
			],
			project,
		);
		expect(imported.trim()).toBe("function function");
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
}, 600_000);

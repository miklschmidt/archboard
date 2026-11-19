// The npm build of @archboard/codex-realtime-voice works outside this repository: a Bun project
// installs the packed tarball, type-checks a file that imports every public entry together with
// the README's checked code blocks, and runs the server's start and stop and the browser client's
// reconnect. Every duration the packed code names resolves in timing's published build.
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
 * its models, vaults, panes, walkthroughs, narration, dock and canvas, or a decision or task of
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

/**
 * Every name the packed JavaScript hands to timing: a duration, such as `"codexRealtime.stop"`,
 * or a wait, which `waitUntil` takes.
 * @returns The names, each once, a wait marked by a leading `wait:`.
 */
function timingNamesInPackedCode(): string[] {
	const call = /\b(durationMs|deadline|waitUntil|pause)(?:\$\d+)?\(\s*"([a-zA-Z]+\.[a-zA-Z]+)"/g;
	const names = readdirSync(path.join(packed, "dist"))
		.filter((file) => file.endsWith(".mjs"))
		.flatMap((file) =>
			[...readFileSync(path.join(packed, "dist", file), "utf8").matchAll(call)].map(
				([, operation, name]) => `${operation === "waitUntil" ? "wait:" : ""}${name ?? ""}`,
			),
		);
	return [...new Set(names)].toSorted();
}

/**
 * Read each name once through timing built under the `published` condition, which the pack builds
 * with. A name that only the host's half of timing carries throws there.
 * @param names The names, as {@link timingNamesInPackedCode} returns them.
 * @returns One line for each name read.
 */
function readInPublishedTiming(names: readonly string[]): string[] {
	const script = `import { deadline, waitUntil } from "@archboard/timing";
for (const name of ${JSON.stringify(names)}) {
	if (name.startsWith("wait:")) console.log(name, (await waitUntil(name.slice(5), () => true)).ok);
	else console.log(name, deadline(name, 0));
}`;
	const output = run(
		["bun", "--conditions", "published", "-e", script],
		path.join(root, "packages/codex-realtime-voice"),
	);
	return output.split("\n").filter(Boolean);
}

/**
 * What timing's published build says when it is asked for a duration only the host's half carries.
 * @returns Its error output.
 */
function hostNameInPublishedTiming(): string {
	const result = Bun.spawnSync(
		[
			"bun",
			"--conditions",
			"published",
			"-e",
			'import { durationMs } from "@archboard/timing"; durationMs("pane.report");',
		],
		{ cwd: path.join(root, "packages/codex-realtime-voice"), stdout: "pipe", stderr: "pipe" },
	);
	expect(result.exitCode).not.toBe(0);
	return result.stderr.toString();
}

/** A consumer's server and page: a start against a Codex that exits, a stop, and a lost socket. */
const EXERCISE = `import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";
import { createVoiceAgent } from "@archboard/codex-realtime-voice/server";

const executablePath = path.join(import.meta.dir, "codex");
writeFileSync(executablePath, '#!/bin/sh\\n[ "$1" = --version ] && echo "codex-cli 0.166.0" && exit 0\\nexit 1\\n');
chmodSync(executablePath, 0o755);
const agent = createVoiceAgent({
	storage: { directory: path.join(import.meta.dir, "state") },
	codex: { executablePath },
	checkouts: [import.meta.dir],
	instructions: { coordinator: "Coordinate.", workhorse: "Work." },
	onFatal: () => undefined,
});
const handlers = agent.bunHandlers({ path: "/voice", fetch: () => new Response("") });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, ...handlers });
const start = await agent.start().then(() => "started", () => "refused");
Object.assign(globalThis, { location: { href: server.url.href } });
const client = createVoiceClient({ socketPath: "/voice" });
await client.connect();
await agent.shutdown();
await server.stop(true);
await Bun.sleep(100);
console.log(start, client.snapshot().connection);
client.dispose();
`;

test("an outside Bun project installs the packed package, uses every public entry and the README's code", () => {
	const project = realpathSync(mkdtempSync(path.join(tmpdir(), "codex-realtime-voice-consumer-")));
	try {
		run(["bun", "run", "pack:voice"], root);
		expect(archboardConceptsInPackedPackage()).toEqual([]);
		const names = timingNamesInPackedCode();
		expect(names).toContain("codexRealtime.clientReconnect");
		expect(readInPublishedTiming(names)).toHaveLength(names.length);
		expect(hostNameInPublishedTiming()).toContain('no duration named "pane.report"');
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
				`const server = await import("${manifest.name}/server"); console.log(typeof server.createVoiceAgent);`,
			],
			project,
		);
		expect(imported.trim()).toBe("function");

		writeFileSync(path.join(project, "exercise.ts"), EXERCISE);
		expect(run(["bun", "exercise.ts"], project).trim()).toBe("refused reconnecting");
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
}, 600_000);

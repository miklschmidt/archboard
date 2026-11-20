// The npm build of @archboard/codex-realtime-voice works outside this repository: a Bun project
// installs the packed tarball, finds exactly the runtime names each entry promises, type-checks
// the README's checked code blocks, and runs a consumer's server and client against a stand-in
// Codex: a client that connects before start, a refused start, a reconnect after shutdown and a
// stale approval click. Every duration the packed code names resolves in timing's published build.
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

import { prepareProductionFixture } from "../server-state/support/codex-production.ts";

const root = path.resolve(import.meta.dir, "../../..");
/**
 * The runtime value names each public entry exports, sorted: the package's whole interface. A
 * change here is a change of the published package, which needs a `!` and a BREAKING CHANGE
 * footer when it removes or renames a name.
 */
const ENTRY_NAMES = {
	"./browser": ["createSocketConversation", "createVoiceClient", "mountVoice"],
	"./contract": ["createCodexBrowserModel"],
	"./react": ["useVoiceState"],
	"./server": [
		"additionalContextPolicy",
		"composeRoleInstructions",
		"createTextUserInput",
		"createVoiceAgent",
		"parseTabSessionId",
	],
};
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

/**
 * A consumer's server and client against a stand-in Codex. The client connects before the agent
 * starts, an agent whose Codex exits refuses its start, the client reconnects after a shutdown and
 * a new start, and an approval from before that reconnect is refused in the client.
 */
const EXERCISE = `import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";
import { createVoiceAgent } from "@archboard/codex-realtime-voice/server";

const until = async (check: () => boolean, what: string) => {
	for (let tries = 0; !check(); tries++) {
		if (tries > 400) throw new Error(\`Timed out waiting for \${what}.\`);
		await Bun.sleep(50);
	}
};
const exits = path.join(import.meta.dir, "exits");
writeFileSync(exits, '#!/bin/sh\\n[ "$1" = --version ] && echo "codex-cli 0.166.0" && exit 0\\nexit 1\\n');
chmodSync(exits, 0o755);
const refused = createVoiceAgent({
	directory: path.join(import.meta.dir, "refused"),
	codex: { executablePath: exits },
	checkouts: [import.meta.dir],
	onFatal: () => undefined,
});
console.log("start", await refused.start().then(() => "started", () => "refused"));
await refused.shutdown();

const agent = createVoiceAgent({
	directory: path.join(import.meta.dir, "state"),
	codex: { executablePath: process.env["STAND_IN_CODEX"] },
	checkouts: [import.meta.dir],
});
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, ...agent.bunHandlers({ path: "/voice" }) });
Object.assign(globalThis, { location: { href: server.url.href } });
const client = createVoiceClient({ url: "/voice" });
await until(() => client.snapshot().failure !== null, "the client to be refused before start");
console.log("before start", client.snapshot().failure?.message);
await agent.start();
const connected = () => client.snapshot().connection === "connected" && !client.snapshot().busy;
await until(connected, "the client to connect after start");
console.log("account", client.snapshot().server?.account.state);
await client.send("Run a command.");
await until(() => (client.snapshot().server?.approvals.length ?? 0) > 0, "the approval");
const stale = client.snapshot().server!.approvals[0]!;
await agent.shutdown();
await until(() => client.snapshot().connection !== "connected", "the client to lose its socket");
await agent.start();
await until(connected, "the client to reconnect after shutdown");
console.log("reconnected", client.snapshot().connection);
console.log("stale", await client.answerApproval(stale, { approvalKind: "command_execution", decision: "accept" }));
console.log("failure", client.snapshot().failure?.message);
await client.dispose();
await agent.shutdown();
await server.stop(true);
`;

test("an outside Bun project installs the packed package, uses every public entry and the README's code", async () => {
	const project = realpathSync(mkdtempSync(path.join(tmpdir(), "codex-realtime-voice-consumer-")));
	const resources = new AsyncDisposableStack();
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

		expect(Object.keys(manifest.exports).toSorted()).toEqual(Object.keys(ENTRY_NAMES));
		const entryNames = run(
			[
				"bun",
				"-e",
				`const names = {}; for (const entry of ${JSON.stringify(Object.keys(ENTRY_NAMES))}) names[entry] = Object.keys(await import("${manifest.name}" + entry.slice(1))).toSorted(); console.log(JSON.stringify(names));`,
			],
			project,
		);
		expect(JSON.parse(entryNames)).toEqual(ENTRY_NAMES);
		const blocks = checkedReadmeBlocks();
		expect(blocks.map(({ file }) => file)).toEqual(
			expect.arrayContaining(["server.ts", "page.ts"]),
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
				include: blocks.map(({ file }) => file),
			}),
		);
		run([path.join(root, "node_modules/.bin/tsc"), "-p", "tsconfig.json"], project);

		const fixture = prepareProductionFixture(
			resources,
			path.join(root, "tests/system/server-state/fixtures/fake-codex-production.ts"),
		);
		writeFileSync(fixture.controlPath, JSON.stringify({ ordinaryOnly: true }));
		writeFileSync(path.join(project, "exercise.ts"), EXERCISE);
		const exercised = Bun.spawnSync(["bun", "exercise.ts"], {
			cwd: project,
			env: { ...process.env, STAND_IN_CODEX: fixture.executablePath },
			stdout: "pipe",
			stderr: "pipe",
		});
		const said = exercised.stdout.toString();
		expect(exercised.exitCode, `${said}${exercised.stderr.toString()}`).toBe(0);
		expect(said.trim().split("\n")).toEqual([
			"start refused",
			"before start The Codex workbench is unavailable.",
			"account ready",
			"reconnected connected",
			"stale false",
			"failure This approval is from an earlier state of the conversation. Answer it again from the current state.",
		]);
	} finally {
		await resources.disposeAsync();
		rmSync(project, { recursive: true, force: true });
	}
}, 600_000);

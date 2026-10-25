// The npm build of @archboard/codex-realtime-voice works outside this repository: a Bun project
// installs the packed tarball, type-checks a file that imports every public entry, and imports the
// server entry.
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

test("an outside Bun project installs the packed package and uses every public entry", () => {
	const project = realpathSync(mkdtempSync(path.join(tmpdir(), "codex-realtime-voice-consumer-")));
	try {
		run(["bun", "run", "pack:voice"], root);
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
		// The Codex executable is a peer that the host installs. Importing the package needs none.
		run(["bun", "add", "--omit", "peer", path.join(project, tarball ?? "")], project);

		const specifiers = Object.keys(manifest.exports).map(
			(subpath) => `${manifest.name}${subpath.slice(1)}`,
		);
		writeFileSync(
			path.join(project, "consumer.ts"),
			[
				...specifiers.map((specifier, index) => `import * as entry${index} from "${specifier}";`),
				`import { createVoiceAgent, resolveCodexExecutable, type VoiceAgent } from "${manifest.name}/server";`,
				`export const entries = [${specifiers.map((_, index) => `entry${index}`).join(", ")}];`,
				"export function start(directory: string, checkout: string): VoiceAgent {",
				"\treturn createVoiceAgent({",
				"\t\tstorage: { directory },",
				"\t\tcodex: { executablePath: resolveCodexExecutable() },",
				"\t\tcheckouts: [checkout],",
				'\t\tinstructions: { coordinator: "", workhorse: "" },',
				"\t\tonFatal: (error: unknown) => console.error(error),",
				"\t});",
				"}",
				"",
			].join("\n"),
		);
		writeFileSync(
			path.join(project, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					target: "ES2023",
					module: "ESNext",
					moduleResolution: "bundler",
					lib: ["ES2023", "DOM"],
					typeRoots: [path.join(root, "node_modules/@types")],
					types: ["bun"],
					strict: true,
					noEmit: true,
					skipLibCheck: false,
				},
				include: ["consumer.ts"],
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

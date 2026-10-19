// One run's private world: its own HOME, repository registry, CLI log and an
// `archboard` on PATH that runs this checkout. The run's vault is the
// `.archboard/vault` of its Flask checkout, where a command finds it from the
// checkout's directory, as it does for any repository (ADR 0049). A batch sits
// in the archboard checkout, whose own vault a command run outside the Flask
// checkout would find, so the run's directory holds a link to the run's vault
// and git looks no higher than it. Nothing here is shared
// between runs, so parallel authors cannot see each other, and nothing the
// operator has in their own ~/.codex — AGENTS.md, skills, MCP servers, model
// choice — reaches an author.
//
// The world is a directory of its own under the run, and the harness's records
// are not in it: the board snapshot the checks diff against, the author's
// transcript, the verdicts, the bundle the grader reads and the private
// CODEX_HOME with the operator's credentials all sit beside it, above the only
// directory the author can write. Reads cannot be forbidden — a workspace-write
// sandbox restricts writes, not reads — so what an author must not consult is
// kept out of the world it works in, and a read that climbs out of it is
// recorded as exposure (classify.ts).

import fs from "node:fs";
import path from "node:path";

/** Where everything of one run lives. */
interface RunPaths {
	readonly root: string;
	/** The author's own world: the only directory it may write, holding nothing of the harness's. */
	readonly world: string;
	readonly home: string;
	readonly codexHome: string;
	readonly flask: string;
	/** `.archboard/vault` in the Flask checkout. The clone needs an empty destination, so the vault is made after it. */
	readonly vault: string;
	readonly bin: string;
	readonly repos: string;
	readonly xdgState: string;
	readonly xdgConfig: string;
	readonly temporary: string;
	readonly serverLog: string;
	readonly cliLog: string;
	readonly authorEvents: string;
	readonly authorStdout: string;
	readonly authorStderr: string;
	readonly lastMessage: string;
	readonly snapshot: string;
	readonly boards: string;
	readonly renders: string;
	/** The PNGs of every diagram the scenario declared, plus their tiles. */
	readonly captures: string;
	readonly manifest: string;
}

/** What one author is pinned to. */
interface AuthorSettings {
	readonly model: string;
	readonly reasoningEffort: string;
	readonly sandbox: string;
}

/**
 * The layout of one run directory, created empty: the author's world under
 * `world/`, and the harness's own records beside it, where the author cannot
 * write them and does not meet them.
 * @param root The run's directory.
 * @returns Every path the run uses.
 */
function prepareRunDirectory(root: string): RunPaths {
	const world = path.join(root, "world");
	const paths: RunPaths = {
		root,
		world,
		home: path.join(world, "home"),
		codexHome: path.join(root, "codex-home"),
		flask: path.join(world, "flask"),
		vault: path.join(world, "flask", ".archboard", "vault"),
		bin: path.join(world, "bin"),
		repos: path.join(world, "repos.json"),
		xdgState: path.join(world, "state"),
		xdgConfig: path.join(world, "config"),
		temporary: path.join(world, "tmp"),
		serverLog: path.join(root, "server.log"),
		// The CLI refuses to start when the log path it is given cannot be
		// written, so the author's own tool logs inside the author's world.
		cliLog: path.join(world, "archboard.log"),
		authorEvents: path.join(root, "author.jsonl"),
		authorStdout: path.join(root, "author.stdout.txt"),
		authorStderr: path.join(root, "author.stderr.txt"),
		lastMessage: path.join(root, "last-message.md"),
		snapshot: path.join(root, "snapshot"),
		boards: path.join(root, "boards"),
		renders: path.join(root, "renders"),
		captures: path.join(root, "captures"),
		manifest: path.join(root, "run.json"),
	};
	fs.rmSync(root, { recursive: true, force: true });
	for (const directory of [
		paths.home,
		paths.codexHome,
		paths.bin,
		paths.xdgState,
		paths.xdgConfig,
		paths.temporary,
		paths.snapshot,
		paths.boards,
		paths.renders,
		paths.captures,
	]) {
		fs.mkdirSync(directory, { recursive: true });
	}
	// The nearest vault above the author's home, TMPDIR or world: the run's own,
	// not the archboard checkout's that the batch sits in. Git stops at the run's
	// directory (runEnvironment), so the search reaches this link.
	const above = path.join(root, ".archboard");
	fs.mkdirSync(above);
	fs.symlinkSync(path.relative(above, paths.vault), path.join(above, "vault"));
	return paths;
}

/**
 * Puts an `archboard` on the run's PATH that runs this checkout's CLI with
 * the bun that is running the harness.
 * @param paths The run.
 * @param checkout The archboard checkout.
 */
function writeCliWrapper(paths: RunPaths, checkout: string): void {
	const wrapper = path.join(paths.bin, "archboard");
	fs.writeFileSync(
		wrapper,
		`#!/bin/sh\nexec "${process.execPath}" "${path.join(checkout, "src", "bin.ts")}" "$@"\n`,
		{ mode: 0o755 },
	);
}

/**
 * The config.toml an author's Codex reads: the pinned model and effort,
 * approvals off, a workspace-write sandbox that may reach the local Archboard server
 * and write inside the author's world — never the harness's records beside
 * it — and the checkout trusted.
 * @param settings The pins.
 * @param paths The run.
 * @returns TOML text.
 */
function authorConfigToml(settings: AuthorSettings, paths: RunPaths): string {
	return [
		`model = ${JSON.stringify(settings.model)}`,
		`model_reasoning_effort = ${JSON.stringify(settings.reasoningEffort)}`,
		'approval_policy = "never"',
		`sandbox_mode = ${JSON.stringify(settings.sandbox)}`,
		"",
		"[sandbox_workspace_write]",
		"network_access = true",
		`writable_roots = [${JSON.stringify(paths.world)}]`,
		"",
		`[projects.${JSON.stringify(paths.flask)}]`,
		'trust_level = "trusted"',
		"",
	].join("\n");
}

/**
 * The config.toml the grader's Codex reads: its own pinned model and effort,
 * approvals off, read-only, the grading workspace trusted.
 * @param settings The pins.
 * @param workspace The grading workspace.
 * @returns TOML text.
 */
function graderConfigToml(settings: AuthorSettings, workspace: string): string {
	return [
		`model = ${JSON.stringify(settings.model)}`,
		`model_reasoning_effort = ${JSON.stringify(settings.reasoningEffort)}`,
		'approval_policy = "never"',
		`sandbox_mode = ${JSON.stringify(settings.sandbox)}`,
		"",
		`[projects.${JSON.stringify(workspace)}]`,
		'trust_level = "trusted"',
		"",
	].join("\n");
}

/**
 * Fills a private CODEX_HOME: the operator's credentials copied in, the
 * harness's own configuration, and nothing else of theirs.
 * @param codexHome The directory.
 * @param authSource The operator's auth.json, when they use one.
 * @param config The config.toml text.
 * @returns What was copied, for the manifest.
 */
function fillCodexHome(
	codexHome: string,
	authSource: string | null,
	config: string,
): { readonly authCopied: boolean } {
	fs.mkdirSync(codexHome, { recursive: true });
	fs.writeFileSync(path.join(codexHome, "config.toml"), config);
	const authCopied = authSource !== null && fs.existsSync(authSource);
	if (authCopied) fs.copyFileSync(authSource, path.join(codexHome, "auth.json"));
	return { authCopied };
}

/**
 * The variables that name a tool of this machine to archboard (the Chromium it draws with, the
 * ffmpeg it encodes a video with), which a run keeps so it finds the tool as the operator does.
 */
const FORWARDED_TOOLS = ["ARCHBOARD_RENDERER_CHROMIUM", "ARCHBOARD_FFMPEG"] as const;

/**
 * The environment every process of a run gets: the run's registry and server,
 * the private homes, PATH with the run's bin first, and the tools the operator
 * named. It names no vault: a command finds the run's vault from the Flask
 * checkout it runs in, or from the run's directory when it runs outside it.
 * Git looks no higher than the run's directory, so neither the author's git
 * nor its archboard reaches the archboard checkout the batch sits in.
 * @param paths The run.
 * @param serverUrl The run's own server.
 * @returns The environment.
 */
function runEnvironment(paths: RunPaths, serverUrl: string): Record<string, string> {
	return {
		PATH: `${paths.bin}:${process.env["PATH"] ?? ""}`,
		HOME: paths.home,
		CODEX_HOME: paths.codexHome,
		XDG_STATE_HOME: paths.xdgState,
		XDG_CONFIG_HOME: paths.xdgConfig,
		TMPDIR: paths.temporary,
		GIT_CEILING_DIRECTORIES: paths.root,
		ARCHBOARD_REPOS: paths.repos,
		ARCHBOARD_URL: serverUrl,
		ARCHBOARD_NO_AUTOSTART: "1",
		LOG_FILE_PATH: paths.cliLog,
		LOG_LEVEL: "error",
		...Object.fromEntries(
			FORWARDED_TOOLS.flatMap((name) => {
				const value = process.env[name];
				return value === undefined ? [] : [[name, value]];
			}),
		),
	};
}

/**
 * The operator's Codex credentials, if they keep them in a file.
 * @returns The path, or null when there is none to copy.
 */
function operatorAuthFile(): string | null {
	const codexHome = process.env["CODEX_HOME"] ?? path.join(process.env["HOME"] ?? "", ".codex");
	const candidate = path.join(codexHome, "auth.json");
	return fs.existsSync(candidate) ? candidate : null;
}

export {
	authorConfigToml,
	fillCodexHome,
	graderConfigToml,
	operatorAuthFile,
	prepareRunDirectory,
	runEnvironment,
	writeCliWrapper,
	type AuthorSettings,
	type RunPaths,
};

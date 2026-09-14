// One run's private world: its own HOME, CODEX_HOME, vault, repository
// registry, log files and an `archboard` on PATH that runs this checkout.
// Nothing here is shared between runs, so parallel authors cannot see each
// other, and nothing the operator has in their own ~/.codex — AGENTS.md,
// skills, MCP servers, model choice — reaches an author.

import fs from "node:fs";
import path from "node:path";

/** Where everything of one run lives. */
interface RunPaths {
	readonly root: string;
	readonly home: string;
	readonly codexHome: string;
	readonly flask: string;
	readonly vault: string;
	readonly bin: string;
	readonly repos: string;
	readonly xdgState: string;
	readonly xdgConfig: string;
	readonly temporary: string;
	readonly canvasLog: string;
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
 * The layout of one run directory, created empty.
 * @param root The run's directory.
 * @returns Every path the run uses.
 */
function prepareRunDirectory(root: string): RunPaths {
	const paths: RunPaths = {
		root,
		home: path.join(root, "home"),
		codexHome: path.join(root, "codex-home"),
		flask: path.join(root, "flask"),
		vault: path.join(root, "vault"),
		bin: path.join(root, "bin"),
		repos: path.join(root, "repos.json"),
		xdgState: path.join(root, "state"),
		xdgConfig: path.join(root, "config"),
		temporary: path.join(root, "tmp"),
		canvasLog: path.join(root, "canvas.log"),
		cliLog: path.join(root, "archboard.log"),
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
		paths.vault,
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
 * approvals off, a workspace-write sandbox that may reach the local canvas
 * and write inside the run, and the checkout trusted.
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
		`writable_roots = [${JSON.stringify(paths.root)}]`,
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
 * The environment every process of a run gets: the archboard variables the
 * setup block names, the private homes, and PATH with the run's bin first.
 * @param paths The run.
 * @param canvasUrl The run's own canvas.
 * @returns The environment.
 */
function runEnvironment(paths: RunPaths, canvasUrl: string): Record<string, string> {
	return {
		PATH: `${paths.bin}:${process.env["PATH"] ?? ""}`,
		HOME: paths.home,
		CODEX_HOME: paths.codexHome,
		XDG_STATE_HOME: paths.xdgState,
		XDG_CONFIG_HOME: paths.xdgConfig,
		TMPDIR: paths.temporary,
		ARCHBOARD_VAULT: paths.vault,
		ARCHBOARD_REPOS: paths.repos,
		EXPRESS_SERVER_URL: canvasUrl,
		EXCALIDRAW_NO_AUTOSTART: "1",
		LOG_FILE_PATH: paths.cliLog,
		LOG_LEVEL: "error",
		...(process.env["ARCHBOARD_RENDERER_CHROMIUM"] === undefined
			? {}
			: { ARCHBOARD_RENDERER_CHROMIUM: process.env["ARCHBOARD_RENDERER_CHROMIUM"] }),
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

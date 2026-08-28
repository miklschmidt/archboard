import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { checkoutRoot, packageBin } from "./package-cli.ts";

const setupSchema = z.object({
	doc: z.string(),
	docCreated: z.boolean(),
	blockUpdated: z.boolean().optional(),
	vault: z.string(),
	vaultCreated: z.boolean(),
	command: z.string(),
});
export const installResultSchema = z.object({
	skill: z.literal("archboard"),
	mode: z.string(),
	root: z.string(),
	target: z.string(),
	setup: setupSchema.optional(),
});
export type InstallResult = z.infer<typeof installResultSchema>;

export interface InstallSpawn {
	command: readonly string[];
	cwd: string;
	status: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
}

export interface InstallFixture {
	readonly root: string;
	readonly home: string;
	readonly state: string;
	readonly log: string;
	readonly registry: string;
	readonly vault: string;
	readonly skillRoot: string;
	repo(name: string, files?: Readonly<Record<string, string>>): string;
	run(repo: string, args?: readonly string[], options?: { home?: boolean }): InstallSpawn;
	install(repo: string, args?: readonly string[], options?: { home?: boolean }): InstallResult;
	assertSkillBytes(target: string): void;
	dispose(): void;
	[Symbol.dispose](): void;
}

export function installFailure(result: InstallSpawn): string {
	return [
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

const trackedSkillFiles = [
	"SKILL.md",
	"references/architecture-workflow.md",
	"references/cheatsheet.md",
	"references/cli-workflows.md",
	"evals/evals.json",
] as const;

export function createInstallFixture(): InstallFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-install-"));
	const home = join(root, "home");
	const state = join(root, "state");
	const log = join(root, "logs", "archboard.log");
	const registry = join(root, "repos.json");
	const vault = join(root, "vault");
	const skillRoot = join(root, "skills");
	for (const directory of [home, state, dirname(log), vault])
		mkdirSync(directory, { recursive: true });
	const repo = (name: string, files: Readonly<Record<string, string>> = {}) => {
		const path = join(root, name);
		mkdirSync(path, { recursive: true });
		for (const [file, contents] of Object.entries(files)) {
			mkdirSync(join(path, file, ".."), { recursive: true });
			writeFileSync(join(path, file), contents);
		}
		return path;
	};
	const run = (
		repository: string,
		args: readonly string[] = [],
		options: { home?: boolean } = {},
	): InstallSpawn => {
		const namesDestination = args.some((arg) => ["--dir", "--target", "--agent"].includes(arg));
		const command = [
			packageBin,
			"install-skill",
			...(options.home || namesDestination ? [] : ["--dir", skillRoot]),
			"--repo",
			repository,
			...args,
		];
		const result = spawnSync(command[0]!, command.slice(1), {
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				CODEX_HOME: undefined,
				LOCALAPPDATA: undefined,
				EXPRESS_SERVER_URL: undefined,
				ENABLE_CANVAS_SYNC: undefined,
				ARCHBOARD_INJECT: undefined,
				ARCHBOARD_INJECT_LOUD: undefined,
				ARCHBOARD_INJECT_THREAD: undefined,
				ARCHBOARD_INJECT_DEBOUNCE_MS: undefined,
				ARCHBOARD_INJECT_MIN_INTERVAL_MS: undefined,
				ARCHBOARD_SETTLE_MS: undefined,
				ARCHBOARD_SETTLE_MAX_MS: undefined,
				HOME: home,
				XDG_STATE_HOME: state,
				LOG_FILE_PATH: log,
				ARCHBOARD_REPOS: registry,
				ARCHBOARD_VAULT: vault,
				EXCALIDRAW_NO_AUTOSTART: "1",
			},
		});
		return {
			command,
			cwd: root,
			status: result.status,
			signal: result.signal,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	};
	const dispose = () => rmSync(root, { recursive: true, force: true });
	return {
		root,
		home,
		state,
		log,
		registry,
		vault,
		skillRoot,
		repo,
		run,
		install(repository, args = [], options = {}) {
			const result = run(repository, args, options);
			if (result.status !== 0) throw new Error(installFailure(result));
			return installResultSchema.parse(JSON.parse(result.stdout));
		},
		assertSkillBytes(target) {
			for (const relative of trackedSkillFiles) {
				const installed = join(target, relative);
				if (!existsSync(installed)) throw new Error(`Missing installed skill file ${installed}`);
				const source = join(checkoutRoot, "skills", "archboard", relative);
				if (!readFileSync(installed).equals(readFileSync(source)))
					throw new Error(`Installed skill bytes differ: ${relative}`);
			}
		},
		dispose,
		[Symbol.dispose]: dispose,
	};
}

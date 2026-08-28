import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { packageBin } from "./package-cli.ts";

const spawnSchema = z.object({
	command: z.array(z.string()),
	cwd: z.string(),
	status: z.number().nullable(),
	signal: z.string().nullable(),
	stdout: z.string(),
	stderr: z.string(),
});
export type RepositorySpawn = z.infer<typeof spawnSchema>;
export type RepositoryServerEnvironment = Readonly<NodeJS.ProcessEnv>;

export interface RepositoryFixture {
	readonly root: string;
	readonly nowhere: string;
	readonly home: string;
	readonly state: string;
	readonly log: string;
	readonly registry: string;
	readonly vault: string;
	readonly serverEnvironment: RepositoryServerEnvironment;
	repository(name: string, origin: string): string;
	run(args: readonly string[], options?: { cwd?: string; url?: string }): RepositorySpawn;
	dispose(): void;
	[Symbol.dispose](): void;
}

export function repositoryFailure(result: RepositorySpawn): string {
	return [
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

export function createRepositoryFixture(): RepositoryFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-repositories-"));
	const nowhere = join(root, "nowhere");
	const home = join(root, "home");
	const state = join(root, "state");
	const log = join(root, "logs", "archboard.log");
	const registry = join(root, "repos.json");
	const vault = join(root, "vault");
	for (const directory of [nowhere, home, state, dirname(log), vault])
		mkdirSync(directory, { recursive: true });
	const serverEnvironment: RepositoryServerEnvironment = {
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
	};
	const repository = (name: string, origin: string) => {
		const checkout = join(root, name);
		mkdirSync(join(checkout, "src"), { recursive: true });
		writeFileSync(join(checkout, "src/service.ts"), `export const which = '${name}';\n`);
		const git = (args: readonly string[]) =>
			execFileSync("git", [...args], { cwd: checkout, stdio: "ignore" });
		git(["init", "-q", "-b", "main"]);
		git(["remote", "add", "origin", origin]);
		git(["-c", "user.email=t@t", "-c", "user.name=t", "add", "."]);
		git([
			"-c",
			"user.email=t@t",
			"-c",
			"user.name=t",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"-qm",
			"init",
		]);
		return realpathSync.native(checkout);
	};
	const dispose = () => rmSync(root, { recursive: true, force: true });
	return {
		root,
		nowhere,
		home,
		state,
		log,
		registry,
		vault,
		serverEnvironment,
		repository,
		run(args, options = {}) {
			const said = args.includes("--doing")
				? [...args]
				: [...args, "--doing", "checking repository resolution"];
			const command = [packageBin, ...said];
			const cwd = options.cwd ?? nowhere;
			const result = spawnSync(command[0]!, command.slice(1), {
				cwd,
				encoding: "utf8",
				env: {
					...serverEnvironment,
					...(options.url ? { EXPRESS_SERVER_URL: options.url } : {}),
				},
			});
			return spawnSchema.parse({
				command,
				cwd,
				status: result.status,
				signal: result.signal,
				stdout: result.stdout,
				stderr: result.stderr,
			});
		},
		dispose,
		[Symbol.dispose]: dispose,
	};
}

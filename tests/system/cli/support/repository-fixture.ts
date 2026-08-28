import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

export interface RepositoryFixture {
	readonly root: string;
	readonly nowhere: string;
	readonly registry: string;
	readonly vault: string;
	repository(name: string, origin: string): string;
	run(args: readonly string[], options?: { cwd?: string; url?: string }): RepositorySpawn;
	dispose(): void;
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
	const registry = join(root, "repos.json");
	const vault = join(root, "vault");
	mkdirSync(nowhere);
	mkdirSync(vault);
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
	return {
		root,
		nowhere,
		registry,
		vault,
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
					...process.env,
					ARCHBOARD_REPOS: registry,
					ARCHBOARD_VAULT: vault,
					EXCALIDRAW_NO_AUTOSTART: "1",
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
		dispose() {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { checkoutRoot } from "./package-cli.ts";

export const artifactNames = [
	"cli-command-audit.md",
	"command-contract-proof.json",
	"command-contract-proof.md",
] as const;

const spawnSchema = z.object({
	command: z.array(z.string()),
	cwd: z.string(),
	status: z.number().nullable(),
	signal: z.string().nullable(),
	stdout: z.string(),
	stderr: z.string(),
});
export type ArtifactSpawn = z.infer<typeof spawnSchema>;

export function artifactFailure(result: ArtifactSpawn): string {
	return [
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

export interface ArtifactFixture {
	readonly root: string;
	readonly first: string;
	readonly second: string;
	status(): string;
	generate(output: string, extra?: readonly string[]): ArtifactSpawn;
	files(output: string): readonly string[];
	bytes(output: string, name: (typeof artifactNames)[number]): Buffer;
	dispose(): void;
}

export function createArtifactFixture(): ArtifactFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-contract-artifacts-"));
	const first = join(root, "first");
	const second = join(root, "second");
	return {
		root,
		first,
		second,
		status() {
			return spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
				cwd: checkoutRoot,
				encoding: "utf8",
			}).stdout;
		},
		generate(output, extra = []) {
			const command = [
				"bun",
				"run",
				"generate:cli-contract",
				"--",
				"--output-dir",
				output,
				...extra,
			];
			const result = spawnSync(command[0]!, command.slice(1), {
				cwd: checkoutRoot,
				encoding: "utf8",
			});
			return spawnSchema.parse({
				command,
				cwd: checkoutRoot,
				status: result.status,
				signal: result.signal,
				stdout: result.stdout,
				stderr: result.stderr,
			});
		},
		files(output) {
			return readdirSync(output).toSorted();
		},
		bytes(output, name) {
			return readFileSync(join(output, name));
		},
		dispose() {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

// A scratch machine for `archboard init`. Its PATH holds only the programs that the CLI needs and a
// stand-in `bun`: the stand-in records each `bun x` call, which is how `init` starts the skills
// CLI, and runs the real Bun for everything else. So no test reaches the network, and no program of
// the host, such as `claude`, decides what `init` does.

import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { clearedEnvironment, packageBin } from "./package-cli.ts";

const initResultSchema = z.object({
	success: z.literal(true),
	skills: z.union([
		z.object({ runner: z.string() }),
		z.object({ skipped: z.string(), command: z.string() }),
	]),
	setup: z.object({
		repo: z.string(),
		vault: z.string(),
		vaultCreated: z.boolean(),
		vaultIgnored: z.boolean(),
		removedBlocks: z.array(z.string()),
	}),
	agent: z.string().optional(),
	next: z.string().optional(),
});
type InitResult = z.infer<typeof initResultSchema>;

interface InitSpawn {
	command: readonly string[];
	cwd: string;
	status: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
}

type InitAnswer = InitResult & { readonly spawn: InitSpawn };

interface InitFixture {
	readonly root: string;
	readonly home: string;
	readonly registry: string;
	git(repo: string, ...args: string[]): string;
	repo(name: string, files?: Readonly<Record<string, string>>): string;
	/** Puts a program on the PATH that does nothing, as an installed agent would be found. */
	install(program: string): void;
	/** Makes the next `bun x` fail, as an unreachable registry would. */
	failRunner(): void;
	/** The arguments of each `bun x` call so far. */
	runnerCalls(): string[][];
	run(repo: string): InitSpawn;
	/** Runs another archboard command in a directory, with the environment of `init`. */
	archboard(cwd: string, args: readonly string[]): InitSpawn;
	init(repo: string): InitAnswer;
	dispose(): void;
	[Symbol.dispose](): void;
}

function initFailure(result: InitSpawn): string {
	return [
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

/** The programs that `bin/archboard` and the vault setup run, besides Bun. */
const NEEDED = ["bash", "dirname", "realpath", "git", "ssh-keygen"] as const;

/**
 * A text as one word of a shell script.
 * @param text The text.
 * @returns The text in single quotes.
 */
function quote(text: string): string {
	return `'${text.replaceAll("'", "'\\''")}'`;
}

/**
 * A directory of the programs that the CLI needs, and a stand-in `bun`.
 * @param root The scratch machine.
 * @returns The directory, the file that the stand-in writes its calls to, and the file whose
 *   presence makes the stand-in fail.
 */
function scratchPath(root: string): { bin: string; calls: string; fails: string } {
	const bin = join(root, "bin");
	const calls = join(root, "runner-calls.tsv");
	const fails = join(root, "runner-fails");
	mkdirSync(bin);
	for (const program of NEEDED) {
		const found = Bun.which(program);
		if (found === null) throw new Error(`The init tests need ${program} on the PATH`);
		symlinkSync(found, join(bin, program));
	}
	writeFileSync(
		join(bin, "bun"),
		[
			"#!/bin/sh",
			'if [ "$1" = "x" ]; then',
			`  printf '%s\\t' "$@" >> ${quote(calls)}`,
			`  printf '\\n' >> ${quote(calls)}`,
			`  if [ -e ${quote(fails)} ]; then echo 'registry unreachable' >&2; exit 3; fi`,
			"  exit 0",
			"fi",
			`exec ${quote(process.execPath)} "$@"`,
			"",
		].join("\n"),
	);
	chmodSync(join(bin, "bun"), 0o755);
	return { bin, calls, fails };
}

function createInitFixture(): InitFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-init-"));
	const home = join(root, "home");
	const state = join(root, "state");
	const log = join(root, "logs", "archboard.log");
	const registry = join(root, "repos.json");
	for (const directory of [home, state, dirname(log)]) {
		mkdirSync(directory, { recursive: true });
	}
	const { bin, calls, fails } = scratchPath(root);
	const key = join(home, "signing-key");
	const generated = spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
	if (generated.status !== 0) throw new Error(generated.stderr.toString());
	const signers = join(home, "allowed-signers");
	writeFileSync(signers, `install@example.test ${readFileSync(`${key}.pub`, "utf8")}`);
	const gitConfiguration = join(home, ".gitconfig");
	const environment = {
		...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
		...clearedEnvironment,
		PATH: bin,
		HOME: home,
		GIT_CONFIG_GLOBAL: gitConfiguration,
		GIT_CONFIG_NOSYSTEM: "1",
		XDG_STATE_HOME: state,
		LOG_FILE_PATH: log,
		ARCHBOARD_REPOS: registry,
		ARCHBOARD_NO_AUTOSTART: "1",
	};
	const git = (repository: string, ...args: string[]) => {
		const result = spawnSync("git", ["-C", repository, ...args], {
			env: environment,
			encoding: "utf8",
		});
		if (result.status !== 0) throw new Error(result.stderr);
		return result.stdout.trim();
	};
	for (const [name, value] of [
		["user.name", "Install Author"],
		["user.email", "install@example.test"],
		["gpg.format", "ssh"],
		["user.signingkey", key],
		["commit.gpgsign", "true"],
		["gpg.ssh.allowedSignersFile", signers],
	] as const)
		git(root, "config", "--file", gitConfiguration, name, value);
	const repo = (name: string, files: Readonly<Record<string, string>> = {}) => {
		const path = join(root, name);
		mkdirSync(path, { recursive: true });
		for (const [file, contents] of Object.entries(files)) {
			mkdirSync(join(path, file, ".."), { recursive: true });
			writeFileSync(join(path, file), contents);
		}
		return path;
	};
	const archboard = (cwd: string, args: readonly string[]): InitSpawn => {
		const command = [packageBin, ...args];
		const result = spawnSync(command[0]!, command.slice(1), {
			cwd,
			encoding: "utf8",
			env: environment,
		});
		return {
			command,
			cwd,
			status: result.status,
			signal: result.signal,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	};
	const run = (repository: string): InitSpawn => archboard(root, ["init", "--repo", repository]);
	const dispose = () => rmSync(root, { recursive: true, force: true });
	return {
		root,
		home,
		registry,
		git,
		repo,
		install(program) {
			writeFileSync(join(bin, program), "#!/bin/sh\nexit 0\n");
			chmodSync(join(bin, program), 0o755);
		},
		failRunner() {
			writeFileSync(fails, "");
		},
		runnerCalls() {
			if (!existsSync(calls)) return [];
			return readFileSync(calls, "utf8")
				.split("\n")
				.filter((line) => line !== "")
				.map((line) => line.split("\t").slice(0, -1));
		},
		run,
		archboard,
		init(repository) {
			const result = run(repository);
			if (result.status !== 0) {
				throw new Error(initFailure(result));
			}
			let decoded: unknown;
			try {
				decoded = JSON.parse(result.stdout);
			} catch (error) {
				throw new Error(`${initFailure(result)}\nparse: ${(error as Error).message}`, {
					cause: error,
				});
			}
			const parsed = initResultSchema.safeParse(decoded);
			if (!parsed.success) {
				throw new Error(`${initFailure(result)}\nparse: ${parsed.error.message}`);
			}
			return { ...parsed.data, spawn: result };
		},
		dispose,
		[Symbol.dispose]: dispose,
	};
}

export { type InitAnswer, type InitFixture, type InitSpawn, initFailure, createInitFixture };

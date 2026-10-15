import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { vaultIn } from "../../support/test-vault.ts";
import { clearedEnvironment } from "./package-cli.ts";

type RepositoryServerEnvironment = Readonly<NodeJS.ProcessEnv>;

interface RepositoryFixture {
	readonly root: string;
	/** A directory outside every checkout and every vault. */
	readonly nowhere: string;
	readonly home: string;
	readonly state: string;
	readonly log: string;
	readonly registry: string;
	/** An untracked vault, `<root>/boards/.archboard/vault`, that the registry does not list. */
	readonly vault: string;
	readonly serverEnvironment: RepositoryServerEnvironment;
	repository(name: string, origin: string): string;
	dispose(): void;
	[Symbol.dispose](): void;
}

function createRepositoryFixture(): RepositoryFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-repositories-"));
	const nowhere = join(root, "nowhere");
	const home = join(root, "home");
	const state = join(root, "state");
	const log = join(root, "logs", "archboard.log");
	const registry = join(root, "repos.json");
	for (const directory of [nowhere, home, state, dirname(log)]) {
		mkdirSync(directory, { recursive: true });
	}
	const vault = vaultIn(join(root, "boards"));
	const serverEnvironment: RepositoryServerEnvironment = {
		...process.env,
		...clearedEnvironment,
		HOME: home,
		XDG_STATE_HOME: state,
		LOG_FILE_PATH: log,
		ARCHBOARD_REPOS: registry,
		ARCHBOARD_NO_AUTOSTART: "1",
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
		dispose,
		[Symbol.dispose]: dispose,
	};
}

export { type RepositoryServerEnvironment, type RepositoryFixture, createRepositoryFixture };

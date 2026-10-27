import { prepareSkillArtifacts } from "@archboard/skills/distribution";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { checkoutRoot, clearedEnvironment, packageBin } from "./package-cli.ts";

const setupSchema = z.object({
	vault: z.string(),
	vaultCreated: z.boolean(),
	removedBlocks: z.array(z.string()),
});
const installResultSchema = z.object({
	mode: z.string(),
	root: z.string(),
	skills: z.array(z.object({ skill: z.string(), target: z.string() })),
	setup: setupSchema.optional(),
});
type InstallResult = z.infer<typeof installResultSchema>;

interface InstallSpawn {
	command: readonly string[];
	cwd: string;
	status: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
}

type InstalledResult = InstallResult & { readonly spawn: InstallSpawn };

interface InstallFixture {
	readonly root: string;
	readonly home: string;
	readonly state: string;
	readonly log: string;
	readonly registry: string;
	readonly skillRoot: string;
	repo(name: string, files?: Readonly<Record<string, string>>): string;
	run(repo: string, args?: readonly string[], options?: { home?: boolean }): InstallSpawn;
	install(repo: string, args?: readonly string[], options?: { home?: boolean }): InstalledResult;
	assertSkillBytes(skillsRoot: string): void;
	dispose(): void;
	[Symbol.dispose](): void;
}

function installFailure(result: InstallSpawn): string {
	return [
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

/** The skills an install ships, each into its own directory of the skills root. */
const shippedSkills = ["archboard", "archboard-pr"] as const;

function createInstallFixture(): InstallFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-install-"));
	const generatedSkillFiles = prepareSkillArtifacts(join(root, "expected-skill"), {
		root: checkoutRoot,
		revision: "fixture",
	}).files;
	const home = join(root, "home");
	const state = join(root, "state");
	const log = join(root, "logs", "archboard.log");
	const registry = join(root, "repos.json");
	const skillRoot = join(root, "skills");
	for (const directory of [home, state, dirname(log)]) {
		mkdirSync(directory, { recursive: true });
	}
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
				...clearedEnvironment,
				HOME: home,
				XDG_STATE_HOME: state,
				LOG_FILE_PATH: log,
				ARCHBOARD_REPOS: registry,
				ARCHBOARD_NO_AUTOSTART: "1",
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
		skillRoot,
		repo,
		run,
		install(repository, args = [], options = {}) {
			const result = run(repository, args, options);
			if (result.status !== 0) {
				throw new Error(installFailure(result));
			}
			let decoded: unknown;
			try {
				decoded = JSON.parse(result.stdout);
			} catch (error) {
				throw new Error(`${installFailure(result)}\nparse: ${(error as Error).message}`, {
					cause: error,
				});
			}
			const parsed = installResultSchema.safeParse(decoded);
			if (!parsed.success) {
				throw new Error(`${installFailure(result)}\nparse: ${parsed.error.message}`);
			}
			return { ...parsed.data, spawn: result };
		},
		assertSkillBytes(skillsRoot) {
			for (const skill of shippedSkills) {
				const source = join(checkoutRoot, "skills", skill);
				const authored = readdirSync(source, { recursive: true, withFileTypes: true })
					.filter((entry) => entry.isFile())
					.map((entry) => relative(source, join(entry.parentPath, entry.name)))
					.filter((file) => !file.startsWith(join("references", "generated")));
				if (!authored.includes("SKILL.md")) {
					throw new Error(`The checkout's ${skill} skill has no SKILL.md`);
				}
				for (const file of authored) {
					const installed = join(skillsRoot, skill, file);
					if (!existsSync(installed)) {
						throw new Error(`Missing installed skill file ${installed}`);
					}
					if (!readFileSync(installed).equals(readFileSync(join(source, file)))) {
						throw new Error(`Installed skill bytes differ: ${skill}/${file}`);
					}
				}
			}
			for (const file of generatedSkillFiles) {
				if (!existsSync(join(skillsRoot, "archboard", file))) {
					throw new Error(`Missing generated skill file ${file}`);
				}
			}
		},
		dispose,
		[Symbol.dispose]: dispose,
	};
}

export {
	shippedSkills,
	installResultSchema,
	type InstallResult,
	type InstallSpawn,
	type InstalledResult,
	type InstallFixture,
	installFailure,
	createInstallFixture,
};

// What a run of the pull request action knows: the pull request, the inputs, and the commits it
// checks out. Everything here reads the environment, the event file or Git.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { readPullRequest } from "./github.ts";
import type { ApiAccess } from "./github.ts";
import type { Hosting } from "./links.ts";
import { parseOutOfPlanMode } from "./plan.ts";
import type { OutOfPlanMode } from "./plan.ts";
import { inputLines } from "../shared/arguments.ts";
import { input, parseJson, run } from "../shared/process.ts";

/** What the pull request says of itself. */
interface PullFacts {
	readonly number: number;
	readonly baseSha: string;
	/** The branch the pull request merges into, such as `main`. */
	readonly baseRef: string;
	readonly headSha: string;
	readonly labels: readonly string[];
	readonly body: string;
	readonly fromFork: boolean;
}

/** What the workflow's inputs and environment say. */
interface Inputs {
	readonly cli: string;
	readonly directory: string;
	readonly hosting: Hosting;
	readonly access: ApiAccess;
	readonly branch: string;
	readonly mode: OutOfPlanMode;
	readonly overrideLabel: string;
	readonly stateInput: string;
	readonly extraCheckouts: readonly string[];
}

/** What this run knows about the pull request and its inputs. */
interface Context extends PullFacts, Inputs {
	/** The directory below the repository root that holds the vault. */
	readonly subpath: string;
	/** A directory of this run's own, for checkouts and pictures. */
	readonly scratch: string;
}

/** The parts of the `pull_request` event this action reads. */
interface PullRequestEvent {
	readonly pull_request?: {
		readonly number: number;
		readonly body?: string | null;
		readonly base: {
			readonly sha: string;
			readonly ref?: string;
			readonly repo?: { readonly full_name?: string };
		};
		readonly head: { readonly sha: string; readonly repo?: { readonly full_name?: string } | null };
		readonly labels?: readonly { readonly name: string }[];
	};
}

/**
 * Read the event file of the workflow run.
 * @param file The path GITHUB_EVENT_PATH names, or an empty string.
 * @returns The event, empty when there is no file.
 */
function eventOf(file: string): PullRequestEvent {
	return file === "" ? {} : (parseJson(readFileSync(file, "utf8")) ?? {});
}

/**
 * Read the pull request from the event the workflow ran for.
 * @returns What the event says.
 * @throws {Error} When the workflow did not run for a pull request.
 */
function readEvent(): PullFacts {
	const pull = eventOf(input("GITHUB_EVENT_PATH", "")).pull_request;
	if (pull === undefined) throw new Error("This action runs on pull_request events.");
	return {
		number: pull.number,
		baseSha: pull.base.sha,
		baseRef: pull.base.ref ?? "",
		headSha: pull.head.sha,
		labels: (pull.labels ?? []).map((label) => label.name),
		body: pull.body ?? "",
		fromFork: pull.head.repo?.full_name !== pull.base.repo?.full_name,
	};
}

/**
 * Read the inputs and the environment of the step.
 * @returns The inputs.
 * @throws {Error} When an input has a value the action does not accept.
 */
function readInputs(): Inputs {
	const repository = input("GITHUB_REPOSITORY", "");
	const workspace = resolve(input("GITHUB_WORKSPACE", process.cwd()));
	return {
		cli: input("ARCHBOARD_BIN", "archboard"),
		directory: resolve(workspace, input("ARCHBOARD_INPUT_WORKING_DIRECTORY", ".")),
		hosting: { server: input("GITHUB_SERVER_URL", "https://github.com"), repository },
		access: {
			url: input("GITHUB_API_URL", "https://api.github.com"),
			token: input("ARCHBOARD_INPUT_GITHUB_TOKEN", ""),
			repository,
		},
		branch: input("ARCHBOARD_INPUT_ASSETS_BRANCH", "archboard-assets"),
		mode: parseOutOfPlanMode(input("ARCHBOARD_INPUT_OUT_OF_PLAN", "warn")),
		overrideLabel: input("ARCHBOARD_INPUT_OVERRIDE_LABEL", "archboard: out of plan"),
		stateInput: input("ARCHBOARD_INPUT_STATE", ""),
		extraCheckouts: inputLines(input("ARCHBOARD_INPUT_REPOS", "")).map((folder) =>
			resolve(workspace, folder),
		),
	};
}

/**
 * Read the pull request and the inputs.
 * @returns The context.
 */
async function readContext(): Promise<Context> {
	const inputs = readInputs();
	const event = readEvent();
	// Labels and the description can change after the workflow starts, and a re-run keeps the old event.
	const fresh = await readPullRequest(inputs.access, event.number);
	return {
		...inputs,
		...event,
		labels: fresh?.labels ?? event.labels,
		body: fresh?.body ?? event.body,
		subpath: relative(gitRoot(inputs.directory), inputs.directory),
		scratch: mkdtempSync(join(tmpdir(), "archboard-pr-")),
	};
}

/**
 * The root of the Git checkout that holds a directory.
 * @param directory The directory.
 * @returns The root.
 * @throws {Error} When the directory is in no Git checkout.
 */
function gitRoot(directory: string): string {
	const result = run("git", ["-C", directory, "rev-parse", "--show-toplevel"]);
	if (result.exitCode !== 0) throw new Error(`${directory} is in no Git checkout.`);
	return result.stdout.trim();
}

/**
 * Run archboard against a directory.
 * @param context The run.
 * @param directory The directory whose vault the command reads.
 * @param args The command and its options.
 * @returns The result.
 */
function archboard(context: Context, directory: string, args: readonly string[]) {
	return run(context.cli, ["-C", directory, ...args], { cwd: context.directory });
}

/**
 * Check out a commit beside the workspace.
 * @param context The run.
 * @param name The folder's name in the scratch directory.
 * @param sha The commit.
 * @returns The directory inside it that corresponds to the working directory.
 * @throws {Error} When the commit is not in the checkout, which means the checkout was shallow.
 */
function addWorktree(context: Context, name: string, sha: string): string {
	const folder = join(context.scratch, name);
	const result = run("git", ["-C", context.directory, "worktree", "add", "--detach", folder, sha]);
	if (result.exitCode !== 0) {
		throw new Error(
			`Could not check out ${sha}: ${result.stderr.trim()} Check the repository out with fetch-depth: 0.`,
		);
	}
	return join(folder, context.subpath);
}

/**
 * The first non-empty line of some text.
 * @param text The text.
 * @returns The line, or a stand-in.
 */
function firstLine(text: string): string {
	return (
		text
			.split("\n")
			.find((line) => line.trim() !== "")
			?.trim() ?? "no reason given"
	);
}

export { addWorktree, archboard, firstLine, readContext, type Context };

// The Codex grader runner: `codex exec --json` with the pinned model and
// effort, a read-only sandbox, the structured answer enforced with
// `--output-schema` and written by `-o`, every image attached with `--image`
// on every call, and the thread resumed with `codex exec resume`.

import fs from "node:fs";
import path from "node:path";
import { parseTrace, unwrapped, type AuthorTrace } from "@/runtime/skill-evaluation/lib/events";
import type { ProcessResult } from "@/runtime/skill-evaluation/lib/process";
import {
	callSucceeded,
	type GraderCall,
	type GraderCallOutcome,
	type GraderRunner,
} from "@/runtime/skill-evaluation/lib/grader-runner";
import {
	fillCodexHome,
	graderConfigToml,
	operatorAuthFile,
} from "@/runtime/skill-evaluation/lib/isolation";
import { runProcess } from "@/runtime/skill-evaluation/lib/process";
import type { Graders } from "@/runtime/skill-evaluation/lib/suite";

type CodexGraderSettings = Graders["codex"];

/**
 * The Codex command line for one grading call: a new thread for the first,
 * the same thread resumed for the rest.
 * @param settings The pinned grader.
 * @param executable The Codex executable.
 * @param call The call.
 * @returns The argv.
 */
function codexGraderArgv(
	settings: CodexGraderSettings,
	executable: string,
	call: Pick<
		GraderCall,
		"workspace" | "prompt" | "schemaFile" | "verdictFile" | "images" | "sessionId"
	>,
): string[] {
	const shared = [
		...call.images.flatMap((run) =>
			run.images.flatMap((image) => ["--image", path.join(call.workspace, image.file)]),
		),
		"--json",
		"--skip-git-repo-check",
		"-m",
		settings.model,
		"-c",
		`model_reasoning_effort=${JSON.stringify(settings.reasoningEffort)}`,
		"-c",
		'approval_policy="never"',
		"--output-schema",
		call.schemaFile,
		"-o",
		call.verdictFile,
	];
	return call.sessionId === null
		? [executable, "exec", ...shared, "-C", call.workspace, "-s", settings.sandbox, call.prompt]
		: [executable, "exec", "resume", call.sessionId, ...shared, call.prompt];
}

/**
 * Every path a script names, absolute or spelled relative to the workspace,
 * resolved: what a sandbox that blocks writes but not reads lets a grader open.
 * @param script The unwrapped command.
 * @param workspace The workspace the paths are relative to.
 * @returns The resolved paths.
 */
function namedPaths(script: string, workspace: string): string[] {
	return [...script.matchAll(/'([^']*)'|"([^"$`]*)"|([^\s'"|;&<>]+)/gu)]
		.map((match) => (match[1] ?? match[2] ?? match[3] ?? "").replaceAll("\\ ", " "))
		.filter((word) => word.startsWith("/") || word.startsWith("../") || word.startsWith("./"))
		.filter((word) => word !== "/dev/null")
		.map((word) => path.resolve(workspace, word));
}

/**
 * Whether a resolved path is the directory or one of its descendants.
 * @param directory The containing directory.
 * @param target The resolved path.
 * @returns True when target is inside directory.
 */
function within(directory: string, target: string): boolean {
	const relative = path.relative(directory, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Every path the grader reached outside its workspace: a command naming one,
 * or a file change landing on one. The Codex sandbox blocks writes and not
 * reads, so this is what blinds the grader rather than the prompt.
 * @param workspace The workspace.
 * @param trace The event stream.
 * @returns The offending paths, each once.
 */
function outsideReaches(workspace: string, trace: AuthorTrace): string[] {
	const root = path.resolve(workspace);
	const named = trace.commands.flatMap((command) => namedPaths(unwrapped(command.command), root));
	const changed = trace.fileChanges.map((change) => path.resolve(root, change.path));
	return [...new Set([...named, ...changed].filter((target) => !within(root, target)))];
}

/**
 * Why the call failed as a grading call: the process, the stream, a reach
 * outside the workspace, or an answer never written.
 * @param workspace The workspace.
 * @param result The process outcome.
 * @param trace The stream.
 * @param verdictFile Where Codex was told to write the answer.
 * @returns The failure, or null.
 */
function codexProtocolFailure(
	workspace: string,
	result: ProcessResult,
	trace: AuthorTrace,
	verdictFile: string,
): string | null {
	if (result.exitCode !== 0) return `codex exited ${result.exitCode ?? result.signalCode}`;
	if (trace.failure !== null) return trace.failure;
	const outside = outsideReaches(workspace, trace);
	if (outside.length > 0) return `the grader reached outside the workspace: ${outside.join(", ")}`;
	if (!fs.existsSync(verdictFile)) return "the grader wrote no structured answer";
	return null;
}

/**
 * The Codex grader runner.
 * @param settings The pinned grader.
 * @param executable The Codex executable to run.
 * @returns The runner.
 */
function codexGrader(settings: CodexGraderSettings, executable: string): GraderRunner {
	let codexHome = "";
	return {
		name: "codex",
		executable,
		pinnedVersion: settings.version,
		usageSemantics: "cumulative",
		delivery: "attached",
		settings,
		/**
		 * Fills a private CODEX_HOME under the grading root.
		 * @param root The grading root.
		 * @param workspace The workspace to trust.
		 */
		prepare(root, workspace) {
			codexHome = path.join(root, "codex-home");
			fillCodexHome(codexHome, operatorAuthFile(), graderConfigToml(settings, workspace));
		},
		/**
		 * One grading call; Codex writes the structured answer itself with `-o`.
		 * @param request The call.
		 * @returns What it yielded.
		 */
		async call(request): Promise<GraderCallOutcome> {
			if (codexHome === "") throw new Error("the Codex grader was not prepared");
			const result = await runProcess({
				argv: codexGraderArgv(settings, executable, request),
				cwd: request.workspace,
				env: {
					PATH: process.env["PATH"] ?? "",
					HOME: process.env["HOME"] ?? "",
					CODEX_HOME: codexHome,
				},
				timeoutMs: request.timeoutMs,
				signal: request.signal,
			});
			const trace = parseTrace(result.stdout);
			const failure = codexProtocolFailure(request.workspace, result, trace, request.verdictFile);
			// Codex wrote the answer itself; a call that reached outside the workspace
			// leaves none behind to be filed.
			if (failure !== null) fs.rmSync(request.verdictFile, { force: true });
			return {
				result,
				events: result.stdout,
				sessionId: trace.threadId,
				usage: trace.usage,
				raw: null,
				failure,
				delivered: callSucceeded(result, failure) ? request.images : null,
			};
		},
	};
}

export {
	codexGrader,
	codexGraderArgv,
	codexProtocolFailure,
	outsideReaches,
	type CodexGraderSettings,
};

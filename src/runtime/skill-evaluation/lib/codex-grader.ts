// The Codex grader runner: `codex exec --json` with the pinned model and
// effort, a read-only sandbox, the structured answer enforced with
// `--output-schema` and written by `-o`, every image attached with `--image`
// on every call, and the thread resumed with `codex exec resume`.

import path from "node:path";
import { parseTrace } from "@/runtime/skill-evaluation/lib/events";
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
			const delivered = callSucceeded(result, trace.failure) ? request.images : null;
			return {
				result,
				events: result.stdout,
				sessionId: trace.threadId,
				usage: trace.usage,
				raw: null,
				failure: trace.failure,
				delivered,
			};
		},
	};
}

export { codexGrader, codexGraderArgv, type CodexGraderSettings };

// The Claude Code grader runner: `claude -p` with the pinned model and
// effort, a streamed JSON event log, the structured answer enforced with
// `--json-schema`, only the file-reading tools, no settings, hooks, plugins or
// MCP servers of the operator's, and one session started with `--session-id`
// and continued with `--resume`. Pictures are not attached: the grader opens
// them from the workspace, and the stream shows which it opened.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	parseClaudeTrace,
	redactedClaudeStream,
	type ClaudeTrace,
} from "@/runtime/skill-evaluation/lib/claude-events";
import {
	callSucceeded,
	type GraderCall,
	type GraderCallOutcome,
	type GraderRunner,
} from "@/runtime/skill-evaluation/lib/grader-runner";
import type { RunImages } from "@/runtime/skill-evaluation/lib/grading-images";
import { runProcess, type ProcessResult } from "@/runtime/skill-evaluation/lib/process";
import type { Graders } from "@/runtime/skill-evaluation/lib/suite";

type ClaudeGraderSettings = Graders["claude"];

/** The one fixed system prompt; the rubric and the runs are in the shared user prompt. */
const CLAUDE_GRADER_SYSTEM_PROMPT =
	"You are the grader of an archboard skill evaluation. You run in a read-only workspace and may read only files inside it. Do not use subagents or delegate any part of the work. Answer only through the structured output tool; write nothing else.";

/**
 * The JSON Schema as Claude's validator accepts it: without the `$schema`
 * draft declaration, which it does not know and refuses.
 * @param schemaFile The schema file.
 * @returns The schema text to pass.
 */
function claudeSchemaText(schemaFile: string): string {
	const { $schema: _draft, ...schema } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(fs.readFileSync(schemaFile, "utf8")));
	return JSON.stringify(schema);
}

/** Environment the operator's login may depend on; forwarded when set, never invented. */
const FORWARDED_ENVIRONMENT = ["CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY"] as const;

/**
 * The Claude command line for one grading call.
 * @param settings The pinned grader.
 * @param executable The Claude executable.
 * @param call The call, its session id already decided.
 * @param sessionId The session to start or resume.
 * @param resume Whether the session already exists.
 * @returns The argv.
 */
function claudeGraderArgv(
	settings: ClaudeGraderSettings,
	executable: string,
	call: Pick<GraderCall, "prompt" | "schemaFile">,
	sessionId: string,
	resume: boolean,
): string[] {
	return [
		executable,
		"-p",
		"--output-format",
		"stream-json",
		"--verbose",
		"--model",
		settings.model,
		"--effort",
		settings.effort,
		"--tools",
		settings.tools.join(","),
		"--setting-sources",
		settings.settingSources.join(","),
		"--strict-mcp-config",
		"--system-prompt",
		CLAUDE_GRADER_SYSTEM_PROMPT,
		"--json-schema",
		claudeSchemaText(call.schemaFile),
		resume ? "--resume" : "--session-id",
		sessionId,
		call.prompt,
	];
}

/**
 * The environment a grading call gets: PATH and HOME for the login, and the
 * operator's login overrides when they use them.
 * @returns The environment.
 */
function claudeEnvironment(): Record<string, string> {
	const env: Record<string, string> = {
		PATH: process.env["PATH"] ?? "",
		HOME: process.env["HOME"] ?? "",
	};
	for (const name of FORWARDED_ENVIRONMENT) {
		const value = process.env[name];
		if (value !== undefined) env[name] = value;
	}
	return env;
}

/**
 * Files the stream shows the grader opened as images and got.
 * @param trace The stream.
 * @returns Absolute paths.
 */
function openedImages(trace: ClaudeTrace): Set<string> {
	return new Set(trace.reads.filter((read) => read.ok && read.image).map((read) => read.file));
}

/**
 * The images of each run the grader actually opened, and the captures whose
 * every picture it opened. A capture with one tile unopened is not supplied.
 * @param workspace The workspace.
 * @param images What the call offered.
 * @param trace What the stream shows.
 * @returns Delivery evidence per run.
 */
function readImages(
	workspace: string,
	images: readonly RunImages[],
	trace: ClaudeTrace,
): RunImages[] {
	const opened = openedImages(trace);
	return images.map((run) => {
		const read = run.images.filter((image) => opened.has(path.resolve(workspace, image.file)));
		const readLabels = new Set(read.map((image) => image.capture));
		return {
			run: run.run,
			images: read,
			suppliedCaptures: run.suppliedCaptures.filter(
				(label) =>
					readLabels.has(label) &&
					run.images
						.filter((image) => image.capture === label)
						.every((image) => opened.has(path.resolve(workspace, image.file))),
			),
			failures: run.failures,
		};
	});
}

/**
 * Reads that left the workspace, whether Claude refused them or not.
 * @param workspace The workspace.
 * @param trace The stream.
 * @returns The offending paths.
 */
function outsideReads(workspace: string, trace: ClaudeTrace): string[] {
	const inside = `${path.resolve(workspace)}${path.sep}`;
	return [
		...new Set(
			[...trace.reads.map((read) => read.file), ...trace.denied].filter(
				(file) => !file.startsWith(inside),
			),
		),
	];
}

/**
 * A non-zero exit, with the last thing Claude printed to stderr.
 * @param result The process outcome.
 * @returns The failure text.
 */
function exitFailure(result: ProcessResult): string {
	const last = result.stderr.trim().split("\n").at(-1) ?? "";
	return `claude exited ${result.exitCode ?? result.signalCode}; ${last}`;
}

/**
 * Why the call failed as a grading call: the process, the stream, or what
 * the stream lacks.
 * @param workspace The workspace.
 * @param result The process outcome.
 * @param trace The stream.
 * @returns The failure, or null.
 */
function protocolFailure(
	workspace: string,
	result: ProcessResult,
	trace: ClaudeTrace,
): string | null {
	if (result.exitCode !== 0) return exitFailure(result);
	if (trace.failure !== null) return trace.failure;
	const outside = outsideReads(workspace, trace);
	if (outside.length > 0) return `the grader read outside the workspace: ${outside.join(", ")}`;
	if (trace.structuredOutput === null) return "the grader returned no structured output";
	return null;
}

/**
 * The Claude grader runner.
 * @param settings The pinned grader.
 * @param executable The Claude executable to run.
 * @returns The runner.
 */
function claudeGrader(settings: ClaudeGraderSettings, executable: string): GraderRunner {
	return {
		name: "claude",
		executable,
		pinnedVersion: settings.version,
		usageSemantics: "per-call",
		delivery: "workspace",
		settings: { ...settings, systemPrompt: CLAUDE_GRADER_SYSTEM_PROMPT },
		/** Claude keeps no private home here: the isolation is on the command line. */
		prepare() {},
		/**
		 * One grading call, its structured answer written to the verdict file.
		 * @param request The call.
		 * @returns What it yielded.
		 */
		async call(request): Promise<GraderCallOutcome> {
			const sessionId = request.sessionId ?? randomUUID();
			const result = await runProcess({
				argv: claudeGraderArgv(
					settings,
					executable,
					request,
					sessionId,
					request.sessionId !== null,
				),
				cwd: request.workspace,
				env: claudeEnvironment(),
				timeoutMs: request.timeoutMs,
				signal: request.signal,
			});
			const trace = parseClaudeTrace(result.stdout, request.workspace);
			const failure = protocolFailure(request.workspace, result, trace);
			fs.rmSync(request.verdictFile, { force: true });
			if (failure === null && trace.structuredOutput !== null)
				fs.writeFileSync(request.verdictFile, `${trace.structuredOutput}\n`);
			return {
				result,
				events: redactedClaudeStream(result.stdout),
				sessionId: trace.sessionId ?? sessionId,
				usage: trace.usage,
				raw: { usage: trace.rawUsage, modelUsage: trace.modelUsage, costUsd: trace.costUsd },
				failure,
				delivered: callSucceeded(result, failure)
					? readImages(request.workspace, request.images, trace)
					: null,
			};
		},
	};
}

export {
	CLAUDE_GRADER_SYSTEM_PROMPT,
	claudeGrader,
	claudeGraderArgv,
	outsideReads,
	readImages,
	type ClaudeGraderSettings,
};

// Model-free owners of the Claude grader runner: the command line carries
// the pinned posture, the stream parser reads what the harness reports, and
// the read receipts count only pictures the stream shows were opened.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	CLAUDE_GRADER_SYSTEM_PROMPT,
	claudeGraderArgv,
	claudeUsageFrom,
	outsideReads,
	parseClaudeTrace,
	readImages,
	redactedClaudeStream,
} from "@/runtime/skill-evaluation/audit";
import { graderPrompt, loadSuite } from "@/runtime/skill-evaluation";

const loaded = loadSuite(path.join(import.meta.dir, "../../../..", "evals"));
const workspace = "/batch/graders/workspace";

/**
 * One tool use and its answer, as the stream carries them.
 * @param id The tool use id.
 * @param file The path given to Read.
 * @param answer How the tool answered.
 * @returns Two stream lines.
 */
function readLines(id: string, file: string, answer: "image" | "text" | "error"): string[] {
	const use = {
		type: "assistant",
		message: { content: [{ type: "tool_use", id, name: "Read", input: { file_path: file } }] },
	};
	const result =
		answer === "error"
			? {
					type: "user",
					message: {
						content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: "no" }],
					},
				}
			: {
					type: "user",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: id,
								content:
									answer === "image"
										? [{ type: "image", source: { type: "base64", data: "AAAA" } }]
										: "1\ttext",
							},
						],
					},
					tool_use_result:
						answer === "image" ? { type: "image", file: { base64: "AAAA" } } : { type: "text" },
				};
	return [JSON.stringify(use), JSON.stringify(result)];
}

const RESULT = {
	type: "result",
	subtype: "success",
	is_error: false,
	session_id: "sess-1",
	total_cost_usd: 0.5,
	usage: {
		input_tokens: 4,
		cache_creation_input_tokens: 100,
		cache_read_input_tokens: 300,
		output_tokens: 20,
		output_tokens_details: { thinking_tokens: 7 },
	},
	modelUsage: { "claude-fable-5-1": { costUSD: 0.5 } },
	structured_output: { runs: [] },
};

test("the command line pins the model, effort, tools, empty setting sources, strict MCP, the fixed system prompt, the schema and the session", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-claude-argv-"));
	try {
		const schema = path.join(root, "schema.json");
		fs.writeFileSync(schema, '{"type":"object"}\n');
		const settings = loaded.graders.claude;
		const first = claudeGraderArgv(
			settings,
			"/bin/claude",
			{ prompt: "Grade", schemaFile: schema },
			"id-1",
			false,
		);
		const after = (flag: string): string | undefined => first[first.indexOf(flag) + 1];
		expect(first[0]).toBe("/bin/claude");
		expect(first).toContain("-p");
		expect(after("--output-format")).toBe("stream-json");
		expect(after("--model")).toBe(settings.model);
		expect(after("--effort")).toBe(settings.effort);
		expect(after("--tools")).toBe(settings.tools.join(","));
		expect(after("--setting-sources")).toBe("");
		expect(first).toContain("--strict-mcp-config");
		expect(after("--system-prompt")).toBe(CLAUDE_GRADER_SYSTEM_PROMPT);
		expect(after("--json-schema")).toBe('{"type":"object"}');
		expect(after("--session-id")).toBe("id-1");
		expect(first).not.toContain("--resume");
		expect(first.at(-1)).toBe("Grade");
		const resumed = claudeGraderArgv(
			settings,
			"claude",
			{ prompt: "More", schemaFile: schema },
			"id-1",
			true,
		);
		expect(resumed[resumed.indexOf("--resume") + 1]).toBe("id-1");
		expect(resumed).not.toContain("--session-id");
		for (const forbidden of [
			"--dangerously-skip-permissions",
			"--bare",
			"--no-session-persistence",
		])
			expect(first).not.toContain(forbidden);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("the prompt differs between runners only in how the pictures arrive", () => {
	const brief = {
		rubric: "# Rubric\nBe exact.",
		layout: { flask: "flask", runs: "runs", verdictFile: "verdict-1.json" },
		revisions: { "3.0.0": "abc" },
		runs: ["run-0000000001"],
		continuing: false,
	};
	const attached = graderPrompt({ ...brief, delivery: "attached" }).split("\n");
	const opened = graderPrompt({ ...brief, delivery: "workspace" }).split("\n");
	expect(attached).toHaveLength(opened.length);
	const differing = attached.filter((line, index) => line !== opened[index]);
	expect(differing).toHaveLength(1);
	expect(opened.join("\n")).toContain("file reading tool");
	expect(graderPrompt(brief)).toBe(attached.join("\n"));
});

test("the stream yields the session, every read with its outcome, refusals, per-call usage, cost and the structured answer", () => {
	const lines = [
		JSON.stringify({ type: "system", subtype: "init", session_id: "sess-1" }),
		"not json at all",
		...readLines("t1", `${workspace}/runs/run-0000000001/captures/a.png`, "image"),
		...readLines("t2", "runs/run-0000000001/bundle.json", "text"),
		...readLines("t3", "/etc/hostname", "error"),
		JSON.stringify({ type: "system", subtype: "permission_denied", tool_use_id: "t3" }),
		JSON.stringify(RESULT),
	];
	const trace = parseClaudeTrace(lines.join("\n"), workspace);
	expect(trace.sessionId).toBe("sess-1");
	expect(trace.malformedLines).toBe(1);
	expect(trace.reads.map((read) => [read.file, read.ok, read.image])).toEqual([
		[`${workspace}/runs/run-0000000001/captures/a.png`, true, true],
		[`${workspace}/runs/run-0000000001/bundle.json`, true, false],
		["/etc/hostname", false, false],
	]);
	expect(trace.denied).toEqual(["/etc/hostname"]);
	expect(trace.usage).toEqual({
		input: 404,
		cached: 300,
		cacheWrite: 100,
		output: 20,
		reasoning: 7,
		total: 424,
	});
	expect(trace.costUsd).toBe(0.5);
	expect(trace.structuredOutput).toBe('{"runs":[]}');
	expect(trace.failure).toBeNull();
	expect(outsideReads(workspace, trace)).toEqual(["/etc/hostname"]);
	const failed = parseClaudeTrace(
		JSON.stringify({ ...RESULT, is_error: true, subtype: "error_max_turns", result: "stopped" }),
		workspace,
	);
	expect(failed.failure).toBe("error_max_turns: stopped");
	expect(claudeUsageFrom({ input_tokens: 1 })).toBeNull();
});

test("a capture counts as read only when its main image and every tile were opened as images", () => {
	const run = "run-0000000001";
	const offered = {
		run,
		images: [
			{
				capture: "overview",
				file: `runs/${run}/captures/main.png`,
				width: 1601,
				height: 1,
				sha256: "a",
			},
			{
				capture: "overview",
				file: `runs/${run}/captures/left.png`,
				width: 1600,
				height: 1,
				sha256: "b",
			},
			{
				capture: "overview",
				file: `runs/${run}/captures/right.png`,
				width: 1,
				height: 1,
				sha256: "c",
			},
			{
				capture: "detail",
				file: `runs/${run}/captures/detail.png`,
				width: 1,
				height: 1,
				sha256: "d",
			},
		],
		suppliedCaptures: ["overview", "detail"],
		failures: [{ capture: "gone", detail: "not taken" }],
	};
	const partial = parseClaudeTrace(
		[
			...readLines("t1", `runs/${run}/captures/main.png`, "image"),
			...readLines("t2", `runs/${run}/captures/left.png`, "image"),
			...readLines("t3", `runs/${run}/captures/detail.png`, "image"),
			...readLines("t4", `runs/${run}/captures/right.png`, "text"),
		].join("\n"),
		workspace,
	);
	const [delivered] = readImages(workspace, [offered], partial);
	expect(delivered?.suppliedCaptures).toEqual(["detail"]);
	expect(delivered?.images.map((image) => image.sha256)).toEqual(["a", "b", "d"]);
	expect(delivered?.failures).toEqual(offered.failures);
	const none = readImages(workspace, [offered], parseClaudeTrace("", workspace));
	expect(none[0]?.suppliedCaptures).toEqual([]);
	expect(none[0]?.images).toEqual([]);
});

test("the retained stream keeps every line and replaces image bytes with their size", () => {
	const text = [
		"warning: printed first",
		...readLines("t1", "runs/x/captures/a.png", "image"),
		JSON.stringify(RESULT),
	].join("\n");
	const kept = redactedClaudeStream(text);
	expect(kept.split("\n")).toHaveLength(4);
	expect(kept).toContain("warning: printed first");
	expect(kept).not.toContain('"AAAA"');
	expect(kept).toContain("4 base64 characters omitted");
	expect(parseClaudeTrace(kept, workspace).reads[0]?.image).toBe(true);
	expect(parseClaudeTrace(kept, workspace).usage).toEqual(parseClaudeTrace(text, workspace).usage);
});

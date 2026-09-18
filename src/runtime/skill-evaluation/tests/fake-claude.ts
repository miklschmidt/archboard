// A stand-in for `claude -p --output-format stream-json`, run as a process by
// the model-free grading owner. It answers `--version` with what the test
// says, reads the images the prompt lists the way the real tool does (one
// tool_use per file, an image tool_result back), and ends with a result line
// carrying this call's usage and a structured verdict for every run the
// prompt names. FAKE_CLAUDE_MODE changes what it does wrong.

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const mode = process.env["FAKE_CLAUDE_MODE"] ?? "grade";
const log = process.env["FAKE_CLAUDE_LOG"];
if (log !== undefined) fs.appendFileSync(log, `${JSON.stringify(argv)}\n`);

if (argv.includes("--version")) {
	process.stdout.write(`${process.env["FAKE_CLAUDE_VERSION"] ?? "0.0.0"} (Claude Code)\n`);
	process.exit(0);
}

/**
 * The value following a flag.
 * @param flag The flag.
 * @returns The value, or null.
 */
function flagValue(flag: string): string | null {
	const index = argv.indexOf(flag);
	return index === -1 ? null : (argv[index + 1] ?? null);
}

if (mode === "refuse-schema") {
	process.stderr.write("Error: --json-schema is not a valid JSON Schema\n");
	process.exit(1);
}
if (JSON.parse(flagValue("--json-schema") ?? "{}")["$schema"] !== undefined) {
	process.stderr.write(
		"Error: --json-schema is not a valid JSON Schema: no schema with key or ref\n",
	);
	process.exit(1);
}

const sessionId = flagValue("--session-id") ?? flagValue("--resume") ?? "no-session";
const prompt = argv.at(-1) ?? "";
const images = [
	...prompt.matchAll(/^Image \d+: (run-[0-9a-f]{10}), capture ([^,]+), (\S+) \(/gmu),
].map((match) => ({ run: match[1] ?? "", capture: match[2] ?? "", file: match[3] ?? "" }));
const runs = /Grade these runs now: ([^.]+)\./u.exec(prompt)?.[1]?.split(", ") ?? [];

/**
 * Prints one event line.
 * @param event The event.
 */
function emit(event: unknown): void {
	process.stdout.write(`${JSON.stringify(event)}\n`);
}

/**
 * Prints a Read tool use and its answer.
 * @param file The workspace-relative file.
 * @param index Its ordinal, for the tool use id.
 * @param outcome How the read went.
 */
function read(file: string, index: number, outcome: "image" | "denied"): void {
	const id = `toolu_${index}`;
	emit({
		type: "assistant",
		message: {
			role: "assistant",
			content: [{ type: "tool_use", id, name: "Read", input: { file_path: path.resolve(file) } }],
		},
		session_id: sessionId,
	});
	if (outcome === "denied") {
		emit({
			type: "system",
			subtype: "permission_denied",
			tool_name: "Read",
			tool_use_id: id,
			session_id: sessionId,
		});
		emit({
			type: "user",
			message: {
				role: "user",
				content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: "denied" }],
			},
			session_id: sessionId,
		});
		return;
	}
	const base64 = fs.readFileSync(path.resolve(file)).toString("base64");
	emit({
		type: "user",
		message: {
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: id,
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
					],
				},
			],
		},
		tool_use_result: { type: "image", file: { base64, type: "image/png" } },
		session_id: sessionId,
	});
}

emit({
	type: "system",
	subtype: "init",
	session_id: sessionId,
	tools: ["Glob", "Grep", "Read", "StructuredOutput"],
});
const skipTiles = mode === "skip-tiles";
images.forEach((image, index) => {
	if (skipTiles && /tile/u.test(image.file)) return;
	read(image.file, index, "image");
});
if (mode === "outside-read") read("/etc/hostname", images.length, "denied");
const verdicts = runs.map((run) => {
	const seen = [
		...new Set(images.filter((image) => image.run === run).map((image) => image.capture)),
	];
	return {
		run,
		features: [
			{
				feature: "board.create",
				verdict: "pass",
				evidence: "boards/",
				reason: "present",
				finding: null,
			},
		],
		semanticCorrectness: 8,
		architecturalTruth: 7,
		readability: 9,
		unprompted: [
			{ feature: "traffic", verdict: "missed", evidence: "boards/", reason: "runtime path bare" },
		],
		behaviouralCompleteness: 6,
		summary: `graded ${run}`,
		concerns: [],
		visual: {
			inspectedCaptures: seen,
			verdict: "pass",
			observations: seen.map((capture) => ({ capture, observation: "legible" })),
		},
	};
});
const result: Record<string, unknown> = {
	type: "result",
	subtype: "success",
	is_error: false,
	session_id: sessionId,
	num_turns: images.length + 1,
	total_cost_usd: 0.25,
	usage: {
		input_tokens: 10,
		cache_creation_input_tokens: 2,
		cache_read_input_tokens: 5,
		output_tokens: 3,
		output_tokens_details: { thinking_tokens: 1 },
	},
	modelUsage: { "claude-fable-5-1": { inputTokens: 17, outputTokens: 3, costUSD: 0.25 } },
	result: JSON.stringify({ runs: verdicts }),
};
if (mode !== "no-output") result["structured_output"] = { runs: verdicts };
emit(result);

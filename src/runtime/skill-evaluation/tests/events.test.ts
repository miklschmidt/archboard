// What the harness reads off a Codex event stream, and how it tells a
// discovery call from an operation from a look at the source: the numbers
// the comparison reports rest on.

import { describe, expect, test } from "bun:test";
import {
	classCounts,
	classifyCommands,
	guidanceFilesRead,
	guidanceStanding,
	parseTrace,
	unwrapped,
	usageFrom,
} from "@/runtime/skill-evaluation/index";

const CONTEXT = {
	skillRoot: "/run/home/.agents/skills/archboard",
	checkoutRoot: "/run/flask",
	vault: "/run/vault",
};

/**
 * One JSONL stream from events.
 * @param events The events.
 * @returns The stream text.
 */
function stream(events: readonly unknown[]): string {
	return events.map((event) => JSON.stringify(event)).join("\n");
}

describe("parsing a codex exec event stream", () => {
	test("keeps the thread, the commands, the last message and the usage; counts what is not an event", () => {
		const text = [
			"warning: something codex printed first",
			stream([
				{ type: "thread.started", thread_id: "thr_1" },
				{ type: "turn.started" },
				{
					type: "item.completed",
					item: {
						id: "i1",
						type: "command_execution",
						command: "bash -lc 'cat /run/home/.agents/skills/archboard/SKILL.md'",
						aggregated_output: "# Archboard",
						exit_code: 0,
						status: "completed",
					},
				},
				{
					type: "item.completed",
					item: { id: "i2", type: "reasoning", text: "thinking" },
				},
				{
					type: "item.completed",
					item: {
						id: "i3",
						type: "command_execution",
						command: ["archboard", "semantic", "new", "Flask", "--doing", "x"],
						exit_code: 0,
						status: "completed",
					},
				},
				{
					type: "item.completed",
					item: { id: "i4", type: "agent_message", text: "Done." },
				},
				{
					type: "turn.completed",
					usage: {
						input_tokens: 1000,
						cached_input_tokens: 600,
						output_tokens: 200,
						reasoning_output_tokens: 50,
					},
				},
			]),
		].join("\n");
		const trace = parseTrace(text);
		expect(trace.threadId).toBe("thr_1");
		expect(trace.commands.map((command) => command.command)).toEqual([
			"bash -lc 'cat /run/home/.agents/skills/archboard/SKILL.md'",
			"archboard semantic new Flask --doing x",
		]);
		expect(trace.commands[0]?.output).toBe("# Archboard");
		expect(trace.messages).toEqual(["Done."]);
		expect(trace.usage).toEqual({
			input: 1000,
			cached: 600,
			cacheWrite: null,
			output: 200,
			reasoning: 50,
			total: 1200,
		});
		expect(trace.failure).toBeNull();
		expect(trace.malformedLines).toBe(1);
		expect(trace.events).toBe(7);
	});

	test("a failed turn is a failure with its message, and usage stays unavailable when the producer gave none", () => {
		const trace = parseTrace(
			stream([
				{ type: "thread.started", thread_id: "t" },
				{ type: "turn.failed", error: { message: "rate limited" } },
			]),
		);
		expect(trace.failure).toBe("rate limited");
		expect(trace.usage).toBeNull();
	});

	test("usage never adds cached input to input, and caps cached at input", () => {
		expect(
			usageFrom({
				input_tokens: 100,
				cached_input_tokens: 250,
				output_tokens: 10,
			}),
		).toEqual({
			input: 100,
			cached: 100,
			cacheWrite: null,
			output: 10,
			reasoning: null,
			total: 110,
		});
		expect(usageFrom({ input_tokens: 100 })).toBeNull();
		expect(usageFrom("nope")).toBeNull();
	});
});

describe("classifying what an author ran", () => {
	test("unwraps bash -lc and quotes", () => {
		expect(unwrapped("bash -lc 'rg wsgi_app src/flask'")).toBe("rg wsgi_app src/flask");
		expect(unwrapped('/bin/sh -c "ls"')).toBe("ls");
		expect(unwrapped("archboard check")).toBe("archboard check");
	});

	test("the script of a shell -c call is what the shell receives: quoting, escapes and splices undone", () => {
		expect(unwrapped('/usr/bin/bash -lc "archboard semantic show \\"Flask signals\\""')).toBe(
			'archboard semantic show "Flask signals"',
		);
		expect(unwrapped(`bash -lc "find \\""'$V" -type f\nprintf '"'%s' x"`)).toBe(
			`find "$V" -type f\nprintf '%s' x`,
		);
		expect(unwrapped("bash -lc 'rg '\"'\"'a b'\"'\"' src'")).toBe("rg 'a b' src");
		expect(unwrapped("zsh -l -c 'ls src'")).toBe("ls src");
		expect(unwrapped('sh -c "ls \\\nsrc"')).toBe("ls src");
		// Invoked as bash -l -c, or followed by another command, a write is still a write.
		for (const command of [
			"bash -l -c 'archboard semantic new x --doing y'",
			"bash -c true && archboard semantic new x --doing y",
		]) {
			const [write] = classifyCommands(
				[{ command, exitCode: 0, status: "completed", output: "" }],
				CONTEXT,
			);
			expect(write?.write, command).toBe(true);
		}
	});

	test("each class has a rule that names why, and a write is a write", () => {
		const records = [
			"bash -lc 'cat /run/home/.agents/skills/archboard/references/schemas.md'",
			"bash -lc 'archboard help semantic edit'",
			"bash -lc 'archboard semantic config'",
			"bash -lc 'cat /run/vault/.archboard/config.yaml'",
			'bash -lc \'archboard semantic edit "Flask JSON" --doing "adding the provider" --expect-version 3 < edit.json\'',
			"bash -lc 'archboard check'",
			"bash -lc 'rg -n \"class Flask\" src/flask/app.py'",
			"bash -lc 'sed -n 1,40p /run/flask/src/flask/ctx.py'",
			"bash -lc 'export ARCHBOARD_VAULT=/run/vault'",
			"bash -lc 'archboard frobnicate'",
			"bash -lc 'python3 -c \"print(1)\"'",
		].map((command) => ({
			command,
			exitCode: 0,
			status: "completed",
			output: "",
		}));
		const classified = classifyCommands(records, CONTEXT);
		expect(classified.map((command) => command.class)).toEqual([
			"discovery",
			"discovery",
			"discovery",
			"discovery",
			"operation",
			"operation",
			"code-investigation",
			"code-investigation",
			"setup",
			"ambiguous",
			"ambiguous",
		]);
		expect(classified.every((command) => command.rule.trim().length > 0)).toBe(true);
		expect(classified.map((command) => command.write)).toEqual([
			false,
			false,
			false,
			false,
			true,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
		expect(classCounts(classified)).toEqual({
			discovery: 4,
			operation: 2,
			"code-investigation": 2,
			"product-source": 0,
			setup: 1,
			ambiguous: 2,
		});
	});
});

/** A skill package that ships every file a scenario names. */
const shipsAll = () => true;

describe("what guidance an author read", () => {
	test("names the skill files a trace read, by absolute root or by the install's tail, and what the scenario named that it did not", () => {
		const records = [
			"bash -lc 'sed -n 1,240p /run/home/.agents/skills/archboard/SKILL.md'",
			"bash -lc 'cat /run/home/.agents/skills/archboard/references/edit.md'",
			"bash -lc 'cat .agents/skills/archboard/references/../references/authoring.md'",
			"bash -lc 'rg -n \"class Flask\" src/flask/app.py'",
		].map((command) => ({ command, exitCode: 0, status: "completed" as const, output: "" }));
		const read = guidanceFilesRead(records, { skillRoot: "/run/home/.agents/skills/archboard" });
		expect(read).toEqual(["SKILL.md", "references/authoring.md", "references/edit.md"]);
		const standing = guidanceStanding(
			["references/edit.md", "references/variants.md"],
			read,
			shipsAll,
		);
		expect(standing.missing).toEqual(["references/variants.md"]);
		expect(guidanceStanding([], read, shipsAll).missing).toEqual([]);
	});

	test("does not expect a file the arm's installed skill does not ship", () => {
		const standing = guidanceStanding(
			["references/read.md", "references/authoring.md"],
			["SKILL.md"],
			(file) => file !== "references/read.md",
		);
		expect(standing.expected).toEqual(["references/authoring.md"]);
		expect(standing.missing).toEqual(["references/authoring.md"]);
	});
});

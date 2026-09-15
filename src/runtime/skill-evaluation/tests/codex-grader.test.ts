// The Codex grader is blinded by the harness, not by its prompt: its sandbox
// blocks writes and not reads, so a call whose stream names a path outside the
// staged workspace is filed as an error and leaves no verdict behind.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { codexProtocolFailure, outsideReaches } from "@/runtime/skill-evaluation/lib/codex-grader";
import { parseTrace, type AuthorTrace } from "@/runtime/skill-evaluation/lib/events";

const WORKSPACE = "/batch/graders/workspace";

/**
 * A trace holding the given commands and file changes.
 * @param commands The scripts the grader ran.
 * @param files The files it changed.
 * @returns The trace.
 */
function trace(commands: readonly string[], files: readonly string[] = []): AuthorTrace {
	return {
		...parseTrace(""),
		commands: commands.map((command) => ({
			command,
			exitCode: 0,
			status: "completed",
			output: "",
		})),
		fileChanges: files.map((file) => ({ path: file, kind: "update" })),
	};
}

const RESULT = {
	exitCode: 0,
	signalCode: null,
	stdout: "",
	stderr: "",
	timedOut: false,
	cancelled: false,
	durationMs: 1,
};

describe("what the Codex grader may reach", () => {
	test("a read inside the workspace, by any spelling, reaches nothing outside", () => {
		expect(
			outsideReaches(
				WORKSPACE,
				trace([
					"bash -lc 'cat runs/run-1/bundle.json'",
					`bash -lc 'sed -n 1,40p ${WORKSPACE}/flask/3.0.0/src/flask/app.py'`,
					"bash -lc 'rg -n wsgi_app ./flask > /dev/null'",
				]),
			),
		).toEqual([]);
	});

	test("the blinding file, the evaluation inputs and another checkout are outside, however they are spelled", () => {
		expect(
			outsideReaches(
				WORKSPACE,
				trace(
					[
						"bash -lc 'cat ../../blinding.json'",
						"bash -lc 'cat /home/op/archboard/evals/evals.json'",
						"bash -lc 'cd ../.. && ls'",
					],
					["../notes.md"],
				),
			),
		).toEqual([
			"/batch/blinding.json",
			"/home/op/archboard/evals/evals.json",
			"/batch",
			"/batch/graders/notes.md",
		]);
	});

	test("a reach outside is an error even when Codex wrote an answer, and the other failures keep their precedence", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-grader-"));
		const verdict = path.join(root, "verdict.json");
		fs.writeFileSync(verdict, "{}\n");
		const clean = trace(["bash -lc 'cat runs/run-1/bundle.json'"]);
		const outside = trace(["bash -lc 'cat ../../blinding.json'"]);
		expect(codexProtocolFailure(WORKSPACE, RESULT, clean, verdict)).toBeNull();
		expect(codexProtocolFailure(WORKSPACE, RESULT, outside, verdict)).toContain(
			"reached outside the workspace: /batch/blinding.json",
		);
		expect(codexProtocolFailure(WORKSPACE, { ...RESULT, exitCode: 2 }, outside, verdict)).toContain(
			"codex exited 2",
		);
		expect(
			codexProtocolFailure(WORKSPACE, RESULT, { ...outside, failure: "turn failed" }, verdict),
		).toBe("turn failed");
		expect(codexProtocolFailure(WORKSPACE, RESULT, clean, path.join(root, "absent.json"))).toBe(
			"the grader wrote no structured answer",
		);
		fs.rmSync(root, { recursive: true, force: true });
	});
});

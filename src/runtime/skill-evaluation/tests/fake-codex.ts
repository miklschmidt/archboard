// A stand-in for `codex exec --json`, run as a process by the model-free
// grading owners. It answers `--version` with what the test says, starts a
// thread on `exec` and continues it on `exec resume <id>`, reports the
// thread's cumulative usage on turn.completed as Codex does, and writes the
// structured answer where `-o` says, for every run the prompt names
// (fake-grader-answer.ts decides what the answer lacks). FAKE_CODEX_LOG
// receives every argv.

import fs from "node:fs";
import { fakeVerdicts, listedImages } from "@/runtime/skill-evaluation/tests/fake-grader-answer";

const argv = process.argv.slice(2);
const log = process.env["FAKE_CODEX_LOG"];
if (log !== undefined) fs.appendFileSync(log, `${JSON.stringify(argv)}\n`);

if (argv.includes("--version")) {
	process.stdout.write(`codex-cli ${process.env["FAKE_CODEX_VERSION"] ?? "0.0.0"}\n`);
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

const resumed = argv[0] === "exec" && argv[1] === "resume";
const threadId = resumed ? (argv[2] ?? "") : "thread-fake";
const prompt = argv.at(-1) ?? "";
const answerFile = flagValue("-o");
// Every call of a thread adds the same, and the thread reports its total so far.
const counter = `${process.env["FAKE_GRADER_STATE"] ?? "/dev/null"}.turns`;
const turns = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
fs.writeFileSync(counter, String(turns));

/**
 * Prints one event line.
 * @param event The event.
 */
function emit(event: unknown): void {
	process.stdout.write(`${JSON.stringify(event)}\n`);
}

emit({ type: "thread.started", thread_id: threadId });
emit({ type: "turn.started" });
const attached = new Set(
	argv.flatMap((word, index) => (argv[index - 1] === "--image" ? [word] : [])),
);
const seen = listedImages(prompt).filter((image) =>
	[...attached].some((file) => file.endsWith(image.file)),
);
if (answerFile !== null)
	fs.writeFileSync(answerFile, JSON.stringify({ runs: fakeVerdicts(prompt, seen) }));
emit({
	type: "turn.completed",
	usage: { input_tokens: 10 * turns, cached_input_tokens: 4 * turns, output_tokens: 2 * turns },
});

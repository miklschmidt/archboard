// `--board` is a shared option that names the one board of an invocation, and a
// command may declare it as an option of its own to narrow the boards it reads.
// Routing takes every `--board` out of the arguments before dispatch, so these
// hold what happens to them afterwards. Commands are found in the live
// registry by what their contracts declare, so renaming or adding one changes
// nothing here.

import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { cliContractRegistry, runCli } from "#cli/operations/invocation/run.ts";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";

const registry = cliContractRegistry();
const ownsBoards = (entry: (typeof registry)[number]): boolean =>
	entry.contract.parameters.some(
		(parameter) => parameter.kind === "option" && parameter.spellings.includes("--board"),
	);
const narrowing = registry.filter(ownsBoards);
const naming = registry.filter((entry) => entry.contract.shared.includes("board"));

let stderr: ReturnType<typeof spyOn>;
let exitCode: typeof process.exitCode;
const handlers = new Map(
	[...narrowing, ...naming].map((entry) => [entry.name, spyOn(entry.contract, "handler")]),
);

beforeEach(() => {
	exitCode = process.exitCode;
	process.exitCode = 0;
	stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
	for (const handler of handlers.values()) {
		handler.mockReset();
		handler.mockResolvedValue({ result: {} });
	}
});
afterEach(() => {
	stderr.mockRestore();
	process.exitCode = exitCode ?? 0;
});
afterAll(() => {
	for (const handler of handlers.values()) handler.mockRestore();
});

/**
 * The input that a command's handler was run with.
 * @param name The command.
 * @returns The first call's input.
 */
function inputOf(name: string): unknown {
	return handlers.get(name)?.mock.calls[0]?.[0];
}

test("a command that declares --board receives every one stated, in order, before and after its name", async () => {
	expect(narrowing.length).toBeGreaterThan(0);
	for (const entry of narrowing) {
		for (const argv of [
			[...entry.contract.path, "--board", "a", "--board=b"],
			[entry.contract.path[0]!, "--board", "a", ...entry.contract.path.slice(1), "--board", "b"],
		]) {
			handlers.get(entry.name)?.mockClear();
			process.exitCode = 0;
			await runCli(argv, { url: "http://127.0.0.1:1", help: false });
			expect(inputOf(entry.name), argv.join(" ")).toMatchObject({ board: ["a", "b"] });
			// It names no board for every request of the invocation.
			expect(statedInvocation().board).toBeNull();
		}
	}
});

test("a command that takes the one board of an invocation refuses a second, and runs nothing", async () => {
	expect(naming.length).toBeGreaterThan(0);
	for (const entry of naming) {
		process.exitCode = 0;
		await runCli([...entry.contract.path, "--board", "a", "--board", "b"], {
			url: "http://127.0.0.1:1",
			help: false,
		});
		expect(process.exitCode, entry.name).toBe(2);
		expect(handlers.get(entry.name)?.mock.calls, entry.name).toHaveLength(0);
	}
});

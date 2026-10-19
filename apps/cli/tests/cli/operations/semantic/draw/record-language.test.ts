// The language a recording is narrated in, as `semantic record` takes it (TASK-380).
//
// What is guarded: a tag that names no language is refused before anything runs, a valid one
// reaches the command as given, and none given is the option's declared default. The option is
// found through the command's own contract, so its spelling and default are the contract's. That
// the value reaches the voice start is the end-to-end recording owner's.

import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { cliContractRegistry, runCli } from "#cli/operations/invocation/run.ts";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const vault = makeStandInVault();
afterAll(() => vault.restore());

const record = cliContractRegistry().find(
	(entry) => entry.contract.path.join(" ") === "semantic record",
)?.contract;
if (record === undefined) throw new Error("semantic record is not registered");
const option = record.parameters.find((parameter) => parameter.key === "language");
if (option?.kind !== "option" || option.default === undefined) {
	throw new Error("semantic record declares no --language option with a default");
}
const [spelling] = option.spellings;
const handler = spyOn(record, "handler");
let exitCode: typeof process.exitCode;
let stderr: ReturnType<typeof spyOn>;
let stdout: ReturnType<typeof spyOn>;

beforeEach(() => {
	exitCode = process.exitCode;
	process.exitCode = 0;
	stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
	stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
	handler.mockReset();
	// Stops at the handler: what it was given is the observation.
	handler.mockImplementation(() => Promise.reject(new Error("stopped at the handler")));
});
afterEach(() => {
	stdout.mockRestore();
	stderr.mockRestore();
	process.exitCode = exitCode;
});

/**
 * Run `semantic record` with these arguments after the board and --out.
 * @param args The arguments.
 * @returns The language the handler was given, or undefined when it did not run.
 */
async function languageGiven(args: readonly string[]): Promise<unknown> {
	await runCli(vault.argv(["semantic", "record", "tour", "--out", "tour.mp4", ...args]));
	const input: unknown = handler.mock.calls[0]?.[0];
	return typeof input === "object" && input !== null && "language" in input
		? input.language
		: undefined;
}

test("a tag that names no language is refused before the command runs", async () => {
	for (const refused of ["english", "xx", "en_US"]) {
		handler.mockClear();
		process.exitCode = 0;
		expect(await languageGiven([spelling ?? "", refused])).toBeUndefined();
		expect(handler).not.toHaveBeenCalled();
		expect(process.exitCode).not.toBe(0);
	}
});

test("a valid tag reaches the command as given, and none given is the declared default", async () => {
	expect(await languageGiven([spelling ?? "", "pt-BR"])).toBe("pt-BR");
	handler.mockClear();
	expect(await languageGiven([])).toBe(option.default);
});

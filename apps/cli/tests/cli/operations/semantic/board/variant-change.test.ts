// `archboard semantic edit` and `semantic resolve` from their arguments to their
// streams and exit status. Both write a stated change onto a variant, and both
// read it in one order that this file holds: the version the write was made
// against comes before the input is opened, and a flag that overrides the
// stated variant is said before the schema or the server can refuse the write.
// Only the Archboard server is a stand-in.

import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processCommandHost } from "#cli/store/artifacts/host.ts";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const vault = makeStandInVault();
const work = mkdtempSync(join(tmpdir(), "archboard-variant-change-"));
const REFUSAL = "The board moved on.";
let service = "";
const written: { path: string; body: Record<string, unknown> }[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === "/health") return Response.json({ service, status: "ok" });
		if (request.method === "POST") {
			written.push({ path: pathname, body: (await request.json()) as Record<string, unknown> });
			return Response.json(
				{ success: false, code: "BOARD_VERSION_CONFLICT", error: REFUSAL },
				{ status: 409 },
			);
		}
		return Response.json({ success: false, error: `unexpected ${pathname}` }, { status: 404 });
	},
});
const url = `http://127.0.0.1:${server.port}`;
const environment = {
	ARCHBOARD_URL: process.env["ARCHBOARD_URL"],
	ARCHBOARD_NO_AUTOSTART: process.env["ARCHBOARD_NO_AUTOSTART"],
};
process.env["ARCHBOARD_URL"] = url;
process.env["ARCHBOARD_NO_AUTOSTART"] = "1";
// Imported only now, because the CLI reads where its server is as it loads.
const [config, { runCli }] = await Promise.all([
	import("@archboard/server-lifecycle/config"),
	import("#cli/operations/invocation/run.ts"),
]);
if (config.ARCHBOARD_URL !== url) {
	throw new Error(
		`The CLI loaded before this file pointed it at its stand-in server. Run it in its own process: bun test --isolate ${import.meta.path}`,
	);
}
service = "archboard-server";

afterAll(async () => {
	for (const [key, value] of Object.entries(environment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await server.stop(true);
	vault.restore();
	rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
	written.length = 0;
});

const reads = spyOn(processCommandHost, "readTextFile");
afterEach(() => {
	reads.mockClear();
});

/** What each command is given: a change it accepts, and one its schema refuses. */
const commands = [
	{
		command: "edit",
		valid: { variant: "Current", summary: "Queued" },
		refused: { variant: "Current", bogus: true },
	},
	{
		command: "resolve",
		valid: { variant: "Current", choices: [{ subject: "n1", side: "mine" }] },
		refused: { variant: "Current", choices: [] },
	},
] as const;

/**
 * Run the CLI on a command and capture what it wrote and how it exited.
 * @param command The semantic command.
 * @param change What to state, written to a file the command is pointed at.
 * @param flags The rest of the command line.
 * @returns Its stderr and its exit code.
 */
async function run(
	command: string,
	change: unknown,
	flags: readonly string[],
): Promise<{ stderr: string; exited: unknown }> {
	const file = join(work, `${command}-${Math.random().toString(36).slice(2)}.json`);
	writeFileSync(file, JSON.stringify(change));
	const exitCode = process.exitCode;
	let stderr = "";
	const out = spyOn(process.stdout, "write").mockImplementation(() => true);
	const err = spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderr += String(chunk);
		return true;
	});
	process.exitCode = 0;
	try {
		await runCli(
			vault.argv(["semantic", command, "Orders", "--input", file, "--doing", "testing", ...flags]),
		);
		return { stderr, exited: process.exitCode };
	} finally {
		out.mockRestore();
		err.mockRestore();
		process.exitCode = exitCode ?? 0;
	}
}

for (const { command, valid, refused } of commands) {
	test(`semantic ${command} without an expected version never reads its input`, async () => {
		const { exited } = await run(command, valid, ["--variant", "Queued"]);
		expect(exited).toBe(2);
		expect(reads).not.toHaveBeenCalled();
		expect(written).toEqual([]);
	});

	test(`semantic ${command} says an override before its schema refuses the change`, async () => {
		const { stderr, exited } = await run(command, refused, [
			"--expect-version",
			"3",
			"--variant",
			"Queued",
		]);
		expect(exited).toBe(2);
		expect(reads).toHaveBeenCalledTimes(1);
		const lines = stderr.split("\n");
		const warned = lines.findIndex(
			(line) => line.startsWith("warning:") && line.includes("Queued"),
		);
		expect(warned).toBeGreaterThanOrEqual(0);
		expect(
			lines
				.slice(warned + 1)
				.join("\n")
				.trim(),
		).not.toBe("");
		expect(written).toEqual([]);
	});

	test(`semantic ${command} says an override before the server refuses the write, and sends the flag's variant`, async () => {
		const { stderr, exited } = await run(command, valid, [
			"--expect-version",
			"3",
			"--variant",
			"Queued",
		]);
		expect(exited).toBe(5);
		expect(written).toHaveLength(1);
		expect(sentVariant()).toBe("Queued");
		const warned = stderr.indexOf("warning:");
		expect(warned).toBeGreaterThanOrEqual(0);
		expect(stderr.indexOf(REFUSAL)).toBeGreaterThan(warned);
	});

	test(`semantic ${command} says nothing when the flag and the change name the variant alike`, async () => {
		const { stderr, exited } = await run(command, valid, [
			"--expect-version",
			"3",
			"--variant",
			"Current",
		]);
		expect(exited).toBe(5);
		expect(stderr).not.toContain("warning:");
		expect(sentVariant()).toBe("Current");
	});

	test(`semantic ${command} refuses a change that is not a JSON object before saying anything`, async () => {
		const { stderr, exited } = await run(
			command,
			["Queued"],
			["--expect-version", "3", "--variant", "Queued"],
		);
		expect(exited).toBe(2);
		expect(stderr).not.toContain("warning:");
		expect(written).toEqual([]);
	});
}

/**
 * The variant the one write that reached the server was aimed at.
 * @returns The variant, or undefined when none was sent.
 */
function sentVariant(): unknown {
	const body = written[0]?.body;
	const change = body?.["edit"] ?? body?.["resolve"];
	return typeof change === "object" && change !== null
		? (change as Record<string, unknown>)["variant"]
		: undefined;
}

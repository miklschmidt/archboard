// What a server writes to the launcher's pipe as it ends: one terminal record per process. The
// launcher takes the message of every terminal record it reads, so a second one would replace the
// reason the first gave.

import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";

import { createServerStartupProtocolReader } from "#runtime/protocol/server-startup-protocol.ts";
import { SERVER_STARTUP_TERMINAL_FD_ENV } from "#runtime/protocol/server-startup-terminal.ts";

const WRITER = fileURLToPath(import.meta.resolve("#runtime/protocol/server-startup-terminal.ts"));
const READ_BOUND_MS = 5_000;

test("a second end report in one process writes nothing", async () => {
	// A process of its own, writing to a real pipe on descriptor 3 as a launched server does.
	const child = spawn(
		process.execPath,
		[
			"-e",
			`const { reportStartupEnd } = await import(${JSON.stringify(WRITER)});
			reportStartupEnd({ cleanupProven: false, message: "the first reason" });
			reportStartupEnd({ cleanupProven: true, message: "a later reason" });`,
		],
		{
			stdio: ["ignore", "ignore", "inherit", "pipe"],
			env: { ...process.env, [SERVER_STARTUP_TERMINAL_FD_ENV]: "3" },
		},
	);
	const reader = createServerStartupProtocolReader(child.stdio[3] as Readable);
	try {
		expect(await reader.next(READ_BOUND_MS)).toMatchObject({
			kind: "record",
			record: { kind: "terminal", cleanup: "unproven", message: "the first reason" },
		});
		expect(await reader.next(READ_BOUND_MS)).toEqual({ kind: "closed" });
		expect(reader.terminalMessage()).toBe("the first reason");
	} finally {
		reader.destroy();
		child.kill();
	}
});

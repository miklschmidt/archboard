#!/usr/bin/env bun
// Run `archboard check` on this checkout's vault: the semantics, the code check
// against the bound source, and the embeds. Any warning or error fails it. The
// everyday server read its source when it started, so it can check with older
// code. This stage starts a server from this checkout's source on a free port
// and stops it after the check.
//
// Run: bun scripts/check-model.ts

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const archboard = join(root, "bin", "archboard");

/**
 * A loopback port that nothing listens on.
 * @returns The port.
 */
async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	if (address === null || typeof address === "string") throw new Error("no loopback port");
	return address.port;
}

// Workbench agents disable auto-start for their host server. This stage owns its server.
const env = {
	...process.env,
	ARCHBOARD_URL: `http://127.0.0.1:${String(await freePort())}`,
	ARCHBOARD_NO_AUTOSTART: "0",
};
// stdout carries the JSON result. stderr carries the lines a person reads.
const check = spawn(archboard, ["check"], { cwd: root, env, stdio: ["ignore", "ignore", "pipe"] });
const closed = new Promise<number>((resolve) => {
	check.on("close", (code) => resolve(code ?? 1));
});
/**
 * Cancel the CLI but keep this stage alive until it stops its detached server.
 * @param signal The signal from the terminal or the gate that stopped early.
 */
function interrupt(signal: NodeJS.Signals): void {
	check.kill(signal);
}
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

let status = 1;
try {
	// An information block continues on indented evidence lines.
	let information = false;
	for await (const line of createInterface({ input: check.stderr })) {
		information = line.startsWith("information:") || (information && line.startsWith(" "));
		if (!information) console.error(line);
	}
	status = await closed;
} finally {
	// A server that outlives the stage must fail it, or a passing gate leaks one.
	const stopped = spawnSync(archboard, ["stop"], { cwd: root, env, encoding: "utf8" });
	if (stopped.status !== 0) {
		console.error(`check:model: archboard stop failed: ${stopped.stderr.trim()}`);
		if (status === 0) status = 1;
	}
	process.off("SIGINT", interrupt);
	process.off("SIGTERM", interrupt);
}
process.exit(status);

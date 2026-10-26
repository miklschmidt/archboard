// In a Git checkout that holds no vault, only a command whose contract says
// `runsWithoutVault` runs (ADR 0057). Every other command that reads `-C` is
// refused with VAULT_NOT_FOUND before it reaches a server, as ADR 0049 decides,
// and a directory in no checkout is refused for every command. Only the
// Archboard server is a stand-in, and a refused command never asks it.

import { afterAll, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-no-vault-")));
const checkout = path.join(root, "docs");
const outside = path.join(root, "plain");
fs.mkdirSync(checkout);
fs.mkdirSync(outside);
expect(spawnSync("git", ["init", "-q"], { cwd: checkout }).status).toBe(0);

let service = "";
const asked: string[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const { pathname } = new URL(request.url);
		asked.push(pathname);
		if (pathname === "/health") return Response.json({ service, status: "ok" });
		return Response.json({ success: false, error: `unexpected ${pathname}` }, { status: 404 });
	},
});
const environment = {
	ARCHBOARD_URL: process.env["ARCHBOARD_URL"],
	ARCHBOARD_NO_AUTOSTART: process.env["ARCHBOARD_NO_AUTOSTART"],
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const registry = path.join(root, "repos.json");
process.env["ARCHBOARD_URL"] = `http://127.0.0.1:${server.port}`;
process.env["ARCHBOARD_NO_AUTOSTART"] = "1";
process.env["ARCHBOARD_REPOS"] = registry;
// Imported only now, because the CLI reads where its server is as it loads.
const [client, { cliContractRegistry, runCli }] = await Promise.all([
	import("@archboard/server-lifecycle/server-client"),
	import("#cli/operations/invocation/run.ts"),
]);
service = client.ARCHBOARD_SERVICE_NAME;

afterAll(async () => {
	for (const [key, value] of Object.entries(environment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await server.stop(true);
	fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Run the CLI and capture what it wrote and how it exited.
 * @param argv The arguments.
 * @returns Its two streams and its exit code.
 */
async function run(argv: string[]): Promise<{ stdout: string; stderr: string; exited: unknown }> {
	const exitCode = process.exitCode;
	let stdout = "";
	let stderr = "";
	const out = spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdout += String(chunk);
		return true;
	});
	const err = spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderr += String(chunk);
		return true;
	});
	let exited: unknown;
	process.exitCode = 0;
	try {
		await runCli(argv);
		exited = process.exitCode;
	} finally {
		out.mockRestore();
		err.mockRestore();
		process.exitCode = exitCode ?? 0;
	}
	return { stdout, stderr, exited };
}

/** Every command that finds a vault from `-C` or the working directory. */
const readsDirectory = () =>
	cliContractRegistry().filter((entry) => entry.contract.shared.includes("directory"));

test("in a checkout without a vault only a command that runs without one runs, and every other is refused before it asks the server", async () => {
	const ran: string[] = [];
	for (const { name, contract } of readsDirectory()) {
		asked.length = 0;
		const { stdout, stderr, exited } = await run([...contract.path, "-C", checkout]);
		if (contract.runsWithoutVault === true) {
			ran.push(name);
			expect(exited, `${name}: ${stderr}`).toBe(0);
			expect(JSON.parse(stdout), name).not.toHaveProperty("vault");
		} else {
			// VAULT_NOT_FOUND exits 2, names the checkout, and is no usage error.
			expect(exited, name).toBe(2);
			expect(stderr, name).toContain(checkout);
			expect(stderr, name).not.toContain("Usage:");
			expect(asked, name).toEqual([]);
		}
	}
	expect(ran.length).toBeGreaterThan(0);
	expect(fs.existsSync(path.join(checkout, ".archboard"))).toBe(false);
	// Nothing registered the checkout.
	expect(fs.existsSync(registry)).toBe(false);
});

test("a command that runs without a vault is refused in a directory in no checkout", async () => {
	const unbound = readsDirectory().filter(({ contract }) => contract.runsWithoutVault === true);
	expect(unbound.length).toBeGreaterThan(0);
	for (const { name, contract } of unbound) {
		asked.length = 0;
		const { stderr, exited } = await run([...contract.path, "-C", outside]);
		expect(exited, name).toBe(2);
		expect(stderr, name).toContain(outside);
		expect(asked, name).toEqual([]);
	}
});

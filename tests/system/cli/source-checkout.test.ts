// archboard runs the source of the archboard checkout it stands in, and a
// command refuses a server that runs another checkout's source (ADR 0049,
// TASK-472.08). The shipped bin runs in a stand-in archboard checkout, and
// against a /health double that names another checkout.

import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { z } from "zod";
import { packageBin } from "./support/package-cli.ts";

const repoRoot = realpathSync.native(resolve(import.meta.dir, "../../.."));
let scratch = "";

beforeAll(() => {
	scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-source-checkout-")));
});

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run the shipped bin with a home, state directory and environment of its own.
 * It runs beside this process, so a double served from here can answer it.
 * @param args The command line.
 * @param cwd Where it runs.
 * @param env What this invocation's environment adds.
 * @param input What to put on standard input.
 * @returns How it exited and what it printed.
 */
async function archboard(
	args: readonly string[],
	cwd: string,
	env: Readonly<Record<string, string>> = {},
	input?: string,
) {
	const child = Bun.spawn([packageBin, ...args], {
		cwd,
		stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
		stdout: "pipe",
		stderr: "pipe",
		env: {
			PATH: process.env["PATH"],
			HOME: join(scratch, "home"),
			XDG_STATE_HOME: join(scratch, "state"),
			ARCHBOARD_NO_AUTOSTART: "1",
			...env,
		},
	});
	const [stdout, stderr, status] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { status, stdout, stderr };
}

/**
 * Make a stand-in archboard checkout below the scratch directory.
 * @param name Its directory name.
 * @param script What its `bin/archboard` runs, a bash script.
 * @param options What it holds.
 * @param options.packages Whether it has a node_modules for its source.
 * @returns Its root.
 */
function standIn(name: string, script: string, { packages = true } = {}): string {
	const root = join(scratch, name);
	mkdirSync(join(root, ".git"), { recursive: true });
	mkdirSync(join(root, "bin"));
	mkdirSync(join(root, "docs"));
	if (packages) {
		mkdirSync(join(root, "node_modules"));
	}
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "archboard" }));
	const bin = join(root, "bin", "archboard");
	writeFileSync(bin, `#!/usr/bin/env bash\n${script}`);
	chmodSync(bin, 0o755);
	return root;
}

test("a command in another archboard checkout runs its bin/archboard with the same arguments and environment", async () => {
	const standing = standIn(
		"standing",
		'printf "%s\\n" "$@" "$ARCHBOARD_PROBE" "${NO_COLOR-unset}" "$PWD"\nexit 7\n',
	);

	const ran = await archboard(
		["semantic", "show", "two words", "--url=http://x"],
		join(standing, "docs"),
		{ ARCHBOARD_PROBE: "given" },
	);

	expect(ran.status).toBe(7);
	expect(ran.stdout.split("\n").slice(0, -1)).toEqual([
		"semantic",
		"show",
		"two words",
		"--url=http://x",
		"given",
		// The running CLI sets NO_COLOR for itself; the hand-off comes first.
		"unset",
		join(standing, "docs"),
	]);
});

test("a signal sent to the command reaches the bin/archboard it handed off to", async () => {
	const mark = join(scratch, "signalled.mark");
	const standing = standIn(
		"signalled",
		`trap 'kill $!; echo TERM > "${mark}"; exit 143' TERM\necho started > "${mark}"\nsleep 30 & wait\n`,
	);
	const child = Bun.spawn([packageBin, "status"], {
		cwd: standing,
		stdin: "ignore",
		stdout: "ignore",
		stderr: "ignore",
		env: { PATH: process.env["PATH"], HOME: join(scratch, "home") },
	});
	const deadline = Date.now() + 10_000;
	while (!existsSync(mark) && Date.now() < deadline) {
		await Bun.sleep(20);
	}

	child.kill("SIGTERM");

	expect(await child.exited).toBe(143);
	expect(readFileSync(mark, "utf8")).toBe("TERM\n");
});

test("a checkout without its packages is refused with what to run", async () => {
	const standing = standIn("unpackaged", "exit 0\n", { packages: false });

	const ran = await archboard(["status"], standing);

	expect(ran.status).toBe(1);
	expect(ran.stdout).toBe("");
	expect(ran.stderr).toContain(standing);
	expect(ran.stderr).toContain("bun install");
});

test("a command that finds a server of another checkout's source refuses and names both checkouts", async () => {
	const elsewhere = "/elsewhere/archboard";
	const contacts: string[] = [];
	using double = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			const { pathname } = new URL(request.url);
			contacts.push(`${request.method} ${pathname}`);
			return pathname === "/health"
				? Response.json({
						service: "archboard-server",
						status: "healthy",
						source: { checkout: elsewhere, stale: false },
					})
				: Response.json({ success: false, error: "unexpected" }, { status: 404 });
		},
	});
	const holder = join(scratch, "plans");
	const vault = join(holder, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	const env = { ARCHBOARD_URL: `http://127.0.0.1:${String(double.port)}` };

	const status = await archboard(["status"], holder, env);
	expect(status.status).toBe(3);
	const { conflict } = z
		.object({ running: z.literal(false), conflict: z.string() })
		.parse(JSON.parse(status.stdout));
	expect(conflict).toContain(elsewhere);
	expect(conflict).toContain(repoRoot);

	const board = { level: "system", nodes: [{ name: "Orders", kind: "service" }] };
	for (const [args, input] of [
		[["semantic", "new", "payments", "--doing", "drawing payments"], JSON.stringify(board)],
		[["start"], undefined],
		[["stop"], undefined],
		[["restart"], undefined],
	] as const) {
		const refused = await archboard(args, holder, env, input);
		expect(refused.status).toBe(3);
		expect(refused.stderr).toContain(elsewhere);
		expect(refused.stderr).toContain(repoRoot);
	}
	expect(contacts.every((contact) => contact === "GET /health")).toBeTrue();
	expect(readdirSync(vault)).toEqual([]);
}, 30_000);

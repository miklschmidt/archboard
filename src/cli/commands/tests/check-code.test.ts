// `archboard check --code` from its arguments to its streams and exit status
// (ADR 0046): it asks the plain check and then the code check route, prints
// both, and only a diagnostic or a warning fails it. Behind is information
// (ADR 0045), so a board many commits behind never does. Without `--code` the
// command never asks the code check route. Only the Archboard server is a
// stand-in.

import { afterAll, expect, spyOn, test } from "bun:test";
import {
	CodeCheckAnswerSchema,
	type CodeCheckAnswer,
	type CodeFinding,
} from "@/shared/code-check/index";
import {
	DEFAULT_SEMANTIC_POLICY,
	VaultCheckSchema,
	type VaultCheck,
} from "@/shared/semantic-policy/index";

const clean: VaultCheck = {
	policy: DEFAULT_SEMANTIC_POLICY,
	configurationValid: true,
	configurationFile: "config.yaml",
	fingerprint: "f",
	diagnostics: [],
};
const warned: VaultCheck = {
	...clean,
	diagnostics: [
		{
			severity: "warning",
			code: "BINDING_PATH_MISSING",
			file: "/vault/Orders.semantic.json",
			message: "Gone.",
		},
	],
};
const codeCheck: CodeCheckAnswer = {
	boards: [{ board: "Orders", variant: "v1", version: 4 }],
	findings: [],
	skipped: [{ reason: "no-current-variant", board: "Refunds" }],
	behind: [
		{
			board: "Orders",
			variant: "v1",
			lastChange: {
				kind: "commit",
				commit: "a".repeat(40),
				committedAt: "2026-10-01T00:00:00.000Z",
			},
			commits: [
				{
					repo: "github.com/test/orders",
					commit: "b".repeat(40),
					committedAt: "2026-10-02T00:00:00.000Z",
					subject: "change the ledger",
					files: 40,
					large: true,
				},
			],
			parts: [
				{
					subject: { kind: "node", id: "pL", name: "Ledger" },
					repo: "github.com/test/orders",
					path: "src/ledger.ts",
					commits: ["b".repeat(40)],
				},
			],
			skipped: [{ subject: { kind: "node", id: "pC", name: "Customer" }, reason: "unbound" }],
		},
	],
};

let service = "";
let plain = clean;
let answered = codeCheck;
const asked: string[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === "/health") return Response.json({ service, status: "ok" });
		asked.push(pathname);
		if (pathname === "/api/vault/check") return Response.json({ success: true, ...plain });
		if (pathname === "/api/vault/code-check") return Response.json({ success: true, ...answered });
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
const [config, client, { runCli }] = await Promise.all([
	import("@/runtime/engine/config"),
	import("@/runtime/engine/server-client"),
	import("@/cli/commands/run"),
]);
if (config.ARCHBOARD_URL !== url) {
	throw new Error(
		`The CLI loaded before this file pointed it at its stand-in server. Run it in its own process: bun test --isolate ${import.meta.path}`,
	);
}
service = client.ARCHBOARD_SERVICE_NAME;

afterAll(async () => {
	for (const [key, value] of Object.entries(environment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await server.stop(true);
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
	// A run that succeeds leaves the exit code as it found it, so each run starts from 0.
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

test("check --code asks the plain check, then the code check, and a board behind its code does not fail it", async () => {
	plain = clean;
	asked.length = 0;
	const { stdout, stderr, exited } = await run(["check", "--code"]);
	expect(exited).toBe(0);
	expect(asked).toEqual(["/api/vault/check", "/api/vault/code-check"]);
	const result = VaultCheckSchema.extend({ codeCheck: CodeCheckAnswerSchema }).parse(
		JSON.parse(stdout),
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.codeCheck).toEqual(codeCheck);
	const lines = stderr.split("\n");
	expect(lines.some((line) => line.includes("Orders") && line.includes("1"))).toBe(true);
	expect(lines.some((line) => line.includes("Ledger") && line.includes("src/ledger.ts"))).toBe(
		true,
	);
});

test("check --code fails when the plain check has a diagnostic", async () => {
	plain = warned;
	const { exited } = await run(["check", "--code"]);
	expect(exited).toBe(1);
});

test("check --code fails on a code check warning and never on information", async () => {
	plain = clean;
	const finding: CodeFinding = {
		severity: "warning",
		code: "ANCHOR_PATH_MISSING",
		file: "/vault/Orders.semantic.json",
		message: "Gone.",
	};
	try {
		answered = { ...codeCheck, findings: [finding] };
		expect((await run(["check", "--code"])).exited).toBe(1);
		answered = { ...codeCheck, findings: [{ ...finding, severity: "information" }] };
		expect((await run(["check", "--code"])).exited).toBe(0);
	} finally {
		answered = codeCheck;
	}
});

test("check without --code never asks the code check", async () => {
	plain = clean;
	asked.length = 0;
	const { stdout, exited } = await run(["check"]);
	expect(exited).toBe(0);
	expect(asked).toEqual(["/api/vault/check"]);
	expect(JSON.parse(stdout)).not.toHaveProperty("codeCheck");
});

// `archboard check --code` from its arguments to its streams and exit status
// (ADR 0046): it asks the plain check and then the code check route, prints
// both, and only a diagnostic or a warning fails it. Behind is information
// (ADR 0045), so a board many commits behind never does. Without `--code` the
// command never asks the code check route. `--variant` names the draft the
// route reads. Only the Archboard server is a stand-in.

import { afterAll, expect, spyOn, test } from "bun:test";
import { resolve } from "node:path";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { DEFAULT_SEMANTIC_POLICY, VaultCheckSchema } from "@archboard/board/policy";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";
import type { z } from "zod";

type VaultCheck = z.infer<typeof VaultCheckSchema>;

/** One finding of the code check. */
type CodeFinding = CodeCheckAnswer["findings"][number];

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
	timings: [
		{ check: "code-facts", elapsedMs: 12.5 },
		{
			check: "language-server",
			language: "typescript",
			project: ".",
			repo: "github.com/test/orders",
			elapsedMs: 42.5,
		},
		{ check: "history", elapsedMs: 8.5 },
	],
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

const vault = makeStandInVault();
let service = "";
let plain = clean;
let answered = codeCheck;
let refuseDraft = false;
const asked: string[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const asking = new URL(request.url);
		const { pathname } = asking;
		if (pathname === "/health") return Response.json({ service, status: "ok" });
		asked.push(vault.unnamed(asking));
		if (pathname === "/api/vault/check") return Response.json({ success: true, ...plain });
		if (pathname === "/api/vault/code-check" && refuseDraft) {
			return Response.json(
				{ success: false, code: "NO_SUCH_DRAFT", error: "No such draft." },
				{ status: 422 },
			);
		}
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
	import("@archboard/server-lifecycle/config"),
	import("@archboard/server-lifecycle/server-client"),
	import("#cli/operations/invocation/run.ts"),
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
	vault.restore();
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
		await runCli(vault.argv(argv));
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
	const result = VaultCheckSchema.extend({
		timings: CodeCheckAnswerSchema.shape.timings,
		codeCheck: CodeCheckAnswerSchema,
	}).parse(JSON.parse(stdout));
	expect(result.diagnostics).toEqual([]);
	expect(result.codeCheck).toEqual(codeCheck);
	expect(result.timings.map((timing) => timing.check)).toEqual([
		"board",
		"code-facts",
		"language-server",
		"history",
	]);
	const timed = stderr
		.split("\n")
		.filter((line) => line.endsWith(" ms"))
		.slice(0, result.timings.length);
	expect(timed.map((line) => Number(/: ([\d.]+) ms$/u.exec(line)?.[1]))).toEqual(
		result.timings.map((timing) => Number(timing.elapsedMs.toFixed(1))),
	);
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

test("check --code prints each finding with its subject and evidence, fails on a warning and never on information", async () => {
	plain = clean;
	const finding: CodeFinding = {
		severity: "warning",
		code: "ANCHOR_MISMATCH",
		file: "/vault/Orders.semantic.json",
		board: "Orders",
		variant: "v1",
		subject: { kind: "step", id: "s1", name: "Pay: Api -> Ledger: post" },
		message: "Elsewhere.",
		evidence: [
			{
				kind: "call",
				resolution: "candidate",
				repo: "github.com/test/orders",
				path: "src/api.ts",
				line: 12,
				symbol: "post",
			},
		],
	};
	try {
		answered = { ...codeCheck, findings: [finding] };
		const failed = await run(["check", "--code"]);
		expect(failed.exited).toBe(1);
		const lines = failed.stderr.split("\n");
		const at = lines.findIndex((line) => line.includes("Pay: Api -> Ledger: post"));
		expect(at).toBeGreaterThanOrEqual(0);
		expect(lines[at]?.split(": ").slice(0, 2)).toEqual([finding.severity, finding.code]);
		expect(lines[at + 1]).toContain("src/api.ts:12");
		answered = { ...codeCheck, findings: [{ ...finding, severity: "information" }] };
		const information = await run(["check", "--code"]);
		expect(information.exited).toBe(0);
		expect(
			information.stderr
				.split("\n")
				.some((line) => line.startsWith(`information: ${finding.code}: `)),
		).toBe(true);
	} finally {
		answered = codeCheck;
	}
});

test("--variant names the draft the code check reads, and a draft no board has is refused", async () => {
	plain = clean;
	asked.length = 0;
	expect((await run(["check", "--code", "--variant", "TASK-1"])).exited).toBe(0);
	expect(asked).toEqual(["/api/vault/check", "/api/vault/code-check?variant=TASK-1"]);
	refuseDraft = true;
	try {
		expect((await run(["check", "--code", "--variant", "TASK-0"])).exited).toBe(2);
	} finally {
		refuseDraft = false;
	}
	asked.length = 0;
	const alone = await run(["check", "--variant", "TASK-1"]);
	expect(alone.exited).not.toBe(0);
	expect(asked).toEqual([]);
});

test("--every-draft asks the code check for every draft, and is refused without --code or beside --variant", async () => {
	plain = clean;
	asked.length = 0;
	expect((await run(["check", "--code", "--every-draft"])).exited).toBe(0);
	expect(asked).toEqual(["/api/vault/check", "/api/vault/code-check?every-draft=true"]);
	asked.length = 0;
	expect((await run(["check", "--every-draft"])).exited).not.toBe(0);
	expect((await run(["check", "--code", "--every-draft", "--variant", "TASK-1"])).exited).not.toBe(
		0,
	);
	expect(asked).toEqual([]);
});

test("--plan names each plan JSON by its absolute path, and means nothing without --code", async () => {
	plain = clean;
	asked.length = 0;
	const named = await run([
		"check",
		"--code",
		"--plan",
		"infra/plan.json",
		"--plan",
		"/abs/plan.json",
	]);
	expect(named.exited).toBe(0);
	const query = new URL(`http://host${asked[1] ?? ""}`).searchParams;
	expect(query.getAll("plan")).toEqual([resolve("infra/plan.json"), "/abs/plan.json"]);
	asked.length = 0;
	expect((await run(["check", "--plan", "infra/plan.json"])).exited).not.toBe(0);
	expect(asked).toEqual([]);
});

test("check without --code never asks the code check", async () => {
	plain = clean;
	asked.length = 0;
	const { stdout, stderr, exited } = await run(["check"]);
	expect(exited).toBe(0);
	expect(asked).toEqual(["/api/vault/check"]);
	const result = VaultCheckSchema.extend({ timings: CodeCheckAnswerSchema.shape.timings }).parse(
		JSON.parse(stdout),
	);
	expect(JSON.parse(stdout)).not.toHaveProperty("codeCheck");
	expect(result.timings).toEqual([{ check: "board", elapsedMs: expect.any(Number) }]);
	expect(stderr.split("\n")[0]?.endsWith(`${result.timings[0]?.elapsedMs.toFixed(1)} ms`)).toBe(
		true,
	);
});

test("a skip that holds for a whole language says once which language and why, a checkout with no server says what configures one for each language, and one said for each project of a checkout names the checkout once", async () => {
	plain = clean;
	const detail = "typescript: tsc is not installed";
	const repo = "github.com/test/shop";
	const configure = (language: string) =>
		`${language}: no server is configured. Configure one with \`archboard repo language-server ${language} <command> --repo ${repo}\``;
	try {
		answered = {
			...codeCheck,
			skipped: [
				{ reason: "language-server-missing", detail },
				{ reason: "language-server-missing", repo, detail: configure("c") },
				{ reason: "language-server-missing", repo, detail: configure("python") },
				{ reason: "language-server-unready", repo, detail: "swift: the package a has no index" },
				{ reason: "language-server-unready", repo, detail: "swift: the package b has no index" },
			],
		};
		const { stderr, exited } = await run(["check", "--code"]);
		expect(exited).toBe(0);
		const lines = (reason: string) => stderr.split("\n").filter((line) => line.includes(reason));
		const missing = lines("language-server-missing");
		expect(missing).toHaveLength(2);
		expect(missing.join("\n")).toContain(detail);
		expect(missing.join("\n")).toContain(configure("c"));
		expect(missing.join("\n")).toContain(configure("python"));
		expect(missing.filter((line) => line.includes("skipped 1 checkout"))).toHaveLength(1);
		expect(lines("language-server-unready")).toHaveLength(1);
		expect(lines("language-server-unready")[0]?.split(repo)).toHaveLength(2);
	} finally {
		answered = codeCheck;
	}
});

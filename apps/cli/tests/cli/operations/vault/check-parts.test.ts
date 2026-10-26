// `archboard check` and its subcommands from their arguments to their streams
// and exit status (ADR 0057, ADR 0046): `check` and `check all` ask the
// semantics check and then the code check route and run the embeds check,
// `check semantics`, `check code` and `check embeds` run one each, the answer
// holds a part for each check that ran, and only a diagnostic or a warning
// fails it. Behind is information (ADR 0045), so a board many commits behind
// never does. `--variant`, `--every-draft` and `--plan` name what the code
// check reads, and only `check`, `check all` and `check embeds` take `--fix`.
// Only the Archboard server is a stand-in.

import { afterAll, expect, spyOn, test } from "bun:test";
import { resolve } from "node:path";
import { z } from "zod";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { DEFAULT_SEMANTIC_POLICY, VaultCheckSchema } from "@archboard/board/policy";
import type { CliRegistryEntry } from "#cli/protocol/routing/route.ts";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

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
const [config, { cliContractRegistry, runCli }] = await Promise.all([
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

const SEMANTICS_ROUTE = "/api/vault/check";
const CODE_ROUTE = "/api/vault/code-check";
const PartsSchema = z.object({
	semantics: VaultCheckSchema.extend({ timings: CodeCheckAnswerSchema.shape.timings }).optional(),
	code: CodeCheckAnswerSchema.optional(),
	embeds: z.object({ checkout: z.string().nullable(), embeds: z.array(z.string()) }).optional(),
});
/** The embeds part of a vault in no Git checkout: no file of it can be an embed. */
const NO_CHECKOUT = {
	checkout: null,
	embeds: [],
	tracked: [],
	vaults: [],
	findings: [],
	fixed: [],
};

/** The check commands that read `--fix`, as the registry declares them. */
const readsFix = (entry: CliRegistryEntry): boolean =>
	entry.contract.parameters.some(
		(parameter) => parameter.kind === "option" && parameter.spellings.includes("--fix"),
	);

/** The check commands that read the code check's options, as the registry declares them. */
const readsCodeOptions = (entry: CliRegistryEntry): boolean =>
	entry.contract.parameters.some(
		(parameter) => parameter.kind === "option" && parameter.spellings.includes("--variant"),
	);
const checkRoutes = () =>
	cliContractRegistry().filter(
		(entry) => entry.name === "check" || entry.name.startsWith("check "),
	);

test("check and check all ask the semantics check, then the code check, run the embeds check, and answer with one part for each", async () => {
	plain = clean;
	for (const argv of [["check"], ["check", "all"]]) {
		asked.length = 0;
		const { stdout, stderr, exited } = await run(argv);
		expect(exited).toBe(0);
		// The stand-in vault is in no Git checkout, so the embeds check has no file to ask about.
		expect(asked).toEqual([SEMANTICS_ROUTE, CODE_ROUTE]);
		const answer: unknown = JSON.parse(stdout);
		const result = PartsSchema.parse(answer);
		expect(Object.keys(result)).toEqual(["semantics", "code", "embeds"]);
		expect(answer).toHaveProperty("embeds", NO_CHECKOUT);
		expect(result.semantics?.diagnostics).toEqual([]);
		expect(result.code).toEqual(codeCheck);
		expect(result.semantics?.timings.map((timing) => timing.check)).toEqual(["board"]);
		const timed = stderr
			.split("\n")
			.filter((line) => line.endsWith(" ms"))
			.map((line) => Number(/: ([\d.]+) ms$/u.exec(line)?.[1]));
		expect(timed).toEqual(
			[...(result.semantics?.timings ?? []), ...(result.code?.timings ?? [])].map((timing) =>
				Number(timing.elapsedMs.toFixed(1)),
			),
		);
	}
});

test("a board behind its code is information and does not fail the check", async () => {
	plain = clean;
	const { stderr, exited } = await run(["check", "code"]);
	expect(exited).toBe(0);
	const lines = stderr.split("\n");
	expect(lines.some((line) => line.includes("Orders") && line.includes("1"))).toBe(true);
	expect(lines.some((line) => line.includes("Ledger") && line.includes("src/ledger.ts"))).toBe(
		true,
	);
});

test("check semantics asks only the semantics check and fills only its part", async () => {
	plain = clean;
	asked.length = 0;
	const { stdout, exited } = await run(["check", "semantics"]);
	expect(exited).toBe(0);
	expect(asked).toEqual([SEMANTICS_ROUTE]);
	const answer: unknown = JSON.parse(stdout);
	expect(Object.keys(PartsSchema.parse(answer))).toEqual(["semantics"]);
	expect(answer).not.toHaveProperty("code");
});

test("check code asks only the code check and fills only its part", async () => {
	plain = warned;
	asked.length = 0;
	const { stdout, exited } = await run(["check", "code"]);
	// The warning belongs to the semantics check, which this command did not run.
	expect(exited).toBe(0);
	expect(asked).toEqual([CODE_ROUTE]);
	const answer: unknown = JSON.parse(stdout);
	expect(Object.keys(PartsSchema.parse(answer))).toEqual(["code"]);
	expect(answer).not.toHaveProperty("semantics");
});

test("check embeds fills only its part, with or without --fix", async () => {
	plain = warned;
	for (const argv of [
		["check", "embeds"],
		["check", "embeds", "--fix"],
	]) {
		asked.length = 0;
		const { stdout, exited } = await run(argv);
		expect(exited).toBe(0);
		expect(asked).toEqual([]);
		const answer: unknown = JSON.parse(stdout);
		expect(Object.keys(PartsSchema.parse(answer))).toEqual(["embeds"]);
		expect(answer).toHaveProperty("embeds", NO_CHECKOUT);
	}
});

test("every check subcommand that does not declare --fix refuses it before asking the server", async () => {
	plain = clean;
	const others = checkRoutes().filter((entry) => entry.parent === "check" && !readsFix(entry));
	expect(others.map((entry) => entry.name).toSorted()).toEqual(["check code", "check semantics"]);
	for (const entry of others) {
		asked.length = 0;
		expect((await run([...entry.name.split(" "), "--fix"])).exited, entry.name).toBe(2);
		expect(asked).toEqual([]);
	}
	for (const argv of [
		["check", "--fix"],
		["check", "all", "--fix"],
	]) {
		expect((await run(argv)).exited).toBe(0);
	}
});

test("a command that ran the semantics check fails on its diagnostic, and one that did not does not", async () => {
	plain = warned;
	for (const argv of [["check"], ["check", "all"], ["check", "semantics"]]) {
		expect((await run(argv)).exited).toBe(1);
	}
	expect((await run(["check", "code"])).exited).toBe(0);
});

test("a finding prints with its subject and evidence, fails the code check on a warning and never on information", async () => {
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
		for (const argv of [["check"], ["check", "all"], ["check", "code"]]) {
			answered = { ...codeCheck, findings: [finding] };
			const failed = await run(argv);
			expect(failed.exited).toBe(1);
			const lines = failed.stderr.split("\n");
			const at = lines.findIndex((line) => line.includes("Pay: Api -> Ledger: post"));
			expect(at).toBeGreaterThanOrEqual(0);
			expect(lines[at]?.split(": ").slice(0, 2)).toEqual([finding.severity, finding.code]);
			expect(lines[at + 1]).toContain("src/api.ts:12");
			answered = { ...codeCheck, findings: [{ ...finding, severity: "information" }] };
			const information = await run(argv);
			expect(information.exited).toBe(0);
			expect(
				information.stderr
					.split("\n")
					.some((line) => line.startsWith(`information: ${finding.code}: `)),
			).toBe(true);
		}
		answered = { ...codeCheck, findings: [finding] };
		expect((await run(["check", "semantics"])).exited).toBe(0);
	} finally {
		answered = codeCheck;
	}
});

test("--variant, --every-draft and --plan reach the code check of check, check all and check code", async () => {
	plain = clean;
	for (const argv of [["check"], ["check", "all"], ["check", "code"]]) {
		asked.length = 0;
		expect((await run([...argv, "--variant", "TASK-1"])).exited).toBe(0);
		expect(asked.at(-1)).toBe(`${CODE_ROUTE}?variant=TASK-1`);
		asked.length = 0;
		expect((await run([...argv, "--every-draft"])).exited).toBe(0);
		expect(asked.at(-1)).toBe(`${CODE_ROUTE}?every-draft=true`);
		asked.length = 0;
		expect(
			(await run([...argv, "--plan", "infra/plan.json", "--plan", "/abs/plan.json"])).exited,
		).toBe(0);
		const query = new URL(`http://host${asked.at(-1) ?? ""}`).searchParams;
		expect(query.getAll("plan")).toEqual([resolve("infra/plan.json"), "/abs/plan.json"]);
	}
});

test("a draft no board has is refused, and --every-draft beside --variant is refused before the server", async () => {
	plain = clean;
	refuseDraft = true;
	try {
		for (const argv of [["check"], ["check", "all"], ["check", "code"]]) {
			expect((await run([...argv, "--variant", "TASK-0"])).exited).toBe(2);
		}
	} finally {
		refuseDraft = false;
	}
	for (const argv of [["check"], ["check", "all"], ["check", "code"]]) {
		asked.length = 0;
		expect((await run([...argv, "--every-draft", "--variant", "TASK-1"])).exited).toBe(2);
		expect(asked).toEqual([]);
	}
});

test("every other check subcommand refuses the code check's options before asking the server", async () => {
	const others = checkRoutes().filter(
		(entry) => entry.parent === "check" && !readsCodeOptions(entry),
	);
	expect(others.map((entry) => entry.name)).toContain("check semantics");
	for (const entry of others) {
		for (const option of [
			["--variant", "TASK-1"],
			["--every-draft"],
			["--plan", "infra/plan.json"],
		]) {
			asked.length = 0;
			expect((await run([...entry.name.split(" "), ...option])).exited, entry.name).toBe(2);
			expect(asked).toEqual([]);
		}
	}
});

test("--code is an unknown option of every check command, and a word that names no check is refused", async () => {
	for (const entry of checkRoutes()) {
		asked.length = 0;
		expect((await run([...entry.name.split(" "), "--code"])).exited, entry.name).toBe(2);
		expect(asked).toEqual([]);
	}
	asked.length = 0;
	expect((await run(["check", "nonesuch"])).exited).toBe(2);
	expect(asked).toEqual([]);
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
		const { stderr, exited } = await run(["check", "code"]);
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

// `archboard check` from its arguments to its two streams (TASK-367.03): the
// line for a diagnostic about one node or relationship names it, and the JSON
// answer carries its id. Only the Archboard server is a stand-in, answering
// what the vault checker would; the store owners prove the checker fills the
// subject in.

import { afterAll, expect, spyOn, test } from "bun:test";
import {
	DEFAULT_SEMANTIC_POLICY,
	VaultCheckSchema,
	type DiagnosticSubject,
	type SharedSymbol,
	type VaultCheck,
} from "@archboard/board/policy";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const ledger: DiagnosticSubject = { kind: "node", id: "AbCd", name: "Ledger" };
const sharedSymbol: SharedSymbol = {
	binding: { repo: "github.com/test/orders", path: "src/ledger.ts", symbol: "post" },
	parts: [
		{ board: "Orders", id: "AbCd", name: "Ledger", variants: ["v1"] },
		{ board: "Billing", id: "EfGh", name: "Ledger copy", variants: ["v2", "v3"] },
	],
};
const check: VaultCheck = {
	policy: DEFAULT_SEMANTIC_POLICY,
	configurationValid: true,
	configurationFile: "config.yaml",
	fingerprint: "f",
	diagnostics: [
		{
			severity: "warning",
			code: "BINDING_PATH_MISSING",
			file: "/vault/Orders.semantic.json",
			path: "variants.v1.content.nodes.AbCd.binding",
			board: "Orders",
			variant: "v1",
			subject: ledger,
			message: "Bound to a file that is gone.",
		},
		{
			severity: "warning",
			code: "SHARED_SYMBOL",
			file: "/vault/Orders.semantic.json",
			board: "Orders",
			variant: "v1",
			sharedSymbol,
			message: "Two parts bind one symbol.",
		},
		{
			severity: "error",
			code: "BOARD_UNREADABLE",
			file: "/vault/Broken.semantic.json",
			message: "Not a board.",
		},
	],
};

const vault = makeStandInVault();
let service = "";
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === "/health") return Response.json({ service, status: "ok" });
		if (pathname === "/api/vault/check") return Response.json({ success: true, ...check });
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
});

test("check names the subject beside its message, and its JSON answer carries the subject's id", async () => {
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
	let exited: typeof process.exitCode;
	try {
		await runCli(vault.argv(["check"]));
		exited = process.exitCode;
	} finally {
		out.mockRestore();
		err.mockRestore();
		process.exitCode = exitCode ?? 0;
	}
	expect(exited).toBe(1);
	expect(VaultCheckSchema.parse(JSON.parse(stdout)).diagnostics[0]?.subject).toEqual(ledger);
	// The machine-readable fields of a diagnostic survive the command's own schema.
	expect(
		VaultCheckSchema.parse(JSON.parse(stdout)).diagnostics.find(
			(one) => one.code === "SHARED_SYMBOL",
		)?.sharedSymbol,
	).toEqual(sharedSymbol);
	const [named, , plain] = check.diagnostics;
	const lines = stderr.split("\n");
	expect(lines.find((line) => line.includes(named?.message ?? "-"))).toContain(ledger.name);
	expect(lines.some((line) => line.includes(plain?.message ?? "-"))).toBe(true);
});

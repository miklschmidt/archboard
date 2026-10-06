import { expect, test } from "bun:test";
import { checkContract } from "@/cli/commands/vault";
import {
	DEFAULT_SEMANTIC_POLICY,
	diagnosticLine,
	type VaultCheck,
	type VaultDiagnostic,
} from "@/shared/semantic-policy/index";

const diagnostic: VaultDiagnostic = {
	severity: "warning",
	code: "BINDING_PATH_MISSING",
	file: "/vault/Orders.semantic.json",
	path: "variants.v1.content.nodes.AbCd.binding",
	board: "Orders",
	variant: "v1",
	subject: { kind: "node", id: "AbCd", name: "Ledger" },
	message: "Bound to a file that is gone.",
};
const check: VaultCheck = {
	policy: DEFAULT_SEMANTIC_POLICY,
	configurationValid: true,
	configurationFile: "config.yaml",
	fingerprint: "f",
	diagnostics: [diagnostic],
};

test("the machine-readable answer of check carries the subject id", () => {
	const answer = checkContract.result.parse(JSON.parse(JSON.stringify(check)));
	expect(answer.diagnostics[0]?.subject).toEqual({ kind: "node", id: "AbCd", name: "Ledger" });
});

test("a subject kind other than a node or a relationship is refused", () => {
	const flow = { ...diagnostic, subject: { kind: "flow", id: "x", name: "y" } };
	expect(checkContract.result.safeParse({ ...check, diagnostics: [flow] }).success).toBe(false);
});

test("a line names the subject beside the message, and a diagnostic without one is still a line", () => {
	const named = diagnosticLine(diagnostic);
	expect(named).toContain("Ledger");
	expect(named).toContain(diagnostic.message);
	expect(named).toContain(diagnostic.file);
	const { subject: _subject, ...plain } = diagnostic;
	const unnamed = diagnosticLine(plain);
	expect(unnamed).not.toContain("Ledger");
	expect(unnamed).toContain(plain.message);
});

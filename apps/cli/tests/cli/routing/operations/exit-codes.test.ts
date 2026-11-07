import { expect, test } from "bun:test";
import { exitCodeFor } from "#cli/routing/operations/exit-codes.ts";
import { defineCommand } from "#cli/contract/protocol/contract.ts";
import { proofContract } from "#tests/cli/support/command-contract/support.ts";

test("a revoked claim keeps its fallback exit status", () => {
	expect(exitCodeFor({ code: "CLAIM_REVOKED" })).toBe(5);
});

test("a command's declared refusal exit takes precedence over the fallback", () => {
	const contract = defineCommand({
		...proofContract({ result: null }),
		refusals: [
			{
				code: "CLAIM_REVOKED",
				exit: 2,
				stream: "stderr",
				description: "The command's recovery outcome",
			},
		],
	});
	expect(
		exitCodeFor({ code: "CLAIM_REVOKED" }, { contract, handlerOwner: import.meta.filename }),
	).toBe(2);
});

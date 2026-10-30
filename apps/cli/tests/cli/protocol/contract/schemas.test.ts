import { afterEach, describe, expect, test } from "bun:test";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import {
	cleanupCommandContractTest,
	proofContract,
} from "#tests/cli/support/command-contract/support.ts";

afterEach(cleanupCommandContractTest);

describe("command-contract schemas", () => {
	test("browser result schemas accept the protected server response shapes", async () => {
		const { PaneOpenResultSchema, ShowResultSchema } = await import("#cli/operations/pane/pane.ts");
		const pane = { paneId: "pane-2", clientId: "client-2", place: "right", position: 2 };
		expect(
			PaneOpenResultSchema.parse({
				success: true,
				pane,
				paneCount: 2,
				onScreen: [{ paneId: pane.paneId, place: pane.place, board: "payments" }],
			}),
		).toMatchObject({ paneCount: 2 });
		const shown = {
			success: true as const,
			model: "Payments",
			reading: { grammar: "architecture" },
			revision: { digest: "revision", files: [] },
			repository: "github.com/acme/payments",
			checkout: "/work/payments",
			paneId: "pane-2",
		};
		expect(ShowResultSchema.parse(shown)).toMatchObject(shown);
		expect(ShowResultSchema.safeParse({ ...shown, reading: undefined }).success).toBeFalse();
	});

	test("construction rejects token keys absent from the Zod ingress", () => {
		expect(() =>
			defineCommand({
				...proofContract({ result: null }),
				parameters: [
					{
						kind: "option",
						key: "missing",
						spellings: ["--missing"],
						value: "required",
						description: "missing",
					},
				],
			}),
		).toThrow("has no Zod ingress key");
	});
});

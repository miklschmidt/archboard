import { afterEach, describe, expect, test } from "bun:test";
import { defineCommand } from "../contract.js";
import { cleanupCommandContractTest, proofContract } from "./support.js";

afterEach(cleanupCommandContractTest);

describe("command-contract schemas", () => {
	test("browser result schemas accept the protected server response shapes", async () => {
		const { PaneOpenResultSchema, ShowResultSchema } = await import("../../commands/pane.js");
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
			board: "payments@proposed",
			identity: { board: "payments", variant: "proposed" },
			paneId: "pane-2",
		};
		expect(ShowResultSchema.parse(shown)).toMatchObject(shown);
		expect(ShowResultSchema.safeParse({ ...shown, identity: undefined }).success).toBeFalse();
	});

	test("named Zod schemas own migrated defaults, coercions and cross-field rules", async () => {
		const { ClaimInputSchema } = await import("../../commands/claim.js");

		expect(ClaimInputSchema.parse({ reason: "  redraw  ", for: "1.5m" })).toMatchObject({
			reason: "redraw",
			for: 90_000,
		});
		expect(ClaimInputSchema.safeParse({ reason: "", for: "5" }).success).toBeFalse();
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

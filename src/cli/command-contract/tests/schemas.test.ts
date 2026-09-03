import { afterEach, describe, expect, test } from "bun:test";
import { defineCommand } from "../contract.js";
import { cleanupCommandContractTest, proofContract } from "./support.js";

afterEach(cleanupCommandContractTest);

describe("command-contract schemas", () => {
	test("board and browser result schemas accept the protected server response shapes", async () => {
		const { BoardInfoResultSchema, BoardNewResultSchema, BrowserShowResultSchema } =
			await import("../../commands/board.js");
		const { PaneOpenResultSchema } = await import("../../commands/pane.js");
		const identityState = {
			board: "payments",
			identity: {
				board: "payments",
				variant: "current",
				level: "system",
				displayName: "Payments",
			},
			elementCount: 4,
			version: 7,
			placeholder: false,
			file: "/vault/payments.excalidraw.md",
			savedAt: "2026-08-26T10:00:00.000Z",
			loadedAt: "2026-08-26T09:00:00.000Z",
		};
		const pane = { paneId: "pane-2", clientId: "client-2", place: "right", position: 2 };
		const info = { success: true as const, ...identityState };
		const created = {
			...info,
			version: 1,
			elementCount: 0,
			created: true as const,
			saved: true as const,
		};
		const opened = { ...info, source: "vault" as const, pane };
		expect(BoardInfoResultSchema.parse(info)).toEqual(info);
		expect(BoardNewResultSchema.parse(created)).toEqual(created);
		expect(BrowserShowResultSchema.parse(opened)).toEqual(opened);
		expect(
			PaneOpenResultSchema.parse({
				success: true,
				pane,
				paneCount: 2,
				onScreen: [{ paneId: pane.paneId, place: pane.place, board: "payments" }],
			}),
		).toMatchObject({ paneCount: 2 });
		expect(BoardInfoResultSchema.safeParse({ ...info, version: undefined }).success).toBeFalse();
		expect(
			BoardInfoResultSchema.safeParse({ ...info, placeholder: undefined }).success,
		).toBeFalse();
		expect(BoardNewResultSchema.safeParse(info).success).toBeFalse();
		expect(BrowserShowResultSchema.safeParse(info).success).toBeFalse();
	});

	test("named Zod schemas own migrated defaults, coercions, enums, and cross-field rules", async () => {
		const { ScreenshotInputSchema } = await import("../../commands/scene.js");
		const { ChangesInputSchema } = await import("../../commands/changes.js");
		const { ClaimInputSchema } = await import("../../commands/claim.js");
		const { LibraryInsertStageSchema } = await import("../../commands/library.js");
		const { ArrangeAlignStageSchema, ArrangeDistributeStageSchema, ArrangeDuplicateStageSchema } =
			await import("../../commands/arrange.js");

		expect(ScreenshotInputSchema.parse({ pane: "left" }).format).toBe("png");
		expect(ScreenshotInputSchema.safeParse({ pane: "left", format: "pdf" }).success).toBeFalse();
		expect(ScreenshotInputSchema.safeParse({}).success).toBeFalse();
		expect(ChangesInputSchema.parse({ since: "4" }).since).toBe(4);
		expect(ChangesInputSchema.parse({}).since).toBe(0);
		expect(ChangesInputSchema.safeParse({ since: "before" }).success).toBeFalse();
		expect(ClaimInputSchema.parse({ reason: "  redraw  ", for: "1.5m" })).toMatchObject({
			reason: "redraw",
			for: 90_000,
		});
		expect(ClaimInputSchema.safeParse({ reason: "", for: "5" }).success).toBeFalse();
		expect(LibraryInsertStageSchema.parse({ name: "Queue", x: "10.5", y: "-2" })).toMatchObject({
			name: "Queue",
			x: 10.5,
			y: -2,
		});
		expect(
			LibraryInsertStageSchema.safeParse({ name: "Queue", x: "x", y: "2" }).success,
		).toBeFalse();
		expect(ArrangeAlignStageSchema.parse({ ids: "a, b", to: "left" })).toEqual({
			ids: ["a", "b"],
			alignment: "left",
		});
		expect(
			ArrangeDistributeStageSchema.safeParse({ ids: "a,b", to: "diagonal" }).success,
		).toBeFalse();
		expect(ArrangeDuplicateStageSchema.parse({ ids: "a" })).toEqual({
			ids: ["a"],
			offsetX: 20,
			offsetY: 20,
		});
		expect(ArrangeDuplicateStageSchema.parse({ ids: "a", offset: "4,-3" })).toEqual({
			ids: ["a"],
			offsetX: 4,
			offsetY: -3,
		});
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

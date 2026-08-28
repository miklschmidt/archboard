import { afterEach, describe, expect, test } from "bun:test";
import { defineCommand } from "../contract.js";
import { cleanupCommandContractTest, proofContract } from "./support.js";

afterEach(cleanupCommandContractTest);

describe("command-contract schemas", () => {
	test("board and injection result schemas accept the protected server response shapes", async () => {
		const { BoardInfoResultSchema, BoardNewResultSchema, BoardOpenResultSchema } =
			await import("../../commands/board.js");
		const { PaneOpenResultSchema } = await import("../../commands/pane.js");
		const { InjectStatusResultSchema, InjectTestResultSchema } =
			await import("../../commands/inject.js");
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
			version: null,
			elementCount: 0,
			created: true as const,
			saved: false as const,
			pane: null,
		};
		const opened = { ...info, source: "vault" as const, pane };
		expect(BoardInfoResultSchema.parse(info)).toEqual(info);
		expect(BoardNewResultSchema.parse(created)).toEqual(created);
		expect(BoardOpenResultSchema.parse(opened)).toEqual(opened);
		expect(
			PaneOpenResultSchema.parse({
				success: true,
				pane,
				paneCount: 2,
				onScreen: [{ paneId: pane.paneId, place: pane.place, board: "payments" }],
				board: opened,
			}),
		).toMatchObject({ board: { version: 7, placeholder: false, source: "vault" } });
		expect(BoardInfoResultSchema.safeParse({ ...info, version: undefined }).success).toBeFalse();
		expect(
			BoardInfoResultSchema.safeParse({ ...info, placeholder: undefined }).success,
		).toBeFalse();
		expect(BoardNewResultSchema.safeParse(info).success).toBeFalse();
		expect(BoardOpenResultSchema.safeParse(info).success).toBeFalse();

		const injectionStatus = {
			enabled: true,
			armed: true,
			loud: false,
			refusal: null,
			host: "127.0.0.1",
			socket: {
				path: "/tmp/app-server.sock",
				exists: true,
				isSocket: true,
				ownedByUs: true,
				mode: "600",
			},
			connected: true,
			lastError: null,
			target: {
				threadId: "thread-1",
				reason: "pinned" as const,
				explanation: "the fixture thread is pinned",
				activeTurnId: null,
			},
			threadsSeen: 1,
			pending: 0,
			debounceMs: 200,
			minIntervalMs: 500,
			injected: { quiet: 2, loud: 1, failed: 0 },
			lastInjectionAt: "2026-08-26T10:01:00.000Z",
			lastInjection: {
				channel: "quiet" as const,
				threadId: "thread-1",
				at: "2026-08-26T10:01:00.000Z",
				text: "fixture change",
			},
		};
		expect(InjectStatusResultSchema.parse(injectionStatus)).toEqual(injectionStatus);
		expect(
			InjectTestResultSchema.parse({ channel: "loud", threadId: "thread-1", text: "probe" }),
		).toEqual({ channel: "loud", threadId: "thread-1", text: "probe" });
		expect(
			InjectStatusResultSchema.safeParse({ held: { board: "x", message: "held" } }).success,
		).toBeFalse();
		expect(InjectTestResultSchema.safeParse({ channel: "quiet" }).success).toBeFalse();
	});

	test("named Zod schemas own migrated defaults, coercions, enums, and cross-field rules", async () => {
		const { ScreenshotInputSchema } = await import("../../commands/scene.js");
		const { ChangesInputSchema } = await import("../../commands/changes.js");
		const { ClaimInputSchema } = await import("../../commands/claim.js");
		const { LibraryInsertStageSchema } = await import("../../commands/library.js");
		const { ArrangeAlignStageSchema, ArrangeDistributeStageSchema, ArrangeDuplicateStageSchema } =
			await import("../../commands/arrange.js");

		expect(ScreenshotInputSchema.parse({}).format).toBe("png");
		expect(ScreenshotInputSchema.safeParse({ format: "pdf" }).success).toBeFalse();
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

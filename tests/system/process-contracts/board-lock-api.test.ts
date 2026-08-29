import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { openTestPane, waitForPaneMessage } from "../boards/support/pane-websocket.ts";
import { sanitizedEnvironment } from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
type LockElementView = Pick<ExcalidrawElement, "id">;
const box = (id: string, x = 0) => ({ id, type: "rectangle", x, y: 0, width: 20, height: 20 });

test("public lock API preserves holds, claims, refusals, and told-once recovery", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-lock-api-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: sanitizedEnvironment(root, vault),
	});
	resources.defer(() => canvas.dispose());
	const request = createJsonRequester(canvas);
	const pane = await openTestPane(canvas.base, request, "pane-lock-owner", 0);
	resources.defer(() => pane.close());
	try {
		expect(pane.seen.find((message) => message.type === "board_lock")).toMatchObject({
			board: "scratch",
			held: false,
		});
		const heldStart = pane.since();
		const held = await request<{ created: boolean; holder: { kind: string } }>(
			"/api/boards/hold?board=scratch",
			{ method: "POST", body: { clientId: pane.clientId } },
		);
		expect(held.status).toBe(200);
		expect(held.body).toMatchObject({ created: true, holder: { kind: "human" } });
		expect(await waitForPaneMessage(pane, heldStart, "board_lock")).toMatchObject({
			held: true,
			holder: { id: pane.clientId },
		});
		const joined = await request("/api/elements/changes?board=scratch", {
			method: "POST",
			body: { clientId: pane.clientId, upserts: [box("held")], deletes: [] },
		});
		expect(joined.status).toBe(200);
		const renewed = await request<{ created: boolean }>("/api/boards/hold?board=scratch", {
			method: "POST",
			body: { clientId: pane.clientId },
		});
		expect(renewed.body.created).toBeFalse();

		const timer = setInterval(() => {
			void request("/api/boards/hold?board=scratch", {
				method: "POST",
				body: { clientId: pane.clientId },
			});
		}, 800);
		resources.defer(() => clearInterval(timer));
		const started = Date.now();
		const denied = await request<{
			code: string;
			error: string;
			holder: { id: string };
			document: LockElementView[];
			version: number;
		}>("/api/elements?board=scratch", { method: "POST", body: box("denied") });
		clearInterval(timer);
		expect(denied.status).toBe(409);
		expect(denied.body.code).toBe("BOARD_HELD");
		expect(denied.body.holder.id).toBe(pane.clientId);
		expect(denied.body.error).toMatch(/held by the person at the canvas, since/);
		expect(Date.now() - started).toBeGreaterThanOrEqual(4_800);
		const read = await request<{ elements: LockElementView[] }>("/api/elements?board=scratch");
		const info = await request<{ version: number }>("/api/boards/info?board=scratch");
		expect(denied.body.document).toEqual(read.body.elements);
		expect(denied.body.version).toBe(info.body.version);
		expect(read.status).toBe(200);
		expect(
			(
				await request("/api/boards/open", {
					method: "POST",
					body: { board: "scratch", reload: true },
				})
			).status,
		).toBe(200);
		const freeStart = pane.since();
		expect(
			(
				await request<{ released: boolean }>("/api/boards/hold/release?board=scratch", {
					method: "POST",
					body: { clientId: pane.clientId },
				})
			).body.released,
		).toBeTrue();
		expect(await waitForPaneMessage(pane, freeStart, "board_lock", 2_000)).toMatchObject({
			held: false,
		});

		await request("/api/boards/hold?board=scratch", {
			method: "POST",
			body: { clientId: "other-pane" },
		});
		const otherRenewal = setInterval(() => {
			void request("/api/boards/hold?board=scratch", {
				method: "POST",
				body: { clientId: "other-pane" },
			});
		}, 800);
		resources.defer(() => clearInterval(otherRenewal));
		const otherDenied = await request<{ holder: { id: string } }>(
			"/api/elements/changes?board=scratch",
			{ method: "POST", body: { clientId: pane.clientId, upserts: [box("other")], deletes: [] } },
		);
		clearInterval(otherRenewal);
		expect(otherDenied.status).toBe(409);
		expect(otherDenied.body.holder.id).toBe("other-pane");
		await request("/api/boards/hold/release?board=scratch", {
			method: "POST",
			body: { clientId: "other-pane" },
		});

		const reason = "redrawing the payment path";
		const claim = await request<{ claim: { holder: { reason: string; claimed: boolean } } }>(
			"/api/boards/claim?board=scratch",
			{ method: "POST", body: { reason } },
		);
		expect(claim.status).toBe(200);
		expect(claim.body.claim.holder).toMatchObject({ claimed: true, reason });
		for (let index = 0; index < 20; index += 1) {
			expect(
				(
					await request("/api/elements?board=scratch", {
						method: "POST",
						body: box(`claim-${index}`, index * 30),
					})
				).status,
			).toBe(200);
		}
		expect(
			(
				await request("/api/boards/hold?board=scratch", {
					method: "POST",
					body: { clientId: pane.clientId },
				})
			).status,
		).toBe(200);
		await request("/api/boards/hold/release?board=scratch", {
			method: "POST",
			body: { clientId: pane.clientId },
		});
		const revoked = await request<{
			code: string;
			error: string;
			document: LockElementView[];
			version: number;
		}>("/api/boards/claim?board=scratch", {
			method: "POST",
			body: { reason: "carrying on" },
		});
		expect(revoked.status).toBe(409);
		expect(revoked.body.code).toBe("CLAIM_REVOKED");
		expect(revoked.body.error).toContain("nothing was undone");
		const afterRead = await request<{ elements: LockElementView[] }>("/api/elements?board=scratch");
		const afterInfo = await request<{ version: number }>("/api/boards/info?board=scratch");
		expect(revoked.body.document).toEqual(afterRead.body.elements);
		expect(revoked.body.version).toBe(afterInfo.body.version);
		expect(
			afterRead.body.elements.filter((element) => /^claim-\d+$/.test(element.id)),
		).toHaveLength(20);
		expect(
			(
				await request("/api/elements?board=scratch", {
					method: "POST",
					body: box("ordinary"),
				})
			).status,
		).toBe(200);
		expect(
			(
				await request<{ released: boolean }>("/api/boards/claim/release?board=scratch", {
					method: "POST",
				})
			).body.released,
		).toBeFalse();

		for (const [path, body] of [
			["/api/boards/claim", { reason: "anything" }],
			["/api/boards/claim?board=scratch", {}],
			["/api/boards/hold?board=scratch", {}],
		] as const)
			expect((await request(path, { method: "POST", body })).status).toBe(400);
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);

import { expect, test } from "bun:test";
import { join } from "node:path";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionRecords as records,
	productionSnapshot as snapshots,
	productionLeaseTarget as leaseTarget,
	productionPane as pane,
} from "./support/codex-production.ts";
import { createRequester, waitFor } from "./support/http.ts";
const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

test("live voice receives selection and board switches from production pane routes", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		const canvas = await startOwnedCanvas({
			serverPath,
			vault: fixture.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
				XDG_STATE_HOME: join(fixture.root, "state"),
			},
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		const socket = await openApplicationSocket(canvas.base, "voice-client");
		resources.defer(() => socket.close());
		const registration = pane("voice-client", "voice-pane", true, true);
		expect(
			(await request("/api/panes", { method: "POST", doing: false, body: registration })).status,
		).toBe(200);
		expect(await socket.request("connect")).toMatchObject({ ok: true });
		const command = async (name: string, extra: Record<string, unknown> = {}) =>
			socket.request("command", {
				command: {
					kind: "browser_command",
					command: name,
					...leaseTarget(await socket.request("claimLease")),
					...extra,
				},
			});
		expect(await command("threadLinkCreate")).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const link = snapshots(await socket.request("snapshot"))["threadLink"] as Record<
			string,
			unknown
		>;
		expect(await socket.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
		expect(
			await command("realtimeStart", { threadId: link["threadId"], sdp: "v=0" }),
		).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const updates = () =>
			records(fixture.logPath)
				.filter((entry) => entry.method === "thread/realtime/appendText")
				.flatMap((entry) => {
					const text = entry.params?.["text"];
					if (typeof text !== "string" || !text.startsWith("{")) return [];
					const callback = JSON.parse(text);
					return callback.semantic ? [JSON.parse(callback.semantic.brief)] : [];
				});
		const selected = await request<{ element: { id: string } }>("/api/elements?board=scratch", {
			method: "POST",
			body: { type: "rectangle", x: 0, y: 0, width: 100, height: 60 },
		});
		expect(selected.status).toBe(200);
		const ids = [selected.body.element.id];
		expect(
			(
				await request("/api/selection", {
					method: "POST",
					doing: false,
					body: { clientId: "voice-client", elementIds: ids },
				})
			).status,
		).toBe(200);
		await waitFor(
			() => updates().some((brief) => brief.selection[0] === ids[0]),
			"selected elements to reach live voice",
			{ timeoutMs: 2000 },
		);
		expect(updates().at(-1)).toMatchObject({
			board: { key: "scratch" },
			pane: { paneId: "voice-pane" },
			selection: ids,
		});
		expect(
			(await request("/api/boards/new", { method: "POST", body: { board: "payments@proposal" } }))
				.status,
		).toBe(200);
		expect(
			(
				await request("/api/boards/open", {
					method: "POST",
					body: { board: "payments@proposal", pane: "primary" },
				})
			).status,
		).toBe(200);
		await waitFor(
			() => updates().some((brief) => brief.board.key === "payments@proposal"),
			"switched board to reach live voice",
			{ timeoutMs: 2000 },
		);
		expect(updates().at(-1)).toMatchObject({ board: { key: "payments@proposal" }, selection: [] });
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: { ...registration, board: "payments@proposal", focused: false },
				})
			).status,
		).toBe(200);
		await waitFor(
			() => updates().some((brief) => brief.pane.focused === false),
			"pane focus to reach live voice",
			{ timeoutMs: 2000 },
		);
	} finally {
		await resources.disposeAsync();
	}
}, 15000);

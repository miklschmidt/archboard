import { expect, test } from "bun:test";
import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionRecords as records,
	productionSnapshot as snapshots,
	productionLeaseTarget as leaseTarget,
	productionPane as pane,
} from "./support/codex-production.ts";
import { createRequester, sleep, waitFor } from "./support/http.ts";
import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@/shared/semantic-pane-context";

// Long enough for news to be told: a sentence follows its write within a few milliseconds.
const NEWS_SETTLE_MS = 600;
/** The coordinator thread as the fake Codex names it on the wire: the first thread started. */
const COORDINATOR_WIRE_THREAD = "thread-1";
/** The workhorse thread as the fake Codex names it on the wire: the second thread started. */
const WORKHORSE_WIRE_THREAD = "thread-2";
const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");
const repoRoot = resolve(import.meta.dir, "../../..");

/**
 * The text of the one developer message a `thread/inject_items` call carries.
 * @param items The call's items.
 * @returns The text.
 */
function developerText(items: unknown): string {
	const [item] = items as { content: { text: string }[] }[];
	return item?.content[0]?.text ?? "";
}

// An outside change (TASK-293.06): a board write or a pane switch by an agent that is neither this
// tab's workhorse nor its coordinator. Neither model asked for it, and what they hold about the
// board stops being true, so both are told: the voice model quietly, the coordinator as context
// in its thread that starts no turn. What the session did itself, and a write to a board no pane
// shows, reach nobody. The session hears the vault its pane is in, follows the pane into another
// vault, and still hears that vault while a reload has closed the pane.
test("live voice and its coordinator are told what another agent did to a board on screen, and nothing of what they did themselves", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		const server = await startOwnedServer({
			serverPath,
			vault: fixture.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
				XDG_STATE_HOME: join(fixture.root, "state"),
			},
		});
		resources.defer(() => server.dispose());
		const request = createRequester(server);
		const socket = await openApplicationSocket(server.base, "voice-client");
		resources.defer(() => socket.close());
		for (const board of ["scratch", "payments"]) {
			const created = await request<{ board: { version: number } }>("/api/semantic-boards/create", {
				method: "POST",
				doing: `starting ${board}`,
				body: { board, create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }] } },
			});
			expect(created.status).toBe(200);
		}
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
		expect(await command("threadLinkCreate")).toMatchObject({ ok: true });
		const link = snapshots(await socket.request("snapshot"))["threadLink"] as Record<
			string,
			unknown
		>;
		expect(await socket.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
		expect(
			await command("realtimeStart", { threadId: link["threadId"], sdp: "v=0" }),
		).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		// The two threads that are this session, as each one's board context names it: what an
		// agent states with --as-session.
		const live = snapshots(await socket.request("snapshot"));
		const workhorse = String(link["threadId"]);
		const coordinator = String((live["coordinator"] as Record<string, unknown>)["threadId"]);
		expect(workhorse).not.toBe(coordinator);

		const from = records(fixture.logPath).length;
		const frames = (method: string) =>
			records(fixture.logPath)
				.slice(from)
				.filter((entry) => entry.kind === "frame" && entry.method === method);
		// What the voice was told, leaving out the board catalogue, which has its own channel.
		const voiced = (): string[] =>
			frames("thread/realtime/appendText")
				.map((entry) => entry.params?.["text"])
				.filter((text): text is string => typeof text === "string")
				.filter((text) => !text.includes("archboard_board_catalogue"));
		// What the coordinator thread was given, leaving out the catalogue again.
		const injected = (): string[] =>
			frames("thread/inject_items")
				.filter((entry) => entry.params?.["threadId"] === COORDINATOR_WIRE_THREAD)
				.map((entry) => JSON.stringify(entry.params?.["items"]))
				.filter((items) => !items.includes("Available Archboard boards"));
		const versions = new Map([
			["scratch", 1],
			["payments", 1],
		]);
		const edit = async (node: string, session: string | null, board = "scratch") => {
			const written = await request<{ board: { version: number } }>(
				`/api/semantic-boards/edit?expectVersion=${versions.get(board) ?? 0}`,
				{
					method: "POST",
					doing: `adding ${node}`,
					body: {
						board,
						edit: { nodes: [{ name: node, kind: "service" }] },
						...(session === null ? {} : { session }),
					},
				},
			);
			expect(written.status).toBe(200);
			versions.set(board, written.body.board.version);
		};
		// A board of the same name in a vault no pane of this tab is in is not its news either.
		const elsewhere = join(fixture.root, "elsewhere");
		mkdirSync(elsewhere);
		const other = await request("/api/semantic-boards/create", {
			method: "POST",
			vault: elsewhere,
			doing: "starting scratch elsewhere",
			body: {
				board: "scratch",
				create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }] },
			},
		});
		expect(other.status).toBe(200);
		const otherEdit = await request("/api/semantic-boards/edit?expectVersion=1", {
			method: "POST",
			vault: elsewhere,
			doing: "adding Elsewhere",
			body: { board: "scratch", edit: { nodes: [{ name: "Elsewhere", kind: "service" }] } },
		});
		expect(otherEdit.status).toBe(200);
		// The session's own writes, by either of its threads; a write to a board no pane shows;
		// then one nobody attributed, which is the one that is news.
		await edit("Orders", workhorse);
		await edit("Billing", coordinator);
		await edit("Refunds", null, "payments");
		await edit("Ledger", null);
		await waitFor(() => voiced().length === 1, "the outside write to reach live voice", {
			timeoutMs: 2000,
		});
		await sleep(NEWS_SETTLE_MS);
		expect(voiced()).toHaveLength(1);
		const [sentence = ""] = voiced();
		expect(sentence).toContain("scratch");
		expect(sentence).toContain("adding Ledger");
		expect(sentence).not.toContain("{");
		expect(sentence).not.toMatch(/\buser\b/u);
		// The coordinator got the same sentence, as context in its thread, and no turn.
		expect(injected()).toHaveLength(1);
		expect(injected()[0]).toContain(JSON.stringify(sentence).slice(1, -1));
		expect(frames("turn/start")).toEqual([]);

		// A drill-down is the pane's own: the server still points it at scratch, and only the pane
		// says it now reads payments. A write to the board on screen is news all the same.
		const drilled = await request<{
			board: { version: number; variants: Array<{ id: string; name: string; lifecycle: string }> };
		}>("/api/semantic-boards/board?board=payments");
		const [shown] = drilled.body.board.variants;
		expect(
			(
				await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
					method: "POST",
					doing: false,
					body: {
						paneId: "voice-pane",
						clientId: "voice-client",
						board: { name: "payments", key: "payments" },
						variant: { id: shown?.id, name: shown?.name, lifecycle: shown?.lifecycle },
						view: null,
						selection: [],
						version: drilled.body.board.version,
						at: new Date().toISOString(),
						sequence: 0,
					},
				})
			).status,
		).toBe(200);
		await edit("Payouts", null, "payments");
		await waitFor(() => voiced().length === 2, "a write to the drilled-into board to reach voice", {
			timeoutMs: 2000,
		});
		expect(voiced()[1]).toContain("payments");

		// The session's own show tells nobody; another agent's show of the pane is told to both,
		// worded so it never credits the user. Through the command line, which is what says a show
		// is an agent's and which session made it: the page's own shows name no agent.
		const show = (board: string, session: string | null, vault = fixture.vault) =>
			runServerCli({
				repoRoot,
				vault,
				base: server.base,
				args: [
					"browser",
					"show",
					board,
					"--pane",
					"primary",
					...(session === null ? [] : ["--as-session", session]),
				],
				input: undefined,
			});
		const own = show("payments", workhorse);
		expect(own.status, own.stderr).toBe(0);
		const outside = show("scratch", null);
		expect(outside.status, outside.stderr).toBe(0);
		await waitFor(() => voiced().length === 3, "the agent's show to reach live voice", {
			timeoutMs: 2000,
		});
		await sleep(NEWS_SETTLE_MS);
		expect(voiced()).toHaveLength(3);
		const switched = voiced()[2] ?? "";
		expect(switched).toContain("payments");
		expect(switched).toContain("scratch");
		expect(switched).not.toMatch(/\buser\b/u);
		expect(injected()).toHaveLength(3);
		expect(frames("turn/start")).toEqual([]);

		// An agent shows the pane a board of another vault. The coordinator's board catalogue
		// follows the pane into that vault, and names it.
		const catalogueVaults = (): unknown[] =>
			frames("thread/inject_items")
				.filter((entry) => entry.params?.["threadId"] === COORDINATOR_WIRE_THREAD)
				.map((entry) => developerText(entry.params?.["items"]))
				.filter((text) => text.startsWith("Available Archboard boards"))
				.map(
					(text) => (JSON.parse(text.slice(text.indexOf("\n") + 1)) as { vault: unknown }).vault,
				);
		const cataloguedBefore = catalogueVaults().length;
		const away = show("scratch", null, elsewhere);
		expect(away.status, away.stderr).toBe(0);
		await waitFor(
			() => catalogueVaults().length > cataloguedBefore,
			"the catalogue of the vault the pane moved into to reach the coordinator",
			{ timeoutMs: 2000 },
		);
		expect(catalogueVaults().slice(cataloguedBefore)).toEqual([realpathSync(elsewhere)]);

		// A reload closes every pane of the tab for a moment. Another agent's write meanwhile to a
		// board of the vault the tab was in still reaches its workhorse as context; a write to a
		// board of the same name in another vault does not.
		const workhorseVaults = (): unknown[] =>
			frames("thread/inject_items")
				.filter((entry) => entry.params?.["threadId"] === WORKHORSE_WIRE_THREAD)
				.map((entry) => {
					const context = JSON.parse(developerText(entry.params?.["items"])) as {
						semantic: { brief: string };
					};
					return (JSON.parse(context.semantic.brief) as { board: { vault: unknown } }).board.vault;
				});
		const toldBefore = workhorseVaults().length;
		await socket.close();
		await waitFor(
			async () => (await request<{ paneCount: number }>("/api/panes")).body.paneCount === 0,
			"the tab's pane to leave the server",
		);
		await edit("Reconciler", null);
		const elsewhereWhileClosed = await request("/api/semantic-boards/edit?expectVersion=2", {
			method: "POST",
			vault: elsewhere,
			doing: "adding Faraway",
			body: { board: "scratch", edit: { nodes: [{ name: "Faraway", kind: "service" }] } },
		});
		expect(elsewhereWhileClosed.status).toBe(200);
		await waitFor(
			() => workhorseVaults().length > toldBefore,
			"the write while the tab reloads to reach its workhorse",
			{ timeoutMs: 2000 },
		);
		await sleep(NEWS_SETTLE_MS);
		expect(workhorseVaults().slice(toldBefore)).toEqual([realpathSync(elsewhere)]);
	} finally {
		await resources.disposeAsync();
	}
}, 45_000);

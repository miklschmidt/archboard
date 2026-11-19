// Which pane a caller means and what the panes report, read off the pane registry.
//
// Each pane here is real to the registry the way a browser's is: a socket presents it through the
// pane socket handler, and it reports itself as the pane route takes it. So a report is taken only
// from a pane a socket owns, as in the server.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { ModelDocument } from "@archboard/model-contract";
import type { PaneRegistration } from "#server/panes/rules/pane-layout.ts";
import { closePane, registerPane } from "#server/panes/services/pane-arrivals.ts";
import {
	forgetSemanticPaneContexts,
	recordSemanticPaneContext,
} from "#server/panes/services/context.ts";
import { closeBrowserOwners } from "#server/panes/services/pane-sockets.ts";
import { panesReport } from "#server/panes/services/panes-report.ts";
import { paneFromRequest } from "#server/panes/services/registry.ts";
import { acceptPaneSocket } from "#server/panes/sockets/pane-socket.ts";

const scratch = mkdtempSync(join(tmpdir(), "archboard-panes-on-screen-"));
const VAULT = join(scratch, "vault");
const caller = process.env["ARCHBOARD_REPOS"];
let http: Server;
let sockets: WebSocketServer;
let address = "";
const browsers = new Set<WebSocket>();

beforeAll(async () => {
	// The registry of repositories is read to name a pane's repository; this one is empty.
	process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
	http = createServer();
	sockets = new WebSocketServer({ server: http });
	sockets.on("connection", (ws, req) => void acceptPaneSocket(ws, req, VAULT));
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
	const bound = http.address();
	address = typeof bound === "object" && bound !== null ? `ws://127.0.0.1:${bound.port}` : "";
});

afterEach(async () => {
	for (const browser of browsers) browser.terminate();
	browsers.clear();
	forgetSemanticPaneContexts();
	await closeBrowserOwners(sockets.clients);
});

afterAll(async () => {
	sockets.close();
	await new Promise((resolve) => http.close(resolve));
	if (caller === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Present one pane as a browser does: open its socket, hear which model it is on, then report it.
 * @param clientId Its client id.
 * @param extra What else it says of itself.
 * @returns The registration it reported.
 */
async function present(
	clientId: string,
	extra: Partial<PaneRegistration> = {},
): Promise<PaneRegistration> {
	const browser = new WebSocket(`${address}/?clientId=${clientId}&reading=canonical`);
	browsers.add(browser);
	// The model it is on. The server's socket owns the pane once that message has left it, which is
	// before this end hears it.
	await new Promise((resolve, reject) => {
		browser.once("message", resolve);
		browser.once("error", reject);
	});
	const registration: PaneRegistration = {
		clientId,
		paneId: "A",
		vault: VAULT,
		paneKey: "tour",
		primary: false,
		focused: false,
		rect: { x: 0, y: 0, width: 1920, height: 1080 },
		at: new Date().toISOString(),
		...extra,
	};
	expect(registerPane(registration).registered).toBe(true);
	return registration;
}

describe("a recording page's pane (TASK-304)", () => {
	// A recording page is a headless browser nobody sees, and it presents a pane id like anybody's.
	// What is guarded: no spec but its exact client id, no call that names no pane and no report
	// finds or counts it, and somebody's pane of the same id is found as if the recording were not
	// there. Its client id still names it, because that is how the recording page asks for the
	// model it records.

	test("is nobody's to address but by its client id, count, close or report, beside somebody's of the same id", async () => {
		// Claiming every role a pane can have, so nothing but the recording mark keeps it out.
		await present("record", { recording: true, primary: true, focused: true });

		expect(paneFromRequest(VAULT, undefined)).toBeNull();
		for (const spec of ["A", "1", "primary", "focused"]) {
			expect(() => paneFromRequest(VAULT, spec)).toThrow();
		}

		await present("user");
		expect(paneFromRequest(VAULT, undefined)?.clientId).toBe("user");
		expect(paneFromRequest(VAULT, "A")?.clientId).toBe("user");
		expect(paneFromRequest(VAULT, "1")?.clientId).toBe("user");
		expect(paneFromRequest(VAULT, "record")?.clientId).toBe("record");
		// One pane on screen, so there is none a close may take, the recording's least of all.
		expect(await closePane("record")).toMatchObject({ ok: false, refusal: "only-pane" });

		const report = panesReport(null);
		expect(report.paneCount).toBe(1);
		expect(report.panes.map((one) => one.clientId)).toEqual(["user"]);
	});
});

describe("a pane's line in the report", () => {
	// A pane that shows a canonical model reports no legacy board key at all. What it shows is the
	// model reading it reported, so the report must say that and not that nothing is drawn.

	const reading = {
		model: "Shop",
		expectedRevision: "a".repeat(64),
		subjects: [],
		reading: { focus: [], relationshipKinds: [], grammar: "architecture" as const },
		vault: VAULT,
		selection: { state: "Nightly batch", against: "Starting point" },
	};

	/**
	 * The report for one pane that reported a reading.
	 * @param architecture What the pane reported, if anything.
	 * @returns The report.
	 */
	async function reportOf(architecture: ModelDocument<"paneContext">["architecture"]) {
		await present("c1", { paneKey: null, primary: true, focused: true });
		recordSemanticPaneContext({
			architecture,
			paneId: "A",
			clientId: "c1",
			model: null,
			variant: null,
			view: null,
			selection: [],
			version: null,
			at: new Date().toISOString(),
			sequence: 1,
		});
		return panesReport(null);
	}

	test("names the model and the states it reported, and carries them in the pane entry", async () => {
		const report = await reportOf(reading);
		for (const word of ["Shop", "Nightly batch", "Starting point"]) {
			expect(report.text).toContain(word);
		}
		expect(report.panes[0]?.architecture?.selection).toEqual(reading.selection);
	});

	test("is not given a reading the pane did not report", async () => {
		const report = await reportOf(null);
		expect(report.text).not.toContain("Shop");
		expect(report.panes[0]?.architecture).toBeNull();
	});

	test("describes the accepted reading by its display labels while selectors keep their identities", async () => {
		const display = {
			model: "Web shop",
			state: "Nightly fulfillment",
			comparison: "Compared with its base",
		};
		const architecture = { ...reading, selection: { state: "DraftId" }, display };
		const report = await reportOf(architecture);
		expect(report.panes[0]?.architecture).toEqual(architecture);
		for (const label of Object.values(display)) expect(report.text).toContain(label);
		expect(report.text).not.toContain("state DraftId");
		expect(report.panes[0]).toMatchObject({ position: 1, place: "the only pane" });
	});
});

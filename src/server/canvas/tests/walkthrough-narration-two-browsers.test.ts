// A voice session is about the pane in the browser it was started from, and no other.
//
// The failure this guards: two browsers on one canvas each present a pane "A" (Chrome and the
// ChatGPT desktop app, 2026-09-22), the other browser's registration is first in the registry,
// and Narrate looks for the chosen walkthrough on the board that browser is showing, refuses,
// and the user reads "Realtime negotiation was unavailable or failed" (TASK-294).

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CanvasModule from "@/server/canvas/index";
import type * as StoreModule from "@/runtime/semantic-board-store/index";
import type * as ContractModule from "@/shared/semantic-board/index";
import type { PaneRegistration } from "@/runtime/engine/panes";
import type {
	SemanticPaneContext,
	SemanticPanePresentation,
} from "@/shared/semantic-pane-context/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-two-browsers-"));
process.env["ARCHBOARD_VAULT"] = vault;

let canvas: typeof CanvasModule;
let store: typeof StoreModule;
let contract: typeof ContractModule;
const writer = { kind: "agent" as const };
/** The board Chrome shows, which states the walkthrough. */
const NARRATED = "Ingest pipeline";
/** The board the other browser shows, which states none. */
const OTHER = "Release notes";
/** The walkthrough's minted id, read back after the write. */
let walkthroughId = "";
/** How many reports have been sent, so each is later than the last. */
let reported = 0;

/**
 * Write one board to the vault.
 * @param name The board's name.
 * @param walkthroughs What it states, if anything.
 */
async function writeBoard(name: string, walkthroughs: readonly { name: string }[]): Promise<void> {
	await store.writeSemanticBoard({
		board: name,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({
				name,
				level: "system",
				nodes: [{ name: "Gateway", kind: "service" }],
				walkthroughs: walkthroughs.map((one) => ({
					name: one.name,
					beats: [{ heading: "First", body: "Where it starts." }],
				})),
			}),
		),
	});
}

beforeAll(async () => {
	canvas = await import("@/server/canvas/index");
	store = await import("@/runtime/semantic-board-store/index");
	contract = await import("@/shared/semantic-board/index");
	const landing = store.locateSemanticBoard(NARRATED).file;
	if (!landing.startsWith(vault)) {
		throw new Error(
			`This owner writes boards, and its vault is not the one it made: ${landing} is outside ` +
				`${vault}. Run it in its own process — \`bun test --isolate ${import.meta.file}\` — ` +
				"rather than alongside a file that resolved the vault first.",
		);
	}
	await writeBoard(NARRATED, [{ name: "How a request lands" }]);
	await writeBoard(OTHER, []);
	const read = store.readSemanticBoard(NARRATED);
	if (!read.ok) {
		throw new Error(read.problem);
	}
	walkthroughId = read.board.variants[0]?.content.walkthroughs[0]?.id ?? "";
});

afterAll(() => {
	canvas.panes.clear();
	canvas.forgetSemanticPaneContexts();
	if (callerVault === undefined) {
		delete process.env["ARCHBOARD_VAULT"];
	} else {
		process.env["ARCHBOARD_VAULT"] = callerVault;
	}
	rmSync(vault, { recursive: true, force: true });
});

/**
 * One browser's pane "A", registered and reporting the board it shows.
 * @param clientId The pane's client id in that browser.
 * @param board The board it shows.
 */
function browserPane(clientId: string, board: string): void {
	const registration: PaneRegistration = {
		clientId,
		paneId: "A",
		board: board.toLowerCase(),
		primary: true,
		focused: true,
		rect: { x: 0, y: 0, width: 1, height: 1 },
		at: new Date().toISOString(),
	};
	canvas.panes.set(clientId, registration);
	canvas.recordSemanticPaneContext(report(clientId, board, null));
}

/**
 * A report from one browser's pane "A".
 * @param clientId The pane's client id.
 * @param board The board it says it shows.
 * @param presentation Where its walkthrough stands, or null.
 * @returns The report.
 */
function report(
	clientId: string,
	board: string,
	presentation: SemanticPanePresentation | null,
): SemanticPaneContext {
	reported += 1;
	return {
		paneId: "A",
		clientId,
		board: store.semanticBoardAddress(board),
		variant: null,
		view: null,
		selection: [],
		version: 1,
		presentation,
		at: new Date(1_700_000_000_000 + reported).toISOString(),
		sequence: reported,
	};
}

test("narration is about the browser that pressed Narrate, not the first pane with its id", async () => {
	// The other browser registered first, so a lookup by "A" lands on it.
	browserPane("client-app", OTHER);
	browserPane("client-chrome", NARRATED);

	expect(() => canvas.narrationFor("A", "client-app", walkthroughId)).toThrow();
	expect(canvas.narrationFor("A", "client-chrome", walkthroughId)).toEqual({
		walkthrough: walkthroughId,
		name: "How a request lands",
	});

	// The coordinator names the pane "A"; the step is settled on Chrome's board. Nothing
	// carries it to a socket here, so the pane is refused as absent, not the walkthrough.
	const step = await canvas.presentStepInCanvasPane({
		paneId: "A",
		input: {},
		signal: new AbortController().signal,
		turnId: null,
	});
	expect(step).toMatchObject({ tag: "refused", reason: "not_ready" });
});

test("a hand on the other browser's pane of the same id is not this narration's news", () => {
	canvas.bindVoicePane("A", "client-chrome");
	canvas.noteNarratedWalkthrough("A", walkthroughId, 1);
	const heard: string[] = [];
	const stop = canvas.subscribeNarrationChanges((change) => heard.push(change.kind));
	const stepped: SemanticPanePresentation = {
		walkthrough: walkthroughId,
		beat: 0,
		of: 1,
		arrived: true,
		answering: null,
	};
	canvas.panePresentations.note(report("client-app", OTHER, stepped));
	canvas.panePresentations.note(report("client-app", OTHER, null));
	expect(heard).toEqual([]);
	canvas.panePresentations.note(report("client-chrome", NARRATED, stepped));
	expect(heard).toEqual(["stepped"]);
	stop();
});

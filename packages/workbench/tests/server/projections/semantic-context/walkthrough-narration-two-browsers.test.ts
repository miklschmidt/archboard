// A voice session is about the exact pane it was started from, by client id, and no other.
//
// The failure this guards: two browser tabs on one server each present a pane "A" (Chrome and the
// ChatGPT desktop app, 2026-09-22), the other tab's registration is first in the registry,
// and Narrate looks for the chosen walkthrough on the board that tab is showing, refuses,
// and the user reads "Realtime negotiation was unavailable or failed" (TASK-294, TASK-373).

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	forgetSemanticPaneContexts,
	recordSemanticPaneContext,
} from "#server/services/panes/context.ts";
import {
	narrationFor,
	subscribeNarrationChanges,
} from "#server/projections/semantic-context/walkthrough-narration.ts";
import { panePresentations } from "#server/services/panes/presentation.ts";
import { panes } from "#server/services/panes/registry.ts";
import { writeSemanticBoard, createBoardTransition } from "@archboard/board/store-write";
import { readSemanticBoard } from "@archboard/board/store-read";
import { semanticBoardAddress } from "@archboard/board/address";
import { BoardCreateInputSchema } from "@archboard/board/commands";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type SemanticPanePresentation = NonNullable<z.infer<typeof SemanticPaneContextSchema>["presentation"]>;
type SemanticPaneContext = z.infer<typeof SemanticPaneContextSchema>;

const vault = mkdtempSync(join(tmpdir(), "archboard-two-browsers-"));

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
	await writeSemanticBoard({
		vault,
		board: name,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
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
	await writeBoard(NARRATED, [{ name: "How a request lands" }]);
	await writeBoard(OTHER, []);
	const read = readSemanticBoard(vault, NARRATED);
	if (!read.ok) {
		throw new Error(read.problem);
	}
	walkthroughId = read.board.variants[0]?.content.walkthroughs[0]?.id ?? "";
});

afterAll(() => {
	panes.clear();
	forgetSemanticPaneContexts();
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
		vault,
		board: board.toLowerCase(),
		primary: true,
		focused: true,
		rect: { x: 0, y: 0, width: 1, height: 1 },
		at: new Date().toISOString(),
	};
	panes.set(clientId, registration);
	recordSemanticPaneContext(report(clientId, board, null));
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
		board: semanticBoardAddress(board),
		variant: null,
		view: null,
		selection: [],
		version: 1,
		presentation,
		at: new Date(1_700_000_000_000 + reported).toISOString(),
		sequence: reported,
	};
}

test("narration is about the tab that pressed Narrate, not the first pane with its id", () => {
	// The other tab registered first, so a lookup by "A" lands on it.
	browserPane("client-app", OTHER);
	browserPane("client-chrome", NARRATED);

	expect(() => narrationFor("client-app", walkthroughId, null)).toThrow();
	expect(narrationFor("client-chrome", walkthroughId, null)).toEqual({
		walkthrough: walkthroughId,
		name: "How a request lands",
		recording: null,
	});
});

test("a hand on the other tab's pane of the same id is not this narration's news", () => {
	narrationFor("client-chrome", walkthroughId, null);
	const heard: string[] = [];
	const stop = subscribeNarrationChanges((change, clientId) =>
		heard.push(`${clientId}:${change.kind}`),
	);
	const stepped: SemanticPanePresentation = {
		walkthrough: walkthroughId,
		beat: 0,
		of: 1,
		arrived: true,
		answering: null,
	};
	panePresentations.note(report("client-app", OTHER, stepped));
	panePresentations.note(report("client-app", OTHER, null));
	expect(heard).toEqual([]);
	panePresentations.note(report("client-chrome", NARRATED, stepped));
	expect(heard).toEqual(["client-chrome:stepped"]);
	stop();
});

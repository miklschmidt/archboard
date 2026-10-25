// A recording's voice hears every subject's standing against the variant its frames are drawn
// against (TASK-478.01).
//
// The failure this guards: a recording made with `--against` drew its frames relative to the
// named variant while its voice heard standings against the default comparison, so on a built
// board in a stack of pull requests it called a part "added" that a lower pull request added and
// the picture showed unmarked.

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
import { writeSemanticBoard } from "@archboard/board/store-write";
import { semanticBoardAddress } from "@archboard/board/address";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticBoard,
} from "@archboard/board/document";
import type { RealtimePresentationChange } from "#runtime/rules/realtime/presentation-mode.ts";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type SemanticPanePresentation = NonNullable<z.infer<typeof SemanticPaneContextSchema>["presentation"]>;
type SemanticPaneContext = z.infer<typeof SemanticPaneContextSchema>;

const vault = mkdtempSync(join(tmpdir(), "archboard-narration-against-"));
const BOARD = "Stacked";
const CLIENT = "client-recording";
const WALKTHROUGH = "wt";

const GATEWAY = { id: "gw", name: "Gateway", kind: "service", order: 1000 };
const LEDGER = { id: "ld", name: "Ledger", kind: "service", order: 2000 };
const CACHE = { id: "ca", name: "Cache", kind: "service", order: 3000 };

/** A built board: the current variant, the pull request below, and the pull request drawn. */
const stacked: SemanticBoard = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "bd",
	name: BOARD,
	level: "system",
	version: 1,
	createdAt: "2026-10-15T00:00:00.000Z",
	updatedAt: "2026-10-15T00:00:00.000Z",
	current: "v1",
	variants: [
		{ id: "v1", name: "Built", lifecycle: "current", content: { nodes: [GATEWAY] } },
		{
			id: "v2",
			name: "Lower pull request",
			lifecycle: "draft",
			parent: "v1",
			content: { nodes: [GATEWAY, LEDGER] },
		},
		{
			id: "v3",
			name: "This pull request",
			lifecycle: "draft",
			parent: "v2",
			content: {
				nodes: [GATEWAY, LEDGER, CACHE],
				walkthroughs: [
					{
						id: WALKTHROUGH,
						name: "The stack",
						beats: [
							{
								id: "b1",
								heading: "Both",
								body: "Two parts.",
								subjects: ["ld", "ca"],
							},
						],
					},
				],
			},
		},
	],
});

let reported = 0;

beforeAll(async () => {
	await writeSemanticBoard({
		vault,
		board: BOARD,
		writer: { kind: "agent" },
		transition: {
			summary: "create the stacked board",
			changesExistingBoard: false,
			apply: () => ({ ok: true, board: stacked }),
		},
	});
	const registration: PaneRegistration = {
		clientId: CLIENT,
		paneId: "A",
		vault,
		board: BOARD.toLowerCase(),
		primary: true,
		focused: true,
		rect: { x: 0, y: 0, width: 1, height: 1 },
		at: new Date().toISOString(),
	};
	panes.set(CLIENT, registration);
	recordSemanticPaneContext(report(null));
});

afterAll(() => {
	panes.clear();
	forgetSemanticPaneContexts();
	rmSync(vault, { recursive: true, force: true });
});

/**
 * A report from the recording pane, showing the pull request's variant.
 * @param presentation Where its walkthrough stands, or null.
 * @returns The report.
 */
function report(presentation: SemanticPanePresentation | null): SemanticPaneContext {
	reported += 1;
	return {
		paneId: "A",
		clientId: CLIENT,
		board: semanticBoardAddress(BOARD),
		variant: { id: "v3", name: "This pull request", lifecycle: "draft" },
		view: null,
		selection: [],
		version: 1,
		presentation,
		at: new Date(1_700_000_000_000 + reported).toISOString(),
		sequence: reported,
	};
}

/**
 * Narrate the walkthrough as a recording and read how the first step tells its subjects stand.
 * @param recording What the start carried: a language, and maybe the variant to read against.
 * @returns Each subject's name and standing, as the voice is told them.
 */
function standingsHeard(
	recording: { language: string; against?: string } | null,
): { name: string; standing: string | null }[] {
	narrationFor(CLIENT, WALKTHROUGH, recording);
	let heard: RealtimePresentationChange | undefined;
	const stop = subscribeNarrationChanges((change) => {
		heard ??= change;
	});
	try {
		panePresentations.note(
			report({ walkthrough: WALKTHROUGH, beat: 0, of: 1, arrived: true, answering: null }),
		);
	} finally {
		// Leaving ends the narration.
		panePresentations.note(report(null));
		stop();
	}
	if (heard?.kind !== "stepped") throw new Error("the step was not told");
	return heard.subjects.map(({ name, standing }) => ({ name, standing }));
}

test("a recording made with --against hears standings against that variant", () => {
	expect(standingsHeard({ language: "en", against: "v2" })).toEqual([
		{ name: "Ledger", standing: "unchanged" },
		{ name: "Cache", standing: "added" },
	]);
});

test("a recording without --against and a live narration keep the usual comparison", () => {
	const usual = [
		{ name: "Ledger", standing: "added" },
		{ name: "Cache", standing: "added" },
	];
	expect(standingsHeard({ language: "en" })).toEqual(usual);
	expect(standingsHeard(null)).toEqual(usual);
});

test("a recording against a variant the board no longer has hears no standing", () => {
	expect(standingsHeard({ language: "en", against: "gone" })).toEqual([
		{ name: "Ledger", standing: null },
		{ name: "Cache", standing: null },
	]);
});

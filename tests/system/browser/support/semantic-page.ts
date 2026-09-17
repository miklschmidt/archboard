// Putting a board in front of a browser test.
//
// Every browser owner needs the same two things: a board in the vault, and a
// pane showing it. Both go through the public surface — the create route an
// agent uses and the address the shell restores from — so what a test drives is
// what a person drives, and no owner reaches into the store to arrange a scene.

import type { JsonResponse } from "../../support/http.ts";

/** One node of the architecture a test seeds. */
interface SeedNode {
	readonly name: string;
	readonly kind: string;
	readonly responsibility?: string;
	readonly parent?: string;
	readonly binding?: { readonly repo: string; readonly path: string };
}

/** One relationship between two of them. */
interface SeedEdge {
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly label?: string;
}

/** What a seeded board says. */
interface SeedBoard {
	readonly nodes: readonly SeedNode[];
	readonly edges?: readonly SeedEdge[];
}

/** How a test reaches the canvas's JSON routes. */
type JsonRequester = <T>(
	path: string,
	options?: { method?: string; body?: unknown; doing?: string },
) => Promise<JsonResponse<T>>;

/** The architecture every owner that does not care about the content uses. */
const A_SMALL_PIPELINE: SeedBoard = {
	nodes: [
		{ name: "Ingest", kind: "service", responsibility: "Takes the feed" },
		{ name: "Warehouse", kind: "datastore", responsibility: "Keeps the rows" },
	],
	edges: [{ from: "Ingest", to: "Warehouse", kind: "data", label: "rows" }],
};

/**
 * Create one board through the route an agent writes with.
 * @param request The canvas's JSON requester.
 * @param board The board's name.
 * @param content What is on it; a small pipeline when the test does not care.
 * @returns Settles once the board is on disk.
 * @throws {Error} When the canvas refused to create it.
 */
async function seedSemanticBoard(
	request: JsonRequester,
	board: string,
	content: SeedBoard = A_SMALL_PIPELINE,
): Promise<void> {
	const created = await request<{ success: boolean; error?: string }>(
		"/api/semantic-boards/create",
		{
			method: "POST",
			doing: `starting ${board}`,
			body: {
				board,
				origin: "agent",
				create: { level: "system", nodes: content.nodes, edges: content.edges ?? [] },
			},
		},
	);
	if (created.status !== 200 || !created.body.success) {
		throw new Error(`Could not seed "${board}": ${created.body.error ?? created.status}`);
	}
}

/**
 * The address that opens one board in the first pane.
 * @param base The canvas's base URL.
 * @param board The board key.
 * @returns The URL.
 */
function addressShowing(base: string, board: string): string {
	return `${base}/?paneA=${encodeURIComponent(board)}`;
}

/** The stage one semantic pane draws into. */
const SEMANTIC_STAGE = '[data-slot="semantic-board-stage"]';

/** The element the camera moves, which the drawn subjects sit in. */
const SEMANTIC_SURFACE = '[data-slot="semantic-board-surface"]';

/**
 * Which of the pane's states is on screen: `loading`, `drawn`, `empty` or
 * `error`. The one thing every browser owner waits on before it looks.
 * @param evaluate How the owner evaluates an expression in the page.
 * @returns The `data-state`, or null before the pane is there.
 */
function stageState(evaluate: <T>(expression: string) => Promise<T>): Promise<string | null> {
	return evaluate<string | null>(
		`document.querySelector('${SEMANTIC_STAGE}')?.getAttribute('data-state') ?? null`,
	);
}

/**
 * Whether the pane is drawn and its picture has landed: past the entrance or
 * transition that brings a picture in, so what is on the surface is exactly
 * what was drawn. Owners that read the picture's markup wait on this.
 * @param evaluate How the owner evaluates an expression in the page.
 * @returns True once the picture is at rest.
 */
function pictureAtRest(evaluate: <T>(expression: string) => Promise<T>): Promise<boolean> {
	return evaluate<boolean>(
		`document.querySelector('${SEMANTIC_STAGE}')?.getAttribute('data-state') === 'drawn' && document.querySelector('${SEMANTIC_SURFACE}:not([data-picture-motion]) svg') !== null`,
	);
}

export {
	A_SMALL_PIPELINE,
	SEMANTIC_STAGE,
	SEMANTIC_SURFACE,
	addressShowing,
	pictureAtRest,
	seedSemanticBoard,
	stageState,
	type JsonRequester,
	type SeedBoard,
	type SeedEdge,
	type SeedNode,
};

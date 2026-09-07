// What is on screen and what can be made from it: panes, the selection, the
// viewport, pictures of a board, snapshots, the stencil library, and the
// canvas's own health.

import type { SelectionReport } from "@/runtime/engine/describe";
import type { PanesReport } from "@/runtime/engine/panes";
import type { ServerElement } from "@/runtime/engine/types";
import type { HoldReport } from "@/runtime/engine/board-hold";
import type { InspectionPolicyInput, InspectionReport } from "@/runtime/board-inspection";
import { EXPRESS_SERVER_URL } from "@/runtime/engine/config";
import { postingJson } from "@/runtime/engine/lib/canvas-client-answers";
import { requestJson } from "@/runtime/engine/lib/canvas-client-transport";

interface PaneAddress {
	paneId: string;
	clientId: string;
	place: string;
	position: number;
}

interface PaneLayoutResponse {
	success: boolean;
	pane?: PaneAddress | null;
	closed?: PaneAddress & { board: string };
	paneCount: number;
	onScreen: Array<{ paneId: string; place: string; board: string }>;
}

interface FindingExportResponse {
	board: string;
	sourceFingerprint: string;
	report: InspectionReport;
	sourceRenderable: boolean;
	results: Array<{
		findingIndex: number;
		data?: string;
		failure?: "renderer-failed";
	}>;
}

interface BoardRenderResponse {
	success: true;
	board: string;
	sourceFingerprint: string;
	format: "png" | "svg";
	data: string;
	width: number;
	height: number;
	padding: number;
	scale: number;
	background: boolean;
	backgroundColor: string;
}

/** How to render a whole board off screen. */
interface BoardRenderParams {
	format: "png" | "svg";
	background: boolean;
	padding: number;
	scale: number;
}

interface HealthStatus {
	status: string;
	timestamp: string;
	elements_count: number;
	websocket_clients: number;
	// Identity fields (v1.1+); `stop` requires both before signaling anything
	service?: string;
	pid?: number;
	held_boards?: HoldReport[];
	/** Whether the canvas is running the source on disk now (TASK-056). */
	source?: {
		evaluatedAt: string;
		newestFile: string | null;
		newestAt: string | null;
		stale: boolean;
	};
	/** The entry script the built frontend names now, or null if nothing is built. */
	frontendBuild?: string | null;
}

interface LibraryResponse {
	success: boolean;
	items: Array<{ id: string; name?: string; status: string; created: number; elements: unknown[] }>;
	seeded: string[];
	/** Which curated set each seeded stencil came from, by item id. */
	origins: Record<string, string>;
	file: string | null;
	vaultBacked: boolean;
}

/**
 * What a human currently has picked on the board: ids plus enough semantic
 * detail (label, node-ness, kind, binding) to act on without a scene fetch.
 * @param pane Which pane to ask.
 * @returns The selection.
 */
async function getSelection(
	pane: string,
): Promise<SelectionReport & { success: boolean; board: string }> {
	return requestJson<SelectionReport & { success: boolean; board: string }>(
		`/api/selection?pane=${encodeURIComponent(pane)}`,
	);
}

/**
 * What the human is currently looking at: one entry per pane on screen, with
 * the board it holds, where it sits, how much of it is in view, and what is
 * picked in it. View state only — cheap enough to read every turn.
 * @returns The panes.
 */
async function getPanes(): Promise<PanesReport & { success: boolean; activeBoard: string }> {
	return requestJson<PanesReport & { success: boolean; activeBoard: string }>("/api/panes");
}

/**
 * Split the canvas. The new pane inherits what is currently displayed;
 * choosing another board is the separate `browser show` operation.
 *
 * Splitting used to be a click, which meant a thread that could only talk had
 * no way to put a proposal beside the architecture it changes. It reused the
 * pane the human was reading instead (TASK-033).
 * @returns Where the new pane landed.
 */
async function openPane(): Promise<PaneLayoutResponse> {
	return requestJson<PaneLayoutResponse>("/api/panes/open", postingJson({}));
}

/**
 * Close one pane, named the way `--pane` names one.
 * @param pane Which pane.
 * @returns What is left on screen.
 */
async function closePane(pane: string): Promise<PaneLayoutResponse> {
	return requestJson<PaneLayoutResponse>("/api/panes/close", postingJson({ pane }));
}

/**
 * Move what a pane is looking at.
 * @param params Where to look, as the viewport route spells it.
 * @returns Whether the pane moved.
 */
async function setViewport(
	params: Record<string, unknown>,
): Promise<{ success: boolean; message?: string }> {
	return requestJson("/api/viewport", postingJson(params));
}

/**
 * A picture of one pane.
 * @param format Whether to take a raster or a vector picture.
 * @param background Whether to draw the canvas background behind it.
 * @param pane Which pane; without it the pane that answers for the browser is
 * photographed, which with a single pane is that pane.
 * @returns The picture, encoded as the format's own text.
 */
async function captureBrowser(
	format: "png" | "svg",
	background = true,
	pane?: string,
): Promise<{ success: boolean; format: string; data: string }> {
	return requestJson(
		"/api/browser/capture",
		postingJson({ format, background, ...(pane ? { pane } : {}) }),
	);
}

/**
 * Render a picture of each finding an inspection reports.
 * @param policy Which findings to look for.
 * @returns The report and one picture per finding.
 */
async function exportFindings(policy: InspectionPolicyInput): Promise<FindingExportResponse> {
	return requestJson("/api/export/findings", postingJson({ policy }));
}

/**
 * Render the whole board, off screen.
 * @param input The format, background, padding and scale to render at.
 * @returns The picture and the size it came out.
 */
async function renderBoard(input: BoardRenderParams): Promise<BoardRenderResponse> {
	return requestJson("/api/render/board", postingJson(input));
}

/**
 * The board's embedded files, by file id.
 * @returns The files, empty when the board has none.
 */
async function getFiles(): Promise<Record<string, unknown>> {
	const data = await requestJson<{ files?: Record<string, unknown> }>("/api/files");
	return data.files ?? {};
}

/**
 * Add embedded files to the board.
 * @param files The files to add.
 */
async function postFiles(files: unknown[]): Promise<void> {
	await requestJson("/api/files", postingJson(files));
}

/**
 * Keep a copy of the board under a name.
 * @param name What to call it.
 * @returns What was kept.
 */
async function saveSnapshot(name: string): Promise<{ elementCount: number; createdAt: string }> {
	return requestJson("/api/snapshots", postingJson({ name }));
}

/**
 * Every snapshot the canvas holds.
 * @returns The snapshots.
 */
async function listSnapshots(): Promise<{
	success: boolean;
	snapshots: unknown[];
	count: number;
}> {
	return requestJson("/api/snapshots");
}

/**
 * One snapshot by name.
 * @param name Which snapshot.
 * @returns The snapshot and its elements.
 */
async function getSnapshot(
	name: string,
): Promise<{ name: string; board?: string; elements: ServerElement[]; createdAt: string }> {
	const data = await requestJson<{
		success: boolean;
		snapshot: { name: string; board?: string; elements: ServerElement[]; createdAt: string };
	}>(`/api/snapshots/${encodeURIComponent(name)}`);
	return data.snapshot;
}

/**
 * What the canvas says about itself.
 * @param timeoutMs How long to wait for it to answer.
 * @returns Its health.
 * @throws {Error} When it answers with a failure.
 */
async function getHealth(timeoutMs = 2000): Promise<HealthStatus> {
	const response = await fetch(`${EXPRESS_SERVER_URL}/health`, {
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) {
		throw new Error(`Health check failed: ${response.status}`);
	}
	const health: unknown = await response.json();
	// The canvas's own /health shape, which is what this returns; there is no
	// second description of it to check against.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the canvas's declared health shape
	return health as HealthStatus;
}

/**
 * What the canvas says about its own syncing.
 * @returns The status.
 */
async function getSyncStatus(): Promise<Record<string, unknown>> {
	return requestJson("/api/sync/status");
}

/**
 * The stencil library.
 *
 * Read-only from here. The palette is edited in a browser, where the shapes
 * are; the reason an agent can see it at all is that it lives on the server
 * (ADR 0007) rather than in some tab's localStorage — which is what makes
 * "put a Redis on the board" a question with an answer.
 * @returns Its items and where the seeded ones came from.
 */
async function getLibrary(): Promise<LibraryResponse> {
	return requestJson<LibraryResponse>("/api/library");
}

export {
	type BoardRenderResponse,
	type FindingExportResponse,
	type HealthStatus,
	type LibraryResponse,
	type PaneAddress,
	type PaneLayoutResponse,
	captureBrowser,
	closePane,
	exportFindings,
	getFiles,
	getHealth,
	getLibrary,
	getPanes,
	getSelection,
	getSnapshot,
	getSyncStatus,
	listSnapshots,
	openPane,
	postFiles,
	renderBoard,
	saveSnapshot,
	setViewport,
};

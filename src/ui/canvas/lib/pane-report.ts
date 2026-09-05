// What this pane has in front of the human, right now: which board, where the
// pane sits on the display, and what of the board is in view.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { loadedBundle, type PaneReport } from "@/ui/canvas/api";

/** The identity and placement a report is built from. */
interface PaneReportInput {
	api: ExcalidrawImperativeAPI;
	boardKey: string;
	/** The element the canvas fills, for a measured rectangle. */
	element: HTMLElement | null;
	clientId: string;
	paneId: string;
	primary: boolean;
	focused: boolean;
}

/** A rectangle in CSS pixels. */
type PageRect = { x: number; y: number; width: number; height: number };

/**
 * Where the pane is in the page. Measured off the DOM rather than taken from
 * appState: Excalidraw catches up with a resize on its own schedule, and a pane
 * that reported a stale width would place itself wrong.
 * @param input The report input.
 * @returns The rectangle.
 */
function paneRect(input: PaneReportInput): PageRect {
	const box = input.element?.getBoundingClientRect();
	if (box) {
		return { x: box.left, y: box.top, width: box.width, height: box.height };
	}
	const appState = input.api.getAppState();
	return {
		x: appState.offsetLeft,
		y: appState.offsetTop,
		width: appState.width,
		height: appState.height,
	};
}

/**
 * Whether every number in a record is finite. `JSON.stringify` turns NaN and
 * infinities into null, so a report is only published when it can be inspected.
 * @param values The numbers.
 * @returns True when all are finite.
 */
function allFinite(values: Record<string, number>): boolean {
	return Object.values(values).every(Number.isFinite);
}

/**
 * Build the pane report, or nothing when the camera is not yet finite.
 * @param input The report input.
 * @returns The report, or null.
 */
function buildPaneReport(input: PaneReportInput): PaneReport | null {
	const appState = input.api.getAppState();
	const zoom = appState.zoom.value;
	const rect = paneRect(input);
	// Scene coordinates, so it can be compared with element positions directly.
	const viewport = {
		x: -appState.scrollX,
		y: -appState.scrollY,
		width: rect.width / zoom,
		height: rect.height / zoom,
		zoom,
	};
	if (!allFinite(rect) || !allFinite(viewport) || zoom <= 0) {
		return null;
	}
	const report: PaneReport = {
		clientId: input.clientId,
		paneId: input.paneId,
		board: input.boardKey,
		primary: input.primary,
		focused: input.focused,
		elementCount: input.api.getSceneElements().length,
		rect,
		viewport,
	};
	const build = loadedBundle();
	if (build !== undefined) {
		report.build = build;
	}
	return report;
}

/**
 * A comparison key for a report, rounded so a sub-pixel scroll is not a change
 * worth a POST.
 * @param report The report.
 * @returns The key.
 */
function paneReportKey(report: PaneReport): string {
	return JSON.stringify(report, (_key, value: unknown) =>
		typeof value === "number" ? Math.round(value) : value,
	);
}

export { buildPaneReport, paneReportKey, type PaneReportInput };

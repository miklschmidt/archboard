// What this pane has in front of the human, right now: which board, and where
// the pane sits on the display.
//
// Nothing about the picture. A semantic pane's camera is presentation state
// that belongs to the browser (ADR 0023), and the board's content is on disk,
// so what the server needs from a pane is only its identity and its place.

import { loadedBundle, type PaneReport } from "@/ui/pane-session/api";

/** The identity and placement a report is built from. */
interface PaneReportInput {
	boardKey: string | null;
	/** The element the pane fills, for a measured rectangle. */
	element: HTMLElement | null;
	clientId: string;
	paneId: string;
	primary: boolean;
	focused: boolean;
}

/** A rectangle in CSS pixels. */
type PageRect = Record<"x" | "y" | "width" | "height", number>;

/** A pane that has not been laid out yet, and so has no rectangle to report. */
const UNPLACED: PageRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

/**
 * Where the pane is in the page, measured off the DOM.
 * @param element The element the pane fills, or null before it mounts.
 * @returns The rectangle.
 */
function paneRect(element: HTMLElement | null): PageRect {
	const box = element?.getBoundingClientRect();
	return box ? { x: box.left, y: box.top, width: box.width, height: box.height } : UNPLACED;
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
 * Build the pane report, or nothing when the pane cannot be measured.
 * @param input The report input.
 * @returns The report, or null.
 */
function buildPaneReport(input: PaneReportInput): PaneReport | null {
	const rect = paneRect(input.element);
	if (!allFinite(rect)) {
		return null;
	}
	const report: PaneReport = {
		clientId: input.clientId,
		paneId: input.paneId,
		board: input.boardKey,
		primary: input.primary,
		focused: input.focused,
		rect,
	};
	const build = loadedBundle();
	if (build !== undefined) {
		report.build = build;
	}
	return report;
}

/**
 * A comparison key for a report, rounded so a sub-pixel resize is not a change
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

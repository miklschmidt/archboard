// Sending one pane's report and applying what its answer may change.
// Pushed rather than polled: an agent asking "what am I looking at" gets an
// answer off server state, not by waking a browser.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { reportPane, type PaneReply, type PaneReport } from "@/ui/canvas/api";
import { buildPaneReport, paneReportKey } from "@/ui/canvas/lib/pane-report";
import type { PaneSocketConnector } from "@/ui/canvas/lib/pane-socket";
import {
	createCanvasPaneReportSequencer,
	type CanvasPaneReportCurrent,
	type CanvasPaneReportDispatch,
	type CanvasPaneReportEffects,
} from "@/ui/canvas/workbench-socket";

/** What the sender reads and tells. */
interface PaneReportSenderParts {
	readonly paneId: string;
	readonly clientId: string;
	readonly api: () => ExcalidrawImperativeAPI | null;
	readonly boardKey: () => string | null;
	readonly paneElement: () => HTMLElement | null;
	readonly primary: () => boolean;
	readonly focused: () => boolean;
	readonly connector: PaneSocketConnector;
	readonly setConnected: (connected: boolean) => void;
	readonly onPaneStateAccepted: () => void;
	readonly onStaleFrontend: (message: string) => void;
}

/** One pane's report sender. */
interface PaneReportSender {
	/** Report what the pane shows, when it differs from what was last reported. */
	readonly send: () => void;
	/** Forget the last report, so the next one goes out even if equal. */
	readonly forget: () => void;
}

/**
 * Create the sender for one pane.
 * @param parts What it reads and tells.
 * @returns The sender.
 */
function createPaneReportSender(parts: PaneReportSenderParts): PaneReportSender {
	const sequencer = createCanvasPaneReportSequencer();
	let publishedKey = "";
	let acceptedListingKey = "";
	let staleBuild = "";

	/**
	 * The identity the pane holds right now.
	 * @returns The socket, generation and registration.
	 */
	function current(): CanvasPaneReportCurrent {
		const generation = parts.connector.current();
		return {
			socket: generation?.socket ?? null,
			generation: generation?.generation ?? 0,
			registration: parts.connector.registration(),
		};
	}

	/**
	 * Say once per build that this tab is running old code (TASK-056).
	 * @param result The pane-report answer.
	 */
	function noteStaleBuild(result: PaneReply | null): void {
		const stale = result?.staleFrontend;
		if (stale === undefined) {
			return;
		}
		if (stale.message === null || staleBuild === stale.current) {
			return;
		}
		staleBuild = stale.current ?? "";
		parts.onStaleFrontend(stale.message);
	}

	/**
	 * The navigator only depends on which board this accepted pane contributes,
	 * not on its camera; say so once per board rather than per pan.
	 * @param report The accepted report.
	 */
	function acceptListing(report: PaneReport): void {
		const listingKey = JSON.stringify([report.clientId, report.board]);
		if (listingKey !== acceptedListingKey) {
			acceptedListingKey = listingKey;
			parts.onPaneStateAccepted();
		}
	}

	/**
	 * Apply what a pane-report answer may change.
	 * @param effects What the sequencer permits.
	 * @param dispatch The identity the report was dispatched under.
	 * @param report The report.
	 * @param result The answer, when the request settled.
	 */
	function apply(
		effects: CanvasPaneReportEffects,
		dispatch: CanvasPaneReportDispatch,
		report: PaneReport,
		result: PaneReply | null,
	): void {
		if (effects.superseded) {
			return;
		}
		if (effects.acknowledgeRegistration) {
			dispatch.registration?.acknowledge(true);
		}
		if (effects.connectionHealth !== null) {
			parts.setConnected(effects.connectionHealth);
		}
		if (effects.acceptPaneListing) {
			acceptListing(report);
		}
		applyFreshness(effects, result);
	}

	/**
	 * Apply the freshness half of an answer: forgetting a refused report, and
	 * noting a stale build.
	 * @param effects What the sequencer permits.
	 * @param result The answer, when the request settled.
	 */
	function applyFreshness(effects: CanvasPaneReportEffects, result: PaneReply | null): void {
		if (effects.clearPublishedReport) {
			publishedKey = "";
		}
		if (effects.applyStaleBuild) {
			noteStaleBuild(result);
		}
	}

	/**
	 * Put a report on the wire under the identity the pane holds now.
	 * @param report The report.
	 */
	function dispatchReport(report: PaneReport): void {
		const now = current();
		const dispatch: CanvasPaneReportDispatch = {
			request: sequencer.begin(now.generation),
			socket: now.socket,
			registration: now.registration,
		};
		reportPane(report)
			.then((result) => {
				const outcome = { settled: true, registered: result.registered } as const;
				apply(sequencer.settle(dispatch, current(), outcome), dispatch, report, result);
				return result;
			})
			.catch(() => {
				apply(sequencer.settle(dispatch, current(), { settled: false }), dispatch, report, null);
			});
	}

	/**
	 * The report to send, or null when there is nothing finite to say.
	 * @returns The report.
	 */
	function build(): PaneReport | null {
		const api = parts.api();
		const boardKey = parts.boardKey();
		if (!api || boardKey === null) {
			return null;
		}
		return buildPaneReport({
			api,
			boardKey,
			element: parts.paneElement(),
			clientId: parts.clientId,
			paneId: parts.paneId,
			primary: parts.primary(),
			focused: parts.focused(),
		});
	}

	/** Report what the pane shows, when it differs from what was last reported. */
	function send(): void {
		const report = build();
		if (report === null) {
			// A camera that is not finite forgets the last report, so a corrected
			// camera registers even if it returns to the same coordinates.
			publishedKey = "";
			return;
		}
		const key = paneReportKey(report);
		if (key === publishedKey) {
			return;
		}
		publishedKey = key;
		dispatchReport(report);
	}

	/** Forget the last report. */
	function forget(): void {
		publishedKey = "";
	}

	return { send, forget };
}

export { createPaneReportSender, type PaneReportSender, type PaneReportSenderParts };

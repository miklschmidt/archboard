// Sending one pane's report and applying what its answer may change.
// Pushed rather than polled: an agent asking "what am I looking at" gets an
// answer off server state, not by waking a browser.

import {
	reportPane,
	type PaneReply,
	type PaneReport,
} from "#ui/panes/pane-session/clients/pane-requests.ts";
import { buildPaneReport, paneReportKey } from "#ui/panes/pane-session/clients/pane-report.ts";
import type { PaneSocketConnector } from "#ui/panes/pane-session/clients/pane-socket.ts";
import {
	createPaneReportSequencer,
	type PaneReportCurrent,
	type PaneReportDispatch,
	type PaneReportEffects,
} from "#ui/panes/pane-session/clients/workbench-socket.ts";

/** What the sender reads and tells. */
interface PaneReportSenderParts {
	readonly paneId: string;
	readonly clientId: string;
	readonly paneKey: () => string | null;
	/** The vault the pane is in now, which its report names. */
	readonly vault: () => string;
	readonly paneElement: () => HTMLElement | null;
	readonly primary: () => boolean;
	readonly focused: () => boolean;
	readonly recording: () => boolean;
	readonly connector: PaneSocketConnector;
	readonly setConnected: (connected: boolean) => void;
	/**
	 * Say whether the server has this pane.
	 * @param registered What the server answered.
	 */
	readonly setRegistered: (registered: boolean) => void;
	/**
	 * Hear what an answer says about this tab's build.
	 * @param result The answer, or null when the request never settled.
	 */
	readonly noteBuild: (result: PaneReply | null) => void;
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
	const sequencer = createPaneReportSequencer();
	let publishedKey = "";

	/**
	 * The identity the pane holds right now.
	 * @returns The socket, generation and registration.
	 */
	function current(): PaneReportCurrent {
		const generation = parts.connector.current();
		return {
			socket: generation?.socket ?? null,
			generation: generation?.generation ?? 0,
			registration: parts.connector.registration(),
		};
	}

	/**
	 * Apply what a pane-report answer may change.
	 * @param effects What the sequencer permits.
	 * @param dispatch The identity the report was dispatched under.
	 * @param result The answer, when the request settled.
	 */
	function apply(
		effects: PaneReportEffects,
		dispatch: PaneReportDispatch,
		result: PaneReply | null,
	): void {
		if (effects.superseded) {
			return;
		}
		applyRegistration(effects, dispatch);
		applyFreshness(effects, result);
	}

	/**
	 * Apply registration acknowledgement and connection health.
	 * @param effects What the sequencer permits.
	 * @param dispatch The identity the report was dispatched under.
	 */
	function applyRegistration(effects: PaneReportEffects, dispatch: PaneReportDispatch): void {
		if (effects.acknowledgeRegistration) {
			dispatch.registration?.acknowledge(true);
		}
		if (effects.connectionHealth !== null) {
			parts.setConnected(effects.connectionHealth);
			parts.setRegistered(effects.connectionHealth);
		}
	}

	/**
	 * Apply the freshness half: forgetting a refused report, and noting that
	 * this tab is running a build the server no longer serves.
	 * @param effects What the sequencer permits.
	 * @param result The answer, when the request settled.
	 */
	function applyFreshness(effects: PaneReportEffects, result: PaneReply | null): void {
		if (effects.clearPublishedReport) {
			publishedKey = "";
		}
		if (effects.applyStaleBuild) {
			parts.noteBuild(result);
		}
	}

	/**
	 * Put a report on the wire under the identity the pane holds now.
	 * @param vault The vault the pane is in, which the report names.
	 * @param report The captured pane report.
	 */
	function dispatchReport(vault: string, report: PaneReport): void {
		const now = current();
		const dispatch: PaneReportDispatch = {
			request: sequencer.begin(now.generation),
			socket: now.socket,
			registration: now.registration,
		};
		reportPane(vault, report)
			.then((result) => {
				// The server moved the pane before this report reached it. The move's
				// pane_place says where, and the report that follows it is the answer
				// that counts, whichever of the two arrives first.
				if (result.code === "PANE_MOVED") {
					return result;
				}
				const outcome = { settled: true, registered: result.registered } as const;
				apply(sequencer.settle(dispatch, current(), outcome), dispatch, result);
				return result;
			})
			.catch(() => {
				apply(sequencer.settle(dispatch, current(), { settled: false }), dispatch, null);
			});
	}

	/**
	 * The report to send, or null when the pane cannot be measured yet.
	 *
	 * A pane showing no model still reports: it is on screen, it has a place,
	 * and it is the thing a `browser show` will point at.
	 * @returns The report.
	 */
	function build(): PaneReport | null {
		return buildPaneReport({
			paneKey: parts.paneKey(),
			element: parts.paneElement(),
			clientId: parts.clientId,
			paneId: parts.paneId,
			primary: parts.primary(),
			focused: parts.focused(),
			recording: parts.recording(),
		});
	}

	/** Report what the pane shows, when it differs from what was last reported. */
	function send(): void {
		const report = build();
		if (report === null) {
			publishedKey = "";
			return;
		}
		// The same report in another vault is another report: the server moved the
		// pane, and it answers one that names the vault the pane left as one from
		// a pane it does not have, so only a report from the new vault puts it back.
		const vault = parts.vault();
		const key = JSON.stringify([vault, paneReportKey(report)]);
		if (key === publishedKey) {
			return;
		}
		publishedKey = key;
		dispatchReport(vault, report);
	}

	/** Forget the last report. */
	function forget(): void {
		publishedKey = "";
	}

	return { send, forget };
}

export { createPaneReportSender };

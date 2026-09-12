// Sending one pane's report and applying what its answer may change.
// Pushed rather than polled: an agent asking "what am I looking at" gets an
// answer off server state, not by waking a browser.

import { reportPane, type PaneReply, type PaneReport } from "@/ui/pane-session/api";
import { buildPaneReport, paneReportKey } from "@/ui/pane-session/lib/pane-report";
import type { PaneSocketConnector } from "@/ui/pane-session/lib/pane-socket";
import type { PaneSessionOptions } from "@/ui/pane-session/lib/session-contracts";
import {
	createPaneReportSequencer,
	type PaneReportCurrent,
	type PaneReportDispatch,
	type PaneReportEffects,
} from "@/ui/pane-session/workbench-socket";

/**
 * The two things the sender has to say beyond the pane's connection health,
 * taken from the session options rather than forwarded one at a time: both are
 * answers to a pane report, and this is the only place either is raised.
 */
type PaneReportListeners = Pick<
	PaneSessionOptions<never>,
	"onPaneStateAccepted" | "onStaleFrontend"
>;

/** What the sender reads and tells. */
interface PaneReportSenderParts {
	readonly paneId: string;
	readonly clientId: string;
	readonly boardKey: () => string | null;
	readonly paneElement: () => HTMLElement | null;
	readonly primary: () => boolean;
	readonly focused: () => boolean;
	readonly connector: PaneSocketConnector;
	readonly setConnected: (connected: boolean) => void;
	/**
	 * Say whether the canvas has this pane.
	 * @param registered What the canvas answered.
	 */
	readonly setRegistered: (registered: boolean) => void;
	/** The session's listeners, read at the moment there is something to say. */
	readonly listeners: () => PaneReportListeners;
}

/** One pane's report sender. */
interface PaneReportSender {
	/** Report what the pane shows, when it differs from what was last reported. */
	readonly send: () => void;
	/** Forget the last report, so the next one goes out even if equal. */
	readonly forget: () => void;
}

/** What an answer says about this tab's build, once it says anything. */
interface StaleBuild {
	/** The build the canvas serves now, which is what a repeat is judged against. */
	readonly current: string;
	/** What to tell the person about it. */
	readonly message: string;
}

/**
 * What a pane-report answer says about this tab's build, when it says anything.
 * @param result The answer, or null when the request never settled.
 * @returns The stale build, or null when nothing is stale.
 */
function staleBuildOf(result: PaneReply | null): StaleBuild | null {
	const stale = result?.staleFrontend;
	if (stale === undefined) {
		return null;
	}
	const { current, message } = stale;
	return message === null ? null : { current: current ?? "", message };
}

/**
 * Create the sender for one pane.
 * @param parts What it reads and tells.
 * @returns The sender.
 */
function createPaneReportSender(parts: PaneReportSenderParts): PaneReportSender {
	const sequencer = createPaneReportSequencer();
	let publishedKey = "";
	let acceptedListingKey = "";
	let staleBuild = "";

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
	 * Say once per build that this tab is running old code (TASK-056).
	 * @param result The pane-report answer.
	 */
	function noteStaleBuild(result: PaneReply | null): void {
		const stale = staleBuildOf(result);
		if (stale !== null && staleBuild !== stale.current) {
			staleBuild = stale.current;
			tellStaleBuild(stale.message);
		}
	}

	/**
	 * Tell the session this tab is running old code.
	 * @param message What the server said about it.
	 */
	function tellStaleBuild(message: string): void {
		const listener = parts.listeners().onStaleFrontend;
		if (listener !== undefined) {
			listener(message);
		}
	}

	/**
	 * The navigator only depends on which board this accepted pane contributes,
	 * not on where it sits; say so once per board rather than per resize. A pane
	 * going away is not visible here at all: it is the retiring pane that says
	 * so, when its socket has actually closed (TASK-167).
	 * @param report The accepted report.
	 */
	function acceptListing(report: PaneReport): void {
		const listingKey = JSON.stringify([report.clientId, report.board]);
		if (listingKey !== acceptedListingKey) {
			acceptedListingKey = listingKey;
			parts.listeners().onPaneStateAccepted?.();
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
		effects: PaneReportEffects,
		dispatch: PaneReportDispatch,
		report: PaneReport,
		result: PaneReply | null,
	): void {
		if (effects.superseded) {
			return;
		}
		applyRegistration(effects, dispatch, report);
		applyFreshness(effects, result);
	}

	/**
	 * Apply the registration half of an answer: the acknowledgement, the pane's
	 * connection health, and the listing this pane contributes to.
	 * @param effects What the sequencer permits.
	 * @param dispatch The identity the report was dispatched under.
	 * @param report The report.
	 */
	function applyRegistration(
		effects: PaneReportEffects,
		dispatch: PaneReportDispatch,
		report: PaneReport,
	): void {
		if (effects.acknowledgeRegistration) {
			dispatch.registration?.acknowledge(true);
		}
		if (effects.connectionHealth !== null) {
			parts.setConnected(effects.connectionHealth);
			parts.setRegistered(effects.connectionHealth);
		}
		if (effects.acceptPaneListing) {
			acceptListing(report);
		}
	}

	/**
	 * Apply the freshness half: forgetting a refused report, and noting that
	 * this tab is running a build the canvas no longer serves.
	 * @param effects What the sequencer permits.
	 * @param result The answer, when the request settled.
	 */
	function applyFreshness(effects: PaneReportEffects, result: PaneReply | null): void {
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
		const dispatch: PaneReportDispatch = {
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
	 * The report to send, or null when the pane cannot be measured yet.
	 *
	 * A pane showing no board still reports: it is on screen, it has a place,
	 * and it is the thing a `browser show` will point at.
	 * @returns The report.
	 */
	function build(): PaneReport | null {
		return buildPaneReport({
			boardKey: parts.boardKey(),
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

export {
	createPaneReportSender,
	type PaneReportListeners,
	type PaneReportSender,
	type PaneReportSenderParts,
};

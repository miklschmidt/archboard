// What each duration must stay under or over, as data that one test checks
// (`tests/shared/constants/relations.test.ts`). A side is a duration, a sum, or a backoff cap. The
// reason for each relation is written beside the durations it names.

import type { Backoff, Wait } from "#shared/constants/waits.ts";

/** One duration, several that run in sequence, or the longest delay of a backoff. */
type Side = Wait | readonly Wait[] | { readonly cap: Backoff };

/**
 * `[shorter, "<", longer]`: the left side must stay under the right, at most it with "<=", or as
 * long as it with "=", where one length serves two uses.
 */
type Relation = readonly [Side, "<" | "<=" | "=", Side];

/** Every relation between two durations that the code relies on. */
const RELATIONS: readonly Relation[] = [
	// A stuck request is refused while `archboard stop` still watches the server.
	["server.mutationDrain", "<", "server.stopConfirm"],
	// A stuck keep-alive is forced closed before the stop's next observation could give up.
	["server.httpStopGrace", "<", "server.stopConfirm"],
	// The pidfile can remain while HTTP closes, so give it twice the grace.
	[["server.httpStopGrace", "server.httpStopGrace"], "=", "server.stopPidfileWait"],
	// Shutdown can refuse while an admitted Git identity probe is still cancellable.
	["server.mutationDrain", "<", "git.command"],
	// One cleanup grace serves the three waits on a terminated Git group.
	["git.groupCleanup", "=", "git.groupGone"],
	["git.groupCleanup", "=", "git.groupFreeze"],
	// Failed cleanup is diagnosed before the command timeout would be.
	["git.groupCleanup", "<", "git.command"],
	["git.commandRun", "=", "git.command"],
	// An interrupted CLI never pre-empts Git's termination and its absence proof, plus a margin.
	[["git.groupCleanup", "git.groupGone", "git.groupCleanup"], "<=", "git.cliInterruptCleanup"],
	// Two network fetches and three local commands of a running fetch end before its directory is stale.
	[
		["check.vaultFetch", "check.vaultFetch", "git.command", "git.command", "git.command"],
		"<",
		"check.fetchIncomingStale",
	],
	["git.command", "<", "check.vaultFetch"],
	// Restart starts at its base and can back off at least as long as a request takes to settle.
	["codex.restart", "<=", { cap: "codex.restart" }],
	["codex.requestSettlement", "<=", { cap: "codex.restart" }],
	// Queue refreshes and work-tree stop settle inside a Codex request window.
	["codex.queueRereadFloor", "<", "codex.requestSettlement"],
	["codex.workTreeStop", "<", "codex.requestSettlement"],
	// A command lease outlasts the wait and visual approval, which outlasts the spoken gate.
	["codex.dynamicWait", "<", "codex.browserCommandLease"],
	["codex.requestSettlement", "<", "codex.browserCommandLease"],
	["codex.approvalExpiry", "<", "codex.browserCommandLease"],
	["codex.spokenGate", "<=", "codex.approvalExpiry"],
	// Reconnect fits inside tab grace, which ends before the tab's approvals would expire.
	["codex.clientReconnect", "<", "codex.tabSessionGrace"],
	["codex.tabSessionGrace", "<", "codex.approvalExpiry"],
	["codex.contextFreshness", "<", "codex.realtimeRecovery"],
	// Realtime stop, stdin EOF and TERM leave time inside the composed cap to freeze and prove the group gone.
	["codex.realtimeStop", "<", "codex.termGrace"],
	[
		["codex.realtimeStop", "codex.stdinEofGrace", "codex.termGrace", "codex.groupFreeze"],
		"<",
		"codex.composedShutdown",
	],
	// A killed group's drain runs for the rest of the composed cap, which ends it first.
	["codex.killDrain", "=", "codex.composedShutdown"],
	// Chromium's port arrives inside its start, and a page opens within as long.
	["chromium.devToolsPort", "=", "chromium.start"],
	["chromium.openPage", "=", "chromium.start"],
	// Stopping Chromium takes two phases, inside the CLI's interrupt grace with room to remove its profile.
	[["chromium.groupExit", "chromium.groupExit"], "<", "git.cliInterruptCleanup"],
	// A job's document loads inside the job's bound, and a DevTools call fits inside a job.
	["raster.documentLoad", "=", "raster.job"],
	["chromium.call", "<=", "raster.job"],
	// An agent waiting on a crashed holder outlasts its lease and gets the model.
	["modelLock.lease", "<", "modelLock.wait"],
	// A reader waits out a write as long as an agent does.
	["modelLock.readerWait", "=", "modelLock.wait"],
	// Two renewals can go missing before a live holder loses the model.
	[["modelLock.renew", "modelLock.renew"], "<", "modelLock.lease"],
	// A pane learns of a claim about as fast as the claim's lease moves.
	["modelLock.watch", "=", "modelLock.renew"],
	// One lease length serves the lock, the claim beneath a campaign and the registry's lock.
	["claim.lease", "=", "modelLock.lease"],
	["registry.lockLease", "=", "modelLock.lease"],
	// A campaign outlasts its lease, a claim of subjects runs one default campaign, and the cap is longest.
	["claim.lease", "<", "claim.campaign"],
	["claim.subjects", "=", "claim.campaign"],
	["claim.campaign", "<", "claim.campaignMax"],
	// A steal's read-back waits far less than a lease.
	["modelLock.stealGuard", "<", "modelLock.lease"],
	// A sender's claim goes stale long before its record is old enough to drop, and many rounds fit in both.
	["telemetry.round", "<", "telemetry.staleClaim"],
	["telemetry.staleClaim", "<", "telemetry.keep"],
	// A post ends long before the next round.
	["telemetry.send", "<", "telemetry.round"],
	// A recorder waits out the longest a live page stays on one state, a step's talk or voice going live.
	[["recording.stepMax", "recording.voiceStart"], "=", "recorder.stall"],
	// Voice goes live within a realtime start, and a page's readiness serves its three waits.
	["codex.realtimeStart", "<", "recording.voiceStart"],
	["recorder.pageLoad", "=", "recorder.pageReady"],
	["recorder.replayReady", "=", "recorder.pageReady"],
	// A frame call waits past the page's own frame bound, so the page's reason reaches the caller.
	["replay.frameReady", "<", "recorder.frameCall"],
	// An evaluation server's stop outlasts its own composed Codex shutdown, with one more of margin.
	[["codex.composedShutdown", "codex.composedShutdown"], "<=", "skillEval.serverGroupStop"],
	["skillEval.reap", "=", "skillEval.groupStop"],
	// The settle cap waits out a moved pane's report, with room for the round trip and a slow frame.
	["pane.report", "<", "pane.settleCap"],
	[["presentation.step", "pane.selectionDebounce"], "<", "pane.presentationPaneCheck"],
	[["picture.transition", "pane.selectionDebounce"], "<", "pane.presentationPaneCheck"],
	// One failed redial is a blip and a second is loss.
	[["pane.socketReconnect", "pane.socketReconnect"], "=", "pane.contactLost"],
	// A reload plus a redial of the pane and of the voice fit inside a tab's grace.
	[["pane.socketReconnect", "codex.clientReconnect"], "<", "codex.tabSessionGrace"],
	// A model is put up before its first frame long enough for its entrance to end.
	["picture.entry", "<", "replay.preroll"],
	// A pointer gets a quick answer, and walkthrough text is ready before the motion finishes.
	["exploring.lightingDwell", "<", "exploring.subjectTip"],
	["exploring.cameraFit", "<", "presentation.step"],
	["exploring.lightingFade", "<", "presentation.step"],
	["exploring.reveal", "<", "presentation.step"],
	["exploring.dive", "<", "presentation.step"],
	["presentation.boxIn", "<", "presentation.step"],
	["presentation.boxIn", "<", "voice.flight"],
	["presentation.boxStep", "<", "presentation.step"],
	["voice.extinguish", "<", "voice.ignite"],
	["voice.seatOut", "<", "voice.flight"],
	["voice.boxIn", "<", "voice.flight"],
	["voice.boxOut", "<", "voice.boxIn"],
	["subtitle.back", "<", "subtitle.out"],
	// A docked sidebar slides with the conversation, and a settled slide is the slide and its settling.
	["sidebar.dock", "=", "column.agentPanelSlide"],
	[["column.agentPanelSlide", "column.slideSettled"], "=", "column.agentPanelSettled"],
	["column.popoverOut", "<", "column.popoverIn"],
	["sidebar.floatOut", "<", "sidebar.floatIn"],
	// A model read that met a write is read again within the wait of an agent.
	["modelCache.busyRetry", "<", "modelLock.readerWait"],
];

export { RELATIONS };
export type { Relation };

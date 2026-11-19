// The host half of timing's tables: Archboard's own durations, waits and
// pauses, beside the published half (published.ts) that the packages
// Archboard publishes reach. timing's package.json resolves this module under
// the `published` condition to host-absent.ts, so a published build carries
// none of it. A wait or pause here may name a published duration too.

import { CHECK_MS } from "#shared/constants/checks.ts";
import { COLUMN_MS, SIDEBAR_MS } from "#shared/constants/column-motion.ts";
import { PICTURE_LOOKUP, PRESENTATION_MS } from "#shared/constants/diagram-motion.ts";
import { EXPLORING_MS } from "#shared/constants/exploring.ts";
import { GIT_MS } from "#shared/constants/git.ts";
import { CLAIM_MS, MODEL_LOCK_MS } from "#shared/constants/model-locks.ts";
import { PANE_MS } from "#shared/constants/pane.ts";
import { RASTER_MS } from "#shared/constants/raster.ts";
import { SERVER_LIFECYCLE_MS } from "#shared/constants/server-lifecycle.ts";
import { MODEL_CACHE_MS, SHELL_CLOCK_MS } from "#shared/constants/shell.ts";
import { SKILL_EVAL_MS } from "#shared/constants/skill-eval.ts";
import { TELEMETRY_MS } from "#shared/constants/telemetry.ts";
import { SUBTITLE_MS, VOICE_MS } from "#shared/constants/voice-motion.ts";
import { RECORDER_MS, RECORDING_MS } from "#shared/constants/walkthrough-recording.ts";
import { REPLAY_MS } from "#shared/constants/walkthrough-replay.ts";
import type { PUBLISHED_GROUPS } from "#shared/tables/rules/published.ts";
import type { NameOf, PausePolicy, WaitPolicy } from "#shared/tables/rules/shape.ts";

/** Each of Archboard's own groups under the name its durations start with. */
const HOST_GROUPS = Object.freeze({
	check: CHECK_MS,
	claim: CLAIM_MS,
	column: COLUMN_MS,
	exploring: EXPLORING_MS,
	git: GIT_MS,
	modelCache: MODEL_CACHE_MS,
	modelLock: MODEL_LOCK_MS,
	pane: PANE_MS,
	picture: PICTURE_LOOKUP,
	presentation: PRESENTATION_MS,
	raster: RASTER_MS,
	recorder: RECORDER_MS,
	recording: RECORDING_MS,
	replay: REPLAY_MS,
	serverLifecycle: SERVER_LIFECYCLE_MS,
	shellClock: SHELL_CLOCK_MS,
	sidebar: SIDEBAR_MS,
	skillEval: SKILL_EVAL_MS,
	subtitle: SUBTITLE_MS,
	telemetry: TELEMETRY_MS,
	voice: VOICE_MS,
});

/** Any duration, of either half. */
type AnyName = NameOf<typeof PUBLISHED_GROUPS & typeof HOST_GROUPS>;

/** Archboard's polls. */
const HOST_WAITS = Object.freeze({
	/** `archboard stop` watches the pidfile of a server that stopped answering go away. */
	"serverLifecycle.stopPidfileWait": {
		bound: "serverLifecycle.stopPidfileWait",
		cadence: "serverLifecycle.stopPidfilePoll",
		check: "afterProbe",
		sleep: "full",
	},
	/** `archboard stop` watches a signalled server stop answering. */
	"serverLifecycle.stopConfirm": {
		bound: "serverLifecycle.stopConfirm",
		cadence: "serverLifecycle.stopProbePoll",
		check: "beforeProbe",
		sleep: "full",
	},
	/** A start watches the server it spawned answer as itself. */
	"serverLifecycle.startupReadiness": {
		bound: "serverLifecycle.startupReadiness",
		cadence: "serverLifecycle.startupProbePoll",
		check: "beforeProbe",
		sleep: "full",
	},
	/** The CLI waits for the first pane of the browser it opened; it gives the browser a beat first. */
	"pane.browserConnect": {
		bound: "pane.browserConnect",
		cadence: "pane.browserConnectPoll",
		check: "beforeProbe",
		sleepFirst: true,
		sleep: "full",
	},
	/** The server waits for the panes a layout change moved to report again. */
	"pane.settleCap": {
		bound: "pane.settleCap",
		cadence: "pane.settlePoll",
		check: "beforeProbe",
		sleep: "full",
	},
	/** A dynamic wait watches its target threads, for as long as its caller asked. */
	"codexSession.waitTargets": {
		cadence: "codexSession.waitTargetPoll",
		check: "beforeProbe",
		firstProbeFree: true,
		sleep: "cutOrSkip",
	},
	/** A terminated Git command's process group goes away. */
	"git.groupCleanup": {
		bound: "git.groupCleanup",
		cadence: "git.groupPoll",
		check: "afterProbe",
		sleep: "full",
	},
	/** An evaluation's process group stops, within its caller's grace. */
	"skillEval.groupSettle": {
		cadence: "processGroup.poll",
		check: "afterProbe",
		sleep: "cut",
	},
	/** An evaluation server answers /health as itself. */
	"skillEval.serverStartup": {
		bound: "skillEval.serverStartup",
		cadence: "skillEval.healthPoll",
		check: "beforeProbe",
		sleep: "full",
	},
	/** The recorder waits for a page to offer what it drives. */
	"recorder.pageReady": {
		bound: "recorder.pageReady",
		cadence: "recorder.poll",
		check: "afterProbe",
		sleep: "full",
	},
	/** A replay frame waits for its page to be ready, one turn of the event loop at a time. */
	"replay.frameReady": {
		bound: "replay.frameReady",
		cadence: 0,
		check: "afterProbe",
		strict: true,
		sleep: "full",
	},
	/** A recording waits for the tap to pass its voice on, one turn of the event loop at a time. */
	"recording.tapDrain": {
		bound: "recording.tapDrain",
		cadence: 0,
		check: "beforeProbe",
		sleep: "full",
	},
	/** Headless Chromium opens its port, loads a document or its group exits, within its caller's time. */
	"raster.chromium": {
		cadence: "processGroup.poll",
		check: "afterProbe",
		strict: true,
		sleep: "full",
	},
} satisfies Record<string, WaitPolicy<AnyName>>);

/** Archboard's pauses. */
const HOST_PAUSES = Object.freeze({
	/** A model lock acquisition looks at the lease again; it never sleeps nothing at all. */
	"modelLock.poll": { floorMs: 1 },
	/** A Git command's process group is sampled again while it freezes. */
	"git.groupPoll": {},
	/** The recorder reads its page again. */
	"recorder.poll": {},
} satisfies Partial<Record<AnyName, PausePolicy>>);

export { HOST_GROUPS, HOST_PAUSES, HOST_WAITS };

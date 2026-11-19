// Each named wait: what bounds it, how often it looks, and the details its
// owner chose on purpose. They differ between waits, so each wait keeps its own:
// whether it sleeps before or after it looks, where it checks the bound and
// whether the bound's own moment counts, and how its last sleep meets the bound.

import type { DurationName } from "#shared/durations/names.ts";

/** How one poll waits. */
interface WaitPolicy {
	/** The bound when the caller names none. Without one, only the caller's bound or cap ends it. */
	readonly bound?: DurationName;
	/** The sleep between two looks; 0 is one turn of the event loop. */
	readonly cadence: DurationName | 0;
	/**
	 * Where the bound is checked: before each look, or after each look that found
	 * nothing, before the sleep. A wait that sleeps first checks before the sleep.
	 */
	readonly check: "beforeProbe" | "afterProbe";
	/** The first look runs whatever the time; the bound is checked before each later one. */
	readonly firstProbeFree?: true;
	/** It sleeps before each look rather than after it. */
	readonly sleepFirst?: true;
	/** It refuses only past the bound, so a look at the bound's own moment still counts. */
	readonly strict?: true;
	/**
	 * How the sleep meets the bound: in full, cut to the time left, or cut to the
	 * time left and skipped when none is left.
	 */
	readonly sleep: "full" | "cut" | "cutOrSkip";
}

/** How one pause between the passes of a loop that keeps its own decisions sleeps. */
interface PausePolicy {
	/**
	 * The shortest a pause cut to a moment sleeps. Without one, a pause with no
	 * time left before its moment does not sleep at all.
	 */
	readonly floorMs?: number;
}

/** Every named poll. */
const WAITS = Object.freeze({
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
	/** A killed Codex process group drains, until its caller's composed deadline. */
	"processGroup.killDrain": {
		cadence: "processGroup.poll",
		check: "beforeProbe",
		sleep: "cutOrSkip",
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
	/** The rasterizer waits for a document to finish loading, within the job's time. */
	"raster.documentLoad": {
		bound: "raster.jobTimeout",
		cadence: "processGroup.poll",
		check: "afterProbe",
		strict: true,
		sleep: "full",
	},
	/** Headless Chromium opens its port or its group exits, within its caller's time. */
	"raster.chromium": {
		cadence: "processGroup.poll",
		check: "afterProbe",
		strict: true,
		sleep: "full",
	},
} satisfies Record<string, WaitPolicy>);

/** Every named pause. */
const PAUSES = Object.freeze({
	/** A model lock acquisition looks at the lease again; it never sleeps nothing at all. */
	"modelLock.poll": { floorMs: 1 },
	/** A process group is sampled again while it freezes. */
	"processGroup.poll": {},
	/** A Git command's process group is sampled again while it freezes. */
	"git.groupPoll": {},
	/** A workhorse stop reads its work tree again. */
	"codexSession.workTreeStopPoll": {},
	/** The recorder reads its page again. */
	"recorder.poll": {},
} satisfies Partial<Record<DurationName, PausePolicy>>);

/** A named poll. */
type WaitName = keyof typeof WAITS;

/** A named pause. */
type CadenceName = keyof typeof PAUSES;

export { PAUSES, WAITS };
export type { CadenceName, PausePolicy, WaitName, WaitPolicy };

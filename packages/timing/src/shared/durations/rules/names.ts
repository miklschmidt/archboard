// Every duration by its name, "<owner>.<key>", such as "pane.report".
//
// The owners' groups stay in their files under `constants/`, with what each
// duration pulls against written beside it. This file only names them, so that
// the waits, the deadlines and `durationMs` read a duration the same way.

import { CHECK_MS } from "#shared/constants/checks.ts";
import {
	CODEX_APPROVAL_MS,
	CODEX_PROCESS_MS,
	CODEX_REALTIME_MS,
	CODEX_SESSION_MS,
} from "#shared/constants/codex.ts";
import { COLUMN_MS, SIDEBAR_MS } from "#shared/constants/column-motion.ts";
import { PICTURE_LOOKUP, PRESENTATION_MS } from "#shared/constants/diagram-motion.ts";
import { EXPLORING_MS } from "#shared/constants/exploring.ts";
import { GIT_MS } from "#shared/constants/git.ts";
import { CLAIM_MS, MODEL_LOCK_MS } from "#shared/constants/model-locks.ts";
import { PANE_MS } from "#shared/constants/pane.ts";
import { PROCESS_GROUP_MS } from "#shared/constants/process-groups.ts";
import { RASTER_MS } from "#shared/constants/raster.ts";
import { SERVER_LIFECYCLE_MS } from "#shared/constants/server-lifecycle.ts";
import { MODEL_CACHE_MS, SHELL_CLOCK_MS } from "#shared/constants/shell.ts";
import { SKILL_EVAL_MS } from "#shared/constants/skill-eval.ts";
import { TELEMETRY_MS } from "#shared/constants/telemetry.ts";
import { SUBTITLE_MS, VOICE_MS } from "#shared/constants/voice-motion.ts";
import { RECORDER_MS, RECORDING_MS } from "#shared/constants/walkthrough-recording.ts";
import { REPLAY_MS } from "#shared/constants/walkthrough-replay.ts";

/** Each owner's group under the name its durations start with. */
const OWNERS = Object.freeze({
	check: CHECK_MS,
	claim: CLAIM_MS,
	codexApproval: CODEX_APPROVAL_MS,
	codexProcess: CODEX_PROCESS_MS,
	codexRealtime: CODEX_REALTIME_MS,
	codexSession: CODEX_SESSION_MS,
	column: COLUMN_MS,
	exploring: EXPLORING_MS,
	git: GIT_MS,
	modelCache: MODEL_CACHE_MS,
	modelLock: MODEL_LOCK_MS,
	pane: PANE_MS,
	picture: PICTURE_LOOKUP,
	presentation: PRESENTATION_MS,
	processGroup: PROCESS_GROUP_MS,
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

type Owners = typeof OWNERS;

/** One duration of Archboard, named by its owner and its key, such as `"pane.report"`. */
type DurationName = {
	[Owner in keyof Owners]: `${Owner}.${keyof Owners[Owner] & string}`;
}[keyof Owners];

/** Every duration, by its name. */
const BY_NAME: ReadonlyMap<string, number> = new Map(
	Object.entries(OWNERS).flatMap(([owner, group]) =>
		Object.entries(group).map(([key, ms]): [string, number] => [`${owner}.${key}`, ms]),
	),
);

/**
 * One duration, by its name.
 * @param name Which one.
 * @returns It, in milliseconds.
 */
function durationOf(name: DurationName): number {
	return BY_NAME.get(name) ?? Number.NaN;
}

export { durationOf };
export type { DurationName };

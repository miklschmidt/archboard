// The skill evaluation harness (TASK-209).
//
// Every duration the on-demand skill evaluation pulls against. None of them is
// reached from the product: the harness owns its own Archboard server per run, spawns the
// archboard CLI to lay fixtures, and runs Codex authors and one grader, and
// each of those has a point past which waiting longer is a hang, not patience.

import { durations } from "#shared/constants/durations.ts";
import { CODEX_PROCESS_MS } from "#shared/constants/codex.ts";

/** The durations of one skill evaluation batch. */
const SKILL_EVAL_MS = durations({
	/** An owned evaluation server answering /health after spawn; a cold bun start on a busy box. */
	serverStartup: 20_000,
	/** Between /health probes while an evaluation server starts. */
	healthPoll: 100,
	/** One /health probe; a listener that cannot answer in this time is treated as not up yet. */
	healthRequest: 1000,
	/** Let the server finish its separately owned Codex shutdown before harness escalation, with one composed budget of margin. */
	serverShutdown: CODEX_PROCESS_MS.composedShutdown * 2,
	/** One archboard CLI call laying a fixture or reading an outcome; each is one HTTP round trip. */
	cli: 60_000,
	/** One git command fetching or checking out Flask; a first clone from the network is the slow case. */
	git: 10 * 60_000,
	/** One author run end to end; a run still going after this is killed and recorded as timed out. */
	author: 40 * 60_000,
	/** The one grading session over a whole batch; it reads three Flask revisions and every run. */
	grader: 4 * 60 * 60_000,
	/**
	 * How long the voice of a fixture's kept talk speaks about each step. Long enough for a subtitle
	 * to be read in the video an author renders from it; every second is 30 frames the author's
	 * replay draws in software, about 2.5 s of the run, so three steps render in under half a minute.
	 */
	talkStep: 3000,
	/** From SIGTERM to SIGKILL for a Codex process the harness gives up on. */
	codexTermGrace: 10_000,
});

export { SKILL_EVAL_MS };

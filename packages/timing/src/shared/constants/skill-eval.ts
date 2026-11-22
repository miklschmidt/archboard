// The skill evaluation harness (TASK-209).
//
// Every duration the on-demand skill evaluation pulls against. None of them is
// reached from the product: the harness owns its own Archboard server per run, spawns the
// archboard CLI to lay fixtures, and runs Codex authors and one grader, and
// each of those has a point past which waiting longer is a hang, not patience.

import { bound, handed, polled } from "#shared/constants/uses.ts";

/** `skillEval.groupStop`, named once so that reaping the stopped process waits as long. */
const CODEX_TERM_GRACE_MS = 10_000;

/** The durations of one skill evaluation batch. */
const SKILL_EVAL = {
	/** An owned evaluation server answering /health after spawn; a cold bun start on a busy box. */
	"skillEval.serverStartup": polled(20_000, "the evaluation server to answer /health"),
	/** One /health probe; a listener that cannot answer in this time is treated as not up yet. */
	"skillEval.healthRequest": handed(1000),
	/**
	 * Each phase of stopping an evaluation server's group: it lets the server finish its separately
	 * owned Codex shutdown before harness escalation, with one composed budget of margin.
	 */
	"skillEval.serverGroupStop": polled(2 * 10_000, "an evaluation server's process group to stop"),
	/** One archboard CLI call laying a fixture or reading an outcome; each is one HTTP round trip. */
	"skillEval.cli": handed(60_000),
	/** One git command fetching or checking out Flask; a first clone from the network is the slow case. */
	"skillEval.git": handed(10 * 60_000),
	/** One author run end to end; a run still going after this is killed and recorded as timed out. */
	"skillEval.author": handed(40 * 60_000),
	/** The one grading session over a whole batch; it reads three Flask revisions and every run. */
	"skillEval.grader": handed(4 * 60 * 60_000),
	/**
	 * How long the voice of a fixture's kept talk speaks about each step. Long enough for a subtitle
	 * to be read in the video an author renders from it; every second is 30 frames the author's
	 * replay draws in software, about 2.5 s of the run, so three steps render in under half a minute.
	 */
	"skillEval.talkStep": handed(3000),
	/** Each phase of stopping a Codex process group the harness gives up on, from SIGTERM to SIGKILL. */
	"skillEval.groupStop": polled(CODEX_TERM_GRACE_MS, "an evaluation process group to stop"),
	/** A stopped evaluation process being reaped, and its output pipes closing. */
	"skillEval.reap": bound(CODEX_TERM_GRACE_MS, "a stopped evaluation process to be reaped"),
};

export { SKILL_EVAL };

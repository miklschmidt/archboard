/** The largest complete JSONL payload accepted from or sent to Codex. */
export const CODEX_TRANSPORT_MAX_FRAME_BYTES = 1_048_576;

/** A stalled stdout line is discarded after this bound until its newline arrives. */
export const CODEX_TRANSPORT_MAX_STDOUT_BUFFER_BYTES = CODEX_TRANSPORT_MAX_FRAME_BYTES;

/** Stderr is drained in full, but only this much is retained for inspection. */
export const CODEX_TRANSPORT_MAX_STDERR_BYTES = 65_536;

/** A writer may retain only this many frames while stdin applies backpressure. */
export const CODEX_TRANSPORT_MAX_QUEUED_FRAMES = 128;

/** A writer may retain only this many queued bytes while stdin applies backpressure. */
export const CODEX_TRANSPORT_MAX_QUEUED_BYTES = 4 * 1_048_576;

/** Bounded diagnostics keep a broken child from becoming an unbounded memory sink. */
export const CODEX_TRANSPORT_MAX_RETAINED_ISSUES = 256;

/** Late results and request tombstones are finite, inspectable histories. */
export const CODEX_TRANSPORT_MAX_RETAINED_LATE_RESPONSES = 256;

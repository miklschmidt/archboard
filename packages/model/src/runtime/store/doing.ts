// What an agent said it was doing, per model of each vault.
//
// A person at the wall sees boxes move. Without this they infer the intent
// afterwards, if they can — which is the connection between a creator and what
// they are creating being broken for one of the two creators on this canvas
// (ADR 0016). So an agent says what it is doing on every write, in
// one line, and the line goes on screen as the write lands.
//
// ── This is not the change feed ───────────────────────────────────
//
// The feed reports what the model BECAME, computed by diffing it against the
// last state anybody was told about. This is what somebody SAID they were
// doing, which is a claim about intent no diff can recover: a move that changes
// nothing nameable still has one, and a line that turns out to be wrong is
// still what was said. Neither is routed through the other.
//
// ── And it is not model content ───────────────────────────────────
//
// It never reaches the note. It is not what is on the model, it is what
// somebody said while changing it, so it dies with the server — the same
// carve-out ADR 0015 draws for sockets, panes and what a person has selected.
// The requirement rides as a query parameter for that reason as much as for
// DELETE having no body: a field in an element's body is one careless spread
// away from being persisted.
//
// ── One line, and a few of them ───────────────────────────────────
//
// A list of one-liners makes current work easy to scan on the
// display. A list of paragraphs is a log nobody reads, and a transcript is
// worse. So the line is capped and the list is short, and both caps are here
// rather than in the middleware, the pane and the injector separately.

/**
 * The longest line worth putting on a wall.
 *
 * Not a truncation: a caller that writes past it is refused, because being made
 * to write the sentence is the point and a silently clipped sentence teaches
 * nothing. Long enough for "rerouting orders through the new payment queue",
 * short enough that four of them fit in the corner of a model.
 */
const DOING_MAX_CHARS = 140;

/** A line as it must arrive, or the reason it is refused. */
type DoingCheck = { ok: true; doing: string } | { ok: false; problem: string };

/**
 * Is this a line, and is it one line?
 *
 * Newlines collapse rather than being refused — a shell heredoc is not a
 * mistake worth a round trip — but length and emptiness are refusals, because
 * both mean the caller has not actually said anything.
 * @param raw What the caller wrote.
 * @returns The line, or why it is refused.
 */
function checkDoing(raw: unknown): DoingCheck {
	if (typeof raw !== "string" || !raw.trim()) {
		return { ok: false, problem: "nothing was said" };
	}
	const doing = raw.replace(/\s+/g, " ").trim();
	if (doing.length > DOING_MAX_CHARS) {
		return {
			ok: false,
			problem: `${doing.length} characters, and the cap is ${DOING_MAX_CHARS} — this goes on a wall, not into a log`,
		};
	}
	return { ok: true, doing };
}

export { DOING_MAX_CHARS, type DoingCheck, checkDoing };

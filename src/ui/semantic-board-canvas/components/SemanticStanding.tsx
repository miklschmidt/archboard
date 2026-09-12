// What a state is waiting on, said where somebody is looking at it.
//
// A draft whose predecessor has moved under it is in an odd position: what it
// says is coherent — it was written and validated as a whole — and it is also
// out of step with the architecture it was derived from, in ways nobody has
// decided yet. A picture cannot show that by itself. Drawn plainly it looks
// settled, which is the one impression it must not give.
//
// So the pane says it, in the board's own words: which variant it is waiting
// on, what the disagreements are about, and what the reconciliation itself said
// to do about each one. The words are quoted rather than rewritten here — the
// thing that found the disagreement is the thing that knows what it is.

import type { JSX } from "react";

import type { SemanticWaiting } from "@/ui/semantic-board-canvas/api/semantic-boards";

/** Inputs for the disclosure. */
interface SemanticStandingProps {
	/** What this state is waiting on, or null when it is waiting on nothing. */
	waiting: SemanticWaiting | null;
	/**
	 * What one of the variant's subjects is called.
	 * @param id The semantic id.
	 * @returns The words to use.
	 */
	nameOf: (id: string) => string;
	/**
	 * What one of the board's variants is called.
	 *
	 * A different question from the one above, and it has to be asked of a
	 * different thing: a blocking ancestor is a state of the architecture, not a
	 * subject of this one's content, so the function that names nodes and steps
	 * has never heard of it and hands back the id. "`7c40IV7N` is itself
	 * unsettled" tells a reader nothing they can act on; the name on the variant
	 * bar in front of them does.
	 * @param id The variant's id.
	 * @returns The words to use.
	 */
	variantNameOf: (id: string) => string;
}

/**
 * What the disclosure says at the top of itself.
 *
 * Three different situations, three different sentences. A draft holding its own
 * disagreements says how many; a draft waiting on an ancestor has none of its
 * own and must say whose decision it is waiting for, or "0 things nobody has
 * decided" is all a reader gets; and a draft doing both says both. Written out
 * rather than assembled from a count and a plural suffix, because somebody
 * reading "1 thing(s)" is reading a sentence nobody wrote.
 * @param waiting What this state is waiting on.
 * @param variantNameOf What to call a variant of this board.
 * @returns The sentence.
 */
function saying(waiting: SemanticWaiting, variantNameOf: (id: string) => string): string {
	const stale = "This is coherent and out of step with the variant it came from";
	const count = waiting.issues.length === 1 ? "one thing" : `${waiting.issues.length} things`;
	if (waiting.blockedBy === undefined) {
		return `${stale}: ${count} nobody has decided yet.`;
	}
	const held =
		waiting.issues.length === 0
			? ""
			: ` It is also holding ${count} of its own to settle after that.`;
	return `${stale}, and it has not been brought forward at all: "${variantNameOf(waiting.blockedBy)}" is itself unsettled, and what this proposal should say depends on what that one decides.${held}`;
}

/**
 * What this state is waiting on, or nothing when it is in step.
 * @param props The standing and how to name a subject.
 * @returns The disclosure, or null.
 */
function SemanticStanding(props: SemanticStandingProps): JSX.Element | null {
	const { waiting, nameOf, variantNameOf } = props;
	if (waiting === null) {
		return null;
	}
	return (
		<section
			data-slot="semantic-standing"
			data-issues={waiting.issues.length}
			data-blocked-by={waiting.blockedBy ?? ""}
			aria-label="What this state is waiting on"
			className="border-border bg-muted/40 shrink-0 border-b px-4 py-3"
		>
			<p className="text-body">{saying(waiting, variantNameOf)}</p>
			<ul className="mt-2 flex flex-col gap-2">
				{waiting.issues.map((issue) => (
					<li
						key={`${issue.subject}|${issue.field ?? ""}|${issue.kind}`}
						data-slot="semantic-standing-issue"
					>
						<p className="text-body">
							<span className="font-medium">{nameOf(issue.subject)}</span>
							{issue.field === undefined ? "" : ` — ${issue.field}`}
						</p>
						<p className="text-muted-foreground text-body">{issue.repair}</p>
					</li>
				))}
			</ul>
		</section>
	);
}

export { SemanticStanding, type SemanticStandingProps };

// What the inspector says about where a subject stands: how a proposal
// changed it against the state it came from, and what nobody has decided yet.
//
// Split out of the panel so the panel stays about what the board says a
// subject is, and this stays about how it is standing. Both read the same
// comparison and the same reconciliation the picture is drawn from.

import type { JSX } from "react";

import type { ChangeKind, FieldChange, ReconciliationIssue } from "@/shared/semantic-board/index";
import { Row, Section } from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";

/** How the selected subject stands against the variant this one came from. */
interface StandingProps {
	/** Its standing. */
	standing: ChangeKind;
	/** What the variant it came from is called. */
	predecessor: string;
	/** The fields that moved; empty for anything but a change. */
	moved: readonly FieldChange[];
}

/**
 * What the change did to the selected subject, and what moved.
 *
 * The picture already says which is which without words. This answers what the
 * picture cannot: a card drawn as changed does not say *what* changed, and a
 * standing without a before and an after is a badge rather than information.
 * Nothing at all for a subject that stands unchanged — most of a proposal does,
 * and saying so on every panel would bury the few that moved.
 * @param props The standing, what it is compared against, and what moved.
 * @returns The block, or nothing.
 */
function StandingBlock(props: StandingProps): JSX.Element | null {
	const sentence = standingSentence(props.standing, props.predecessor);
	if (sentence === undefined) {
		return null;
	}
	return (
		<Section title="Against this proposal's source">
			<p
				className="text-body"
				data-slot="semantic-inspector-standing"
				data-standing={props.standing}
			>
				{sentence}
			</p>
			{props.moved.length > 0 && (
				<dl
					className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2.5"
					data-slot="semantic-inspector-moved"
				>
					{props.moved.map((change) => (
						<Row
							key={change.field}
							field={change.field}
							label={change.field}
							value={
								change.field === "traffic"
									? "Illustrated traffic changed"
									: `${valueText(change.before)} → ${valueText(change.after)}`
							}
						/>
					))}
				</dl>
			)}
		</Section>
	);
}

/** Inputs for the undecided block. */
interface WaitingProps {
	/** The disagreements this subject is held up by; never empty when shown. */
	open: readonly ReconciliationIssue[];
}

/**
 * What nobody has decided about the selected subject.
 *
 * The picture says there is something open — a warning badge in the subject's
 * corner — and this is where that badge is cashed in. A badge a reader cannot
 * turn into a sentence is a badge that only tells them to worry, so the words
 * are the reconciliation's own: which field, what each side says, and the
 * repair it suggested. Quoted rather than rewritten, because the thing that
 * found the disagreement is the thing that knows what it is.
 * @param props The open disagreements.
 * @returns The block.
 */
function WaitingBlock(props: WaitingProps): JSX.Element | null {
	if (props.open.length === 0) {
		return null;
	}
	return (
		<Section title="Nobody has decided this yet">
			<ul className="flex flex-col gap-2.5" data-slot="semantic-inspector-waiting">
				{props.open.map((issue) => (
					// The repair is part of the identity, not decoration. One subject can
					// hold two disagreements of the same kind about no field at all — a
					// relationship whose predecessor took both of its endpoints away
					// reports one for each end — and a key built from the kind and the
					// field alone is the same key twice.
					<li key={`${issue.kind}|${issue.field ?? ""}|${issue.repair}`}>
						<p className="text-body">
							{issue.field === undefined ? issue.what : `${issue.what} — ${issue.field}`}
						</p>
						<p className="text-muted-foreground text-body">{issue.repair}</p>
					</li>
				))}
			</ul>
		</Section>
	);
}

/**
 * One compared value that is not a list, in words a person reads.
 * @param value What the field said.
 * @returns The words to show.
 */
function plainText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return value === undefined || value === null ? "not set" : JSON.stringify(value);
}

/**
 * One compared value, in words a person reads.
 *
 * A field's two values arrive as whatever the contract writes there — a string,
 * a number, a list of ids, a code binding, a drill-down target — and all of
 * them have to be shown. The small closed records are written out as they are
 * spelled rather than summarised, because which part of a binding moved is
 * exactly what a reader is asking; a field nobody has filled in says so in
 * words rather than showing an empty cell, which reads as a rendering fault.
 * @param value What the field said.
 * @returns The words to show.
 */
function valueText(value: unknown): string {
	if (!Array.isArray(value)) {
		return plainText(value);
	}
	const written: readonly unknown[] = value;
	return written.length === 0 ? "nothing" : written.map((one) => valueText(one)).join(", ");
}

/**
 * What a subject's standing says, in a sentence.
 *
 * The picture says which is which in shape, lightness and texture; this says it
 * in words, and names the state being compared against so that "changed" is
 * never changed-from-nowhere. Nothing is said about a subject that stands
 * unchanged: most of a proposal does, and a line on every card saying so would
 * bury the handful that did move.
 * @param standing How the subject stands.
 * @param predecessor What the variant it came from is called.
 * @returns The sentence, or undefined when there is nothing to say.
 */
function standingSentence(standing: ChangeKind, predecessor: string): string | undefined {
	if (standing === "added") {
		return `New in this proposal. It was not on ${predecessor}.`;
	}
	if (standing === "removed") {
		return `Not on this proposal. It is shown from ${predecessor} to say what the change takes away.`;
	}
	return standing === "changed" ? `Changed since ${predecessor}.` : undefined;
}

export { StandingBlock, WaitingBlock, standingSentence, valueText, type StandingProps };

// What the inspector says about where a subject stands: how the variant on
// screen differs on it from the variant it is read against — the current one,
// or on a board with none the one it came from — what nobody has decided yet,
// and what the last code check found about it.
//
// One region of the panel, set right after what the subject is, because for a
// reader of a proposal it is what the panel is for: it is not the last thing at
// the foot of a long list of relationships. A subject that stands unchanged has
// no such region, and neither has one with nothing open and nothing found.
//
// Split out of the panel so the panel stays about what the board says a
// subject is, and this stays about how it is standing. Both read the same
// comparison and the same reconciliation the picture is drawn from.

import type { JSX } from "react";

import type { ChangeKind, FieldChange } from "@archboard/board/comparison";
import { cn } from "@archboard/ui-kit/components";
import {
	CodeBlock,
	type CodeStanding,
} from "#ui/components/semantic-board-canvas/SemanticInspectorCode.tsx";
import {
	SidebarRegion,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import type { ReconciliationIssueSchema } from "@archboard/board/reconciliation";
import type { z } from "zod";

type ReconciliationIssue = z.infer<typeof ReconciliationIssueSchema>;

/** How the selected subject stands against the variant this one is read against. */
interface StandingProps {
	/** Its standing. */
	standing: ChangeKind;
	/** What the variant it is read against is called. */
	against: string;
	/** The fields that moved; empty for anything but a change. */
	moved: readonly FieldChange[];
}

/** Inputs for one field that moved. */
interface MovedProps {
	/** The field, with what it said and what it says. */
	change: FieldChange;
}

/** Inputs for one value of a field that moved. */
interface MovedValueProps {
	/** What the field said, or says. */
	text: string;
	/** Which it is. */
	when: "was" | "now";
}

/**
 * One value of a field that moved, after the word that says which it is: what
 * it said first and quieter, what it says under that, the whole of each wrapped.
 * @param props The value.
 * @returns The value.
 */
function MovedValue(props: MovedValueProps): JSX.Element {
	return (
		<dd className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-1.5">
			<span className="text-muted-foreground text-body">{props.when}</span>
			<span
				className={cn(
					"text-body [overflow-wrap:anywhere]",
					props.when === "was" && "text-muted-foreground",
				)}
			>
				{props.text}
			</span>
		</dd>
	);
}

/**
 * One field that moved, its name over what it said and what it says: the whole
 * of both, because which part of a long description or a binding moved is
 * exactly what a reader is asking.
 * @param props The field.
 * @returns The field.
 */
function Moved(props: MovedProps): JSX.Element {
	const { change } = props;
	return (
		<div data-field={change.field} className="flex flex-col gap-1">
			<dt className="text-muted-foreground text-body">{change.field}</dt>
			{change.field === "traffic" ? (
				<dd className="text-body">Illustrated traffic changed</dd>
			) : (
				<>
					<MovedValue text={valueText(change.before)} when="was" />
					<MovedValue text={valueText(change.after)} when="now" />
				</>
			)}
		</div>
	);
}

/** Inputs for the standing block. */
interface StandingBlockProps {
	/** How the subject stands, or null when the variant is read against nothing. */
	against: StandingProps | null;
}

/**
 * What to say in a sentence of how the subject stands: nothing for one that
 * stands unchanged, and nothing for a changed one whose fields say it already.
 * @param against How it stands.
 * @returns The sentence, or undefined.
 */
function sentenceOf(against: StandingProps): string | undefined {
	if (against.standing === "changed" && against.moved.length > 0) {
		return undefined;
	}
	return standingSentence(against.standing, against.against);
}

/**
 * Whether the subject differs from what it is read against, so that there is
 * something to say of it.
 * @param against How it stands, or null.
 * @returns Whether it does.
 */
function differs(against: StandingProps | null): against is StandingProps {
	return against !== null && (against.moved.length > 0 || sentenceOf(against) !== undefined);
}

/**
 * How the selected subject differs, and what moved.
 *
 * The picture already says which is which without words. This answers what the
 * picture cannot: a card drawn as changed does not say *what* changed, and a
 * standing without a before and an after is a badge rather than information.
 * Nothing at all for a subject that stands unchanged — most of a variant does,
 * and saying so on every panel would bury the few that moved.
 * @param props How it stands, what it is compared against, and what moved.
 * @returns The block, or nothing.
 */
function StandingBlock(props: StandingBlockProps): JSX.Element | null {
	const { against } = props;
	if (!differs(against)) {
		return null;
	}
	const sentence = sentenceOf(against);
	return (
		<SidebarSection
			title={`Against ${against.against}`}
			slot="semantic-inspector-against"
			level={3}
		>
			{sentence !== undefined && (
				<p
					className="text-body"
					data-slot="semantic-inspector-standing"
					data-standing={against.standing}
				>
					{sentence}
				</p>
			)}
			{against.moved.length > 0 && (
				<dl data-slot="semantic-inspector-moved" className="mt-1 flex flex-col gap-2">
					{against.moved.map((change) => (
						<Moved key={change.field} change={change} />
					))}
				</dl>
			)}
		</SidebarSection>
	);
}

/** Inputs for the undecided block. */
interface WaitingProps {
	/** The disagreements this subject is held up by; empty when it is held up by none. */
	open: readonly ReconciliationIssue[];
	/** Authored subject names for a whole-reading disclosure outside a subject inspector. */
	names?: ReadonlyMap<string, string>;
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
 * @returns The block, or nothing.
 */
function WaitingBlock(props: WaitingProps): JSX.Element | null {
	if (props.open.length === 0) {
		return null;
	}
	return (
		<SidebarSection
			title="Nobody has decided this yet"
			slot="semantic-inspector-undecided"
			level={3}
		>
			<ReconciliationIssues {...props} />
		</SidebarSection>
	);
}

/**
 * Canonical readings and legacy inspectors share the same explicit disagreement values.
 * @param props The unresolved issues from the runtime.
 * @returns Each subject, field, proposal value, predecessor value, and repair instruction.
 */
function ReconciliationIssues(props: WaitingProps): JSX.Element {
	return (
		<ul className="flex flex-col gap-4" data-slot="semantic-inspector-waiting">
			{props.open.map((issue) => (
				<li
					key={JSON.stringify([issue.subject, issue.kind, issue.field, issue.repair])}
					data-subject-id={issue.subject}
					data-field={issue.field}
				>
					<p className="text-body font-medium">
						{issueName(issue, props.names)}
						{issue.field === undefined ? "" : ` · ${issue.field}`}
					</p>
					<dl className="text-body mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 [overflow-wrap:anywhere]">
						<dt className="text-muted-foreground">Proposal</dt>
						<dd data-value="mine">{valueText(issue.mine)}</dd>
						<dt className="text-muted-foreground">Predecessor</dt>
						<dd data-value="theirs">{valueText(issue.theirs)}</dd>
					</dl>
					<p className="text-muted-foreground text-body mt-2">{issue.repair}</p>
				</li>
			))}
		</ul>
	);
}

/**
 * A whole-reading issue names its subject even when the coherent side no longer contains it.
 * @param issue The exact unresolved subject.
 * @param names Optional authored names from the coherent model.
 * @returns Its subject name or stable identity, with legacy inspector wording preserved.
 */
function issueName(issue: ReconciliationIssue, names: WaitingProps["names"]): string {
	return names === undefined ? issue.what : (names.get(issue.subject) ?? issue.subject);
}

/** Inputs for the standing region. */
interface StandingRegionProps extends WaitingProps, StandingBlockProps {
	/** What the last code check found about the subject, or null when it found nothing. */
	code: CodeStanding | null;
}

/**
 * The region of the panel that says where the subject stands: what nobody has
 * decided about it and what the code check found, the two things the warning
 * on the picture stands for, then how it differs from what it is read against.
 * @param props What is open on the subject, what the code check found, and how it stands.
 * @returns The region, or nothing when there is nothing to say.
 */
function Standing(props: StandingRegionProps): JSX.Element | null {
	const { open, against, code } = props;
	if (open.length === 0 && !differs(against) && code === null) {
		return null;
	}
	return (
		<SidebarRegion slot="semantic-inspector-standing-region">
			<WaitingBlock open={open} />
			<CodeBlock code={code} />
			<StandingBlock against={against} />
		</SidebarRegion>
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
 * never changed-from-nowhere. The words hold whichever way the two variants lie
 * in time: a historical variant is read against the current one as much as a
 * proposal is. Nothing is said about a subject that stands unchanged: most of a
 * variant does, and a line on every card saying so would bury the handful that
 * did move.
 * @param standing How the subject stands.
 * @param against What the variant it is read against is called.
 * @returns The sentence, or undefined when there is nothing to say.
 */
function standingSentence(standing: ChangeKind, against: string): string | undefined {
	if (standing === "added") {
		return `On this variant and not on ${against}.`;
	}
	if (standing === "removed") {
		return `Not on this variant. It is shown from ${against} to say what differs.`;
	}
	return standing === "changed" ? `Different on ${against}.` : undefined;
}

export { Standing, ReconciliationIssues, type StandingProps };

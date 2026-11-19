// What the inspector says about where a subject stands: how the variant on
// screen differs on it from the variant it is read against — the current one,
// or on a model with none the one it came from — what nobody has decided yet,
// and what the last code check found about it.
//
// One region of the panel, set right after what the subject is, because for a
// reader of a proposal it is what the panel is for: it is not the last thing at
// the foot of a long list of relationships. A subject that stands unchanged has
// no such region, and neither has one with nothing open and nothing found.
//
// Split out of the panel so the panel stays about what the model says a
// subject is, and this stays about how it is standing. Both read the same
// comparison and the same reconciliation the picture is drawn from.

import type { RemixiconComponentType } from "@remixicon/react";
import { type ChangeObject, diffWords } from "diff";
import type { JSX } from "react";

import type { ChangeKind, FieldChange } from "@archboard/model/comparison";
import { cn } from "@archboard/ui-kit/components";
import {
	CodeBlock,
	type CodeStanding,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";
import {
	SidebarRegion,
	SidebarSection,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticSidebarParts.tsx";
import { StandingSample } from "#ui/architecture-drawing/canvas/presentation/components/SemanticTypeSamples.tsx";
import { SectionLabel } from "#ui/shell/components/SectionLabel.tsx";
import type { ReconciliationIssueSchema } from "@archboard/model/reconciliation";
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
	/** What the field said, or says, in runs that are marked where they moved. */
	runs: readonly WordRun[];
	/** Which it is. */
	when: "was" | "now";
}

/** A run of words of one value, and whether it moved. */
interface WordRun {
	/** Where the run starts in the value. */
	at: number;
	/** The words. */
	text: string;
	/** Whether the other value does not have them. */
	moved: boolean;
}

/** How each side of a moved field is drawn: its gutter mark, the word that names it, and its tints. */
const SIDES = {
	was: {
		mark: "−",
		line: "bg-standing-removed/6",
		run: "bg-standing-removed/20",
		ink: "text-standing-removed",
	},
	now: {
		mark: "+",
		line: "bg-standing-added/6",
		run: "bg-standing-added/20",
		ink: "text-standing-added",
	},
} as const;

/**
 * One value of a field that moved, as a line of a diff: a gutter mark, − for what it said and +
 * for what it says, on a faint tint of its side, the whole value wrapped. The words that moved
 * carry a stronger tint: in red where they were taken out, in green where they were put in. The
 * mark names its side, `was` or `now`, to assistive technology.
 * @param props The value.
 * @returns The value.
 */
function MovedValue(props: MovedValueProps): JSX.Element {
	const Mark = props.when === "was" ? "del" : "ins";
	const side = SIDES[props.when];
	return (
		<dd
			data-side={props.when}
			className={cn("grid grid-cols-[1rem_minmax(0,1fr)] py-1 pr-3", side.line)}
		>
			<span aria-hidden="true" className={cn("text-body text-center font-mono", side.ink)}>
				{side.mark}
			</span>
			<span
				className={cn(
					"text-body [overflow-wrap:anywhere]",
					props.when === "was" ? "text-muted-foreground" : "text-body-foreground",
				)}
			>
				<span className="sr-only">{props.when} </span>
				{props.runs.map((run) =>
					run.moved ? (
						<Mark
							key={run.at}
							className={cn(
								"text-foreground rounded-chip [box-decoration-break:clone] no-underline",
								side.run,
							)}
						>
							{run.text}
						</Mark>
					) : (
						<span key={run.at}>{run.text}</span>
					),
				)}
			</span>
		</dd>
	);
}

/**
 * The two values of a field that moved, each cut into runs of words that are
 * marked where they moved. Two values that share no word are left whole: when
 * all of a value moved, a mark on all of it says nothing the words do not.
 * @param before What the field said.
 * @param after What it says.
 * @returns The runs of each.
 */
function wordRuns(before: string, after: string): Record<"was" | "now", WordRun[]> {
	const parts = diffWords(before, after);
	if (!parts.some((part) => !part.added && !part.removed && /[\p{L}\p{N}_]/u.test(part.value))) {
		return {
			was: [{ at: 0, text: before, moved: false }],
			now: [{ at: 0, text: after, moved: false }],
		};
	}
	return {
		was: runsOf(parts.filter((part) => !part.added)),
		now: runsOf(parts.filter((part) => !part.removed)),
	};
}

/**
 * The parts of a word diff that make up one value, as runs that know where they
 * start. The space round the words that moved is not marked, so a mark holds
 * words alone.
 * @param parts The parts, in order.
 * @returns The runs.
 */
function runsOf(parts: readonly ChangeObject<string>[]): WordRun[] {
	const runs: WordRun[] = [];
	let at = 0;
	/**
	 * Add a run that holds any text.
	 * @param text Its words.
	 * @param moved Whether they moved.
	 */
	const push = (text: string, moved: boolean): void => {
		if (text !== "") {
			runs.push({ at, text, moved });
			at += text.length;
		}
	};
	for (const part of parts) {
		if (!part.added && !part.removed) {
			push(part.value, false);
			continue;
		}
		const words = part.value.trim();
		const lead = part.value.length - part.value.trimStart().length;
		push(part.value.slice(0, lead), false);
		push(words, true);
		push(part.value.slice(lead + words.length), false);
	}
	return runs;
}

/**
 * One field that moved, its name over what it said and what it says: the whole of both, with the
 * words that moved marked, because which part of a long description or a binding moved is exactly
 * what a reader is asking.
 * @param props The field.
 * @returns The field.
 */
function Moved(props: MovedProps): JSX.Element {
	const { change } = props;
	const runs = wordRuns(valueText(change.before), valueText(change.after));
	return (
		<div data-field={change.field} className="flex flex-col py-2">
			<dt className="text-body text-foreground px-3 pb-1.5 font-medium">
				{fieldName(change.field)}
			</dt>
			{change.field === "traffic" ? (
				<dd className="text-body px-3">Illustrated traffic changed</dd>
			) : (
				<>
					<MovedValue runs={runs.was} when="was" />
					<MovedValue runs={runs.now} when="now" />
				</>
			)}
		</div>
	);
}

/**
 * A field's name as a reader reads it: its first word capitalized, and the humps of a compound
 * name parted into words.
 * @param field The field, as the comparison names it.
 * @returns The name.
 */
function fieldName(field: string): string {
	const words = field.replace(/[A-Z]/gu, (hump) => ` ${hump.toLowerCase()}`);
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Inputs for the standing block. */
interface StandingBlockProps {
	/** How the subject stands, or null when the variant is read against nothing. */
	against: StandingProps | null;
	/** The icon of the section, where its column draws section icons. */
	icon?: RemixiconComponentType | undefined;
}

/**
 * Whether the subject differs from what it is read against, so that there is
 * something to say of it.
 * @param against How it stands, or null.
 * @returns Whether it does.
 */
function differs(against: StandingProps | null): against is StandingProps {
	return (
		against !== null && (against.moved.length > 0 || standingWord(against.standing) !== undefined)
	);
}

/** The tint of each standing's chip. */
const CHIP_TINTS = {
	added: "border-standing-added/40 bg-standing-added/12",
	changed: "border-standing-changed/40 bg-standing-changed/12",
	removed: "border-standing-removed/40 bg-standing-removed/12",
} as const;

/**
 * How the subject stands, as a chip at the end of the section's head: the mark that the picture
 * and the change list put on it, and its word.
 * @param props The standing.
 * @param props.standing How the subject stands.
 * @returns The chip, or nothing for a subject that stands unchanged.
 */
function StandingChip(props: { readonly standing: ChangeKind }): JSX.Element | null {
	const { standing } = props;
	const word = standingWord(standing);
	if (word === undefined || standing === "unchanged") return null;
	return (
		<span
			data-slot="semantic-inspector-standing"
			data-standing={standing}
			className={cn(
				"text-body text-foreground rounded-chip inline-flex h-5 shrink-0 items-center gap-1 border px-1.5",
				CHIP_TINTS[standing],
			)}
		>
			<StandingSample standing={standing} />
			{word}
		</span>
	);
}

/**
 * How the selected subject differs, and what moved.
 *
 * The picture already says which is which without words. This answers what the
 * picture cannot: a card drawn as changed does not say *what* changed, and a
 * standing without a before and an after is a badge rather than information.
 * So the head names the state it is read against and how the subject stands
 * there, and a card under it sets each moved field out as a diff. Nothing at all
 * for a subject that stands unchanged — most of a variant does, and saying so on
 * every panel would bury the few that moved.
 * @param props How it stands, what it is compared against, and what moved.
 * @returns The block, or nothing.
 */
function StandingBlock(props: StandingBlockProps): JSX.Element | null {
	const { against } = props;
	if (!differs(against)) {
		return null;
	}
	const title = `Against ${against.against}`;
	return (
		<section
			data-slot="semantic-inspector-against"
			aria-label={title}
			className="border-border flex flex-col gap-1.5 border-t pt-4"
		>
			<div className="flex min-h-6 items-center justify-between gap-2">
				<h3 className="m-0 min-w-0">
					<SectionLabel icon={props.icon} title={title} />
				</h3>
				<StandingChip standing={against.standing} />
			</div>
			{against.moved.length > 0 && (
				<dl
					data-slot="semantic-inspector-moved"
					className="plate divide-border m-0 flex flex-col divide-y overflow-hidden"
				>
					{against.moved.map((change) => (
						<Moved key={change.field} change={change} />
					))}
				</dl>
			)}
		</section>
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
	/** Lay it in a place that keeps its own margins and rules. */
	flush?: boolean;
}

/**
 * The region of the panel that says where the subject stands: what nobody has
 * decided about it and what the code check found, the two things the warning
 * on the picture stands for, then how it differs from what it is read against.
 * @param props What is open on the subject, what the code check found, and how it stands.
 * @returns The region, or nothing when there is nothing to say.
 */
function Standing(props: StandingRegionProps): JSX.Element | null {
	const { open, against, code, flush, icon } = props;
	if (open.length === 0 && !differs(against) && code === null) {
		return null;
	}
	const blocks = (
		<>
			<WaitingBlock open={open} />
			<CodeBlock code={code} />
			<StandingBlock against={against} icon={icon} />
		</>
	);
	return flush === true ? (
		<div data-slot="semantic-inspector-standing-region" className="flex flex-col gap-4">
			{blocks}
		</div>
	) : (
		<SidebarRegion slot="semantic-inspector-standing-region">{blocks}</SidebarRegion>
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
 * What a subject's standing says, in a word.
 *
 * The picture says which is which in shape, lightness and texture; this says it
 * in words, beside the name of the state being compared against, so that
 * "changed" is never changed-from-nowhere. The words hold whichever way the two
 * variants lie in time: a historical variant is read against the current one as
 * much as a proposal is. Nothing is said about a subject that stands unchanged:
 * most of a variant does, and a word on every card saying so would bury the
 * handful that did move.
 * @param standing How the subject stands.
 * @returns The word, or undefined when there is nothing to say.
 */
function standingWord(standing: ChangeKind): string | undefined {
	if (standing === "added") return "Added";
	if (standing === "removed") return "Removed";
	return standing === "changed" ? "Changed" : undefined;
}

export { Standing, ReconciliationIssues, type StandingProps };

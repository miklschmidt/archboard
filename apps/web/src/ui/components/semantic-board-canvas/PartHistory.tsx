import { useCallback, useState, type JSX, type ReactNode } from "react";

import type { LocalityAnswer } from "@archboard/code-intel/history";
import type { SemanticNode } from "@archboard/board/content";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarHeading,
	SidebarLabel,
	SidebarMeta,
	SidebarRow,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { usePeekControl } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import {
	partLocality,
	type PartLocality,
	type Partner,
} from "#ui/rules/semantic-board-canvas/board/part-locality.ts";

/** A part the reading did not read, and why. */
type BehindSkip = LocalityAnswer["skipped"][number];

/** One commit in the period. */
type LocalityCommit = LocalityAnswer["commits"][number];

/** One period of the reading. */
type LocalityPeriod = LocalityAnswer["periods"][number];

/** How many of a part's commits show before the person asks for the rest. */
const FIRST_COMMITS = 5;

/**
 * Why the lens did not read a part, in words, for each reason the answer gives.
 * The region has no heading, so each sentence says that it is about the
 * history of the part's code.
 */
const SKIPPED: Readonly<Record<BehindSkip["reason"], string>> = {
	unbound: "It is bound to no code, so Git has no history of it.",
	"drill-down":
		"It opens a board of its own, and the parts of that board carry the history of its code.",
	"repository-unregistered":
		"The history of its code is not read, because its repository is not registered on this machine.",
	"checkout-unavailable":
		"The history of its code is not read, because its checkout could not be read.",
	"ref-not-checked-out":
		"The history of its code is not read, because its binding names a ref that its checkout does not have out.",
};

/** The pure source-history display, shared by canonical module readers. */
interface PartHistoryProps {
	readonly answer: Omit<LocalityAnswer, "board" | "version" | "variant">;
	readonly subject: string;
	readonly nodes: readonly Pick<SemanticNode, "id" | "kind">[];
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
}

/**
 * Show the selected module's commits, coupled modules, or explicit source limitation.
 * @param props The coherent analysis and subject identities.
 * @returns Source evidence without any architecture reads or fabricated board metadata.
 */
function PartHistory(props: PartHistoryProps): JSX.Element {
	const { answer, subject } = props;
	const reading = partLocality(answer, subject);
	if (reading.kind !== "read") return <Unread reading={reading} />;
	return (
		<>
			<Commits commits={reading.commits} period={reading.period} />
			{reading.commits.length > 0 && (
				<Partners
					partners={reading.partners}
					nodes={props.nodes}
					look={props.look}
					onPick={props.onPick}
				/>
			)}
			<LeftOut count={answer.leftOut.largeCommits} />
		</>
	);
}

/**
 * Why the answer holds nothing about the part.
 * @param props What the answer says about it.
 * @param props.reading That it was skipped, with the reason, or that it is not in the answer.
 * @returns The line.
 */
function Unread(props: {
	readonly reading: Exclude<PartLocality, { readonly kind: "read" }>;
}): JSX.Element {
	const { reading } = props;
	if (reading.kind === "absent") {
		return <Note>The architecture changed while its code history was read.</Note>;
	}
	const { skip } = reading;
	// What the reason rests on, where it rests on a fact: the repository, the
	// refs, what the checkout said. A part that is unbound or opens a board of
	// its own needs none.
	const said = skip.reason !== "unbound" && skip.reason !== "drill-down";
	const facts = [
		said ? skip.repo : undefined,
		skip.ref === undefined ? undefined : `${skip.ref.named} named, ${skip.ref.checkedOut} out`,
		skip.detail,
	].filter((fact) => fact !== undefined);
	return (
		<div data-slot="semantic-inspector-history-skipped" data-reason={skip.reason}>
			<Note>{SKIPPED[skip.reason]}</Note>
			{facts.map((fact) => (
				<p
					key={fact}
					className="text-technical text-muted-foreground font-mono [overflow-wrap:anywhere]"
				>
					{fact}
				</p>
			))}
		</div>
	);
}

/**
 * How many large commits the answer left out of every count, when it left any
 * out. The answer counts them for the whole board and not for each part, so
 * the line says that before it gives the number.
 * @param props The count.
 * @param props.count How many.
 * @returns The line, or nothing.
 */
function LeftOut(props: { readonly count: number }): JSX.Element | null {
	const { count } = props;
	if (count === 0) {
		return null;
	}
	return (
		<Note slot="semantic-inspector-large-commits" count={count}>
			{count === 1
				? "In this model, one large commit of over 30 files is left out of every count."
				: `In this model, ${count} large commits of over 30 files are left out of every count.`}
		</Note>
	);
}

/** Inputs for the commits. */
interface CommitsProps {
	readonly commits: readonly LocalityCommit[];
	readonly period: LocalityPeriod | undefined;
}

/**
 * The part's commits in the period, newest first, under the day the period starts.
 * @param props The commits and the period they are of.
 * @returns The section.
 */
function Commits(props: CommitsProps): JSX.Element {
	const { commits, period } = props;
	const since = period === undefined ? undefined : `since ${day(period.since, true)}`;
	return (
		<Counted
			title="Recent commits"
			count={commits.length}
			slot="semantic-inspector-commits"
			aside={since}
		>
			{commits.length === 0 ? (
				<Note>No commit changed it in this period.</Note>
			) : (
				<CommitList commits={commits} />
			)}
		</Counted>
	);
}

/**
 * The commits: the first few, and the rest when the person asks.
 * @param props The commits.
 * @param props.commits The commits, newest first.
 * @returns The list and the control that shows the rest.
 */
function CommitList(props: { readonly commits: readonly LocalityCommit[] }): JSX.Element {
	const { commits } = props;
	const [all, setAll] = useState(false);
	const toggle = useCallback((): void => setAll((shown) => !shown), []);
	return (
		<>
			<ul className="flex flex-col" data-slot="semantic-inspector-commit-list">
				{(all ? commits : commits.slice(0, FIRST_COMMITS)).map((commit) => (
					<SidebarRow as="li" key={commit.commit} data-commit={commit.commit}>
						<SidebarLabel>
							{commit.subject}
							<SidebarMeta technical>
								{commit.commit.slice(0, 7)} · {day(commit.committedAt, false)}
							</SidebarMeta>
						</SidebarLabel>
					</SidebarRow>
				))}
			</ul>
			{commits.length > FIRST_COMMITS && (
				<SmallButton onClick={toggle} expanded={all}>
					{all ? "Show fewer" : `Show all ${commits.length}`}
				</SmallButton>
			)}
		</>
	);
}

/** Inputs for the parts that change with this one. */
interface PartnersProps {
	readonly partners: readonly Partner[];
	/** The variant that holds the parts, for each one's kind. */
	readonly nodes: PartHistoryProps["nodes"];
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
}

/**
 * The parts whose code changes in the same commits as this part's, each with
 * how many commits the two share.
 * @param props The parts, and what to do with a pick.
 * @returns The section.
 */
function Partners(props: PartnersProps): JSX.Element {
	const { partners, nodes, look, onPick } = props;
	const kinds = new Map(nodes.map((node) => [node.id, node.kind]));
	return (
		<Counted title="Changes with" count={partners.length} slot="semantic-inspector-partners">
			{partners.length === 0 ? (
				<Note>No other part changes in enough of the same commits.</Note>
			) : (
				<SidebarChoices label="Changes with" slot="semantic-inspector-partner-list">
					{partners.map((partner) => (
						<PartnerRow
							key={partner.subject.id}
							partner={partner}
							kind={kinds.get(partner.subject.id) ?? "other"}
							look={look}
							onPick={onPick}
						/>
					))}
				</SidebarChoices>
			)}
		</Counted>
	);
}

/** Inputs for one part that changes with this one. */
interface PartnerRowProps {
	readonly partner: Partner;
	readonly kind: string;
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
}

/**
 * One part that changes with this one, as the choice that picks it out: its
 * name with the number of shared commits at the end of the line, how much of
 * their change that is, and whether nothing on the board joins the two.
 * Pointing at it, or focusing it, lights the part on the picture.
 * @param props The part and what to do with a pick.
 * @returns The row.
 */
function PartnerRow(props: PartnerRowProps): JSX.Element {
	const { partner, look, onPick } = props;
	const { id, name } = partner.subject;
	const { point } = usePeekControl();
	const aim = useCallback((): void => point(id), [point, id]);
	const leave = useCallback((): void => point(null), [point]);
	const choose = useCallback((): void => onPick(id), [onPick, id]);
	return (
		<SidebarChoice
			data-slot="semantic-inspector-partner"
			data-part={id}
			data-shared={partner.shared}
			data-unjoined={partner.unjoined}
			onClick={choose}
			onPointerEnter={aim}
			onPointerLeave={leave}
			onFocus={aim}
			onBlur={leave}
		>
			<SidebarGlyph>
				<KindIcon look={look} kind={props.kind} className="text-foreground/80 size-4" />
			</SidebarGlyph>
			<SidebarLabel>
				{name}
				<SidebarMeta>
					{partner.shared} commits together, {partner.degree}% of their changes
				</SidebarMeta>
				{/* The question the reading asks, so in the ink rather than the quiet tone. */}
				{partner.unjoined && (
					<span className="text-body block leading-4 font-normal">
						No relationship joins these modules
					</span>
				)}
			</SidebarLabel>
		</SidebarChoice>
	);
}

/** Inputs for a counted section. */
interface CountedProps {
	readonly title: string;
	readonly count: number;
	/** Where tests and styles find it. */
	readonly slot: string;
	/** A quiet fact at the end of the heading's line: the start of the period. */
	readonly aside?: string | undefined;
	readonly children: ReactNode;
}

/**
 * A section whose heading carries its count, as Sends to and Entry points do.
 * @param props The heading, the count, a fact beside them and what the section holds.
 * @returns The section.
 */
function Counted(props: CountedProps): JSX.Element {
	return (
		<section
			data-slot={props.slot}
			data-count={props.count}
			aria-label={props.title}
			className="flex flex-col gap-1"
		>
			<div className="flex min-h-6 items-center justify-between gap-2">
				<SidebarHeading level={3}>
					{props.title}{" "}
					<span className="text-technical ml-0.5 font-mono font-normal">{props.count}</span>
				</SidebarHeading>
				{props.aside !== undefined && (
					<span className="text-technical text-muted-foreground font-mono">{props.aside}</span>
				)}
			</div>
			{props.children}
		</section>
	);
}

/**
 * A quiet line of the region.
 * @param props The words, and where tests find them.
 * @param props.slot Where tests and styles find it.
 * @param props.count A number the words carry, for tests.
 * @param props.children The words.
 * @returns The line.
 */
function Note(props: {
	readonly slot?: string;
	readonly count?: number;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<p
			data-slot={props.slot}
			data-count={props.count}
			className="text-muted-foreground text-body [overflow-wrap:anywhere]"
		>
			{props.children}
		</p>
	);
}

/**
 * A small outlined control under a list, the size of the trace controls.
 * @param props What it says and does.
 * @param props.onClick What pressing it does.
 * @param props.expanded Whether what it opens is open, when it opens something.
 * @param props.children What it says.
 * @returns The control.
 */
function SmallButton(props: {
	readonly onClick: () => void;
	readonly expanded?: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-expanded={props.expanded}
			onClick={props.onClick}
			className="text-body border-border hover:bg-sidebar-accent/50 rounded-control flex h-6 shrink-0 items-center self-start border px-2 transition-colors"
		>
			{props.children}
		</button>
	);
}

/**
 * A day as a reader says it, with the year when it is not this year's or when
 * asked for.
 * @param at When, as the server wrote it.
 * @param year Whether to say the year whatever it is.
 * @returns The words.
 */
function day(at: string, year: boolean): string {
	const date = new Date(at);
	const withYear = year || date.getFullYear() !== new Date().getFullYear();
	return date.toLocaleDateString([], {
		day: "numeric",
		month: "short",
		...(withYear ? { year: "numeric" } : {}),
	});
}

export { PartHistory };

// What a person reaches by picking something out of a diagram.
//
// The card in the picture says a node's name, its kind and, when it has one,
// the single line it is responsible for. That is all a card can carry and stay
// readable, and ADR 0023 makes the rest reachable rather than drawn: the longer
// description, the one optional primary code binding, the board one level down,
// and what the last code check found about it.
//
// Everything here comes from the board document rather than from the picture.
// The atlas decides what can be picked out of the drawing on screen; the board
// decides what that thing is. Keeping those apart is what lets a narrowed view
// draw fewer subjects without the inspector losing the ability to explain the
// ones it does draw.

import { useQuery } from "@tanstack/react-query";
import type { JSX, ReactNode } from "react";

import {
	addressedVariant,
	everyStep,
	isMessage,
	stepWords,
	type FlowStep,
	type ReconciliationIssue,
	type SemanticBoard,
	type SemanticNode,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { RelationshipChip } from "@/ui/semantic-board-canvas/components/KindMarks";
import { DetailsPanel } from "@/ui/semantic-board-canvas/components/DetailsPanel";
import type { RememberedReading } from "@/shared/code-check/index";
import type { CodeBinding } from "@archboard/code-binding/code-binding";
import {
	Account,
	Facts,
	Row,
	SubjectTitle,
	type GroupControls,
} from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import {
	Standing,
	type StandingProps,
} from "@/ui/semantic-board-canvas/components/SemanticInspectorStanding";
import {
	SidebarRegion,
	SidebarSection,
} from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import type { CodeStanding } from "@/ui/semantic-board-canvas/components/SemanticInspectorCode";
import { cn } from "@/ui/components/class-names";
import {
	useCodeFindings,
	type ReadingOnScreen,
} from "@/ui/semantic-board-canvas/hooks/use-code-findings";
import { useSemanticBoardChanges } from "@/ui/semantic-board-canvas/hooks/use-semantic-board-changes";
import type { KindLook } from "@/ui/semantic-board-canvas/lib/kind-look";
import { semanticBoardDocumentQuery } from "@/ui/semantic-board-canvas/lib/queries";
import {
	depictionOf,
	readBoard,
	subjectOf,
	type EdgeSubject,
	type FlowSubject,
	type StepSubject,
	type Subject,
} from "@/ui/semantic-board-canvas/lib/board-document";
import { usePaneVault } from "@/ui/semantic-board-canvas/hooks/use-pane-vault";
import type { OpenDown } from "@/ui/semantic-board-canvas/lib/drill-target";

/**
 * What a part is called, or the id the board names it by when the variant no
 * longer holds it.
 * @param node The part, when the variant still holds it.
 * @param id The id the board names it by.
 * @returns The name.
 */
function nameOf(node: SemanticNode | undefined, id: string): string {
	return node?.name ?? id;
}

/** Inputs for the flow body. */
interface FlowBodyProps {
	/** The selected exchange, with its cast. */
	subject: FlowSubject;
	/** Where it stands, set between what it is and who takes part. */
	children: ReactNode;
}

/**
 * Everything the board says about one exchange.
 * @param props The flow.
 * @returns The body.
 */
function FlowBody(props: FlowBodyProps): JSX.Element {
	const { flow, participants } = props.subject;
	return (
		<>
			<SidebarRegion slot="semantic-inspector-about">
				<SubjectTitle name={flow.name}>
					<span>Exchange</span>
				</SubjectTitle>
				<Account lead={flow.summary} />
			</SidebarRegion>
			{props.children}
			<SidebarRegion slot="semantic-inspector-wiring">
				<SidebarSection title="Taking part" slot="semantic-inspector-cast" level={3}>
					<p className="text-body" data-slot="semantic-inspector-participants">
						{participants.join(", ")}
					</p>
					<p className="text-body" data-slot="semantic-inspector-step-count">
						{flow.steps.length === 1 ? "One message" : `${flow.steps.length} messages`}
					</p>
				</SidebarSection>
			</SidebarRegion>
		</>
	);
}

/** Inputs for the step body. */
interface StepBodyProps {
	/** The selected message, with its ends and where it comes. */
	subject: StepSubject;
	/** Where it stands, set between what it is and where it comes. */
	children: ReactNode;
}

/**
 * What sort of step one is, in the words of its line under the title.
 * @param step The step.
 * @returns A message and its kind, or a decision, or a loop.
 */
function stepSort(step: FlowStep): string {
	if (step.kind === "decision") return "Decision";
	if (step.kind === "loop") return "Loop";
	return `Message · ${step.kind}`;
}

/**
 * Everything the board says about one step of an exchange.
 *
 * Where it comes is part of what it means, which is why the comparison treats a
 * step's position as one of its own fields.
 * @param props The step.
 * @returns The body.
 */
function StepBody(props: StepBodyProps): JSX.Element {
	const { step, flow, position, from, to } = props.subject;
	return (
		<>
			<SidebarRegion slot="semantic-inspector-about">
				<SubjectTitle name={stepWords(step)}>
					<span>{stepSort(step)}</span>
				</SubjectTitle>
				<Account detail={step.note} />
			</SidebarRegion>
			{props.children}
			<SidebarRegion slot="semantic-inspector-wiring">
				<SidebarSection title="In this exchange" slot="semantic-inspector-exchange" level={3}>
					<Facts>
						<Row field="flow" label="flow" value={flow.name} />
						{/* Counted within the state that holds this message, which for one
						    this variant does not send is the variant it is read against. The
						    composed picture the diagram is drawn from holds both at once and
						    is nobody's architecture, so nothing is counted against it. */}
						<Row
							field="position"
							label="step"
							value={`${position} of ${everyStep(flow.steps).length}`}
						/>
						{isMessage(step) && <Row label="from" value={nameOf(from, step.from)} />}
						{isMessage(step) && <Row label="to" value={nameOf(to, step.to)} />}
						{isMessage(step) && step.repeat !== undefined && (
							<Row label="repeats" value={`${step.repeat}×`} />
						)}
						{step.kind === "decision" && (
							<Row
								label="answers"
								value={step.alternatives.map((alternative) => alternative.label).join(", ")}
							/>
						)}
					</Facts>
				</SidebarSection>
			</SidebarRegion>
		</>
	);
}

/** Inputs for the edge body. */
interface EdgeBodyProps {
	/** The selected relationship, with the nodes at its ends. */
	subject: EdgeSubject;
	/** How the vault's kinds look, for the relationship's kind. */
	look: KindLook;
	/** Where it stands, set between what it is and what it joins. */
	children: ReactNode;
}

/**
 * Everything the board says about one relationship.
 * @param props The relationship.
 * @returns The body.
 */
function EdgeBody(props: EdgeBodyProps): JSX.Element {
	const { edge, from, to } = props.subject;
	return (
		<>
			<SidebarRegion slot="semantic-inspector-about">
				<SubjectTitle name={edge.label ?? "Connection"}>
					<RelationshipChip look={props.look} kind={edge.kind} />
				</SubjectTitle>
				<Account detail={edge.description} />
			</SidebarRegion>
			{props.children}
			<SidebarRegion slot="semantic-inspector-wiring">
				<SidebarSection title="Between" slot="semantic-inspector-between" level={3}>
					<Facts>
						<Row label="from" value={nameOf(from, edge.from)} />
						<Row label="to" value={nameOf(to, edge.to)} />
					</Facts>
				</SidebarSection>
			</SidebarRegion>
		</>
	);
}

/**
 * Whichever of the other three bodies the selected subject calls for. A part
 * has its own panel, `DetailsPanel`.
 * @param subject What the board says the selection is.
 * @param look How the vault's kinds look.
 * @param standing Where the subject stands, which each body sets after what it is.
 * @returns The body.
 */
function bodyFor(
	subject: EdgeSubject | FlowSubject | StepSubject,
	look: KindLook,
	standing: ReactNode,
): JSX.Element {
	if (subject.kind === "edge") {
		return (
			<EdgeBody subject={subject} look={look}>
				{standing}
			</EdgeBody>
		);
	}
	return subject.kind === "flow" ? (
		<FlowBody subject={subject}>{standing}</FlowBody>
	) : (
		<StepBody subject={subject}>{standing}</StepBody>
	);
}

/** Inputs for the body. */
interface BodyProps {
	/**
	 * Open the code a node is bound to, when the shell around the pane can.
	 * @param binding Where the code is.
	 */
	onOpenCode?: ((binding: CodeBinding) => void) | undefined;
	/** What the board says the selection is, or undefined while that is not known. */
	subject: Subject | undefined;
	/** What to say when there is no subject: still reading, or a reason. */
	notice: string;
	/** How the subject stands, and what moved, when this variant is read against another. */
	against: StandingProps | null;
	/** What about this subject nobody has decided yet. */
	open: readonly ReconciliationIssue[];
	/** What the last code check found about this subject, or null for nothing. */
	code: CodeStanding | null;
	/**
	 * Open the board one level down.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	onOpen: OpenDown;
	/** How to name the groups a node belongs to, and select one. */
	groups: GroupControls;
	/** The state that holds the subject: its relationships are read there. */
	held: SemanticVariant | undefined;
	/** The level of the board drawn, which places the boards its parts open. */
	level: string | undefined;
	/** The board, variant and version on screen, which a part's history is read at. */
	on: ReadingOnScreen | null;
	/** How the vault's kinds look. */
	look: KindLook;
	/**
	 * Pick another part out.
	 * @param id The part.
	 */
	onPick: (id: string | null) => void;
}

/**
 * The inspector's body for whatever was picked out.
 *
 * What the change did to the subject is a region of its own, after what the
 * subject is, rather than a badge on the title: for a changed subject it is not
 * one word but a list of fields with two values each.
 * @param props The subject, what the change did to it, the fallback words and the drill-down action.
 * @returns The body.
 */
function InspectorBody(props: BodyProps): JSX.Element {
	const { subject, against } = props;
	if (subject === undefined) {
		return <p className="text-muted-foreground text-body px-4 py-4">{props.notice}</p>;
	}
	const standing = <Standing open={props.open} against={against} code={props.code} />;
	if (subject.kind === "node" && props.held !== undefined) {
		return (
			<DetailsPanel
				subject={subject}
				look={props.look}
				groups={props.groups}
				onPick={props.onPick}
				onOpen={props.onOpen}
				onOpenCode={props.onOpenCode}
				level={props.level}
				on={props.on}
				held={props.held}
			>
				{standing}
			</DetailsPanel>
		);
	}
	if (subject.kind === "node") {
		return <p className="text-muted-foreground text-body px-4 py-4">{props.notice}</p>;
	}
	return bodyFor(subject, props.look, standing);
}

/** What the board turned out to say about the selection, and what to say instead. */
interface Explanation {
	/** The subject, when the board holds one under that id. */
	readonly subject: Subject | undefined;
	/** What to say when it does not. */
	readonly notice: string;
	/** How it stands against the variant this one is read against, when there is one. */
	readonly against: StandingProps | null;
	/** What about this subject nobody has decided yet; empty when nothing is open. */
	readonly open: readonly ReconciliationIssue[];
	/** The state that holds the subject, when one does. */
	readonly held: SemanticVariant | undefined;
	/** The board's level, once it is read. */
	readonly level?: string | undefined;
	/** The board, variant and version the subject was read from, for the code check's findings. */
	readonly on: ReadingOnScreen | null;
}

/**
 * What one selected id is, read from the state that actually holds it.
 *
 * The variant on screen first, and for a subject it does not hold, the variant
 * it is read against. Both halves matter and for the same reason: every
 * number a subject carries — where a message comes in its exchange, how many
 * messages that exchange has, what a container holds — is a count of one
 * architecture, and it must come from the architecture that has the subject in
 * it.
 *
 * Not, in particular, from the depiction the renderer was given. That content
 * is the variant with what only the other side has put back, which is a picture
 * of a difference and is not what either variant says: counted against it, an
 * added step would be third of three in a flow of one, and a removed step second of
 * three in an exchange that only ever had two. A removed subject is read where
 * it lived, so it is counted among the things it lived with.
 * @param board The board the variant belongs to.
 * @param shown The variant the picture is of.
 * @param selection The picked semantic id.
 * @returns The subject and how it stands, or neither.
 */
function comparedSubject(
	board: SemanticBoard,
	shown: SemanticVariant,
	selection: string,
): Pick<Explanation, "subject" | "against" | "held"> {
	const depiction = depictionOf(board, shown);
	const other = depiction.against;
	const own = subjectOf(shown, selection);
	const subject = own ?? (other === undefined ? undefined : subjectOf(other, selection));
	const held = own === undefined ? other : shown;
	if (subject === undefined || other === undefined) {
		return { subject, held, against: null };
	}
	return {
		subject,
		held,
		against: {
			standing: depiction.standing(selection),
			against: other.name,
			moved: depiction.moved(selection),
		},
	};
}

/**
 * What the board says about one selected id.
 *
 * Every way this can come up empty is a different piece of news, and each says
 * so: the read failed, the board has not arrived yet, the board is unreadable,
 * the variant on screen is gone, or the subject itself is gone. A person who
 * acts on the wrong one of those goes looking for the wrong thing — and the
 * worst of the five to get wrong is a failure shown as waiting, because waiting
 * for something that is never coming looks exactly like a panel that is slow.
 * @param vault The vault the board is in.
 * @param read How the board's own read went.
 * @param read.data The board document, when it has arrived.
 * @param read.error Why the read failed, when it did.
 * @param variant The id of the variant the drawing is of.
 * @param selection The picked semantic id.
 * @returns The subject, or the words that stand in for it.
 */
function explain(
	vault: string,
	read: { readonly data: unknown; readonly error: Error | null },
	variant: string,
	selection: string,
): Explanation {
	const { data: document } = read;
	const nothing = {
		subject: undefined,
		against: null,
		open: [],
		held: undefined,
		on: null,
	} as const;
	if (read.error !== null) {
		return { ...nothing, notice: `This board could not be read. ${read.error.message}` };
	}
	if (document === undefined) {
		return { ...nothing, notice: "Reading the board…" };
	}
	const reading = readBoard(document);
	if (!reading.ok) {
		return { ...nothing, notice: `This board could not be read. ${reading.problem}` };
	}
	const opened = addressedVariant(reading.board, variant);
	if (!opened.ok) {
		return { ...nothing, notice: `This board cannot say what is on screen: ${opened.problem}.` };
	}
	const shown = opened.variant;
	return {
		...comparedSubject(reading.board, shown, selection),
		level: reading.board.level,
		open: openOn(shown, selection),
		on: {
			vault,
			board: reading.board.name,
			variant: shown.id,
			version: reading.board.version,
		},
		notice: "This is not on the board any more. It may have gone since the picture was drawn.",
	};
}

/**
 * What nobody has decided about one subject.
 *
 * The variant's own reconciliation, which is where the picture's warning badges
 * come from as well, narrowed to the subject somebody picked out — so the badge
 * in the corner and the words in this panel are two readings of one fact.
 * @param shown The variant the picture is of.
 * @param selection The picked semantic id.
 * @returns Its open disagreements, which is usually none.
 */
function openOn(shown: SemanticVariant, selection: string): readonly ReconciliationIssue[] {
	const issues = shown.reconciliation?.issues ?? [];
	return issues.filter((issue) => issue.subject === selection);
}

/**
 * What the last code check found about one subject, warnings first.
 * @param reading What the pass found on the board on screen, or null.
 * @param selection The picked semantic id.
 * @returns Its findings and when the pass ran, or null when there are none.
 */
function codeOn(reading: RememberedReading | null, selection: string): CodeStanding | null {
	const findings = (reading?.findings ?? [])
		.filter((finding) => finding.subject?.id === selection)
		.toSorted((a, b) => Number(b.severity === "warning") - Number(a.severity === "warning"));
	return reading === null || findings.length === 0
		? null
		: { findings, checkedAt: reading.checkedAt };
}

/** Inputs for the inspector. */
interface SemanticInspectorProps {
	/**
	 * Open the code a node is bound to, when the shell around the pane can.
	 * @param binding Where the code is.
	 */
	onOpenCode?: ((binding: CodeBinding) => void) | undefined;
	/** The board on screen. */
	board: string;
	/** The id of the variant the drawing is of. */
	variant: string;
	/** The picked semantic id. */
	selection: string;
	/**
	 * Open the board one level down.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	onOpen: OpenDown;
	/** How to name the groups a node belongs to, and select one. */
	groups: GroupControls;
	/** How the vault's kinds look. */
	look: KindLook;
	/**
	 * Pick a part out: the one at the other end of a relationship.
	 * @param id The part, or null.
	 */
	onPick: (id: string | null) => void;
}

/**
 * What the board says about whatever the person picked out.
 * @param props The board, the variant, the selection and what can be opened from it.
 * @returns The inspector, as the sidebar's selection panel.
 */
function SemanticInspector(props: SemanticInspectorProps): JSX.Element {
	const vault = usePaneVault();
	const document = useQuery(semanticBoardDocumentQuery(vault, props.board));
	// Read on the same terms as the picture — no timer, fresh when the board
	// announces a new version — and subscribed here rather than relied on from
	// above, under the same spelling of the board name that the read used. A
	// subscription that does not cover the thing being read is an
	// infinitely-fresh answer to a question whose answer has moved.
	useSemanticBoardChanges(vault, props.board);
	const explained = explain(vault, document, props.variant, props.selection);
	const { subject } = explained;
	const code = codeOn(useCodeFindings(explained.on), props.selection);

	return (
		// A panel of the sidebar, which keeps one width whatever it shows, so
		// picking a card out never changes the size of the pane and never moves
		// the diagram under the pointer that picked it.
		<section
			aria-label="Semantic inspector"
			data-slot="semantic-inspector"
			data-subject={subject?.kind ?? "unknown"}
			data-standing={explained.against?.standing}
			className={cn(
				"flex min-h-0 flex-1 flex-col",
				subject?.kind === "node" ? "overflow-hidden" : "overflow-y-auto",
			)}
		>
			<InspectorBody
				subject={subject}
				against={explained.against}
				open={explained.open}
				code={code}
				held={explained.held}
				level={explained.level}
				on={explained.on}
				look={props.look}
				onPick={props.onPick}
				notice={explained.notice}
				onOpen={props.onOpen}
				groups={props.groups}
				onOpenCode={props.onOpenCode}
			/>
		</section>
	);
}

export { SemanticInspector, type SemanticInspectorProps };

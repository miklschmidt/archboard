// What a person reaches by picking something out of a diagram.
//
// The card in the picture says a node's name, its kind and, when it has one,
// the single line it is responsible for. That is all a card can carry and stay
// readable, and ADR 0023 makes the rest reachable rather than drawn: the longer
// description, the one optional primary code binding, and the board one level down.
//
// Everything here comes from the board document rather than from the picture.
// The atlas decides what can be picked out of the drawing on screen; the board
// decides what that thing is. Keeping those apart is what lets a narrowed view
// draw fewer subjects without the inspector losing the ability to explain the
// ones it does draw.

import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";

import {
	addressedVariant,
	type ReconciliationIssue,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { SemanticAppearance } from "@/ui/semantic-board-canvas/components/SemanticAppearance";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";
import { SemanticDrillDown } from "@/ui/semantic-board-canvas/components/SemanticDrillDown";
import type { CodeBinding } from "@/shared/code-target";
import {
	BindingBody,
	Described,
	Memberships,
	Row,
	Section,
	TitleBlock,
	type GroupControls,
} from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import {
	StandingBlock,
	WaitingBlock,
	type StandingProps,
} from "@/ui/semantic-board-canvas/components/SemanticInspectorStanding";
import { useSemanticBoardChanges } from "@/ui/semantic-board-canvas/hooks/use-semantic-board-changes";
import { semanticBoardDocumentQuery } from "@/ui/semantic-board-canvas/lib/queries";
import {
	depictionOf,
	readBoard,
	subjectOf,
	type EdgeSubject,
	type FlowSubject,
	type NodeSubject,
	type StepSubject,
	type Subject,
} from "@/ui/semantic-board-canvas/lib/board-document";

/** Inputs for the flow body. */
interface FlowBodyProps {
	/** The selected exchange, with its cast. */
	subject: FlowSubject;
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
			<TitleBlock name={flow.name} kind="flow" id={flow.id} responsibility={flow.summary} />
			<Section title="Taking part">
				<p className="text-body" data-slot="semantic-inspector-participants">
					{participants.join(", ")}
				</p>
				<p className="text-body" data-slot="semantic-inspector-step-count">
					{flow.steps.length === 1 ? "One message" : `${flow.steps.length} messages`}
				</p>
			</Section>
		</>
	);
}

/** Inputs for the step body. */
interface StepBodyProps {
	/** The selected message, with its ends and where it comes. */
	subject: StepSubject;
}

/**
 * Everything the board says about one message of an exchange.
 *
 * Where it comes is part of what it means, which is why the comparison treats a
 * step's position as one of its own fields.
 * @param props The message.
 * @returns The body.
 */
function StepBody(props: StepBodyProps): JSX.Element {
	const { step, flow, position, from, to } = props.subject;
	return (
		<>
			<TitleBlock name={step.label} kind={step.kind} id={step.id} />
			<Section title="In this exchange">
				<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2.5">
					<Row field="flow" label="flow" value={flow.name} />
					{/* Counted within the state that holds this message, which for one
					    the proposal has stopped sending is the state it came from. The
					    composed picture the diagram is drawn from holds both at once and
					    is nobody's architecture, so nothing is counted against it. */}
					<Row field="position" label="step" value={`${position} of ${flow.steps.length}`} />
					<Row label="from" value={from?.name ?? step.from} />
					<Row label="to" value={to?.name ?? step.to} />
					{step.repeat !== undefined && <Row label="repeats" value={`${step.repeat}×`} />}
				</dl>
			</Section>
			<Described text={step.note} />
		</>
	);
}

/** Inputs for the node body. */
interface NodeBodyProps {
	/** The selected node. */
	subject: NodeSubject;
	/**
	 * Open the board one level down.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	onOpen: (board: string, variant: string) => void;
	/**
	 * Open the code a node is bound to, when the shell around the pane can.
	 * @param binding Where the code is.
	 */
	onOpenCode?: (binding: CodeBinding) => void;
	/** How to name and inspect the groups the node belongs to. */
	groups: GroupControls;
}

/**
 * Everything the board says about one node.
 * @param props The node and how to follow its drill-down.
 * @returns The body.
 */
function NodeBody(props: NodeBodyProps): JSX.Element {
	const { node } = props.subject;
	return (
		<>
			<TitleBlock
				name={node.name}
				kind={node.kind}
				id={node.id}
				responsibility={node.responsibility}
			/>
			<Memberships groups={node.groups} controls={props.groups} />
			<Described text={node.description} />
			<Section title="Bound repository">
				<BindingBody
					binding={node.binding}
					{...(props.onOpenCode === undefined ? {} : { onOpenCode: props.onOpenCode })}
				/>
			</Section>
			{node.drillDown !== undefined && (
				<div className="border-border border-t">
					<div className="px-4 py-4">
						<SemanticDrillDown target={node.drillDown} onOpen={props.onOpen} />
					</div>
				</div>
			)}
		</>
	);
}

/** Inputs for the edge body. */
interface EdgeBodyProps {
	/** The selected relationship, with the nodes at its ends. */
	subject: EdgeSubject;
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
			<TitleBlock name={edge.label ?? "Connection"} kind={edge.kind} id={edge.id} />
			<Section title="Between">
				<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2.5">
					<Row label="from" value={from?.name ?? edge.from} />
					<Row label="to" value={to?.name ?? edge.to} />
				</dl>
			</Section>
			<Described text={edge.description} />
		</>
	);
}

/**
 * Whichever of the four bodies the selected subject calls for.
 * @param subject What the board says the selection is.
 * @param props What a node body needs beyond the subject.
 * @param props.onOpen Open the board one level down, given its board and variant.
 * @param props.onOpenCode Open the code a node is bound to, when the shell can.
 * @param props.groups How to name and inspect groups.
 * @returns The body.
 */
function bodyFor(
	subject: Subject,
	props: Pick<BodyProps, "onOpen" | "onOpenCode" | "groups">,
): JSX.Element {
	if (subject.kind === "node") {
		return (
			<NodeBody
				subject={subject}
				onOpen={props.onOpen}
				groups={props.groups}
				{...(props.onOpenCode === undefined ? {} : { onOpenCode: props.onOpenCode })}
			/>
		);
	}
	if (subject.kind === "edge") {
		return <EdgeBody subject={subject} />;
	}
	return subject.kind === "flow" ? <FlowBody subject={subject} /> : <StepBody subject={subject} />;
}

/** Inputs for the body. */
interface BodyProps {
	/**
	 * Open the code a node is bound to, when the shell around the pane can.
	 * @param binding Where the code is.
	 */
	onOpenCode?: (binding: CodeBinding) => void;
	/** What the board says the selection is, or undefined while that is not known. */
	subject: Subject | undefined;
	/** What to say when there is no subject: still reading, or a reason. */
	notice: string;
	/** How the subject stands, and what moved, when this variant came from one. */
	against: StandingProps | null;
	/** What about this subject nobody has decided yet. */
	open: readonly ReconciliationIssue[];
	/**
	 * Open the board one level down.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	onOpen: (board: string, variant: string) => void;
	/** How to name and inspect the groups a node belongs to. */
	groups: GroupControls;
}

/**
 * The inspector's body for whatever was picked out.
 *
 * What the change did to the subject is a section of its own rather than a badge
 * on the title: for a changed subject it is not one word but a list of fields
 * with two values each.
 * @param props The subject, what the change did to it, the fallback words and the drill-down action.
 * @returns The body.
 */
function InspectorBody(props: BodyProps): JSX.Element {
	const { subject, against } = props;
	if (subject === undefined) {
		return <p className="text-muted-foreground text-body px-4 py-4">{props.notice}</p>;
	}
	return (
		<>
			{bodyFor(subject, props)}
			<WaitingBlock open={props.open} />
			{against !== null && (
				<StandingBlock
					standing={against.standing}
					predecessor={against.predecessor}
					moved={against.moved}
				/>
			)}
		</>
	);
}

/** What the board turned out to say about the selection, and what to say instead. */
interface Explanation {
	/** The subject, when the board holds one under that id. */
	readonly subject: Subject | undefined;
	/** What to say when it does not. */
	readonly notice: string;
	/** How it stands against the variant this one came from, when it came from one. */
	readonly against: StandingProps | null;
	/** What about this subject nobody has decided yet; empty when nothing is open. */
	readonly open: readonly ReconciliationIssue[];
}

/**
 * What one selected id is, read from the state that actually holds it.
 *
 * The proposal first, and for a subject the proposal no longer holds, the
 * variant it came from. Both halves matter and for the same reason: every
 * number a subject carries — where a message comes in its exchange, how many
 * messages that exchange has, what a container holds — is a count of one
 * architecture, and it must come from the architecture that has the subject in
 * it.
 *
 * Not, in particular, from the depiction the renderer was given. That content
 * is the proposal with what its change took away put back, which is a *picture*
 * of a change and is not what either variant says: counted against it, an added
 * step would be third of three in a flow of one, and a removed step second of
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
): Pick<Explanation, "subject" | "against"> {
	const depiction = depictionOf(board, shown);
	const { predecessor } = depiction;
	const subject =
		subjectOf(shown, selection) ??
		(predecessor === undefined ? undefined : subjectOf(predecessor, selection));
	if (subject === undefined || predecessor === undefined) {
		return { subject, against: null };
	}
	return {
		subject,
		against: {
			standing: depiction.standing(selection),
			predecessor: predecessor.name,
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
 * @param read How the board's own read went.
 * @param read.data The board document, when it has arrived.
 * @param read.error Why the read failed, when it did.
 * @param variant The id of the variant the drawing is of.
 * @param selection The picked semantic id.
 * @returns The subject, or the words that stand in for it.
 */
function explain(
	read: { readonly data: unknown; readonly error: Error | null },
	variant: string,
	selection: string,
): Explanation {
	const { data: document } = read;
	const nothing = { subject: undefined, against: null, open: [] } as const;
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
		open: openOn(shown, selection),
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

/** Inputs for the inspector. */
interface SemanticInspectorProps {
	/** Appearance of the selected subject in the exact picture on screen. */
	appearance?: AppliedAppearance | undefined;
	/**
	 * Open the code a node is bound to, when the shell around the pane can.
	 * @param binding Where the code is.
	 */
	onOpenCode?: (binding: CodeBinding) => void;
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
	onOpen: (board: string, variant: string) => void;
	/** How to name and inspect the groups a node belongs to. */
	groups: GroupControls;
}

/**
 * What the board says about whatever the person picked out.
 * @param props The board, the variant, the selection and what can be opened from it.
 * @returns The inspector, as the sidebar's selection panel.
 */
function SemanticInspector(props: SemanticInspectorProps): JSX.Element {
	const document = useQuery(semanticBoardDocumentQuery(props.board));
	// Read on the same terms as the picture — no timer, fresh when the board
	// announces a new version — and subscribed here rather than relied on from
	// above, under the same spelling of the board name that the read used. A
	// subscription that does not cover the thing being read is an
	// infinitely-fresh answer to a question whose answer has moved.
	useSemanticBoardChanges(props.board);
	const explained = explain(document, props.variant, props.selection);
	const { subject } = explained;

	return (
		// A panel of the sidebar, which keeps one width whatever it shows, so
		// picking a card out never changes the size of the pane and never moves
		// the diagram under the pointer that picked it.
		<section
			aria-label="Semantic inspector"
			data-slot="semantic-inspector"
			data-subject={subject?.kind ?? "unknown"}
			data-standing={explained.against?.standing}
			className="flex min-h-0 flex-1 flex-col overflow-y-auto"
		>
			<InspectorBody
				subject={subject}
				against={explained.against}
				open={explained.open}
				notice={explained.notice}
				onOpen={props.onOpen}
				groups={props.groups}
				{...(props.onOpenCode === undefined ? {} : { onOpenCode: props.onOpenCode })}
			/>
			<SemanticAppearance
				subject={subject}
				appearance={props.appearance}
				standing={explained.against?.standing}
			/>
		</section>
	);
}

export { SemanticInspector, type SemanticInspectorProps };

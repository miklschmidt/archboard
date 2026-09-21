import type {
	ChildEpoch,
	ChildId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";
import type {
	ChangeKind,
	DiagramGrammar,
	ReconciliationKind,
	VariantLifecycle,
} from "@/shared/semantic-board/index";
import type { SemanticSubjectKind } from "@/shared/semantic-pane-context/index";

type SemanticChangeOrigin = "human" | "agent" | "mixed";
type SemanticChangeSignificance = "layout" | "structural" | "cosmetic";
type SemanticBriefSource = "settled_change" | "pane_focus" | "pane_selection" | "fresh_brief";
type SemanticThreadLinkState = "executable" | "inspect_only" | "unbound";
type SemanticClaimHolder = "human" | "agent" | "none";
type SemanticPublisherPort = "settled_change" | "pane_focus" | "pane_selection";

type SemanticUnsubscribe = () => void;

interface SemanticCursor {
	readonly feedId: string;
	readonly sequence: number;
}

type SemanticCursorInput = SemanticCursor;

/** The settled fields consumed from the existing change feed. */
interface SettledChangeSourceEvent {
	readonly cursor: number;
	readonly board: string;
	readonly at: string;
	readonly origin: SemanticChangeOrigin;
	readonly significance: SemanticChangeSignificance;
	readonly text: string;
	/**
	 * The agent session that made the write, when the feed could attribute it.
	 *
	 * A session rather than a surface, and it outlives a turn: a write that
	 * lands after the turn that made it is still that session's own. Optional,
	 * so a feed that cannot attribute a write is one that delivers everything
	 * rather than one that does not compile; absent and null both mean "tell
	 * everybody".
	 */
	readonly by?: string | null;
}

/** The one settled-change callback the existing change feed provides. */
interface SettledChangeSource {
	readonly onChange: (listener: (event: SettledChangeSourceEvent) => void) => SemanticUnsubscribe;
}

/** A source adapter for immediate pane telemetry. It owns no settle timer. */
interface PaneSignalSource {
	readonly onFocus: (listener: (input: SemanticContextInput) => void) => SemanticUnsubscribe;
	readonly onSelection: (listener: (input: SemanticContextInput) => void) => SemanticUnsubscribe;
}

/** A board/context reader used only by the on-demand fresh-brief port. */
interface FreshBriefSource {
	readonly read: () => SemanticContextInput;
}

interface SemanticBoardInput {
	readonly key: string;
	/** The name every command spells the board with. */
	readonly name: string;
	/** The document that holds it, which is a path and never content. */
	readonly file: string;
	readonly version: number | null;
}

/**
 * What of a pane's reading the user changed by hand: a part the pane marked in its report
 * (ADR 0034), or the pane having become the one they are in.
 */
type SemanticUserChange = "board" | "variant" | "view" | "selection" | "focus";

interface SemanticPaneInput {
	readonly paneId: string;
	readonly focused: boolean;
	/**
	 * What the user changed by hand to bring this about. Absent means nothing, which is what
	 * a change an agent or the canvas caused says, and what nobody is told about.
	 */
	readonly userChanged?: readonly SemanticUserChange[];
}

interface SemanticThreadLinkInput {
	readonly state: SemanticThreadLinkState;
	readonly reason: string | null;
}

interface SemanticWorkhorseInput {
	readonly threadId: ThreadId | null;
	readonly turnId: TurnId | null;
}

interface SemanticCoordinatorInput {
	readonly threadId: ThreadId | null;
	readonly realtimeSessionId: RealtimeSessionId | null;
}

interface SemanticChildInput {
	readonly id: ChildId | null;
	readonly epoch: ChildEpoch | null;
}

interface SemanticClaimInput {
	readonly holder: SemanticClaimHolder;
	readonly doing: string | null;
}

/**
 * One subject of a variant, named the way every command names it.
 *
 * The id is what an edit, a resolution or a walkthrough beat takes; the name is
 * what a person said out loud. Nothing here is a coordinate, a lane or an
 * element: an agent that is handed one of these can act on it without asking
 * the picture anything (ADR 0023).
 */
interface SemanticSubjectInput {
	readonly kind: SemanticSubjectKind;
	readonly id: string;
	readonly name: string | null;
}

/**
 * What the person has picked out: how many, then as many as the brief can hold.
 *
 * The count is never trimmed, for the same reason the reconciliation's is. A
 * selection the brief had to drop would otherwise read as nobody having selected
 * anything, and "nothing is selected" is an answer an agent gives confidently
 * and wrongly. A count without its subjects still says to go and look.
 */
interface SemanticSelectionInput {
	readonly count: number;
	readonly subjects: readonly SemanticSubjectInput[];
}

/** Which architectural state the pane is reading, and where it stands. */
interface SemanticVariantInput {
	readonly id: string;
	readonly name: string;
	readonly lifecycle: VariantLifecycle;
	/** The variant this one was derived from, which its changes are measured against. */
	readonly against: string | null;
}

/** Which of the variant's views it is being read through. */
interface SemanticViewInput {
	readonly id: string;
	readonly name: string;
	readonly grammar: DiagramGrammar;
}

/** One subject that differs from the predecessor, and how. */
interface SemanticDifferenceInput {
	readonly change: ChangeKind;
	readonly kind: SemanticSubjectKind;
	readonly id: string;
	readonly name: string | null;
}

/** What this variant differs from its predecessor by, counted and then named. */
interface SemanticDifferencesInput {
	readonly added: number;
	readonly removed: number;
	readonly changed: number;
	/** The differing subjects themselves, as many as the brief has room for. */
	readonly subjects: readonly SemanticDifferenceInput[];
}

/**
 * One thing somebody has to settle before this proposal is coherent again.
 *
 * `repair` is written where the disagreement is found — the reconciliation in
 * `@/shared/semantic-board` — and carried verbatim rather than reworded. The
 * same sentence reaches the write answer and the pane, so a person and an agent
 * read one wording of one disagreement; an agent that invents its own there is
 * guessing at a decision it did not make, in words nobody else is using.
 */
interface SemanticIssueInput {
	readonly subject: string;
	readonly what: string;
	readonly kind: ReconciliationKind;
	readonly field: string | null;
	readonly repair: string;
}

/**
 * What a variant is waiting on: the fact first, then as much of the detail as
 * the brief has room for.
 *
 * `required` and `count` are the answer to "is there work here", and they are
 * never trimmed. The issues themselves are, because a brief is display text
 * under a byte ceiling — and a brief that dropped its issues and therefore read
 * as "nothing to settle" would invert the one thing this block exists to say.
 * A count without its issues still sends the agent to read the board; an empty
 * list without a count sends it away.
 */
interface SemanticReconciliationInput {
	readonly required: boolean;
	/** How many disagreements the variant holds, whatever fitted into the brief. */
	readonly count: number;
	/** The ancestor this draft is waiting on before it can move, when there is one. */
	readonly blockedBy: string | null;
	readonly issues: readonly SemanticIssueInput[];
}

/**
 * What the pane is reading, in the board's own identities.
 *
 * All of it is optional in the sense that every part can be absent: a pane on a
 * board that has not drawn yet has no variant, a variant read whole has no
 * view, and a root variant has nothing to differ from. Absence is stated, never
 * implied, so an agent can tell "nothing is selected" from "nobody asked".
 */
interface SemanticArchitectureInput {
	readonly variant: SemanticVariantInput | null;
	readonly view: SemanticViewInput | null;
	readonly selection: SemanticSelectionInput;
	readonly differences: SemanticDifferencesInput | null;
	readonly reconciliation: SemanticReconciliationInput;
}

/**
 * Scalar context supplied by a composition adapter.
 *
 * `description` is already the compact result of the public board-description
 * port. The publisher never receives a board document and never stores one:
 * everything here is a name, an identity or a count that somebody else read.
 */
interface SemanticContextInput {
	readonly repository: string;
	readonly child?: SemanticChildInput;
	readonly threadLink?: SemanticThreadLinkInput;
	readonly workhorse?: SemanticWorkhorseInput;
	readonly coordinator?: SemanticCoordinatorInput;
	readonly board: SemanticBoardInput;
	readonly pane: SemanticPaneInput;
	readonly architecture: SemanticArchitectureInput;
	readonly claim?: SemanticClaimInput;
	readonly doing: string | null;
	readonly cursor: SemanticCursorInput | null;
	readonly description: string;
	readonly ambiguity?: readonly string[];
	readonly stale?: boolean;
	readonly staleReasons?: readonly string[];
}

interface SemanticBoard {
	readonly key: string;
	readonly name: string;
	readonly file: string;
}

interface SemanticPane {
	readonly paneId: string;
	readonly focused: boolean;
}

interface SemanticThreadLink {
	readonly state: SemanticThreadLinkState;
	readonly reason: string | null;
}

interface SemanticWorkhorse {
	readonly threadId: ThreadId | null;
	readonly turnId: TurnId | null;
}

interface SemanticCoordinator {
	readonly threadId: ThreadId | null;
	readonly realtimeSessionId: RealtimeSessionId | null;
}

interface SemanticChild {
	readonly id: ChildId | null;
	readonly epoch: ChildEpoch | null;
}

interface SemanticClaim {
	readonly holder: SemanticClaimHolder;
	readonly doing: string | null;
}

type SemanticSubject = SemanticSubjectInput;
type SemanticVariantIdentity = SemanticVariantInput;
type SemanticViewIdentity = SemanticViewInput;
type SemanticDifference = SemanticDifferenceInput;
type SemanticIssue = SemanticIssueInput;
type SemanticReconciliation = SemanticReconciliationInput;
type SemanticSelection = SemanticSelectionInput;

/** The architecture block as a brief carries it, after bounding and fitting. */
interface SemanticArchitecture {
	readonly variant: SemanticVariantIdentity | null;
	readonly view: SemanticViewIdentity | null;
	readonly selection: SemanticSelection;
	readonly differences: {
		readonly added: number;
		readonly removed: number;
		readonly changed: number;
		readonly subjects: readonly SemanticDifference[];
	} | null;
	readonly reconciliation: SemanticReconciliation;
}

interface SemanticFreshness {
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
	readonly state: "fresh" | "stale";
}

interface SemanticStaleness {
	readonly state: "current" | "stale";
	readonly reasons: readonly string[];
}

interface SemanticBriefFields {
	readonly source: SemanticBriefSource;
	readonly origin: SemanticChangeOrigin | null;
	readonly feedId: string;
	readonly repository: string;
	readonly child: SemanticChild;
	readonly threadLink: SemanticThreadLink;
	readonly workhorse: SemanticWorkhorse;
	readonly coordinator: SemanticCoordinator;
	readonly board: SemanticBoard;
	readonly pane: SemanticPane;
	readonly version: number | null;
	readonly architecture: SemanticArchitecture;
	readonly claim: SemanticClaim;
	readonly doing: string | null;
	readonly cursor: SemanticCursor | null;
	readonly description: string;
	readonly freshness: SemanticFreshness;
	readonly truncated: boolean;
	readonly ambiguity: readonly string[];
	readonly staleness: SemanticStaleness;
	/** Compact, deterministic JSON for the later instruction/delivery adapter. */
	readonly brief: string;
	readonly bytes: number;
}

interface SettledSemanticChangeEvent extends SemanticBriefFields {
	readonly kind: "settled_change";
	readonly change: {
		readonly feedId: string;
		readonly cursor: SemanticCursor;
		readonly board: string;
		readonly at: string;
		readonly origin: SemanticChangeOrigin;
		readonly significance: SemanticChangeSignificance;
		readonly text: string;
		/** The agent session that made it, or null when nobody said. */
		readonly by: string | null;
	};
}

interface PaneFocusEvent extends SemanticBriefFields {
	readonly kind: "pane_focus";
	readonly focus: {
		readonly paneId: string;
		readonly focused: boolean;
		readonly capturedAtMs: number;
	};
	/**
	 * What the user changed by hand to bring this about; empty when nothing was theirs. On the
	 * event and never in the brief: the brief is what a workhorse is given as context, and who
	 * moved a pane is no part of what an architecture is.
	 */
	readonly userChanged: readonly SemanticUserChange[];
}

interface PaneSelectionEvent extends SemanticBriefFields {
	readonly kind: "pane_selection";
	readonly selectionCapturedAtMs: number;
	/** What the user changed by hand to bring this about; empty when nothing was theirs. */
	readonly userChanged: readonly SemanticUserChange[];
}

interface FreshSemanticBrief extends SemanticBriefFields {
	readonly kind: "fresh_brief";
}

interface SemanticListenerFailure {
	readonly port: SemanticPublisherPort;
	readonly eventKind: SemanticBrief["kind"];
	readonly listenerIndex: number;
	readonly errorName: string;
	readonly message: string;
}

interface SemanticListenerFailureBatch {
	readonly entries: readonly SemanticListenerFailure[];
	readonly droppedCount: number;
}

interface SemanticListenerDiagnosticPolicy {
	/** Maximum number of oldest failure entries retained before a drain. */
	readonly maxEntries: number;
	/** Maximum UTF-8 bytes of the JSON string token used for an error name. */
	readonly errorNameBytes: number;
	/** Maximum UTF-8 bytes of the JSON string token used for a message. */
	readonly messageBytes: number;
	/** Maximum UTF-8 bytes of JSON.stringify({ entries, droppedCount }). */
	readonly maxBatchBytes: number;
}

type SemanticBrief =
	| SettledSemanticChangeEvent
	| PaneFocusEvent
	| PaneSelectionEvent
	| FreshSemanticBrief;

interface SemanticContextPublisherOptions {
	readonly feed: SettledChangeSource;
	/** Feed identity makes a cursor from one process distinct after restart. */
	readonly feedId: string;
	readonly fresh: FreshBriefSource;
	/** Must provide scalar state only; it must not read or retain a board document. */
	readonly contextForChange: (event: SettledChangeSourceEvent) => SemanticContextInput;
	readonly pane?: PaneSignalSource;
	readonly now?: () => number;
}

interface SemanticContextPublisher {
	readonly subscribeSettledChange: (
		listener: (event: SettledSemanticChangeEvent) => void,
	) => SemanticUnsubscribe;
	readonly subscribePaneFocus: (listener: (event: PaneFocusEvent) => void) => SemanticUnsubscribe;
	readonly subscribePaneSelection: (
		listener: (event: PaneSelectionEvent) => void,
	) => SemanticUnsubscribe;
	readonly publishPaneFocus: (input: SemanticContextInput) => PaneFocusEvent;
	readonly publishPaneSelection: (input: SemanticContextInput) => PaneSelectionEvent;
	readonly freshBrief: () => FreshSemanticBrief;
	/** Build the same canonical brief from one already-captured exact pane snapshot. */
	readonly freshBriefFor: (input: SemanticContextInput) => FreshSemanticBrief;
	/** Returns and clears the oldest bounded failures and the dropped count. */
	readonly drainListenerFailures: () => SemanticListenerFailureBatch;
	readonly dispose: () => void;
}

export {
	type SemanticChangeOrigin,
	type SemanticChangeSignificance,
	type SemanticBriefSource,
	type SemanticThreadLinkState,
	type SemanticClaimHolder,
	type SemanticPublisherPort,
	type SemanticUnsubscribe,
	type SemanticCursor,
	type SemanticCursorInput,
	type SettledChangeSourceEvent,
	type SettledChangeSource,
	type PaneSignalSource,
	type FreshBriefSource,
	type SemanticBoardInput,
	type SemanticPaneInput,
	type SemanticUserChange,
	type SemanticThreadLinkInput,
	type SemanticWorkhorseInput,
	type SemanticCoordinatorInput,
	type SemanticChildInput,
	type SemanticClaimInput,
	type SemanticSubjectInput,
	type SemanticSelectionInput,
	type SemanticVariantInput,
	type SemanticViewInput,
	type SemanticDifferenceInput,
	type SemanticDifferencesInput,
	type SemanticIssueInput,
	type SemanticReconciliationInput,
	type SemanticArchitectureInput,
	type SemanticContextInput,
	type SemanticBoard,
	type SemanticPane,
	type SemanticThreadLink,
	type SemanticWorkhorse,
	type SemanticCoordinator,
	type SemanticChild,
	type SemanticClaim,
	type SemanticSubject,
	type SemanticSelection,
	type SemanticVariantIdentity,
	type SemanticViewIdentity,
	type SemanticDifference,
	type SemanticIssue,
	type SemanticReconciliation,
	type SemanticArchitecture,
	type SemanticFreshness,
	type SemanticStaleness,
	type SemanticBriefFields,
	type SettledSemanticChangeEvent,
	type PaneFocusEvent,
	type PaneSelectionEvent,
	type FreshSemanticBrief,
	type SemanticListenerFailure,
	type SemanticListenerFailureBatch,
	type SemanticListenerDiagnosticPolicy,
	type SemanticBrief,
	type SemanticContextPublisherOptions,
	type SemanticContextPublisher,
};

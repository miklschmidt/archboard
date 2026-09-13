// What a write can say, and the words it says it in.
//
// Every refusal here is one an agent can act on without reading the source:
// it names the thing that was wrong and, where there is one, what to do about
// it. The codes are stable so a caller can branch on them; the sentences are
// for whoever is reading the terminal.

/** Why a write was refused. */
type SemanticRefusalCode =
	/** A board by that name already exists. */
	| "BOARD_EXISTS"
	/** No board by that name. */
	| "BOARD_MISSING"
	/** The file is there but is not a semantic board. */
	| "BOARD_UNREADABLE"
	/** The board named a variant that is not on it. */
	| "UNKNOWN_VARIANT"
	/** An edit named a node the board does not have. */
	| "UNKNOWN_NODE"
	/** An edit named an edge the board does not have. */
	| "UNKNOWN_EDGE"
	/** A retained connection changes multiple properties from its predecessor. */
	| "EDGE_IDENTITY_REUSED"
	/** An edit named a flow the board does not have. */
	| "UNKNOWN_FLOW"
	/** An edit named a view the board does not have. */
	| "UNKNOWN_VIEW"
	/** An edit named a step the flow it is rewriting does not have. */
	| "UNKNOWN_STEP"
	/** An edit named a walkthrough the board does not have. */
	| "UNKNOWN_WALKTHROUGH"
	/** An edit named a beat the walkthrough it is rewriting does not have. */
	| "UNKNOWN_BEAT"
	/** A beat was written about something the board does not have. */
	| "UNKNOWN_SUBJECT"
	/** A node went away and a flow it takes part in stayed. */
	| "NODE_IN_FLOW"
	/** Something went away and a beat about it stayed. */
	| "SUBJECT_IN_WALKTHROUGH"
	/** A view would be left selecting nothing at all. */
	/** A name named more than one thing, and the edit must say which. */
	| "AMBIGUOUS_REFERENCE"
	/** A container went away and something is still inside it. */
	| "NODE_HAS_CHILDREN"
	/** The edit would leave the board incoherent. */
	| "INVALID_CONTENT"
	/** The board has moved on since the writer read it. */
	| "BOARD_VERSION_CONFLICT"
	/** A write that must say which version it read did not say. */
	| "EXPECT_VERSION_REQUIRED"
	/** The document on disk is not the board its address says it is. */
	| "BOARD_MISADDRESSED"
	/** Somebody else is writing this board. */
	| "BOARD_HELD"
	/** The claim this writer was working under was taken back. */
	| "CLAIM_REVOKED"
	// Settling a disagreement, and adopting an architecture.
	| "NOTHING_TO_SETTLE"
	| "UNKNOWN_ISSUE"
	| "CHOICE_NOT_A_FIELD"
	/** An order was answered for part of an exchange, which decides the rest. */
	| "ORDER_SETTLED_WHOLE"
	| "ALREADY_CURRENT"
	| "VARIANT_UNSETTLED"
	| "VARIANT_BLOCKED"
	| "VARIANT_HISTORICAL";

/** A transition either produced a whole new board, or refused. */
interface SemanticRefusal {
	readonly ok: false;
	readonly code: SemanticRefusalCode;
	readonly problem: string;
}

/**
 * Shape a refusal.
 * @param code Why the write was refused.
 * @param problem What went wrong, in a sentence.
 * @returns The refusal.
 */
function refuse(code: SemanticRefusalCode, problem: string): SemanticRefusal {
	return { ok: false, code, problem };
}

export { type SemanticRefusalCode, type SemanticRefusal, refuse };

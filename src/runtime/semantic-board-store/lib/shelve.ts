// Letting a proposal go: shelving a draft that has nothing left to propose.
//
// A draft can outlive its proposal. It converges on the state it came from, or
// the change it argued for happens some other way, and what is left is a
// variant that proposes nothing and cannot be adopted — adopting it would
// freeze an accurate current architecture into history and promote a variant
// that says the same thing. Until now the only ways out were to keep it, and
// pay for it on every parent edit, or to delete it, and break every drill-down
// that names it (ADR 0030).
//
// So there is a fourth lifecycle. Shelving changes nothing about what the
// variant says: the name, the content and the ancestry stay exactly as they
// are, which is what keeps a link that names it resolving. What changes is
// that the board now says nobody intends to carry it out, and records when
// that was decided and why. Everything else follows from the word: a shelved
// variant is not a draft, so it stops inheriting (`propagate.ts`), and it is
// not editable or adoptable, for the reason history is neither.

import {
	type SemanticBoard,
	type SemanticVariant,
	type Shelving,
} from "@/shared/semantic-board/index";
import { withoutStanding } from "@/runtime/semantic-board-store/lib/propagate";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";

/** A board with the proposal let go, or why it cannot be. */
type ShelvingResult = { readonly ok: true; readonly board: SemanticBoard } | SemanticRefusal;

/**
 * The advice every refusal about a shelved variant ends with.
 *
 * One sentence, in one place, because a shelved variant is refused by three
 * different commands and the way forward is the same from all of them: the
 * thinking is still there under its name, and proposing it again is a branch
 * off it rather than a resurrection of it.
 */
const BRANCH_INSTEAD =
	"Branch a proposal from it if you want to propose it again; it keeps its name and everything " +
	"it says, and every link that names it still opens it.";

/**
 * Let one proposal go.
 * @param board The board as it stands.
 * @param shelving The variant to shelve.
 * @param at The timestamp the write is being made at.
 * @param reason Why the proposal was let go.
 * @returns The board afterwards, or the refusal.
 */
function shelveVariant(
	board: SemanticBoard,
	shelving: SemanticVariant,
	at: string,
	reason: string,
): ShelvingResult {
	const refused = shelvable(board, shelving);
	if (refused !== null) {
		return refused;
	}
	const entry: Shelving = { variant: shelving.id, at, reason };
	return {
		ok: true,
		board: {
			...board,
			variants: board.variants.map((one) => (one.id === shelving.id ? letGo(one) : one)),
			shelvings: [...(board.shelvings ?? []), entry],
		},
	};
}

/**
 * Whether this variant is a proposal that can be let go, and why not.
 * @param board The board as it stands.
 * @param shelving The variant to shelve.
 * @returns The refusal, or null when it may be shelved.
 */
function shelvable(board: SemanticBoard, shelving: SemanticVariant): SemanticRefusal | null {
	// `current` is asked first and by designation rather than by lifecycle: the
	// board's own answer to "which architecture is implemented" is the field, and
	// a document where the two disagree is refused on read anyway.
	if (shelving.id === board.current) {
		return refuse(
			"VARIANT_CURRENT",
			`"${shelving.name}" is the architecture this board says is implemented, not a proposal ` +
				"about it. There is nothing to let go, and shelving it would leave a board that said " +
				"what is built saying nothing: adopt a successor if this one is no longer what is built.",
		);
	}
	if (shelving.lifecycle === "historical") {
		return refuse(
			"VARIANT_HISTORICAL",
			`"${shelving.name}" is an architecture that was implemented and has since been ` +
				"superseded. It is a record of what existed, not a proposal anybody could carry out, " +
				`so there is nothing to let go. ${BRANCH_INSTEAD}`,
		);
	}
	if (shelving.lifecycle === "shelved") {
		return refuse(
			"VARIANT_SHELVED",
			`"${shelving.name}" has already been let go, and this board says when and why. ` +
				BRANCH_INSTEAD,
		);
	}
	return standingOn(board, shelving);
}

/**
 * Whether drafts are still standing on this proposal.
 *
 * Only a draft follows its predecessor, so shelving one that drafts are derived
 * from would strand them: an edit above them would stop at the shelved variant
 * and never reach them, and nothing on screen would say that the thing they are
 * built on has stopped moving. They are named rather than counted, because the
 * way out is to decide what happens to each of them.
 * @param board The board as it stands.
 * @param shelving The variant to shelve.
 * @returns The refusal, or null when nothing is standing on it.
 */
function standingOn(board: SemanticBoard, shelving: SemanticVariant): SemanticRefusal | null {
	const under = board.variants.filter(
		(one) => one.parent === shelving.id && one.lifecycle === "draft",
	);
	if (under.length === 0) {
		return null;
	}
	const named = under.map((one) => `"${one.name}"`).join(", ");
	return refuse(
		"VARIANT_HAS_DRAFTS",
		`${named} ${under.length === 1 ? "is a proposal" : "are proposals"} derived from ` +
			`"${shelving.name}" and still following it. Letting it go would leave ` +
			`${under.length === 1 ? "that proposal" : "those proposals"} standing on a state that has ` +
			"stopped moving, with nothing on the board to say so. Let them go first, or adopt one of " +
			"them, and then shelve this.",
	);
}

/**
 * One variant as shelving leaves it.
 *
 * The standing goes with it. A proposal nobody is carrying out has nothing to
 * settle: somebody had to answer those disagreements only so that this variant
 * could eventually be adopted, and it never will be. Making that a precondition
 * would mean finishing an argument in order to abandon it.
 * @param variant The variant as it stands.
 * @returns The variant, shelved and holding nothing.
 */
function letGo(variant: SemanticVariant): SemanticVariant {
	return { ...withoutStanding(variant, variant.content), lifecycle: "shelved" };
}

export { shelveVariant, BRANCH_INSTEAD, type ShelvingResult };

// The pure half of a write: a board and a stated command in, a candidate board
// out, and nothing touched on the way.
//
// Keeping this half pure is what lets the write boundary be the only thing
// that takes a claim, checks a version, advances a version and writes a file.
// A transition cannot half-apply, cannot publish, and cannot leave a file
// behind when it refuses, because it has no file. Branching, reconciliation
// and adoption are later tickets, and they arrive as further transitions
// through this same shape rather than as second write paths.

import { emptyContent, subjectIds } from "#shared/schemas/content.ts";
import {
	type BoardBranchInput,
	type BoardCreateInput,
	type VariantEditInput,
} from "#shared/protocol/board-input.ts";
import {
	addressedVariant,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	FIRST_BOARD_VERSION,
	nextVersion,
	type SemanticBoard,
	type SemanticVariant,
} from "#shared/schemas/board-document.ts";
import {
	type BoardAdoptInput,
	type BoardShelveInput,
	type ResolutionInput,
} from "#shared/protocol/resolution-input.ts";
import { editContent, type ContentEdit } from "#runtime/operations/edit/content.ts";
import {
	documentsField,
	editsContent,
	editsVariant,
	restated,
} from "#runtime/operations/edit/scope.ts";
import {
	unsettledAncestor,
	type DescendantOutcome,
} from "#runtime/operations/variant/propagate.ts";
import { adoptVariant } from "#runtime/operations/variant/adopt.ts";
import { BRANCH_INSTEAD, shelveVariant } from "#runtime/operations/variant/shelve.ts";
import {
	carriedFamily,
	restoration,
	type RestorableSubjects,
} from "#runtime/operations/variant/restore.ts";
import { guardInheritance } from "#runtime/operations/variant/inheritance.ts";
import { settleVariant } from "#runtime/operations/settle/settle.ts";
import { idsInUse, mintInto, openBatch } from "#runtime/operations/edit/batch.ts";
import { refuse, type SemanticRefusal } from "#runtime/operations/write/outcome.ts";
import type { WriteNotice } from "#runtime/operations/edit/replaced-relationships.ts";

/**
 * The name a board's first variant carries when the caller names none.
 *
 * Not "current": that word asks which variant is designated, and a state that
 * kept it as a name would still be called current long after something else was
 * adopted. A lasting name says what the state is; the designation says where it
 * is now (ADR 0023).
 */
const FIRST_VARIANT_NAME = "Initial";

/** A candidate board, or why the command could not produce one. */
type TransitionResult =
	| {
			readonly ok: true;
			readonly board: SemanticBoard;
			/**
			 * What every draft under the change did about it, when the command was
			 * one that reaches drafts. A caller has to be able to tell "this landed"
			 * from "this landed and three proposals now need somebody" without
			 * reading the whole board back and working it out.
			 */
			readonly descendants?: readonly DescendantOutcome[];
			/** What the command did that the answer should say, though the write lands. */
			readonly notices?: readonly WriteNotice[];
	  }
	| SemanticRefusal;

/**
 * One stated command, as the write boundary sees it: a sentence for a refusal
 * to quote, and a function from the board as it stands to the board as it
 * would be.
 */
interface SemanticTransition {
	/** What this command is, in the words a refusal will use. */
	readonly summary: string;
	/**
	 * Whether this command changes a board that already exists.
	 *
	 * A command that does must say which version of it it was written against,
	 * and the write boundary refuses it otherwise: applied to whatever the board
	 * happens to say now, it is exactly how one agent's change disappears under
	 * another's. Creation has no prior version to have read, and tracking an
	 * embed (ADR 0057) only adds to a list, which undoes nothing another writer
	 * did, so both say false.
	 */
	readonly changesExistingBoard: boolean;
	/**
	 * Produce the candidate board.
	 * @param before The board as it stands, or null when there is none.
	 * @param at The timestamp the write is being made at.
	 * @returns The candidate, or the refusal.
	 */
	readonly apply: (before: SemanticBoard | null, at: string) => TransitionResult;
}

/**
 * Create a named board holding one variant, empty or populated.
 * @param input The board as it was asked for.
 * @returns The transition.
 */
function createBoardTransition(input: BoardCreateInput): SemanticTransition {
	return {
		summary: `create the board "${input.name}"`,
		changesExistingBoard: false,
		/**
		 * Build the new board.
		 * @param before The board as it stands, which must be nothing.
		 * @param at The timestamp the write is being made at.
		 * @returns The new board, or why it cannot be created.
		 */
		apply: (before, at) => {
			if (before !== null) {
				return refuse("BOARD_EXISTS", `a board called "${input.name}" is already in the vault`);
			}
			const content = editContent(
				emptyContent(),
				{
					nodes: input.nodes,
					edges: input.edges,
					flows: input.flows,
					views: input.views,
					walkthroughs: input.walkthroughs,
					removeNodes: [],
					removeEdges: [],
					removeFlows: [],
					removeViews: [],
					removeWalkthroughs: [],
				},
				null,
			);
			if (!content.ok) {
				return content;
			}
			return {
				ok: true,
				board: newBoard(input, content.content, content.views, at),
				notices: content.notices,
			};
		},
	};
}

/**
 * Assemble the board a create command asked for, minting its board and variant
 * identities against each other so neither can collide with the other.
 * @param input The board as it was asked for.
 * @param content The first variant's content.
 * @param views The board views.
 * @param at The timestamp the write is being made at.
 * @returns The board.
 */
function newBoard(
	input: BoardCreateInput,
	content: SemanticVariant["content"],
	views: SemanticBoard["views"],
	at: string,
): SemanticBoard {
	// Against every subject the first variant already holds, through the one
	// collection that knows what a variant holds: a board or a variant that
	// answered to a flow's id would be addressed by the same id as something on
	// it, and nothing downstream carries the kind alongside.
	const batch = openBatch([...subjectIds(content), ...views.map((view) => view.id)]);
	const id = mintInto(batch);
	const variantId = mintInto(batch);
	const lifecycle = input.lifecycle ?? "current";
	return {
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id,
		name: input.name,
		level: input.level,
		version: FIRST_BOARD_VERSION,
		createdAt: at,
		updatedAt: at,
		// A board for something nobody has built designates nothing: its first
		// variant is a proposal, and the absence is how the board says so (ADR 0031).
		...(lifecycle === "current" ? { current: variantId } : {}),
		views,
		variants: [
			{
				id: variantId,
				name: input.variant ?? FIRST_VARIANT_NAME,
				lifecycle,
				content,
				...(input.summary === undefined ? {} : { summary: input.summary }),
				...documentsField(input.documents),
			},
		],
	};
}

/**
 * Derive a proposal from a variant that is already on the board.
 *
 * The predecessor's architecture is carried over whole, with every identity
 * intact. That is the entire mechanism behind competing siblings and chains:
 * branching twice from one variant gives two proposals that can be compared
 * against the same baseline, and branching from a proposal gives a chain, and
 * neither needs anything of its own because ancestry is recorded and nothing is
 * reminted. A branch proposes nothing yet — what it proposes is said afterwards,
 * as ordinary edits to it.
 *
 * It designates nothing either. `current` stays exactly where it was: a
 * proposal becomes the implemented architecture only when somebody says so
 * (ADR 0023), and that is a different command.
 * @param input The proposal as it was asked for.
 * @returns The transition.
 */
function branchVariantTransition(input: BoardBranchInput): SemanticTransition {
	return {
		summary: `branch "${input.name}" from "${input.from ?? "the variant the board's name opens"}"`,
		changesExistingBoard: true,
		/**
		 * Build the board with the proposal on it.
		 * @param before The board as it stands.
		 * @param at The timestamp the write is being made at.
		 * @returns The board with the new variant, or why it cannot be made.
		 */
		apply: (before, at) => {
			if (before === null) {
				return refuse("BOARD_MISSING", "there is no such board in the vault");
			}
			const from = addressed(before, input.from);
			if (!from.ok) {
				return from;
			}
			const parent = from.variant;
			const batch = openBatch(idsInUse(before));
			return {
				ok: true,
				board: {
					...before,
					updatedAt: at,
					variants: [
						...before.variants,
						{
							id: mintInto(batch),
							name: input.name,
							lifecycle: "draft",
							parent: parent.id,
							// The same entities, not copies of them: a proposal and the
							// variant it came from share identities, and that sharing is
							// what a comparison between the two reads.
							content: parent.content,
							...(input.summary === undefined ? {} : { summary: input.summary }),
							// The documents the predecessor draws. The author adds the
							// proposal's own afterwards, as an edit (ADR 0054).
							...documentsField(parent.documents),
							// A proposal derived from a state that is itself in dispute is
							// standing on an argument nobody has finished. It has nothing of
							// its own to settle — it agrees with its predecessor exactly —
							// but saying nothing would leave a reader, and an adoption, with
							// no sign of what it is built on.
							...standingUnder(parent, before),
						},
					],
				},
			};
		},
	};
}

/**
 * Apply one batch of stated changes to one variant of an existing board.
 * @param input The changes as they were stated.
 * @returns The transition.
 */
function editVariantTransition(input: VariantEditInput): SemanticTransition {
	return {
		summary: "edit the board",
		changesExistingBoard: true,
		/**
		 * Build the edited board.
		 * @param before The board as it stands.
		 * @param at The timestamp the write is being made at.
		 * @returns The edited board, or why it cannot be edited.
		 */
		apply: (before, at) => {
			if (before === null) {
				return refuse("BOARD_MISSING", "there is no such board in the vault");
			}
			const changesContent = editsContent(input);
			const editable = editableVariant(before, input.variant, editsVariant(input));
			if (!editable.ok) {
				return editable;
			}
			const { variant } = editable;
			const content = restoredContent(before, variant, input);
			if (!content.ok) {
				return content;
			}
			const carried = carriedFamily(before, variant, content.content, {
				restorable: content.restorable,
				changesContent,
			});
			if (!carried.ok) {
				return carried;
			}
			return {
				ok: true,
				board: {
					...before,
					...(input.level === undefined ? {} : { level: input.level }),
					views: content.views,
					variants: restated(carried.variants, variant.id, input),
					updatedAt: at,
				},
				descendants: carried.descendants,
				notices: content.notices,
			};
		},
	};
}

/**
 * Settle what one proposal is holding, and let its own descendants move again.
 * @param input What it decides.
 * @returns The transition.
 */
function settleVariantTransition(input: ResolutionInput): SemanticTransition {
	return {
		summary: "settle a disagreement",
		changesExistingBoard: true,
		/**
		 * Build the settled board.
		 * @param before The board as it stands.
		 * @param at The timestamp the write is being made at.
		 * @returns The settled board, or why it cannot be settled.
		 */
		apply: (before, at) => {
			if (before === null) {
				return refuse("BOARD_MISSING", "there is no such board in the vault");
			}
			const draft = addressed(before, input.variant);
			if (!draft.ok) {
				return draft;
			}
			const settled = settleVariant(before, draft.variant, input, nextVersion(before));
			if (!settled.ok) {
				return settled;
			}
			return {
				ok: true,
				board: { ...before, variants: [...settled.variants], updatedAt: at },
				descendants: settled.descendants,
			};
		},
	};
}

/**
 * Move the designation to a variant that is coherent and settled.
 * @param input Which variant, and why.
 * @returns The transition.
 */
function adoptVariantTransition(input: BoardAdoptInput): SemanticTransition {
	return {
		summary: "adopt an architecture",
		changesExistingBoard: true,
		/**
		 * Build the board with the designation moved.
		 * @param before The board as it stands.
		 * @param at The timestamp the write is being made at.
		 * @returns The board afterwards, or why it cannot move.
		 */
		apply: (before, at) => {
			if (before === null) {
				return refuse("BOARD_MISSING", "there is no such board in the vault");
			}
			const adopting = addressed(before, input.variant);
			if (!adopting.ok) {
				return adopting;
			}
			const adopted = adoptVariant(before, adopting.variant, at, input);
			if (!adopted.ok) {
				return adopted;
			}
			return { ok: true, board: { ...adopted.board, updatedAt: at } };
		},
	};
}

/**
 * Let one proposal go, under its name.
 * @param input Which variant, and why it was let go.
 * @returns The transition.
 */
function shelveVariantTransition(input: BoardShelveInput): SemanticTransition {
	return {
		summary: "shelve a proposal",
		changesExistingBoard: true,
		/**
		 * Build the board with the proposal let go.
		 * @param before The board as it stands.
		 * @param at The timestamp the write is being made at.
		 * @returns The board afterwards, or why it cannot be let go.
		 */
		apply: (before, at) => {
			if (before === null) {
				return refuse("BOARD_MISSING", "there is no such board in the vault");
			}
			const shelving = addressed(before, input.variant);
			if (!shelving.ok) {
				return shelving;
			}
			const shelved = shelveVariant(before, shelving.variant, at, input.reason);
			if (!shelved.ok) {
				return shelved;
			}
			return { ok: true, board: { ...shelved.board, updatedAt: at } };
		},
	};
}

/**
 * The variant a command acts on: the one it names, or, when it names none, the
 * one the board's bare name opens (`addressedVariant`).
 * @param board The board as it stands.
 * @param asked The variant's id or name, or undefined when the command names none.
 * @returns The variant, or the refusal naming why there is none.
 */
function addressed(
	board: SemanticBoard,
	asked: string | undefined,
): { readonly ok: true; readonly variant: SemanticVariant } | SemanticRefusal {
	const found = addressedVariant(board, asked);
	return found.ok ? found : refuse("UNKNOWN_VARIANT", found.problem);
}

/**
 * What a fresh proposal is waiting on, when what it came from is unsettled.
 * @param parent The variant it was derived from.
 * @param before The board as it stands.
 * @returns The standing to record, or nothing when its predecessor is settled.
 */
function standingUnder(
	parent: SemanticVariant,
	before: SemanticBoard,
): { reconciliation?: SemanticVariant["reconciliation"] } {
	const own = parent.reconciliation;
	// The same rule the propagation uses when it carries a blocker down: a
	// predecessor holding a disagreement is the decision to wait for, and a
	// predecessor that is only waiting itself passes on whose decision it is —
	// naming the one in between would send somebody to a variant with nothing
	// anybody can settle.
	const inherited =
		own === undefined ? unsettledAncestor(before.variants, parent) : (own.blockedBy ?? parent.id);
	if (inherited === undefined) {
		return {};
	}
	return {
		reconciliation: {
			against: parent.id,
			atVersion: nextVersion(before),
			base: parent.content,
			issues: [],
			blockedBy: inherited,
		},
	};
}

export {
	FIRST_VARIANT_NAME,
	adoptVariantTransition,
	settleVariantTransition,
	branchVariantTransition,
	type TransitionResult,
	type SemanticTransition,
	createBoardTransition,
	editVariantTransition,
	restoredContent,
	shelveVariantTransition,
};

/**
 * The variant an edit names, when it exists and may be edited: a state that
 * was implemented and superseded requires an explicit correction, and
 * a proposal that has been let go is an argument that is over.
 *
 * Both refusals are narrow on purpose — they fire only when a batch changes
 * the variant: its content or its summary. Views and level belong to the board
 * rather than to any one variant, so a command that only changes those is not
 * editing a frozen state at all.
 * @param board The board as it stands.
 * @param wanted The variant's id or name, or undefined for the one the board's name opens.
 * @param changesVariant Whether the variant's content or summary is being edited.
 * @returns The variant, or why it cannot be edited.
 */
function editableVariant(
	board: SemanticBoard,
	wanted: string | undefined,
	changesVariant: boolean,
): { readonly ok: true; readonly variant: SemanticVariant } | SemanticRefusal {
	const found = addressed(board, wanted);
	if (!found.ok) {
		return found;
	}
	const { variant } = found;
	if (variant.lifecycle === "historical" && changesVariant) {
		return refuse(
			"VARIANT_HISTORICAL",
			`"${variant.name}" is an architecture that was implemented and has since been ` +
				"superseded. Use semantic correct to repair its description against historical " +
				"Git commits, or branch a proposal to describe an architectural change.",
		);
	}
	if (variant.lifecycle === "shelved" && changesVariant) {
		return refuse(
			"VARIANT_SHELVED",
			`"${variant.name}" is a proposal this board has let go, and it is kept as it was left. ` +
				`Editing it would put words into an argument that is over. ${BRANCH_INSTEAD}`,
		);
	}
	return { ok: true, variant };
}

/**
 * The content one edit leaves, restoring absent identities under their own ids
 * where the edit may (`restore.ts`) rather than minting replacements, and
 * keeping what the variant inherited unless the edit confirms otherwise
 * (`inheritance.ts`).
 * @param board The board as it stands.
 * @param variant The edited variant, as it stood.
 * @param input The edit as stated.
 * @returns The content, what it could restore and what the answer says, or the refusal.
 */
function restoredContent(
	board: SemanticBoard,
	variant: SemanticVariant,
	input: VariantEditInput,
):
	| (Extract<ContentEdit, { ok: true }> & { readonly restorable: RestorableSubjects })
	| SemanticRefusal {
	const restoring = restoration(board, variant, input);
	if (!restoring.ok) {
		return restoring;
	}
	const content = editContent(variant.content, input, board, restoring.restorable);
	if (!content.ok) {
		return content;
	}
	const guarded = guardInheritance(board, variant, content.content, input);
	if (!guarded.ok) {
		return guarded;
	}
	return {
		...content,
		restorable: restoring.restorable,
		notices: [...restoring.notices, ...guarded.notices, ...content.notices],
	};
}

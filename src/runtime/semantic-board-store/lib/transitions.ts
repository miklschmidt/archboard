// The pure half of a write: a board and a stated command in, a candidate board
// out, and nothing touched on the way.
//
// Keeping this half pure is what lets the write boundary be the only thing
// that takes a claim, checks a version, advances a version and writes a file.
// A transition cannot half-apply, cannot publish, and cannot leave a file
// behind when it refuses, because it has no file. Branching, reconciliation
// and adoption are later tickets, and they arrive as further transitions
// through this same shape rather than as second write paths.

import {
	emptyContent,
	type BoardBranchInput,
	resolveVariant,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	FIRST_BOARD_VERSION,
	type BoardAdoptInput,
	type BoardCreateInput,
	nextVersion,
	type ResolutionInput,
	type SemanticBoard,
	type SemanticVariant,
	subjectIds,
	type VariantEditInput,
} from "@/shared/semantic-board/index";
import { editContent } from "@/runtime/semantic-board-store/lib/edit-content";
import {
	propagateEdit,
	unsettledAncestor,
	type DescendantOutcome,
} from "@/runtime/semantic-board-store/lib/propagate";
import { adoptVariant } from "@/runtime/semantic-board-store/lib/adopt";
import { restorableNodes, settleByRestoring } from "@/runtime/semantic-board-store/lib/restore";
import { settleVariant } from "@/runtime/semantic-board-store/lib/settle";
import { idsInUse, mintInto, openBatch } from "@/runtime/semantic-board-store/lib/batch";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import type { WriteNotice } from "@/runtime/semantic-board-store/lib/replaced-relationships";

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
	 * another's. Creation is the one command with no prior version to have read.
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
			return { ok: true, board: newBoard(input, content.content, content.views, at) };
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
	return {
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id,
		name: input.name,
		level: input.level,
		version: FIRST_BOARD_VERSION,
		createdAt: at,
		updatedAt: at,
		current: variantId,
		views,
		variants: [
			{
				id: variantId,
				name: input.variant ?? FIRST_VARIANT_NAME,
				lifecycle: "current",
				content,
				...(input.summary === undefined ? {} : { summary: input.summary }),
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
		summary: `branch "${input.name}" from "${input.from}"`,
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
			const parent = resolveVariant(before, input.from);
			if (parent === undefined) {
				return refuse(
					"UNKNOWN_VARIANT",
					`this board has no variant called "${input.from}" to branch from`,
				);
			}
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
	const wanted = input.variant ?? "current";
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
			const editable = editableVariant(before, wanted, changesContent);
			if (!editable.ok) {
				return editable;
			}
			const { variant } = editable;
			// A draft holding a disagreement about a node it removed may state that
			// node's id again: the third answer the reconciliation contract promises.
			const restorable = restorableNodes(before, variant);
			const content = editContent(variant.content, input, before, restorable);
			if (!content.ok) {
				return content;
			}
			const carried = carriedFamily(before, variant, content.content, {
				restorable,
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
					variants: [...carried.variants],
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
			const draft = resolveVariant(before, input.variant);
			if (draft === undefined) {
				return refuse(
					"UNKNOWN_VARIANT",
					`this board has no variant called "${input.variant ?? before.current}"`,
				);
			}
			const settled = settleVariant(before, draft, input, nextVersion(before));
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
			const adopting = resolveVariant(before, input.variant);
			if (adopting === undefined) {
				return refuse("UNKNOWN_VARIANT", `this board has no variant called "${input.variant}"`);
			}
			const adopted = adoptVariant(before, adopting, at, input.reason);
			if (!adopted.ok) {
				return adopted;
			}
			return { ok: true, board: { ...adopted.board, updatedAt: at } };
		},
	};
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
};

/**
 * Whether a stated batch edits variant content at all, as opposed to the
 * board's views or level alone.
 * @param input The batch as stated.
 * @returns True when any content collection is stated or removed.
 */
function editsContent(input: VariantEditInput): boolean {
	return [
		input.nodes,
		input.edges,
		input.flows,
		input.walkthroughs,
		input.removeNodes,
		input.removeEdges,
		input.removeFlows,
		input.removeWalkthroughs,
	].some((entries) => entries.length > 0);
}

/**
 * The variant an edit names, when it exists and may be edited: a state that
 * was implemented and superseded is a record, and records are not edited.
 * @param board The board as it stands.
 * @param wanted The variant's id or name.
 * @param changesContent Whether variant content is being edited.
 * @returns The variant, or why it cannot be edited.
 */
function editableVariant(
	board: SemanticBoard,
	wanted: string,
	changesContent: boolean,
): { readonly ok: true; readonly variant: SemanticVariant } | SemanticRefusal {
	const variant = resolveVariant(board, wanted);
	if (variant === undefined) {
		return refuse("UNKNOWN_VARIANT", `this board has no variant called "${wanted}"`);
	}
	if (variant.lifecycle === "historical" && changesContent) {
		return refuse(
			"VARIANT_HISTORICAL",
			`"${variant.name}" is an architecture that was implemented and has since been ` +
				"superseded. What was true then does not change: branch a proposal from it if you " +
				"want to say something different.",
		);
	}
	return { ok: true, variant };
}

/**
 * The family after one edit: every draft derived from this variant answers the
 * change in the same candidate, so the parent's new state and its consequences
 * are one write and one version, never a parent that landed and children that
 * have not caught up (ADR 0023). An edit that restores a node this draft was
 * arguing about answers the draft's own disagreement, and that settlement is
 * part of the same write too: the restored node, the settled standing and the
 * descendants' answers land as one version.
 * @param board The board as it stands.
 * @param variant The edited variant, as it stood.
 * @param content Its content as the edit leaves it.
 * @param edit What the edit could and did do.
 * @param edit.restorable The ids the draft's standing let the edit restore.
 * @param edit.changesContent Whether the command edited variant content.
 * @returns The variant family and effects, or the refusal.
 */
function carriedFamily(
	board: SemanticBoard,
	variant: SemanticVariant,
	content: SemanticVariant["content"],
	edit: { readonly restorable: ReadonlySet<string>; readonly changesContent: boolean },
): ReturnType<typeof settleByRestoring> {
	const restored = new Set(
		content.nodes.map((node) => node.id).filter((id) => edit.restorable.has(id)),
	);
	return restored.size > 0
		? settleByRestoring(board, variant, content, restored, nextVersion(board))
		: editedFamily(board, variant, content, edit.changesContent);
}

/**
 * Propagate content edits; changing board views leaves the variant family alone.
 * @param board The board.
 * @param variant The edited variant.
 * @param content The resulting content.
 * @param changesContent Whether the command edited variant content.
 * @returns The variant family and effects.
 */
function editedFamily(
	board: SemanticBoard,
	variant: SemanticVariant,
	content: SemanticVariant["content"],
	changesContent: boolean,
): { readonly ok: true } & ReturnType<typeof propagateEdit> {
	return {
		ok: true,
		...(changesContent
			? propagateEdit(board, { ...variant, content }, nextVersion(board))
			: { variants: board.variants, descendants: [] }),
	};
}

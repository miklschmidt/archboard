// Renaming a board, or one variant of it (TASK-281, ADR 0036).
//
// A rename is a change to what something is called and to nothing else. The
// board keeps its id, every variant keeps its id, lifecycle and ancestry, and
// every adoption, shelving and standing stays exactly as it was: the candidate
// is the board as it stands with one name moved. The old name is kept as a
// former name, so whatever named it — a drill-down on another board, a saved
// pane address, a command somebody wrote down — keeps opening it, and no other
// board has to change for that to stay true.
//
// This half is pure, like every transition. Where the board's file goes when
// its name changes, and whether another board already answers to the new name,
// are the write boundary's, which is the one place that reads the vault under a
// lease (`relocation.ts`).

import { normalizeBoardKey } from "@/runtime/engine/board";
import {
	addressedVariant,
	type BoardRenameInput,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { errorMessage } from "@archboard/diagnostics/errno";
import { semanticBoardAddress } from "@/runtime/semantic-board-store/lib/location";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import type {
	SemanticTransition,
	TransitionResult,
} from "@/runtime/semantic-board-store/lib/transitions";

/**
 * Give a board, or one variant of it, another name.
 * @param input The name asked for, and the variant when it is a variant's.
 * @returns The transition.
 */
function renameTransition(input: BoardRenameInput): SemanticTransition {
	return {
		summary:
			input.variant === undefined
				? `rename the board to "${input.to}"`
				: `rename the variant "${input.variant}" to "${input.to}"`,
		changesExistingBoard: true,
		/**
		 * Build the board with the name moved.
		 * @param before The board as it stands.
		 * @returns The renamed board, or why it cannot be renamed.
		 */
		apply: (before) => {
			if (before === null) {
				return refuse("BOARD_MISSING", "there is no such board in the vault");
			}
			return input.variant === undefined
				? renamedBoard(before, input.to)
				: renamedVariant(before, input.variant, input.to);
		},
	};
}

/**
 * The board under another name.
 *
 * A change of case alone keeps the board's key, so every address that named it
 * still does and nothing is kept: the name is spelled differently and the board
 * answers to it as it did. Any other change keeps the old name as a former one,
 * and takes the new name off the former names when the board is being given
 * back a name it once had.
 * @param before The board as it stands.
 * @param to The name asked for.
 * @returns The board, or why it cannot be called that.
 */
function renamedBoard(before: SemanticBoard, to: string): TransitionResult {
	let address: ReturnType<typeof semanticBoardAddress>;
	try {
		address = semanticBoardAddress(to);
	} catch (error) {
		return refuse("INVALID_NAME", `"${to}" cannot name a board: ${errorMessage(error)}`);
	}
	if (address.name === before.name) {
		return unchanged(`The board is already called "${before.name}"`);
	}
	const was = normalizeBoardKey(before.name);
	if (address.key === was) {
		return { ok: true, board: { ...before, name: address.name } };
	}
	const kept = (before.formerNames ?? []).filter((name) => {
		const key = normalizeBoardKey(name);
		return key !== address.key && key !== was;
	});
	return {
		ok: true,
		board: { ...before, name: address.name, formerNames: [...kept, before.name] },
	};
}

/**
 * The board with one of its variants under another name.
 *
 * Any variant may be renamed, whatever its lifecycle: a name is how a state is
 * addressed, not what it says, so a frozen record and a shelved proposal are
 * renamed as readily as a draft. The name is matched exactly, as a variant's
 * name always is, so a change of case is a change of name and the old spelling
 * is kept like any other.
 * @param before The board as it stands.
 * @param asked The variant's id, name or former name.
 * @param to The name asked for.
 * @returns The board, or why the variant cannot be called that.
 */
function renamedVariant(before: SemanticBoard, asked: string, to: string): TransitionResult {
	const found = addressedVariant(before, asked);
	if (!found.ok) {
		return refuse("UNKNOWN_VARIANT", found.problem);
	}
	const { variant } = found;
	if (variant.name === to) {
		return unchanged(`The variant is already called "${to}"`);
	}
	const other = before.variants.find((one) => one.id !== variant.id && answersTo(one, to));
	if (other !== undefined) {
		return refuse(
			"VARIANT_EXISTS",
			`"${other.name}" on this board already answers to "${to}", and a variant name is an ` +
				"address: two variants answering to one would leave it opening either. Choose " +
				"another name. Nothing was written.",
		);
	}
	const renamed: SemanticVariant = {
		...variant,
		name: to,
		formerNames: [...(variant.formerNames ?? []).filter((name) => name !== to), variant.name],
	};
	return {
		ok: true,
		board: {
			...before,
			variants: before.variants.map((one) => (one.id === variant.id ? renamed : one)),
		},
	};
}

/**
 * Whether a variant answers to a name: its id, its name or a former name.
 * @param variant The variant.
 * @param name The name.
 * @returns True when an address spelled that way could open it.
 */
function answersTo(variant: SemanticVariant, name: string): boolean {
	return (
		variant.id === name || variant.name === name || variant.formerNames?.includes(name) === true
	);
}

/**
 * Refuse a rename that would change nothing. Refused rather than written,
 * because a write advances the version and tells every pane the board changed,
 * and nothing did.
 * @param said What the name already is.
 * @returns The refusal.
 */
function unchanged(said: string): SemanticRefusal {
	return refuse("NAME_UNCHANGED", `${said}. Nothing was written.`);
}

export { renameTransition };

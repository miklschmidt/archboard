// Which boards the code check reads, and at which variant (ADR 0046).
//
// It reads every board at its current variant. `--variant <name>` names a
// draft: a board that has a draft of that name is read at that draft, and
// every other board at its current variant, so one name reads the vault as it
// will stand once every proposal of a task is adopted. A board with no current
// variant, and no draft of the named variant, has nothing built to read, and
// is skipped (ADR 0031). A historical or a shelved variant is never read: it
// is a record, and a finding on it would push somebody to rewrite a record.
// Each board carries the vault's relationship kinds, which say the evidence
// kinds each kind accepts (TASK-367.07).

import {
	listSemanticBoards,
	readSemanticBoardAt,
	readSemanticBoardConfiguration,
} from "@/runtime/semantic-board-store/index";
import type { CodeCheckSkip } from "@/shared/code-check/index";
import {
	currentVariant,
	variantNamed,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";

/** One board the check reads, the variant it reads, and the file it lives in. */
interface BoardToCheck {
	readonly board: SemanticBoard;
	readonly file: string;
	readonly variant: SemanticVariant;
	/** True when the variant is the named draft: then a bound path must be in its checkout too. */
	readonly named: boolean;
	/**
	 * The vault's relationship kinds, which say the evidence kinds each one
	 * accepts; the bundled defaults where the configuration is invalid, as
	 * everywhere else.
	 */
	readonly relationshipKinds: SemanticPolicy["relationshipKinds"];
}

/** The boards one pass reads, and the boards it skips with the reason. */
interface BoardsToCheck {
	readonly ok: true;
	readonly boards: readonly BoardToCheck[];
	readonly skipped: readonly CodeCheckSkip[];
}

/** No board has a draft of the named variant, and the drafts that exist. */
interface NoSuchDraft {
	readonly ok: false;
	readonly variant: string;
	readonly drafts: readonly string[];
}

/**
 * The draft of a name on one board.
 * @param board The board.
 * @param name The variant's name.
 * @returns The draft, or undefined when the board has no draft of that name.
 */
function draftNamed(board: SemanticBoard, name: string): SemanticVariant | undefined {
	const found = variantNamed(board, name);
	return found?.lifecycle === "draft" ? found : undefined;
}

/** What reading every board finds before the named draft is known to exist. */
interface Reading {
	readonly boards: BoardToCheck[];
	readonly skipped: CodeCheckSkip[];
	readonly drafts: Set<string>;
	readonly relationshipKinds: SemanticPolicy["relationshipKinds"];
}

/**
 * Read one board at the variant the check reads, or skip it with the reason.
 * @param location Where the board is.
 * @param variant The draft `--variant` names, if any.
 * @param reading What the pass has read so far, which this adds to.
 */
function readOne(
	location: ReturnType<typeof listSemanticBoards>[number],
	variant: string | undefined,
	reading: Reading,
): void {
	const read = readSemanticBoardAt(location);
	if (!read.ok) {
		reading.skipped.push({
			reason: "board-unreadable",
			board: location.name,
			detail: read.problem,
		});
		return;
	}
	const { board } = read;
	for (const each of board.variants.filter((one) => one.lifecycle === "draft")) {
		reading.drafts.add(each.name);
	}
	const draft = variant === undefined ? undefined : draftNamed(board, variant);
	const chosen = draft ?? currentVariant(board);
	if (chosen === undefined)
		reading.skipped.push({ reason: "no-current-variant", board: board.name });
	else
		reading.boards.push({
			board,
			file: location.file,
			variant: chosen,
			named: draft !== undefined,
			relationshipKinds: reading.relationshipKinds,
		});
}

/**
 * Read every board of the vault at the variant the check reads.
 * @param vault The vault directory.
 * @param variant The draft `--variant` names, if any.
 * @returns The boards and the skipped ones, or the drafts that exist when no
 * board has a draft of that name.
 */
function readBoardsToCheck(vault: string, variant?: string): BoardsToCheck | NoSuchDraft {
	const { relationshipKinds } = readSemanticBoardConfiguration(vault).configuration;
	const reading: Reading = { boards: [], skipped: [], drafts: new Set(), relationshipKinds };
	for (const location of listSemanticBoards(vault)) readOne(location, variant, reading);
	if (variant !== undefined && !reading.boards.some((board) => board.named)) {
		return { ok: false, variant, drafts: [...reading.drafts].toSorted() };
	}
	return { ok: true, boards: reading.boards, skipped: reading.skipped };
}

export { type BoardToCheck, type BoardsToCheck, type NoSuchDraft, readBoardsToCheck };

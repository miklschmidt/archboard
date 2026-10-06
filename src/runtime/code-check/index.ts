// The code check (ADR 0046): on request, the code that the bindings and
// anchors of each board name, held to the files on disk, and the relationships
// between its bound parts held to the evidence that joins their code.
//
// It reads every board through the store at its current variant, or at the
// draft `--variant` names, and never a historical or a shelved variant. It
// reads only files that Git does not ignore, in checkouts this machine has
// registered, through code facts (`src/runtime/code-facts`): TypeScript and
// TSX by their syntax, and every other file as text. It writes nothing
// anywhere.

export {
	type BoardToCheck,
	type BoardsToCheck,
	type NoSuchDraft,
	readBoardsToCheck,
} from "@/runtime/code-check/lib/boards";
export { type CodeCheckOutcome, checkCode } from "@/runtime/code-check/lib/check";

// The code check (ADR 0046): on request, the code that the bindings and
// anchors of each board name, held to the files on disk, and the relationships
// between its bound parts held to the evidence that joins their code.
//
// It reads every board through the store at its current variant, or at the
// draft `--variant` names, or every draft of every board (`--every-draft`),
// and never a historical or a shelved variant. A draft is also held to the
// parts the variant before it holds and it lacks, in the code it describes. It
// reads only files that Git does not ignore, in checkouts this machine has
// registered, through code facts (`src/runtime/code-facts`): each language an
// adapter reads by its syntax, and every other file as text. A Terraform or
// OpenTofu root module is read as one address space, with the plan JSON files
// an agent named (`readPlans`) for the modules it does not read. It writes
// nothing anywhere.

export {
	type BoardToCheck,
	type BoardsToCheck,
	type NoSuchDraft,
	readBoardsToCheck,
	readEveryDraftToCheck,
} from "@/runtime/code-check/lib/boards";
export { type CodeCheckOutcome, checkCode } from "@/runtime/code-check/lib/check";
export { type PlanRefused, readPlans } from "@/runtime/code-check/lib/plans";

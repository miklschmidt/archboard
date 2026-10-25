// The help texts of `semantic edit` and `semantic branch`, which are long
// enough that the contract file beside them would pass the line bound with
// them in it. Each is the description of its command, written as the lines
// that `--help` prints.

import { UNNAMED_VARIANT } from "#cli/operations/semantic/input/semantic-input.ts";

/** The description of `semantic edit`. */
const EDIT_HELP = [
	"Applies one batch of stated changes to a semantic board in one write. The batch lands whole or not at all.",
	"",
	"The batch:",
	"- It is JSON with optional board `level` metadata, the target variant's `summary` and `documents`, `nodes`, `edges`, `flows`, `views`, `walkthroughs` and the matching `remove...` lists.",
	"- The command reads it from --input or standard input.",
	"- Architectural content targets the selected variant. Views are shared by the whole board.",
	"",
	"Variant and version:",
	`- --variant says which variant the change lands on, by id or name, ${UNNAMED_VARIANT}.`,
	"- The batch's own `variant` says the same thing. Where the two differ, the command line wins and the write says so.",
	"- --expect-version is required. State the version that the board reported when you read it. The write is refused if somebody has changed the board since.",
	"",
	"The scope of a view reads exactly as it is written:",
	"- Name relationships and the view shows those and no others, so one connection can be isolated.",
	"- Name none and the view shows every relationship between the nodes that it kept.",
	"- Either way, both ends of a shown relationship, every participant of a shown flow, and every container that they sit inside come with it. A container that holds all of them is the exception.",
	"",
	"A stated id that the variant lacks restores that subject under its id when the variant's predecessor or recorded reconciliation base holds it.",
	"",
	"Confirming a change on purpose:",
	"- A refusal that an edit can make on purpose names its code. --confirm with that code passes it.",
	"- RESTORE_UNCONFIRMED: restoring an id that only another variant holds.",
	"- PART_RECREATED: adding a part that an ancestor holds under another id.",
	"- INHERITANCE_DROPPED: removing more than half of what the variant inherited.",
].join("\n");

/** The description of `semantic branch`. */
const BRANCH_HELP = [
	`Adds a proposal derived from a variant that this board already has. --from names the variant to derive from, ${UNNAMED_VARIANT}.`,
	"",
	"What the proposal starts with:",
	"- The architecture of the predecessor, carried over whole. Every entity keeps the identity that it already had. That is what makes the two comparable: a node that keeps its id through a rename is a rename, and the same node written again under a fresh id would be a deletion standing beside an addition.",
	"- The document references of the predecessor, copied too. The `documents` of an edit restate them.",
	"- The state of a draft. The proposal designates nothing, so what is current stays where it is until somebody says otherwise.",
	"",
	"What the proposal proposes is said afterwards, as ordinary edits to it.",
].join("\n");

export { BRANCH_HELP, EDIT_HELP };

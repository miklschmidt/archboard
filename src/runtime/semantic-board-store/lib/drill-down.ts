// What the vault can say about a link from one board to another (ADR 0029).
//
// A drill-down is the one thing on a board that names something outside it, so
// it is the one thing no single board can check. The board knows it opens
// "Archboard server"; whether the vault holds that board, and what level it is
// at, is a fact about the vault. That is why these three diagnostics live in
// the vault checker and nowhere near the write boundary: refusing a write
// would mean reading another board inside the lease of this one, and the
// answer would go stale the moment the other board was renamed anyway.
//
// The three things it reports, from ADR 0029:
//
//   - a node that exists only to carry its link. It has no relationship, no
//     children and no part in a flow, so the only thing it says is "there is
//     another board" — a button, and a diagram has no buttons;
//   - a link to a board the vault does not hold, which opens nothing;
//   - a kind that disagrees with the level of the board it opens, because a
//     node standing for what another board describes carries that board's
//     level as its kind.
//
// A drill-down that names a repository identity (ADR 0049) opens a board of the
// vault of that identity's chosen checkout, so the same three questions are
// asked of that vault, and a fourth is added: whether this machine has a
// checkout of the repository to ask at all. The checkout is the one every other
// reader of this vault resolves (`checkoutsReadFrom`), and a drill-down that
// names the vault's own repository (`vaultIdentity`) stays in the vault, as the
// board listing reads it. The target is read
// without writing: a check of one repository never migrates a board of another.
//
// All of them are warnings. The board still draws, and the repair is an ordinary
// agent write (ADR 0026) — and every repair the three name rewrites the
// variant's own nodes, which is why they are reported only over the variants
// that still accept content edits (see `content-checks.ts`). On frozen history
// the same warning would name a write the store refuses.

import fs from "node:fs";
import path from "node:path";
import { checkoutsReadFrom, vaultIdentity } from "@/runtime/code-target/index";
import {
	messagesOf,
	type DrillDown,
	type SemanticBoard,
	type SemanticNode,
	type VariantContent,
} from "@/shared/semantic-board/index";
import type { VaultDiagnostic } from "@/shared/semantic-policy/index";
import { contentCheckedVariants } from "@/runtime/semantic-board-store/lib/content-checks";
import { decodeSemanticBoardDocument } from "@/runtime/semantic-board-store/lib/decode";
import { resolveSemanticBoard } from "@/runtime/semantic-board-store/lib/former-names";
import { semanticBoardAddress } from "@/runtime/semantic-board-store/lib/location";
import { nodeSubject } from "@/runtime/semantic-board-store/lib/subject";

/** Where a checkout keeps its vault (ADR 0049). */
const VAULT_IN_CHECKOUT = path.join(".archboard", "vault");

/** What the checker knows about one board it read, as another board's target. */
interface DrillDownTarget {
	/** The board's own name, as the document spells it. */
	readonly name: string;
	/** The level it declares. */
	readonly level: string;
}

/**
 * The address a drill-down names, without touching the filesystem.
 * @param board The board name as the node spells it.
 * @returns Its comparison key, or null when the name is not a usable address.
 */
function targetKey(board: string): string | null {
	try {
		return semanticBoardAddress(board).key;
	} catch {
		return null;
	}
}

/** Why a drill-down names a repository whose board cannot be looked at. */
type Unreachable =
	| { readonly why: "unknown" }
	| { readonly why: "gone" | "no-vault"; readonly root: string };

/** Where the board a drill-down opens is looked up. */
type DrillPlace =
	| { readonly kind: "here" }
	| { readonly kind: "elsewhere"; readonly vault: string }
	| ({ readonly kind: "unreachable" } & Unreachable);

const HERE: DrillPlace = { kind: "here" };

/**
 * Where the board a drill-down opens is looked up, given the checkout that
 * holds its repository.
 * @param found That checkout, or undefined when this machine has none.
 * @returns The place.
 */
function placeIn(
	found: { readonly root: string; readonly exists: boolean } | undefined,
): DrillPlace {
	if (found === undefined) return { kind: "unreachable", why: "unknown" };
	if (!found.exists) return { kind: "unreachable", why: "gone", root: found.root };
	const there = path.join(found.root, VAULT_IN_CHECKOUT);
	return fs.statSync(there, { throwIfNoEntry: false })?.isDirectory()
		? { kind: "elsewhere", vault: there }
		: { kind: "unreachable", why: "no-vault", root: found.root };
}

/**
 * The place each drill-down of one vault opens, asked at most once per check
 * and only when some drill-down names a repository. A drill-down that names
 * the vault's own identity opens a board of the vault itself, as the listing
 * reads it (ADR 0049).
 * @param vault The vault the drill-downs are on.
 * @returns The place for a repository identity, or for none.
 */
function createDrillPlaces(vault: string): (repo: string | undefined) => DrillPlace {
	let own: { readonly identity: string | undefined } | undefined;
	let checkouts: ReturnType<typeof checkoutsReadFrom> | undefined;
	return (repo) => {
		if (repo === undefined) return HERE;
		own ??= { identity: vaultIdentity(vault) };
		if (repo === own.identity) return HERE;
		checkouts ??= checkoutsReadFrom(vault);
		return placeIn(checkouts.find((entry) => entry.repo === repo));
	};
}

/** What a drill-down opens, as far as the checker can tell. */
type DrillAnswer =
	| { readonly kind: "found"; readonly target: DrillDownTarget }
	| { readonly kind: "missing" }
	| { readonly kind: "unreadable"; readonly file: string; readonly problem: string }
	| ({ readonly kind: "unreachable" } & Unreachable);

const MISSING: DrillAnswer = { kind: "missing" };

/**
 * The board a name answers to in another vault, read as it is on disk and
 * never migrated or written: its own name, else one it had (ADR 0036).
 * @param vault The other vault.
 * @param board The name the drill-down spells.
 * @returns The board, none, or why the file that holds it cannot be read. The
 * other vault's own check reports that file; this one only says why the link
 * cannot be followed.
 */
function targetIn(vault: string, board: string): DrillAnswer {
	let file: string;
	let text: string;
	try {
		file = resolveSemanticBoard(board, vault).file;
		text = fs.readFileSync(file, "utf-8");
	} catch {
		return MISSING;
	}
	const decoded = decodeSemanticBoardDocument(text);
	return decoded.ok
		? { kind: "found", target: { name: decoded.board.name, level: decoded.board.level } }
		: { kind: "unreadable", file, problem: decoded.problem };
}

/** Answers where a drill-down leads, for the boards of one vault. */
type DrillLookup = (drill: DrillDown) => DrillAnswer;

/**
 * Where drill-downs lead, for one vault.
 * @param vault The vault the drill-downs are on.
 * @param local Every board the vault holds, by address key.
 * @returns The lookup.
 */
function createDrillLookup(
	vault: string,
	local: ReadonlyMap<string, DrillDownTarget>,
): DrillLookup {
	const places = createDrillPlaces(vault);
	return (drill) => {
		const place = places(drill.repo);
		if (place.kind === "unreachable") return place;
		if (place.kind === "elsewhere") return targetIn(place.vault, drill.board);
		const key = targetKey(drill.board);
		const target = key === null ? undefined : local.get(key);
		return target === undefined ? MISSING : { kind: "found", target };
	};
}

/**
 * Whether a node is on the board for any reason other than its link.
 *
 * A part that is really there is wired to something: it sends or receives a
 * relationship, holds children, or takes part in an exchange. A node with none
 * of the three and a `drillDown` is there to be clicked.
 * @param node The node carrying the link.
 * @param content The variant it belongs to.
 * @returns True when the board says something about the node besides the link.
 */
function participates(node: SemanticNode, content: VariantContent): boolean {
	return (
		content.edges.some((edge) => edge.from === node.id || edge.to === node.id) ||
		content.nodes.some((other) => other.parent === node.id) ||
		content.flows.some(
			(flow) =>
				flow.participants.includes(node.id) ||
				messagesOf(flow.steps).some((step) => step.from === node.id || step.to === node.id),
		)
	);
}

/**
 * Everything wrong with one board's links out of it, over the variants
 * somebody can still edit.
 * @param board The board as read.
 * @param file The file it was read from.
 * @param lookup Where each drill-down leads.
 * @returns One diagnostic per problem, in board order.
 */
function semanticDrillDownDiagnostics(
	board: SemanticBoard,
	file: string,
	lookup: DrillLookup,
): VaultDiagnostic[] {
	return contentCheckedVariants(board).flatMap((variant) =>
		variant.content.nodes.flatMap((node) =>
			node.drillDown === undefined
				? []
				: linkDiagnostics(node, node.drillDown, variant.content, lookup, {
						file,
						board: board.name,
						variant: variant.id,
						path: `variants.${variant.id}.content.nodes.${node.id}.drillDown`,
						subject: nodeSubject(node),
					}),
		),
	);
}

/** Where one link is, in the words every vault diagnostic uses. */
type DiagnosticSite = Pick<VaultDiagnostic, "file" | "board" | "variant" | "path" | "subject">;

/**
 * Where a drill-down's board is, in the words of a diagnostic.
 * @param drill The drill-down.
 * @returns The board, and the repository when the drill-down names one.
 */
function whereItOpens(drill: DrillDown): string {
	return drill.repo === undefined
		? `board ${JSON.stringify(drill.board)}`
		: `board ${JSON.stringify(drill.board)} of repository ${drill.repo}`;
}

/**
 * What is wrong with a drill-down that cannot reach the repository it names.
 * @param drill The drill-down.
 * @param answer Why the repository cannot be looked at.
 * @returns What happened and what to do about it.
 */
function unreachableWords(drill: DrillDown, answer: Unreachable): string {
	const repo = drill.repo ?? "";
	if (answer.why === "unknown")
		return (
			`this machine has no chosen checkout of repository ${repo}, so the link opens nothing here. ` +
			"Register a checkout with `archboard repo add <directory>` (the first one known is the one " +
			"read), choose a known one with `archboard repo use <directory>`, or name the repository " +
			"that holds the board."
		);
	return answer.why === "gone"
		? `the chosen checkout of repository ${repo} (${answer.root}) is gone, so the link opens ` +
				"nothing. Choose another with `archboard repo use <directory>`, or remove this one with " +
				`\`archboard repo forget ${answer.root}\`.`
		: `the chosen checkout of repository ${repo} (${answer.root}) holds no .archboard/vault, so ` +
				"the link opens nothing. Choose a checkout that has one with `archboard repo use " +
				"<directory>`, or name the repository that holds the board.";
}

/** One problem with a link, before it is placed on the link. */
type LinkProblem = Pick<VaultDiagnostic, "code" | "message">;

/**
 * What is wrong with where a link leads, when anything is.
 * @param node The node carrying it.
 * @param drill The drill-down it carries.
 * @param answer Where it leads.
 * @returns The problem, or null when it opens a board of the node's level.
 */
function answerProblem(
	node: SemanticNode,
	drill: DrillDown,
	answer: DrillAnswer,
): LinkProblem | null {
	const named = JSON.stringify(node.name);
	switch (answer.kind) {
		case "unreachable":
			return {
				code: "DRILL_DOWN_UNKNOWN_REPOSITORY",
				message: `Node ${named} opens ${whereItOpens(drill)}, but ${unreachableWords(drill, answer)}`,
			};
		case "unreadable":
			return {
				code: "DRILL_DOWN_UNKNOWN_BOARD",
				message:
					`Node ${named} opens ${whereItOpens(drill)}, which the vault of its chosen checkout ` +
					`holds in ${answer.file}, and that file cannot be read: ${answer.problem}. The link ` +
					"opens nothing until the board is repaired in its own repository, where " +
					"`archboard check` names the repair.",
			};
		case "missing":
			return {
				code: "DRILL_DOWN_UNKNOWN_BOARD",
				message:
					`Node ${named} opens ${whereItOpens(drill)}, which ` +
					`${drill.repo === undefined ? "this vault" : "the vault of its chosen checkout"} ` +
					"does not hold, so the link opens nothing. Create that board, name the board that does " +
					"describe these internals, or remove the drill-down.",
			};
		case "found":
			break;
	}
	return levelProblem(node, drill, answer.target);
}

/**
 * Whether a node's kind disagrees with the level of the board it opens.
 * @param node The node carrying the link.
 * @param drill The drill-down it carries.
 * @param target The board it opens.
 * @returns The problem, or null when they agree.
 */
function levelProblem(
	node: SemanticNode,
	drill: DrillDown,
	target: DrillDownTarget,
): LinkProblem | null {
	if (node.kind === target.level) return null;
	return {
		code: "DRILL_DOWN_LEVEL_MISMATCH",
		message:
			`Node ${JSON.stringify(node.name)} is of kind ${JSON.stringify(node.kind)} and opens ` +
			`${whereItOpens({ ...drill, board: target.name })}, which is at level ` +
			`${JSON.stringify(target.level)}. A node standing for what another board ` +
			"describes carries that board's level as its kind: use " +
			`kind ${JSON.stringify(target.level)} (defining it under nodeKinds in ` +
			".archboard/config.yaml when the vault has no such kind yet), or point the drill-down at " +
			"the board this part really is.",
	};
}

/**
 * Everything wrong with one node's link.
 * @param node The node carrying it.
 * @param drill The drill-down it carries.
 * @param content The variant it belongs to.
 * @param lookup Where each drill-down leads.
 * @param where The diagnostic site.
 * @returns One diagnostic per problem.
 */
function linkDiagnostics(
	node: SemanticNode,
	drill: DrillDown,
	content: VariantContent,
	lookup: DrillLookup,
	where: DiagnosticSite,
): VaultDiagnostic[] {
	const onlyNode: LinkProblem | null = participates(node, content)
		? null
		: {
				code: "DRILL_DOWN_ONLY_NODE",
				message:
					`Node ${JSON.stringify(node.name)} carries a drill-down to ${JSON.stringify(drill.board)} ` +
					"and nothing else: it has no relationship, no children and no part in a flow, so it is " +
					"on the board only to be opened. A drill-down is an affordance on a part that is really " +
					"there. Draw the actual participant this board reaches and put the link on it, or move " +
					"an upward link onto the container the board describes, and remove this node.",
			};
	return [onlyNode, answerProblem(node, drill, lookup(drill))].flatMap((problem) =>
		problem === null ? [] : [{ ...where, severity: "warning" as const, ...problem }],
	);
}

export { type DrillDownTarget, type DrillLookup, createDrillLookup, semanticDrillDownDiagnostics };

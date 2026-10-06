// What the evidence says about the relationships of one board (ADR 0046).
//
// Two bound parts that code joins and that no relationship joins are a
// dependency the board does not draw: `RELATIONSHIP_UNDRAWN`, one finding on
// the part the code reaches, which lists every part that reaches it with one
// piece of evidence each, so 7 parts that use one shared helper make one
// finding on the helper. A relationship or a flow step in either direction
// between the two parts, or between parts that hold them, counts as drawn.
// Only a call, a configured path or a build dependency is a dependency: a
// permission, an import that only types use and provisioning never are. The
// finding is a warning when some of its evidence is resolved, because the
// check is sure of it and drawing the relationship clears it, and information
// when all of it is a candidate, which nothing on a board can clear.
//
// A relationship with no anchor whose ends are both read is judged by the
// evidence its kind accepts (the `evidence` key of its kind in the vault
// configuration; a kind without it accepts every evidence kind). Evidence from
// a part inside an end counts as evidence of that end. Accepted evidence from
// its start to its end supports it. Otherwise `RELATIONSHIP_BACKWARDS` says
// that accepted evidence runs only the other way, and
// `RELATIONSHIP_UNSUPPORTED` that none joins the ends. Both are information:
// the direction of a kind is the vault's convention, and code does not prove
// a call across a network, through an event bus or through a value a part
// receives. A relationship with an anchor is judged only by its anchor.

import type { BoardToCheck } from "@/runtime/code-check/lib/boards";
import type { ClaimSite } from "@/runtime/code-check/lib/claims";
import type { BoardEvidence, Piece } from "@/runtime/code-check/lib/evidence";
import type { PartCode, ReadPart, SkippedPart } from "@/runtime/code-check/lib/part-code";
import { edgeSubjects, nodeSubject } from "@/runtime/semantic-board-store/index";
import type { CodeCheckSkip, CodeFinding } from "@/shared/code-check/index";
import type { SemanticEdge } from "@/shared/semantic-board/index";
import {
	describeSubject,
	type EvidenceKind,
	type SemanticPolicy,
} from "@/shared/semantic-policy/index";

/** The evidence kinds that are a dependency at run time or at build time. */
const DEPENDENCY_KINDS: ReadonlySet<EvidenceKind> = new Set([
	"call",
	"configured-path",
	"build-dependency",
]);

/** What judging the relationships of one board needs. */
interface RelationshipReading {
	readonly read: BoardToCheck;
	readonly codes: ReadonlyMap<string, PartCode>;
	readonly evidence: BoardEvidence;
	/** Each part and the parts that hold it, the part first. */
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
	readonly relationshipKinds: SemanticPolicy["relationshipKinds"];
}

/** What the relationships of one board give. */
interface RelationshipOutcome {
	readonly findings: CodeFinding[];
	readonly skipped: CodeCheckSkip[];
}

/**
 * Where a finding about one part or relationship of the board sits.
 * @param read The board and its variant.
 * @param path The place inside the variant's content.
 * @param subject What it is about.
 * @returns The site.
 */
function siteOf(read: BoardToCheck, path: string, subject: ClaimSite["subject"]): ClaimSite {
	return {
		file: read.file,
		board: read.board.name,
		variant: read.variant.id,
		path: `variants.${read.variant.id}.content.${path}`,
		subject,
	};
}

/**
 * The name of a part, quoted.
 * @param reading The board.
 * @param id The part's id.
 * @returns Its name.
 */
function nameOf(reading: RelationshipReading, id: string): string {
	return JSON.stringify(reading.codes.get(id)?.node.name ?? id);
}

/**
 * Whether the board draws two parts joined: a relationship or a flow step runs
 * between them, or between parts that hold them, in either direction.
 * @param reading The board.
 * @param left One part.
 * @param right The other.
 * @returns True when it does.
 */
function drawn(reading: RelationshipReading, left: string, right: string): boolean {
	const { content } = reading.read.variant;
	const atLeft = reading.lineages.get(left) ?? new Set([left]);
	const atRight = reading.lineages.get(right) ?? new Set([right]);
	const joints = [...content.edges, ...content.flows.flatMap((flow) => flow.steps)];
	return joints.some(
		({ from, to }) =>
			(atLeft.has(from) && atRight.has(to)) || (atLeft.has(to) && atRight.has(from)),
	);
}

/**
 * One piece for each key, a resolved one before a candidate, in the order the
 * keys first appear.
 * @param pieces The pieces.
 * @param keyOf What makes two pieces the same.
 * @returns One piece for each key.
 */
function onePer(pieces: readonly Piece[], keyOf: (piece: Piece) => string): Piece[] {
	const chosen = new Map<string, Piece>();
	for (const piece of pieces) {
		const key = keyOf(piece);
		const held = chosen.get(key);
		if (
			held === undefined ||
			(held.resolution === "candidate" && piece.resolution === "resolved")
		) {
			chosen.set(key, piece);
		}
	}
	return [...chosen.values()];
}

/**
 * What a finding says of its candidates.
 * @param candidates How many of its pieces are candidates.
 * @returns The sentence, or nothing when none is.
 */
function candidateSentence(candidates: number): string {
	if (candidates === 0) return "";
	const pieces =
		candidates === 1 ? "One piece of it is a candidate" : `${candidates} pieces are candidates`;
	return ` ${pieces}, matched by name only until a language server resolves it.`;
}

/**
 * The finding about a part that code reaches from parts the board does not join to it.
 * @param reading The board.
 * @param to The part reached.
 * @param pieces One piece for each part that reaches it.
 * @returns The finding.
 */
function undrawnFinding(reading: RelationshipReading, to: ReadPart, pieces: Piece[]): CodeFinding {
	const subject = nodeSubject(to.node);
	const from = pieces.map((piece) => nameOf(reading, piece.from)).join(", ");
	const candidates = pieces.filter((piece) => piece.resolution === "candidate").length;
	const resolved = candidates < pieces.length;
	const unsure = candidateSentence(candidates);
	return {
		...siteOf(reading.read, `nodes.${to.node.id}`, subject),
		severity: resolved ? "warning" : "information",
		code: "RELATIONSHIP_UNDRAWN",
		message:
			`The code of ${from} reaches ${describeSubject(subject)}, and no relationship joins ` +
			`${pieces.length === 1 ? "them" : "each of them to it"}.${unsure} Draw the relationship ` +
			"this board's question needs, between these parts or parts that hold them, or change " +
			`the code if it should not reach ${nameOf(reading, to.node.id)}.`,
		evidence: pieces,
	};
}

/**
 * The parts that code reaches from bound parts the board does not join to them.
 * @param reading The board.
 * @returns One finding for each part reached.
 */
function undrawnFindings(reading: RelationshipReading): CodeFinding[] {
	const byTarget = new Map<string, Piece[]>();
	for (const piece of reading.evidence.pieces) {
		if (!DEPENDENCY_KINDS.has(piece.kind) || drawn(reading, piece.from, piece.to)) continue;
		byTarget.set(piece.to, [...(byTarget.get(piece.to) ?? []), piece]);
	}
	return [...reading.codes.values()].flatMap((code) => {
		const pieces = byTarget.get(code.node.id);
		if (code.status !== "read" || pieces === undefined) return [];
		return [
			undrawnFinding(
				reading,
				code,
				onePer(pieces, (piece) => piece.from),
			),
		];
	});
}

/**
 * Whether a relationship kind accepts an evidence kind. A kind without the
 * `evidence` key, or one the vocabulary lacks, accepts every evidence kind.
 * @param reading The board and the vocabulary.
 * @param kind The relationship's kind.
 * @param evidence The evidence kind.
 * @returns True when it does.
 */
function accepts(reading: RelationshipReading, kind: string, evidence: EvidenceKind): boolean {
	const kinds = reading.relationshipKinds;
	const accepted = Object.hasOwn(kinds, kind) ? kinds[kind]?.evidence : undefined;
	return accepted === undefined || accepted.includes(evidence);
}

/**
 * A part and every part inside it.
 * @param reading The board.
 * @param id The part.
 * @returns The ids.
 */
function sideOf(reading: RelationshipReading, id: string): Set<string> {
	return new Set(
		[...reading.lineages].flatMap(([inside, chain]) => (chain.has(id) ? [inside] : [])),
	);
}

/** Why a relationship is not judged: an end the pass skipped, or ends that share their code. */
type Unjudged = Pick<CodeCheckSkip, "reason" | "repo" | "ref" | "detail"> | "silent";

/**
 * Whether the pass skipped a part, with the reason it gives.
 * @param code The part's code.
 * @returns True when it did.
 */
function isSkipped(code: PartCode | undefined): code is SkippedPart {
	return code?.status === "skipped";
}

/**
 * Whether the pass read a part's code.
 * @param code The part's code.
 * @returns True when it did.
 */
function isRead(code: PartCode | undefined): code is ReadPart {
	return code?.status === "read";
}

/**
 * Whether code facts, not the text reading, read some of the code of a part
 * or of a part inside it, so references can join it to another.
 * @param reading The board.
 * @param part The part.
 * @returns True when a grammar read one of those files.
 */
function hasParsedCode(reading: RelationshipReading, part: ReadPart): boolean {
	const parsed = reading.evidence.parsed.get(part.checkout.repo) ?? new Set();
	return [...sideOf(reading, part.node.id)].some((id) => {
		const code = reading.codes.get(id);
		return isRead(code) && code.files.some((file) => parsed.has(file));
	});
}

/**
 * Whether one part holds the other.
 * @param reading The board.
 * @param left One part's id.
 * @param right The other's.
 * @returns True when either holds the other.
 */
function holdsOneAnother(reading: RelationshipReading, left: string, right: string): boolean {
	return (
		reading.lineages.get(left)?.has(right) === true ||
		reading.lineages.get(right)?.has(left) === true
	);
}

/**
 * Why the check does not judge a relationship whose ends it read: ends that
 * hold one another or bind the same code, or code it read only as text.
 * @param reading The board.
 * @param start The part at its start.
 * @param end The part at its end.
 * @returns The reason, `silent` when the text-only skip says it, or undefined.
 */
function unjudgedRead(
	reading: RelationshipReading,
	start: ReadPart,
	end: ReadPart,
): Unjudged | undefined {
	if (holdsOneAnother(reading, start.node.id, end.node.id) || start.key === end.key)
		return { reason: "ends-overlap" };
	return hasParsedCode(reading, start) && hasParsedCode(reading, end) ? undefined : "silent";
}

/**
 * Why the check does not judge a relationship with no anchor whose ends are
 * both bound, or nothing when it does.
 * @param reading The board.
 * @param edge The relationship.
 * @returns The reason, `silent` when it is said elsewhere, or undefined.
 */
function unjudged(reading: RelationshipReading, edge: SemanticEdge): Unjudged | undefined {
	const ends = [reading.codes.get(edge.from), reading.codes.get(edge.to)];
	const skipped = ends.find(isSkipped);
	if (skipped !== undefined) {
		const detail = [skipped.node.name, skipped.skip.detail].filter(Boolean).join(": ");
		return { ...skipped.skip, detail };
	}
	const [start, end] = ends.filter(isRead);
	return start === undefined || end === undefined ? "silent" : unjudgedRead(reading, start, end);
}

/**
 * What makes two pieces the same in a relationship's finding: their parts and kind.
 * @param piece The piece.
 * @returns The key.
 */
function pairOf(piece: Piece): string {
	return `${piece.from}\0${piece.to}\0${piece.kind}`;
}

/**
 * The finding about a relationship with no anchor that the accepted evidence
 * does not support, if any.
 * @param reading The board.
 * @param edge The relationship.
 * @returns The finding, or undefined when accepted evidence supports it.
 */
function judgeEdge(reading: RelationshipReading, edge: SemanticEdge): CodeFinding | undefined {
	const start = sideOf(reading, edge.from);
	const end = sideOf(reading, edge.to);
	const between = reading.evidence.pieces.filter(
		(piece) =>
			(start.has(piece.from) && end.has(piece.to)) || (end.has(piece.from) && start.has(piece.to)),
	);
	const accepted = between.filter((piece) => accepts(reading, edge.kind, piece.kind));
	if (accepted.some((piece) => start.has(piece.from))) return undefined;
	const subject = edgeSubjects(reading.read.variant.content)(edge);
	const site = siteOf(reading.read, `edges.${edge.id}`, subject);
	const about = `${describeSubject(subject)} has no anchor, and`;
	const kind = JSON.stringify(edge.kind);
	if (accepted.length > 0) {
		return {
			...site,
			severity: "information",
			code: "RELATIONSHIP_BACKWARDS",
			message:
				`The ${about} the evidence its kind ${kind} accepts runs only from ` +
				`${nameOf(reading, edge.to)} to ${nameOf(reading, edge.from)}. Turn it around if the ` +
				"code runs that way. If the direction is the convention of its kind, as a subscription " +
				"runs from the handler to the part that sends the event, anchor it to the code that proves it.",
			evidence: onePer(accepted, pairOf),
		};
	}
	const others = onePer(between, pairOf);
	const found =
		others.length === 0
			? ""
			: ` The code joins them only by ${[...new Set(others.map((piece) => piece.kind))].join(" and ")} evidence.`;
	return {
		...site,
		severity: "information",
		code: "RELATIONSHIP_UNSUPPORTED",
		message:
			`The ${about} no evidence its kind ${kind} accepts joins the code of its ends.${found} ` +
			"A call across a network, through an event bus or through a value a part receives shows " +
			"none in code: anchor it to the code that proves it, or change it to what the code does.",
		...(others.length === 0 ? {} : { evidence: others }),
	};
}

/**
 * Judge one relationship with no anchor whose ends are both bound, or say why not.
 * @param reading The board.
 * @param edge The relationship.
 * @param outcome What the board gives, which this adds to.
 */
function judgeOrSkip(
	reading: RelationshipReading,
	edge: SemanticEdge,
	outcome: RelationshipOutcome,
): void {
	const reason = unjudged(reading, edge);
	if (reason === "silent") return;
	if (reason === undefined) {
		const finding = judgeEdge(reading, edge);
		if (finding !== undefined) outcome.findings.push(finding);
		return;
	}
	const subject = edgeSubjects(reading.read.variant.content)(edge);
	const { board, variant } = siteOf(reading.read, "", subject);
	outcome.skipped.push({ board, variant, subject, ...reason });
}

/**
 * Judge every relationship with no anchor whose ends are both bound.
 * @param reading The board.
 * @returns The findings and what was not judged.
 */
function edgeOutcome(reading: RelationshipReading): RelationshipOutcome {
	const outcome: RelationshipOutcome = { findings: [], skipped: [] };
	/**
	 * Whether a part has a binding.
	 * @param id The part's id.
	 * @returns True when it does.
	 */
	const bound = (id: string) => reading.codes.get(id)?.node.binding !== undefined;
	for (const edge of reading.read.variant.content.edges) {
		if (edge.anchor === undefined && bound(edge.from) && bound(edge.to)) {
			judgeOrSkip(reading, edge, outcome);
		}
	}
	return outcome;
}

/**
 * What the evidence says about the relationships of one board: the parts code
 * joins that the board does not, then each relationship with no anchor that
 * the evidence does not support.
 * @param reading The board, its parts' code, the evidence and the vocabulary.
 * @returns The findings and what was not judged.
 */
function judgeRelationships(reading: RelationshipReading): RelationshipOutcome {
	const edges = edgeOutcome(reading);
	return { findings: [...undrawnFindings(reading), ...edges.findings], skipped: edges.skipped };
}

export { type RelationshipReading, judgeRelationships };

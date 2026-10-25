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
//
// Where no accepted evidence supports a relationship whose kind accepts a
// build dependency, the code of its start holds a Nix expression the static
// reading cannot follow, such as a package `callPackage` builds from another
// file, and the code of its end holds an output of the same flake, what the
// start is built from is unknown. The relationship is then skipped as
// `expression-not-followed`, never reported unsupported (TASK-367.22). A
// build dependency in a flake reaches only that flake's outputs, so a
// relationship to any other code is judged.
//
// Across a network hop, the evidence is the join of code and infrastructure
// (environment-join.ts): the code reads a value that the infrastructure that
// runs it sets to another part's address. A piece of that join is shown with
// its partner, where the value is set. Where nothing supports a relationship
// whose kind accepts a configured path, `RELATIONSHIP_UNSUPPORTED` says which
// side has no evidence: the code, when the infrastructure sets a value to the
// address of the end for the code of the start and that code reads none of
// those names, or the infrastructure, when the code of the start reads names
// that nothing the check reads sets for it.

import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
import type { ClaimSite } from "#runtime/operations/code-check/claims/claims.ts";
import type { EnvironmentJoin } from "#runtime/operations/code-check/evidence/environment-join.ts";
import type { BoardEvidence, Piece } from "#runtime/operations/code-check/evidence/evidence.ts";
import { differingCode } from "#runtime/operations/code-check/part-code.ts";
import type { PartCode, ReadPart, SkippedPart } from "#runtime/operations/code-check/part-code.ts";
import { edgeSubjects, nodeSubject } from "@archboard/board/vault-policy";
import type { CodeCheckSkip, CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import { messagesOf } from "@archboard/board/flow";
import type { SemanticEdge } from "@archboard/board/content";
import { describeSubject, type SemanticPolicy } from "@archboard/board/policy";
import type { EvidenceKindSchema } from "@archboard/board/policy";
import type { z } from "zod";

type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

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
	/** The join of code and infrastructure: each joined piece's partner, and the sides of a hop. */
	readonly hops: Pick<EnvironmentJoin, "partners" | "sides">;
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
	const joints = [...content.edges, ...content.flows.flatMap((flow) => messagesOf(flow.steps))];
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
 * Pieces with the partner of each piece of a join across a network hop: the
 * place where the infrastructure sets the value that the code reads.
 * @param reading The board.
 * @param pieces The pieces.
 * @returns Each piece, followed by its partner where it has one.
 */
function withPartners(reading: RelationshipReading, pieces: readonly Piece[]): Piece[] {
	return pieces.flatMap((piece) => {
		const partner = reading.hops.partners.get(piece);
		return partner === undefined ? [piece] : [piece, partner];
	});
}

/**
 * How many pieces are candidates, as the start of a sentence.
 * @param count How many.
 * @returns The words.
 */
function candidatesAre(count: number): string {
	return count === 1 ? "One piece of it is a candidate" : `${count} pieces are candidates`;
}

/**
 * What a finding says of its candidates: those of code, matched by name, and
 * those of a join across a network hop, where the infrastructure leaves a
 * choice (environment-join.ts).
 * @param reading The board and its join.
 * @param pieces The finding's pieces.
 * @returns The sentences, or nothing when none is a candidate.
 */
function candidateSentence(reading: RelationshipReading, pieces: readonly Piece[]): string {
	const candidates = pieces.filter((piece) => piece.resolution === "candidate");
	const joined = candidates.filter((piece) => reading.hops.partners.has(piece)).length;
	const named = candidates.length - joined;
	return [
		named === 0
			? ""
			: ` ${candidatesAre(named)}, matched by name only until a language server resolves it.`,
		joined === 0
			? ""
			: ` ${candidatesAre(joined)}: the code that reads the value runs in more than one place ` +
				"that sets it differently, or the address leads to more than one part.",
	].join("");
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
	const resolved = pieces.some((piece) => piece.resolution === "resolved");
	const unsure = candidateSentence(reading, pieces);
	return {
		...siteOf(reading.read, `nodes.${to.node.id}`, subject),
		severity: resolved ? "warning" : "information",
		code: "RELATIONSHIP_UNDRAWN",
		message:
			`The code of ${from} reaches ${describeSubject(subject)}, and no relationship joins ` +
			`${pieces.length === 1 ? "them" : "each of them to it"}.${unsure} Draw the relationship ` +
			"this board's question needs, between these parts or parts that hold them, or change " +
			`the code if it should not reach ${nameOf(reading, to.node.id)}.`,
		evidence: withPartners(reading, pieces),
	};
}

/**
 * Whether a piece makes a dependency undrawn where no relationship draws it:
 * evidence of a dependency, unless its use runs none of the code it reaches.
 * @param reading The board.
 * @param piece The piece.
 * @returns True when it does.
 */
function undrawnBy(reading: RelationshipReading, piece: Piece): boolean {
	if (!DEPENDENCY_KINDS.has(piece.kind) || reading.evidence.values.has(piece)) return false;
	return !drawn(reading, piece.from, piece.to);
}

/**
 * The parts that code reaches from bound parts the board does not join to them.
 * @param reading The board.
 * @returns One finding for each part reached.
 */
function undrawnFindings(reading: RelationshipReading): CodeFinding[] {
	const byTarget = new Map<string, Piece[]>();
	for (const piece of reading.evidence.pieces) {
		if (!undrawnBy(reading, piece)) continue;
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
	const parsed = reading.evidence.parsed.get(part.checkout.root) ?? new Set();
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
 * hold one another, bind the same code or are read at different code, or code it
 * read only as text.
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
	return (
		differingCode(start, end) ??
		(hasParsedCode(reading, start) && hasParsedCode(reading, end) ? undefined : "silent")
	);
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
function judgeEdge(
	reading: RelationshipReading,
	edge: SemanticEdge,
): CodeFinding | Exclude<Unjudged, "silent"> | undefined {
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
			evidence: withPartners(reading, onePer(accepted, pairOf)),
		};
	}
	return (
		notFollowed(reading, edge, { start, end }) ??
		unsupportedFinding(reading, edge, onePer(between, pairOf))
	);
}

/**
 * Why the check cannot tell that no build dependency supports a
 * relationship: its kind accepts one, the code of its start, or of a part
 * inside it, holds a Nix expression the static reading cannot follow, and the
 * code of its end holds an output of the same flake, which that expression
 * may name. A build dependency in a flake reaches only the outputs of that
 * flake, so a relationship to any other code is judged.
 * @param reading The board.
 * @param edge The relationship.
 * @param ends Its start and its end, each with every part inside it.
 * @param ends.start Its start and every part inside it.
 * @param ends.end Its end and every part inside it.
 * @returns The skip, which names the part, the file and the lines of the expression, or nothing.
 */
function notFollowed(
	reading: RelationshipReading,
	edge: SemanticEdge,
	ends: { readonly start: ReadonlySet<string>; readonly end: ReadonlySet<string> },
): Exclude<Unjudged, "silent"> | undefined {
	if (!accepts(reading, edge.kind, "build-dependency")) return undefined;
	const reached = new Set(
		[...ends.end].flatMap((id) => {
			const code = reading.codes.get(id);
			return isRead(code) ? code.files.map((file) => `${code.checkout.root}\0${file}`) : [];
		}),
	);
	for (const id of ends.start) {
		const found = [...(reading.evidence.unfollowed.get(id) ?? [])].find(([at]) => reached.has(at));
		const code = reading.codes.get(id);
		if (found !== undefined && isRead(code)) {
			const detail = `${code.node.name}: ${found[1]}`;
			return { reason: "expression-not-followed", repo: code.checkout.repo, detail };
		}
	}
	return undefined;
}

/**
 * The names a side's evidence quotes, each once.
 * @param evidence The evidence.
 * @returns The names, joined.
 */
function namesIn(evidence: readonly CodeEvidence[]): string {
	return [...new Set(evidence.map((each) => each.symbol))].join(", ");
}

/**
 * Which side of a relationship across a network hop has evidence, where only one has.
 * @param reading The board.
 * @param edge The relationship.
 * @returns The side with none, what the other side says, and its evidence; nothing where neither or both have some.
 */
function oneSided(
	reading: RelationshipReading,
	edge: SemanticEdge,
): Pick<CodeFinding, "missing"> & { says: string; evidence: CodeEvidence[] } {
	const neither = { says: "", evidence: [] };
	if (!accepts(reading, edge.kind, "configured-path")) return neither;
	const sides = reading.hops.sides(sideOf(reading, edge.from), sideOf(reading, edge.to));
	const start = nameOf(reading, edge.from);
	if (sides.settings.length > 0) {
		return {
			missing: "code",
			says:
				` Only the infrastructure has evidence: it sets ${namesIn(sides.settings)} to the address of ` +
				`${nameOf(reading, edge.to)} for the code of ${start}, and that code reads none of them.`,
			evidence: [...sides.settings],
		};
	}
	if (sides.unset.length === 0) return neither;
	return {
		missing: "infrastructure",
		says:
			` Only the code has evidence: the code of ${start} reads ${namesIn(sides.unset)}, and nothing ` +
			"the check reads sets them for that code.",
		evidence: [...sides.unset],
	};
}

/**
 * The finding about a relationship with no anchor that no accepted evidence
 * joins: with the pieces of other kinds between its ends, and, across a
 * network hop, the side that has evidence.
 * @param reading The board.
 * @param edge The relationship.
 * @param others One piece of each pair and kind between its ends.
 * @returns The finding.
 */
function unsupportedFinding(
	reading: RelationshipReading,
	edge: SemanticEdge,
	others: readonly Piece[],
): CodeFinding {
	const subject = edgeSubjects(reading.read.variant.content)(edge);
	const kinds = [...new Set(others.map((piece) => piece.kind))].join(" and ");
	const found = others.length === 0 ? "" : ` The code joins them only by ${kinds} evidence.`;
	const side = oneSided(reading, edge);
	const evidence = [...withPartners(reading, others), ...side.evidence];
	const finding: CodeFinding = {
		...siteOf(reading.read, `edges.${edge.id}`, subject),
		severity: "information",
		code: "RELATIONSHIP_UNSUPPORTED",
		message:
			`The ${describeSubject(subject)} has no anchor, and no evidence its kind ` +
			`${JSON.stringify(edge.kind)} accepts joins the code of its ends.${found}${side.says} ` +
			"A call across a network, through an event bus or through a value a part receives shows " +
			"none in code: anchor it to the code that proves it, or change it to what the code does.",
	};
	if (evidence.length > 0) finding.evidence = evidence;
	if (side.missing !== undefined) finding.missing = side.missing;
	return finding;
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
	const judged = reason ?? judgeEdge(reading, edge);
	if (judged === undefined) return;
	if ("code" in judged) {
		outcome.findings.push(judged);
		return;
	}
	const subject = edgeSubjects(reading.read.variant.content)(edge);
	const { board, variant } = siteOf(reading.read, "", subject);
	outcome.skipped.push({ board, variant, subject, ...judged });
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

export { type RelationshipReading, judgeRelationships, siteOf };

// What one variant claims about code, as the code check judges it (ADR 0046).
//
// Two kinds of claim come from selected architecture. Every binding claims
// that its path is in the checkout. A binding with a symbol also claims that
// the bound file or directory defines that symbol. An anchor on a relationship or a flow step
// claims that its file holds its symbol, and that where the symbol is defined
// in the checkout, the bound code of an end or of a part inside one holds it.

import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
import { edgeSubjects, nodeSubject } from "@archboard/board/vault-policy";
import type { CodeAnchor, CodeBinding } from "@archboard/code-binding/bindings";
import { messagesOf } from "@archboard/board/flow";
import type { SemanticNode } from "@archboard/board/content";
import type { EvidenceKindSchema } from "@archboard/board/policy";
import type { z } from "zod";
import type { VaultDiagnosticSchema } from "@archboard/board/policy";
import type { describeSubject } from "@archboard/board/policy";

type DiagnosticSubject = Parameters<typeof describeSubject>[0];
type VaultDiagnostic = z.infer<typeof VaultDiagnosticSchema>;
type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/** Where a claim sits: the board, its variant, the place in the document and its subject. */
type ClaimSite = Pick<VaultDiagnostic, "file" | "board" | "variant" | "path"> & {
	readonly subject: DiagnosticSubject;
};

/** A part's binding: its path and optional symbol. */
interface BindingClaim {
	readonly kind: "binding";
	readonly site: ClaimSite;
	readonly binding: CodeBinding;
}

/** An anchor of a relationship or a flow step, and the parts at its ends. */
interface AnchorClaim {
	readonly kind: "anchor";
	readonly site: ClaimSite;
	readonly anchor: CodeAnchor;
	readonly ends: readonly SemanticNode[];
	/** The parts at its ends and every part inside one: whose bound code counts as an end's. */
	readonly holders: readonly SemanticNode[];
	/**
	 * A relationship's kind, and the evidence kinds the vault lets it accept,
	 * absent when the kind accepts every one. A flow step has none.
	 */
	readonly relationship?: { readonly kind: string; readonly accepts?: readonly EvidenceKind[] };
}

type Claim = BindingClaim | AnchorClaim;

/** One variant as its claims read it: where a claim sits, and its parts by id. */
interface ReadVariant {
	readonly read: BoardToCheck;
	readonly byId: ReadonlyMap<string, SemanticNode>;
	/** The parts directly inside each part, by its id. */
	readonly inside: ReadonlyMap<string, readonly SemanticNode[]>;
	/** A relationship as every diagnostic names it, `From -> To`. */
	readonly edgeSubject: ReturnType<typeof edgeSubjects>;
}

/**
 * Where a claim sits in its board.
 * @param variant The variant read.
 * @param path The place inside the variant's content.
 * @param subject What the claim is about.
 * @returns The site.
 */
function siteOf(variant: ReadVariant, path: string, subject: DiagnosticSubject): ClaimSite {
	const { board, file, variant: read } = variant.read;
	return {
		file,
		board: board.name,
		variant: read.id,
		path: `variants.${read.id}.content.${path}`,
		subject,
	};
}

/**
 * The parts at the ends of a relationship or a step.
 * @param variant The variant read.
 * @param from The id of its start.
 * @param to The id of its end.
 * @returns The parts the variant holds.
 */
function endsOf(variant: ReadVariant, from: string, to: string): SemanticNode[] {
	return [variant.byId.get(from), variant.byId.get(to)].filter((node) => node !== undefined);
}

/**
 * The parts at the ends of a relationship or a step, and every part inside one.
 * @param variant The variant read.
 * @param ends The parts at its ends.
 * @returns The parts, each once.
 */
function holdersOf(variant: ReadVariant, ends: readonly SemanticNode[]): SemanticNode[] {
	const holders = new Map<string, SemanticNode>();
	/**
	 * Take a part and every part inside it.
	 * @param node The part.
	 */
	const visit = (node: SemanticNode): void => {
		if (holders.has(node.id)) return;
		holders.set(node.id, node);
		for (const child of variant.inside.get(node.id) ?? []) visit(child);
	};
	for (const end of ends) visit(end);
	return [...holders.values()];
}

/**
 * An anchor's claim.
 * @param variant The variant read.
 * @param site Where the anchor sits.
 * @param anchor The anchor.
 * @param ends The ids of its ends.
 * @param ends.from The id of its start.
 * @param ends.to The id of its end.
 * @returns The claim.
 */
function anchorClaim(
	variant: ReadVariant,
	site: ClaimSite,
	anchor: CodeAnchor,
	ends: { readonly from: string; readonly to: string },
): AnchorClaim {
	const parts = endsOf(variant, ends.from, ends.to);
	return { kind: "anchor", site, anchor, ends: parts, holders: holdersOf(variant, parts) };
}

/**
 * The path and optional symbol claims of every bound part.
 * @param variant The variant read.
 * @returns The claims.
 */
function bindingClaims(variant: ReadVariant): BindingClaim[] {
	return variant.read.variant.content.nodes.flatMap((node) => {
		const binding = node.binding;
		if (binding === undefined) return [];
		const site = siteOf(variant, `nodes.${node.id}.binding`, nodeSubject(node));
		return [{ kind: "binding" as const, site, binding }];
	});
}

/**
 * The claims of the anchored relationships.
 * @param variant The variant read.
 * @returns The claims.
 */
function edgeClaims(variant: ReadVariant): AnchorClaim[] {
	return variant.read.variant.content.edges.flatMap((edge) => {
		if (edge.anchor === undefined) return [];
		const site = siteOf(variant, `edges.${edge.id}.anchor`, variant.edgeSubject(edge));
		const kinds = variant.read.relationshipKinds;
		const accepts = Object.hasOwn(kinds, edge.kind) ? kinds[edge.kind]?.evidence : undefined;
		const relationship = { kind: edge.kind, ...(accepts === undefined ? {} : { accepts }) };
		return [{ ...anchorClaim(variant, site, edge.anchor, edge), relationship }];
	});
}

/**
 * The claims of the anchored flow steps. A step is named by its flow, its ends
 * as a relationship names them, and its label, since it has no name of its own.
 * @param variant The variant read.
 * @returns The claims.
 */
function stepClaims(variant: ReadVariant): AnchorClaim[] {
	return variant.read.variant.content.flows.flatMap((flow) =>
		messagesOf(flow.steps).flatMap((step) => {
			if (step.anchor === undefined) return [];
			const name = `${flow.name}: ${variant.edgeSubject(step).name}: ${step.label}`;
			const subject = { kind: "step" as const, id: step.id, name };
			const site = siteOf(variant, `flows.${flow.id}.steps.${step.id}.anchor`, subject);
			return [anchorClaim(variant, site, step.anchor, step)];
		}),
	);
}

/**
 * Every claim one board makes about code at the variant the check reads.
 * @param read The board, its variant, and whether the variant is the named draft.
 * @returns The claims, in the variant's order: parts, relationships, then steps.
 */
function claimsOf(read: BoardToCheck): Claim[] {
	const { content } = read.variant;
	const inside = new Map<string, SemanticNode[]>();
	for (const node of content.nodes) {
		if (node.parent !== undefined)
			inside.set(node.parent, [...(inside.get(node.parent) ?? []), node]);
	}
	const variant = {
		read,
		byId: new Map(content.nodes.map((node) => [node.id, node])),
		inside,
		edgeSubject: edgeSubjects(content),
	};
	return [...bindingClaims(variant), ...edgeClaims(variant), ...stepClaims(variant)];
}

export { type AnchorClaim, type BindingClaim, type Claim, type ClaimSite, claimsOf };

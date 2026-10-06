// What one variant claims about code, as the code check judges it (ADR 0046).
//
// Two kinds of claim come from a board. A binding with a symbol claims that the
// bound file or directory defines that symbol, and on a named draft every
// binding claims that its path is in the checkout, because to name a draft is
// to say its code is built now. An anchor on a relationship or a flow step
// claims that its file holds its symbol. A binding with no symbol on the
// current variant claims only its path, which the plain check tests.

import type { BoardToCheck } from "@/runtime/code-check/lib/boards";
import { edgeSubjects, nodeSubject } from "@/runtime/semantic-board-store/index";
import type { CodeAnchor, CodeBinding } from "@/shared/code-target/index";
import type { SemanticNode } from "@/shared/semantic-board/index";
import type { DiagnosticSubject, VaultDiagnostic } from "@/shared/semantic-policy/index";

/** Where a claim sits: the board, its variant, the place in the document and its subject. */
type ClaimSite = Pick<VaultDiagnostic, "file" | "board" | "variant" | "path"> & {
	readonly subject: DiagnosticSubject;
};

/** A part's binding: its symbol, and on a named draft its path too. */
interface BindingClaim {
	readonly kind: "binding";
	readonly site: ClaimSite;
	readonly binding: CodeBinding;
	/** True on a named draft, where the path must be in the checkout too. */
	readonly path: boolean;
}

/** An anchor of a relationship or a flow step, and the parts at its ends. */
interface AnchorClaim {
	readonly kind: "anchor";
	readonly site: ClaimSite;
	readonly anchor: CodeAnchor;
	readonly ends: readonly SemanticNode[];
}

type Claim = BindingClaim | AnchorClaim;

/** One variant as its claims read it: where a claim sits, and its parts by id. */
interface ReadVariant {
	readonly read: BoardToCheck;
	readonly byId: ReadonlyMap<string, SemanticNode>;
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
 * The claims of the parts: a binding with a symbol, and on a named draft every binding.
 * @param variant The variant read.
 * @returns The claims.
 */
function bindingClaims(variant: ReadVariant): BindingClaim[] {
	const { named } = variant.read;
	return variant.read.variant.content.nodes.flatMap((node) => {
		const binding = node.binding;
		if (binding === undefined || (binding.symbol === undefined && !named)) return [];
		const site = siteOf(variant, `nodes.${node.id}.binding`, nodeSubject(node));
		return [{ kind: "binding" as const, site, binding, path: named }];
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
		return [
			{
				kind: "anchor" as const,
				site,
				anchor: edge.anchor,
				ends: endsOf(variant, edge.from, edge.to),
			},
		];
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
		flow.steps.flatMap((step) => {
			if (step.anchor === undefined) return [];
			const name = `${flow.name}: ${variant.edgeSubject(step).name}: ${step.label}`;
			const subject = { kind: "step" as const, id: step.id, name };
			const site = siteOf(variant, `flows.${flow.id}.steps.${step.id}.anchor`, subject);
			return [
				{
					kind: "anchor" as const,
					site,
					anchor: step.anchor,
					ends: endsOf(variant, step.from, step.to),
				},
			];
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
	const variant = {
		read,
		byId: new Map(content.nodes.map((node) => [node.id, node])),
		edgeSubject: edgeSubjects(content),
	};
	return [...bindingClaims(variant), ...edgeClaims(variant), ...stepClaims(variant)];
}

export { type AnchorClaim, type BindingClaim, type Claim, type ClaimSite, claimsOf };

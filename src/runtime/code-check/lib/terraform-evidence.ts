// The evidence between the parts of one board that infrastructure joins
// (ADR 0046, TASK-367.17): the references of a Terraform or OpenTofu root
// module, read as one address space.
//
// A declaration that a reference of another reaches, directly or through the
// variables, module arguments, outputs and local values that pass a value on,
// is evidence from the part that owns the referring declaration to the part
// that owns the one it reaches. It is resolved, because a reference names the
// address it reaches. Its kind is what the rules of the referring
// declaration's provider make of the argument the reference sits in
// (TASK-367.18): most of it is provisioning, some of it a call, a configured
// path or a permission, and a provider with no rules gives a configured path.
//
// A joining declaration, such as an event source mapping, gives no evidence
// from itself to the ends it names. It gives evidence from the owners of what
// its from-arguments reach to the owners of what its to-arguments reach, of
// the join's kind, and the piece cites the joining declaration, which an
// anchor names to prove the relationship (ADR 0046). An end its arguments
// reach nothing for is the joining declaration itself.
//
// A declaration belongs to the part bound in the same root module to the
// longest address that is it or holds it: `module.queue` holds every
// declaration of that module instance, and `module.queue.aws_sqs_queue.this`
// only itself. A declaration no such part holds belongs, as all code does, to
// the part with the narrowest binding that holds its block: a part bound to
// the same block from another root module, to its file, or to a directory
// above it (evidence.ts). One that only a plan names is held by the module
// call of the module the check does not read. The piece is the reference of
// the referring declaration that starts the way: its file and line, or the
// plan that names it.

import { piecesBetween, type Piece } from "@/runtime/code-check/lib/evidence";
import { ownersOf, ownersOfSite } from "@/runtime/code-check/lib/ownership";
import type { PartCode, ReadPart } from "@/runtime/code-check/lib/part-code";
import {
	declarationAddress,
	terraformConfiguration,
	type FactsPass,
	type TerraformConfiguration,
} from "@/runtime/code-facts/index";

/** One declaration of a root module's address space. */
type Declaration = TerraformConfiguration["endpoints"][number];

/** What a declaration reaches, each with the reference that starts the way there. */
type Reached = ReturnType<TerraformConfiguration["reached"]>;

/** A part bound to an address of a root module, and the address without its instance key. */
interface AddressedPart {
	readonly part: ReadPart;
	readonly address: string;
}

/**
 * The address a part's binding names, without an instance key.
 * @param part The part.
 * @returns The address, or undefined for a part bound with no symbol.
 */
function addressOf(part: ReadPart): string | undefined {
	const symbol = part.node.binding?.symbol;
	return symbol === undefined ? undefined : declarationAddress(symbol);
}

/**
 * Whether one address is another or holds it, name by name.
 * @param holder The holding address, such as `module.queue`.
 * @param address The address.
 * @returns True when it is.
 */
function holds(holder: string, address: string): boolean {
	return address === holder || address.startsWith(`${holder}.`);
}

/**
 * Who owns each declaration of one root module.
 * @param configuration The root module's address space.
 * @param parts The read parts of the board in the root's checkout.
 * @returns The owners of an address.
 */
function ownershipIn(
	configuration: TerraformConfiguration,
	parts: readonly ReadPart[],
): (address: string) => ReadPart[] {
	const addressed: AddressedPart[] = parts.flatMap((part) => {
		const address = part.root === configuration.root ? addressOf(part) : undefined;
		return address === undefined ? [] : [{ part, address }];
	});
	const others = ownersOf(parts.filter((part) => !addressed.some((each) => each.part === part)));
	return (address) => {
		const holding = addressed.filter((each) => holds(each.address, address));
		const longest = Math.max(...holding.map((each) => each.address.length));
		if (holding.length > 0) {
			return holding.filter((each) => each.address.length === longest).map((each) => each.part);
		}
		const site = configuration.siteOf(address);
		return site === undefined ? [] : ownersOfSite(others, { ...site, via: [] });
	};
}

/** What the pieces of one root module are made from. */
interface RootReading {
	readonly ownersAt: (address: string) => ReadPart[];
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
	readonly repo: string;
}

/**
 * What one end of a joining declaration reaches: what the arguments that
 * name it reach, else the declaration itself.
 * @param declaration The joining declaration.
 * @param ends What its arguments that name an end reach.
 * @param end Which end.
 * @returns The addresses at that end.
 */
function endOf(declaration: Declaration, ends: Reached, end: "from" | "to"): string[] {
	const named = ends.filter(({ link }) => link.joins === end).map(({ to }) => to.address);
	return named.length === 0 ? [declaration.address] : named;
}

/**
 * The evidence a joining declaration gives: from the owners of what its
 * from-arguments reach to the owners of what its to-arguments reach, an end
 * they reach nothing for being the declaration itself.
 * @param declaration The declaration.
 * @param reached What it reaches.
 * @param reading The root module's owners, the board's lineages and the repository.
 * @returns The pieces; none for a declaration that joins nothing.
 */
function joinedBy(declaration: Declaration, reached: Reached, reading: RootReading): Piece[] {
	const ends = reached.filter(({ link }) => link.joins !== undefined);
	const [first] = ends;
	if (first === undefined) return [];
	const cited =
		declaration.path === undefined || declaration.definition === undefined
			? { path: first.link.path, line: first.link.line, symbol: declaration.address }
			: {
					path: declaration.path,
					line: declaration.definition.start,
					symbol: declaration.definition.symbol,
				};
	return endOf(declaration, ends, "from").flatMap((start) =>
		endOf(declaration, ends, "to").flatMap((end) =>
			piecesBetween(
				reading.ownersAt(start),
				{ to: reading.ownersAt(end), resolution: "resolved" },
				reading.lineages,
				{ repo: reading.repo, kind: first.link.kind, ...cited },
			),
		),
	);
}

/**
 * The evidence one root module gives between the parts of a board.
 * @param configuration The root module's address space.
 * @param parts The read parts of the board in its checkout.
 * @param lineages Each part and the parts that hold it.
 * @returns The pieces.
 */
function piecesIn(
	configuration: TerraformConfiguration,
	parts: readonly [ReadPart, ...ReadPart[]],
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): Piece[] {
	const reading: RootReading = {
		ownersAt: ownershipIn(configuration, parts),
		lineages,
		repo: parts[0].checkout.repo,
	};
	return configuration.endpoints.flatMap((declaration) => {
		const reached = configuration.reached(declaration.address);
		const from = reading.ownersAt(declaration.address);
		const direct = reached
			.filter(({ link }) => link.joins === undefined)
			.flatMap(({ to, link }) =>
				piecesBetween(
					from,
					{ to: reading.ownersAt(to.address), resolution: "resolved" },
					lineages,
					{
						repo: reading.repo,
						path: link.path,
						kind: link.kind,
						line: link.line,
						symbol: link.symbol,
					},
				),
			);
		return [...direct, ...joinedBy(declaration, reached, reading)];
	});
}

/**
 * Keep the first piece of each kind between two parts.
 * @param pieces The pieces, in the order they were read.
 * @returns One piece for each pair of parts and evidence kind.
 */
function firstPerPair(pieces: readonly Piece[]): Piece[] {
	const seen = new Map<string, Piece>();
	for (const piece of pieces) {
		const key = `${piece.from}\0${piece.to}\0${piece.kind}`;
		if (!seen.has(key)) seen.set(key, piece);
	}
	return [...seen.values()];
}

/**
 * The evidence the Terraform and OpenTofu root modules that the parts of one
 * board bind give between those parts.
 * @param codes Each part's bound code, by its id.
 * @param facts The pass, with the plans an agent named.
 * @param lineages Each part and the parts that hold it.
 * @returns The pieces.
 */
async function terraformEvidenceOf(
	codes: ReadonlyMap<string, PartCode>,
	facts: FactsPass,
	lineages: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<Piece[]> {
	const byRepo = new Map<string, [ReadPart, ...ReadPart[]]>();
	for (const code of codes.values()) {
		if (code.status !== "read") continue;
		const parts = byRepo.get(code.checkout.repo);
		if (parts === undefined) byRepo.set(code.checkout.repo, [code]);
		else parts.push(code);
	}
	const pieces: Piece[] = [];
	for (const parts of byRepo.values()) {
		const roots = [...new Set(parts.flatMap((part) => part.root ?? []))].toSorted();
		for (const root of roots) {
			// oxlint-disable-next-line no-await-in-loop -- one root module at a time, in order, so the pieces keep that order
			const configuration = await terraformConfiguration(facts, parts[0].checkout, root);
			pieces.push(...piecesIn(configuration, parts, lineages));
		}
	}
	return firstPerPair(pieces);
}

export { ownershipIn, terraformEvidenceOf };

// The evidence between the parts of one board that infrastructure joins
// (ADR 0046, TASK-367.17): the references of a Terraform or OpenTofu root
// module, read as one address space.
//
// A declaration that a reference of another reaches, directly or through the
// variables, module arguments, outputs and local values that pass a value on,
// is configured-path evidence from the part that owns the referring
// declaration to the part that owns the one it reaches. It is resolved,
// because a reference names the address it reaches. TASK-367.18 makes most of
// it provisioning, and some of it calls or permissions, by the rules of each
// provider.
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

import {
	ownersOf,
	ownersOfSite,
	piecesBetween,
	type Piece,
} from "@/runtime/code-check/lib/evidence";
import type { PartCode, ReadPart } from "@/runtime/code-check/lib/part-code";
import {
	declarationAddress,
	terraformConfiguration,
	type FactsPass,
	type TerraformConfiguration,
} from "@/runtime/code-facts/index";

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
	const ownersAt = ownershipIn(configuration, parts);
	const { repo } = parts[0].checkout;
	return configuration.endpoints.flatMap((declaration) => {
		const from = ownersAt(declaration.address);
		if (from.length === 0) return [];
		return configuration.reached(declaration.address).flatMap(({ to, link }) =>
			piecesBetween(from, { to: ownersAt(to.address), resolution: "resolved" }, lineages, {
				repo,
				path: link.path,
				kind: "configured-path",
				line: link.line,
				symbol: link.symbol,
			}),
		);
	});
}

/**
 * Keep the first piece between two parts.
 * @param pieces The pieces, in the order they were read.
 * @returns One piece for each pair of parts.
 */
function firstPerPair(pieces: readonly Piece[]): Piece[] {
	const seen = new Map<string, Piece>();
	for (const piece of pieces) {
		const key = `${piece.from}\0${piece.to}`;
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

export { terraformEvidenceOf };

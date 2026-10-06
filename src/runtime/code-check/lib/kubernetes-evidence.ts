// The evidence between the parts of one board that Kubernetes manifests join
// by labels (ADR 0046, TASK-367.19).
//
// A Service's selector is configured-path evidence from the part that owns
// the Service to each part that owns a workload it picks, and a NetworkPolicy
// is permission evidence from the part that owns a workload that sends to the
// part that owns one that receives (kubernetes-links.ts in code facts). Both
// are read from the manifests beside the files the board binds.
//
// A board usually draws the workloads, not the Services that name them. So a
// reference from bound code to a Service that no part binds, as its symbol or
// its file, reaches the workloads the Service picks: `CART_ADDR: cart:7070`
// in the web Deployment joins the part bound to `Deployment/web` to the part
// bound to `Deployment/cart`. A Service that a part binds is that part's,
// and the reference reaches it (evidence.ts).

import {
	ownersAtLine,
	ownersOf,
	ownersOfSite,
	piecesBetween,
	type Owners,
	type Piece,
} from "@/runtime/code-check/lib/evidence";
import type { PartCode, ReadPart } from "@/runtime/code-check/lib/part-code";
import {
	kubernetesLinks,
	type FactsPass,
	type ManifestSite,
	type SyntaxFacts,
	type Target,
} from "@/runtime/code-facts/index";

/** One repository's parts, and what reading its evidence needs. */
interface RepoParts {
	readonly parts: readonly [ReadPart, ...ReadPart[]];
	readonly owners: Owners;
	readonly facts: FactsPass;
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * The parts that own an object of a manifest.
 * @param repo The repository's parts.
 * @param site The object.
 * @returns The narrowest parts that hold it.
 */
function ownersOfObject(repo: RepoParts, site: ManifestSite): ReadPart[] {
	return ownersOfSite(repo.owners, { ...site, via: [] });
}

/**
 * Whether a part binds a Service, as its symbol or as its file.
 * @param parts The repository's parts.
 * @param target The Service, where a reference leads.
 * @returns True when one does.
 */
function bound(parts: readonly ReadPart[], target: Target): boolean {
	return parts.some(({ grain }) =>
		grain.kind === "symbol"
			? grain.file === target.path && grain.definition.symbol === target.symbol
			: grain.kind === "file" && grain.file === target.path,
	);
}

/**
 * The pieces a reference to a Service that no part binds gives: to the parts
 * that own the workloads the Service picks.
 * @param repo The repository's parts.
 * @param facts The referring file's facts.
 * @param reference The reference.
 * @returns The pieces.
 */
function throughService(
	repo: RepoParts,
	facts: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
): Piece[] {
	const { target, kind, line, symbol } = reference;
	if (target === undefined || kind === undefined || !target.symbol.startsWith("Service/"))
		return [];
	if (bound(repo.parts, target)) return [];
	const { checkout } = repo.parts[0];
	const picked = kubernetesLinks(repo.facts, checkout, [target.path]).filter(
		(link) =>
			link.kind === "configured-path" &&
			link.from.path === target.path &&
			link.from.definition.symbol === target.symbol,
	);
	const from = ownersAtLine(repo.owners, facts.path, line);
	const evidence = { repo: checkout.repo, path: facts.path, kind, line, symbol };
	return picked.flatMap((link) =>
		piecesBetween(
			from,
			{ to: ownersOfObject(repo, link.to), resolution: "resolved" },
			repo.lineages,
			evidence,
		),
	);
}

/**
 * The evidence of one repository's manifests.
 * @param repo The repository's parts.
 * @returns The pieces.
 */
async function piecesIn(repo: RepoParts): Promise<Piece[]> {
	const { checkout } = repo.parts[0];
	const files = [...new Set(repo.parts.flatMap((part) => part.files))].toSorted();
	const joined = kubernetesLinks(repo.facts, checkout, files).flatMap((link) =>
		piecesBetween(
			ownersOfObject(repo, link.from),
			{ to: ownersOfObject(repo, link.to), resolution: "resolved" },
			repo.lineages,
			{
				repo: checkout.repo,
				path: link.path,
				kind: link.kind,
				line: link.line,
				symbol: link.symbol,
			},
		),
	);
	const read = await Promise.all(files.map((file) => repo.facts.read(checkout, file)));
	const through = read.flatMap((facts) =>
		facts?.adapter === "kubernetes"
			? facts.references.flatMap((reference) => throughService(repo, facts, reference))
			: [],
	);
	return [...joined, ...through];
}

/**
 * Keep the first piece of each kind between two parts.
 * @param pieces The pieces, in the order they were read.
 * @returns One piece for each.
 */
function firstOfEach(pieces: readonly Piece[]): Piece[] {
	const seen = new Map<string, Piece>();
	for (const piece of pieces) {
		const key = `${piece.from}\0${piece.to}\0${piece.kind}`;
		if (!seen.has(key)) seen.set(key, piece);
	}
	return [...seen.values()];
}

/**
 * The evidence that the Kubernetes manifests beside the files the parts of
 * one board bind give between those parts by labels.
 * @param codes Each part's bound code, by its id.
 * @param facts The pass.
 * @param lineages Each part and the parts that hold it.
 * @returns The pieces.
 */
async function kubernetesEvidenceOf(
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
		const repo = { parts, owners: ownersOf(parts), facts, lineages };
		// oxlint-disable-next-line no-await-in-loop -- one repository at a time, in board order
		pieces.push(...(await piecesIn(repo)));
	}
	return firstOfEach(pieces);
}

export { kubernetesEvidenceOf };

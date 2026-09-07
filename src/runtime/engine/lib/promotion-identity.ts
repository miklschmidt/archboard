// Node identity is a stable logical id, distinct from the Excalidraw element
// id. Element ids do not survive redraws, mermaid conversion, or independent
// variant authoring (ADR 0003), so this readable id is the cross-board join.

const KINDS = ["service", "queue", "datastore", "gateway", "external"] as const;
type Kind = (typeof KINDS)[number];

/** A refusal a caller can put in front of a person as it stands. */
class PromotionError extends Error {
	public override name = "PromotionError";
}

/**
 * One of the kinds a node can be.
 * @param raw What the caller said.
 * @returns The kind.
 * @throws {PromotionError} When it is not one, naming the ones that are.
 */
function normalizeKind(raw: string): Kind {
	const normalized = raw.trim().toLowerCase();
	const kind = KINDS.find((candidate) => candidate === normalized);
	if (kind !== undefined) {
		return kind;
	}
	throw new PromotionError(
		`Unknown kind "${raw}". Valid kinds are: ${KINDS.join(", ")}. ` +
			`The kind vocabulary grows deliberately — add it to CONTEXT.md and KINDS before using it.`,
	);
}

const NODE_ID_MAX = 48;

/**
 * Words as a node id: lowercase, letters and digits, hyphens between.
 *
 * Accents are stripped rather than encoded, so a name typed with them and one
 * typed without produce the same id and the same cross-board join.
 * @param text The words.
 * @returns The slug, which may be empty when nothing survives.
 */
function slugify(text: string): string {
	return (
		text
			.normalize("NFKD")
			// Strip combining accents.
			.replaceAll(/[\u0300-\u036F]/gu, "")
			.toLowerCase()
			.replaceAll(/[^a-z0-9]+/gu, "-")
			.replaceAll(/^-+|-+$/gu, "")
			.slice(0, NODE_ID_MAX)
			.replaceAll(/-+$/gu, "")
	);
}

/**
 * A node id a caller named, in the shape every node id has.
 *
 * Explicit node values use the same shape so ids remain comparable across
 * boards.
 * @param raw What the caller said.
 * @returns The id.
 * @throws {PromotionError} When nothing usable survives, rather than silently
 * renaming it.
 */
function validateNodeId(raw: string): string {
	const slug = slugify(raw);
	if (slug.length === 0) {
		throw new PromotionError(`"${raw}" does not make a usable node id (letters and digits only).`);
	}
	return slug;
}

/**
 * A node id nothing else on the board answers to.
 *
 * Uniqueness is per board, and `taken` holds the ids used by every *other*
 * node, so re-promoting the same node keeps its identity rather than sliding
 * to name-2.
 * @param base The id it would prefer.
 * @param taken The ids already spoken for.
 * @returns The id.
 * @throws {PromotionError} When ten thousand boards' worth of suffixes are
 * all taken.
 */
function uniqueNodeId(base: string, taken: Set<string>): string {
	const stem = base.length > 0 ? base : "node";
	if (!taken.has(stem)) {
		return stem;
	}
	for (let suffix = 2; suffix < 10_000; suffix++) {
		const candidate = `${stem.slice(0, NODE_ID_MAX - String(suffix).length - 1)}-${suffix}`;
		if (!taken.has(candidate)) {
			return candidate;
		}
	}
	throw new PromotionError(`Could not find a free node id based on "${stem}".`);
}

export { KINDS, normalizeKind, PromotionError, slugify, uniqueNodeId, validateNodeId };
export type { Kind };

// Node identity is a stable logical id, distinct from the Excalidraw element
// id. Element ids do not survive redraws, mermaid conversion, or independent
// variant authoring (ADR 0003), so this readable id is the cross-board join.

const KINDS = ["service", "queue", "datastore", "gateway", "external"] as const;
type Kind = (typeof KINDS)[number];

class PromotionError extends Error {
	public override name = "PromotionError";
}

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

// Explicit node values use the same shape so ids remain comparable across
// boards. An empty slug is rejected rather than silently renamed.
function validateNodeId(raw: string): string {
	const slug = slugify(raw);
	if (slug.length === 0) {
		throw new PromotionError(`"${raw}" does not make a usable node id (letters and digits only).`);
	}
	return slug;
}

// Uniqueness is per board. `taken` contains ids used by every other node, so
// re-promoting the same node keeps its identity.
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

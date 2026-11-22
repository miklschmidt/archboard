// The lens a picture is read through: a named question that chooses which of
// its relationships draw. A part whose every line it leaves out leaves too.

import { ALL_LENS_ID, type SemanticPolicy } from "#shared/schemas/semantic-policy.ts";
import type { VariantContent } from "#shared/schemas/content.ts";

type Lens = SemanticPolicy["lenses"][string];
type Selector = NonNullable<Lens["show"]>[number];
type Edge = Pick<VariantContent["edges"][number], "kind" | "effect">;

/** A lens in effect: which one it is, and which relationships it draws. */
interface ReadingLens {
	readonly id: string;
	readonly name: string;
	/**
	 * Whether the lens draws a relationship.
	 * @param edge The relationship.
	 * @returns True when its line draws.
	 */
	readonly draws: (edge: Edge) => boolean;
}

/**
 * Whether a selector names a relationship: each field it states must match. A
 * relationship that states no effect matches no selector that names one.
 * @param selector One entry of a lens's list.
 * @param edge The relationship.
 * @returns True when the selector names it.
 */
function names(selector: Selector, edge: Edge): boolean {
	return (
		(selector.kind === undefined || selector.kind === edge.kind) &&
		(selector.effect === undefined || selector.effect === edge.effect)
	);
}

/**
 * The lens a reading is read through: the one it names, or the policy's
 * default when it names none or one the policy does not have.
 * @param policy The policy in effect.
 * @param id The lens the reading names, if any.
 * @returns The lens in effect.
 */
function readingLens(policy: SemanticPolicy, id: string | undefined): ReadingLens {
	const chosen = id !== undefined && Object.hasOwn(policy.lenses, id) ? id : policy.defaultLens;
	const lens = policy.lenses[chosen] ?? { name: "All relationships", hide: [] };
	const { show, hide = [] } = lens;
	return {
		id: chosen,
		name: lens.name,
		draws:
			show === undefined
				? (edge) => !hide.some((selector) => names(selector, edge))
				: (edge) => show.some((selector) => names(selector, edge)),
	};
}

/**
 * The lens of every relationship, which Show all selects in every vault, and which a reading from
 * before lenses is read through.
 * @returns Its id.
 */
function allLens(): string {
	return ALL_LENS_ID;
}

export { allLens, readingLens, type ReadingLens };

// What a reading opens beside its scope, and the control that a door or a frame wears for a live
// reader. A module opened this way folds as a scope folds, so a frame is the end of its chain.

import type { ChangeKind } from "#shared/rules/compare/variants.ts";
import { containment, foldedScope } from "#shared/rules/module-fold.ts";
import type { VariantContent } from "#shared/schemas/content.ts";

/** The control a card or a frame wears: a door brings its module in, and a frame goes back. */
type Toggle = "expand" | "collapse";

/** One module that a reading expands: what its address asked for, and the frame that draws it. */
interface Expansion {
	readonly asked: string;
	readonly frame: string;
}

/** What the cards of a reading offer a live reader. */
interface Toggles {
	readonly expands: (door: string) => boolean;
	readonly collapses: ReadonlySet<string>;
}

/**
 * The modules a reading expands. A module that holds no parts, or that the reading already opens,
 * opens nothing, and a reading that keeps its own extent waits with what its address asks for.
 * @param complete The complete depicted content.
 * @param opened The module that the reading opens.
 * @param plain Whether the reading draws a whole scope.
 * @param expand What the address asks for.
 * @returns Each expansion, in the order they were asked for, and how many of them opened nothing.
 */
function expansions(
	complete: VariantContent,
	opened: string | null,
	plain: boolean,
	expand: readonly string[] = [],
): { readonly expanded: readonly Expansion[]; readonly unopened: number } {
	const asked = [...new Set(expand)];
	const childrenOf = containment(complete);
	const expanded = plain
		? asked.flatMap((id) => {
				const frame = foldedScope(complete, id);
				return frame !== null && frame !== opened && childrenOf.has(frame)
					? [{ asked: id, frame }]
					: [];
			})
		: [];
	return { expanded, unopened: asked.length - expanded.length };
}

/**
 * Which cards of a reading wear a control. A door brings its module in when that module holds
 * parts, a comparison did not remove it, and it does not fold to a frame that is already open.
 * @param complete The complete depicted content.
 * @param open Every open module.
 * @param frames The modules the scope expands.
 * @param standing The comparison status of each subject.
 * @returns What a door and a frame offer.
 */
function toggles(
	complete: VariantContent,
	open: ReadonlySet<string>,
	frames: readonly string[],
	standing: Readonly<Record<string, ChangeKind>>,
): Toggles {
	const childrenOf = containment(complete);
	return {
		/**
		 * Whether a door can open beside the scope.
		 * @param door The door's module.
		 * @returns True when it brings something in.
		 */
		expands: (door) =>
			standing[door] !== "removed" &&
			childrenOf.has(door) &&
			!open.has(foldedScope(complete, door) ?? door),
		collapses: new Set(frames),
	};
}

/**
 * The control a card wears for a live reader.
 * @param card The drawn module.
 * @param offered What a door and a frame offer, if a live reader draws the picture.
 * @returns The card, with its control when it has one.
 */
function withToggle<Card extends { readonly id: string; readonly door?: unknown }>(
	card: Card,
	offered: Toggles | undefined,
): Card & { readonly toggle?: Toggle } {
	if (offered === undefined) return card;
	if (offered.collapses.has(card.id)) return { ...card, toggle: "collapse" };
	return card.door !== undefined && offered.expands(card.id) ? { ...card, toggle: "expand" } : card;
}

export { expansions, toggles, withToggle, type Expansion, type Toggle, type Toggles };

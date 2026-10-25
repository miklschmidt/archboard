import type { VariantLifecycleSchema } from "@archboard/board/document";
import type { z } from "zod";

type VariantLifecycle = z.infer<typeof VariantLifecycleSchema>;
// How the chrome reads a variant's lifecycle: which variants recede because
// the board has moved past them, and the order a board's variants are listed
// in. Shared by every place that lists a board's variants, so the navigator,
// the header and a pane's sidebar say the same thing the same way. Pure.


/** What a variant must say for its place in a list. */
interface ListedLifecycle {
	readonly id: string;
	readonly lifecycle: VariantLifecycle;
}

/**
 * Whether a variant recedes: it is historical or shelved, so the board has
 * moved past it. A current or draft variant is live.
 * @param lifecycle The variant's lifecycle.
 * @returns True for historical and shelved.
 */
function variantRecedes(lifecycle: VariantLifecycle): boolean {
	return lifecycle === "historical" || lifecycle === "shelved";
}

/**
 * A board's variants in the order they are listed: the one the board's name
 * opens first, then the other live variants in the board's own order, then
 * the receding ones newest first.
 * @param variants The variants, in the board's own order.
 * @param opens The id of the variant the board's name opens, or null.
 * @returns The variants, ordered.
 */
function variantOrder<Variant extends ListedLifecycle>(
	variants: readonly Variant[],
	opens: string | null,
): Variant[] {
	const live = variants.filter((variant) => !variantRecedes(variant.lifecycle));
	const opened = live.filter((variant) => variant.id === opens);
	const others = live.filter((variant) => variant.id !== opens);
	const receding = variants.filter((variant) => variantRecedes(variant.lifecycle));
	return [...opened, ...others, ...receding.toReversed()];
}

export { variantOrder, variantRecedes, type ListedLifecycle };

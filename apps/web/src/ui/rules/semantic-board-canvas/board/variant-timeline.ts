// A board's variants as one timeline, from the board's own record and nothing
// else. The adopted line runs from the current variant back through its
// history, each at the adoption that made it current, newest first, the first
// variant (adopted over nothing) last. A draft branches off the variant it was
// derived from, and a draft off a draft branches again, so competing proposals
// read as parallel branches; a shelved variant ends its branch. A board with no
// current variant has no adopted line, and its first drafts stand on the line
// in its place. Pure.

import type { OfferedVariant } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type { SemanticBoard } from "@archboard/board/document";

type Shelving = NonNullable<SemanticBoard["shelvings"]>[number];
type Adoption = NonNullable<SemanticBoard["adoptions"]>[number];

/** One variant's row on the timeline. */
interface TimelineEntry {
	readonly variant: OfferedVariant;
	/** 0 on the adopted line, one more for each branch it sits on. */
	readonly depth: number;
	/** When it became current, when it ever did. */
	readonly adopted: Adoption | undefined;
	/** When and why it was let go, when it was. */
	readonly shelved: Shelving | undefined;
	/** The variant it was derived from, by name, when that is one of the board's. */
	readonly from: string | undefined;
}

/** What the timeline holds. */
interface VariantTimeline {
	readonly entries: readonly TimelineEntry[];
	/** Whether the board has a current variant; without one, nothing it describes is built. */
	readonly built: boolean;
}

/**
 * Whether a variant is on the adopted line: the current one or its history.
 * @param variant The variant.
 * @returns Whether it is.
 */
function adoptedLine(variant: OfferedVariant): boolean {
	return variant.lifecycle === "current" || variant.lifecycle === "historical";
}

/**
 * When a variant became current, as a sortable time; the first variant, never
 * adopted over anything, sorts as the earliest.
 * @param adoption Its adoption, when it had one.
 * @returns The time.
 */
function adoptedAt(adoption: Adoption | undefined): number {
	return adoption === undefined ? Number.NEGATIVE_INFINITY : Date.parse(adoption.at);
}

/**
 * The board's variants in timeline order, each with its depth and its record.
 * @param variants Every variant of the board.
 * @param adoptions Every adoption, oldest first.
 * @param shelvings Every shelving, oldest first.
 * @returns The timeline.
 */
function variantTimeline(
	variants: readonly OfferedVariant[],
	adoptions: readonly Adoption[],
	shelvings: readonly Shelving[],
): VariantTimeline {
	const byId = new Map(variants.map((variant) => [variant.id, variant]));
	/**
	 * The adoption that made a variant current, the latest when there were several.
	 * @param id The variant.
	 * @returns The adoption, or undefined when it never became current.
	 */
	const adoption = (id: string): Adoption | undefined =>
		adoptions.findLast((one) => one.variant === id);
	/**
	 * The shelving that let a variant go.
	 * @param id The variant.
	 * @returns The shelving, or undefined when it was never let go.
	 */
	const shelving = (id: string): Shelving | undefined =>
		shelvings.find((one) => one.variant === id);
	const built = variants.some((variant) => variant.lifecycle === "current");
	// The line: the adopted variants newest first, or on an unbuilt board the
	// drafts that came from no variant of the board.
	const line = built
		? variants
				.filter(adoptedLine)
				.toSorted((a, b) => adoptedAt(adoption(b.id)) - adoptedAt(adoption(a.id)))
		: variants.filter((variant) => variant.parent === undefined || !byId.has(variant.parent));
	const onLine = new Set(line.map((variant) => variant.id));
	const entries: TimelineEntry[] = [];
	/**
	 * Put a variant on the timeline, and its branches after it, one deeper.
	 * @param variant The variant.
	 * @param depth Its depth.
	 */
	const place = (variant: OfferedVariant, depth: number): void => {
		entries.push({
			variant,
			depth,
			adopted: adoption(variant.id),
			shelved: shelving(variant.id),
			from: variant.parent === undefined ? undefined : byId.get(variant.parent)?.name,
		});
		for (const branch of variants.filter(
			(one) => one.parent === variant.id && !onLine.has(one.id),
		)) {
			place(branch, depth + 1);
		}
	};
	for (const variant of line) place(variant, 0);
	// A variant the record joins to nothing else above still has its place, at the end.
	for (const variant of variants) {
		if (!entries.some((entry) => entry.variant.id === variant.id)) place(variant, 0);
	}
	return { entries, built };
}

export { variantTimeline, type TimelineEntry, type VariantTimeline };

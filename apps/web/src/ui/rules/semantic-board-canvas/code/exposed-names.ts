// What the Selection tab can say about the exposed names of a picked container
// (TASK-539.02), from what the server remembers of the last code pass
// (TASK-539.01). A pane never starts a pass (TASK-367.24), so most states say
// why there is no reading, and each names when the pass it speaks of ran.
//
// Only a part that holds parts and is bound can have a module behind it. Before
// a pass has read the board on screen, such a container shows why there is no
// reading. Once a pass read exactly that version, a container it neither judged
// nor skipped has a binding that names no module, and shows nothing.

import type { RememberedFindingsSchema } from "@archboard/code-intel/code-check";
import type { z } from "zod";
import type { SemanticNode, VariantContent } from "@archboard/board/content";

/** What the server remembers of the vault's passes. */
type RememberedFindings = z.infer<typeof RememberedFindingsSchema>;

/** What the last pass found on one board at one variant. */
type RememberedReading = RememberedFindings["readings"][number];

/** The counts a pass left for one judged container. */
type ContainerCounts = RememberedReading["containers"][number];

/** A reason the pass did not judge a container, as it named it. */
type ContainerSkip = Pick<RememberedReading["skipped"][number], "reason" | "detail">;

/** What the region says, and whether it is there at all. */
type ExposedNamesState =
	| { readonly kind: "none" }
	| { readonly kind: "no-pass" }
	| { readonly kind: "variant-unread"; readonly checkedAt: string }
	| { readonly kind: "board-changed"; readonly checkedAt: string }
	| { readonly kind: "skipped"; readonly checkedAt: string; readonly skip: ContainerSkip }
	| { readonly kind: "read"; readonly checkedAt: string; readonly counts: ContainerCounts };

/** The picked part, and the board, variant and version on screen. */
interface ExposedNamesPlace {
	readonly board: string;
	readonly variant: string;
	readonly version: number;
	readonly node: SemanticNode;
	/** The variant that holds the part, as far as its parts. */
	readonly content: Pick<VariantContent, "nodes">;
}

const NONE: ExposedNamesState = { kind: "none" };

/**
 * What the region says about one container, from the reading of the board and
 * variant on screen.
 * @param reading The reading.
 * @param place The container, and what is on screen.
 * @returns The state of the region.
 */
function stateOfReading(reading: RememberedReading, place: ExposedNamesPlace): ExposedNamesState {
	const { checkedAt } = reading;
	if (reading.version !== place.version) {
		return { kind: "board-changed", checkedAt };
	}
	const counts = reading.containers.find((one) => one.container === place.node.id);
	if (counts !== undefined) {
		return { kind: "read", checkedAt, counts };
	}
	// An unavailable checkout is reported once for its repository, without a
	// subject. It still explains why none of that repository's containers were read.
	const skip =
		reading.skipped.find((one) => one.subject?.id === place.node.id) ??
		reading.skipped.find(
			(one) => one.reason === "checkout-unavailable" && one.repo === place.node.binding?.repo,
		);
	return skip === undefined ? NONE : { kind: "skipped", checkedAt, skip };
}

/**
 * What the region says about one picked part.
 * @param remembered What the server remembers of the pane's vault.
 * @param place The part, and what is on screen.
 * @returns The state of the region.
 */
function exposedNamesState(
	remembered: RememberedFindings,
	place: ExposedNamesPlace,
): ExposedNamesState {
	const { node } = place;
	const holdsParts = place.content.nodes.some((one) => one.parent === node.id);
	if (!holdsParts || node.binding === undefined) {
		return NONE;
	}
	const { readings, lastCheckedAt } = remembered;
	if (lastCheckedAt === undefined) {
		return { kind: "no-pass" };
	}
	const reading = readings.find(
		(one) => one.board === place.board && one.variant === place.variant,
	);
	return reading === undefined
		? { kind: "variant-unread", checkedAt: lastCheckedAt }
		: stateOfReading(reading, place);
}

export {
	type ContainerCounts,
	type ContainerSkip,
	type ExposedNamesPlace,
	type ExposedNamesState,
	exposedNamesState,
};

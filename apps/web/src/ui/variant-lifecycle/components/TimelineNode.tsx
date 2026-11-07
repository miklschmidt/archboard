// The node of a state on a timeline's rail, as the site's history draws it: the current state in
// the gold, with a soft halo; a proposal as the ring of the comparison's changed orange; a state
// that was current as a ring of muted ink; a shelved one, let go, as a fainter ring. Its words say
// the lifecycle, so the node carries no name of its own.

import type { JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import type { VariantLifecycleSchema } from "@archboard/model/legacy-board";
import type { z } from "zod";

type VariantLifecycle = z.infer<typeof VariantLifecycleSchema>;

const FAINT_RING =
	"shadow-[inset_0_0_0_2px_color-mix(in_oklch,var(--muted-foreground)_55%,transparent)]";

/** The look of each node. A hollow node takes the floor it lies on. */
const NODE_TONE: Readonly<Record<VariantLifecycle, string>> = {
	current:
		"bg-primary-mark shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary-mark)_18%,transparent)]",
	draft: "shadow-[inset_0_0_0_2px_var(--standing-changed)]",
	historical: "shadow-[inset_0_0_0_2px_var(--muted-foreground)]",
	shelved: FAINT_RING,
};

/**
 * One node on a rail.
 * @param props The lifecycle of its state, or nothing for a state the record cannot name, the
 *   floor a hollow node takes and where it sits.
 * @param props.lifecycle The lifecycle.
 * @param props.floor The background of a hollow node: the floor it lies on.
 * @param props.className Where it sits.
 * @returns The node.
 */
function TimelineNode(props: {
	readonly lifecycle: VariantLifecycle | undefined;
	readonly floor: string;
	readonly className?: string;
}): JSX.Element {
	const { lifecycle, floor } = props;
	const tone = lifecycle === undefined ? FAINT_RING : NODE_TONE[lifecycle];
	const hollow = lifecycle !== "current";
	return (
		<span
			aria-hidden="true"
			data-slot="timeline-node"
			data-lifecycle={props.lifecycle}
			className={cn(
				"relative size-3 shrink-0 rounded-full",
				hollow && floor,
				tone,
				props.className,
			)}
		/>
	);
}

export { TimelineNode, type VariantLifecycle };

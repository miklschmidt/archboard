// The mark that says a variant's lifecycle wherever the chrome names a
// variant: a check for the current variant, the architecture that is built; a
// branch for a draft, a proposal branched from another variant; a clock for a
// historical variant, once current; an archive box for a shelved one, let go.
// The current variant's mark is in the foreground colour, every other one is
// muted. Hovering it names the lifecycle.

import {
	RiArchiveLine,
	RiCheckboxCircleLine,
	RiGitBranchLine,
	RiTimeLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import type { JSX } from "react";

import type { VariantLifecycle } from "@archboard/board/document";
import { cn } from "@archboard/ui-kit/components";

/** The mark of each lifecycle. */
const LIFECYCLE_ICONS: Readonly<Record<VariantLifecycle, RemixiconComponentType>> = {
	current: RiCheckboxCircleLine,
	draft: RiGitBranchLine,
	historical: RiTimeLine,
	shelved: RiArchiveLine,
};

/** Inputs for the mark. */
interface VariantMarkProps {
	readonly lifecycle: VariantLifecycle;
	/** Where the mark sits; its size and colour are its own. */
	readonly className?: string;
}

/**
 * Say a variant's lifecycle at a glance.
 * @param props The lifecycle and where the mark sits.
 * @returns The mark.
 */
function VariantMark(props: VariantMarkProps): JSX.Element {
	const Icon = LIFECYCLE_ICONS[props.lifecycle];
	return (
		<span title={props.lifecycle} className={cn("inline-flex shrink-0", props.className)}>
			<Icon
				aria-hidden="true"
				className={cn(
					"size-3.5",
					props.lifecycle === "current" ? "text-foreground" : "text-muted-foreground",
				)}
			/>
		</span>
	);
}

export { VariantMark, type VariantMarkProps };

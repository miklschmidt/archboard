// The tip over the part of the picture the pointer rests on.

import type { JSX } from "react";

import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import { Tooltip, TooltipContent } from "@/ui/components/tooltip";
import {
	subjectTip,
	type SubjectTip,
	type TipTarget,
} from "@/ui/semantic-board-canvas/lib/subject-tips";

/**
 * What the picture has to add about the part under the pointer, placed against it.
 * @param props The part, the reading it is described from and how far away the picture is seen.
 * @param props.target The part whose tip is open, or null.
 * @param props.reading What the board says about the variant the picture draws, or null.
 * @param props.far Whether the picture is seen from far away, showing names alone.
 * @returns The tip, or nothing when there is nothing to add.
 */
function SemanticSubjectTip(props: {
	readonly target: TipTarget | null;
	readonly reading: VariantReading | null;
	readonly far: boolean;
}): JSX.Element | null {
	const { target } = props;
	const tip = target === null ? null : tipOver(target, props.reading, props.far);
	if (target === null || tip === null) {
		return null;
	}
	return (
		<Tooltip open>
			<TooltipContent
				anchor={target.anchor}
				sideOffset={8}
				data-slot="semantic-subject-tip"
				className="max-w-sm flex-col items-start gap-1 py-2"
			>
				<TipLines tip={tip} />
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * What the tip over one part of the picture says, once the board has been read.
 * @param target The part under the pointer.
 * @param reading What the board says about the variant the picture draws, or null.
 * @param far Whether the picture is seen from far away.
 * @returns The tip, or null when there is nothing to add.
 */
function tipOver(
	target: TipTarget,
	reading: VariantReading | null,
	far: boolean,
): SubjectTip | null {
	const variant = reading?.variant ?? null;
	return variant === null ? null : subjectTip(variant, target, far);
}

/**
 * A tip's lines, in reading order: what leads, what kind of line a label
 * names, the longer account, and what a double-click does.
 * @param props The tip.
 * @param props.tip Its lines.
 * @returns The lines that have something to say.
 */
function TipLines(props: { readonly tip: SubjectTip }): JSX.Element {
	const { lead, kind, body, hint } = props.tip;
	return (
		<>
			{lead !== undefined && <p className="font-medium">{lead}</p>}
			{kind !== undefined && <p className="text-technical text-background/60">{kind}</p>}
			{body !== undefined && <p className="text-background/80 line-clamp-8">{body}</p>}
			{hint !== undefined && <p className="text-technical text-background/60 pt-0.5">{hint}</p>}
		</>
	);
}

export { SemanticSubjectTip };

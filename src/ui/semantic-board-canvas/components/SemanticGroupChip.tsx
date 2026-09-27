// A group's colour, drawn the way the picture draws the group: a small
// rounded outline in the group's colour, like the region it gathers its
// members into, filled while the group is selected. An id the vault no longer
// defines has no colour, and its outline is dashed and neutral.

import { useMemo, type CSSProperties, type JSX } from "react";

import { cn } from "@/ui/components/class-names";
import { paletteInk } from "@/ui/semantic-board-canvas/lib/palette";

/** Inputs for a group's chip. */
interface SemanticGroupChipProps {
	/** The group's colour's name, or undefined when the vault does not define the group. */
	readonly color: string | undefined;
	/** Whether the group is selected. */
	readonly selected: boolean;
}

/**
 * A group's colour chip.
 * @param props The colour, and whether the group is selected.
 * @returns The chip.
 */
function SemanticGroupChip(props: SemanticGroupChipProps): JSX.Element {
	const { color, selected } = props;
	const style = useMemo<CSSProperties | undefined>(() => {
		if (color === undefined) return undefined;
		const ink = paletteInk(color);
		return {
			borderColor: ink,
			backgroundColor: selected ? ink : `color-mix(in srgb, ${ink} 14%, transparent)`,
		};
	}, [color, selected]);
	return (
		<span
			aria-hidden
			data-slot="semantic-group-chip"
			data-selected={selected}
			className={cn(
				"size-3 shrink-0 rounded-[3px] border-2",
				color === undefined && "border-muted-foreground border-dashed",
			)}
			style={style}
		/>
	);
}

export { SemanticGroupChip };

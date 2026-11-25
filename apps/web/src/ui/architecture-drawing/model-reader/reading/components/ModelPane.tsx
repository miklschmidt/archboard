import {
	cameraHandover,
	ModelPaneContext,
} from "#ui/architecture-drawing/model-reader/state/presentation.ts";
import { useMemo, useState, type JSX, type ReactNode } from "react";
import { useSubjectSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";

interface SeedProps {
	readonly subject: string | null;
	readonly selected?: readonly string[] | undefined;
	readonly arrival?: number | undefined;
}

/**
 * Determine the initial subject list when a pane first mounts.
 * @param props The starting subject and optional explicit arrival selection.
 * @returns The starting selected ids.
 */
function initialSelection(props: SeedProps): string[] {
	if (props.selected !== undefined) return [...props.selected];
	return props.subject === null ? [] : [props.subject];
}

/**
 * Compute the next seeded selection when destination props change, or null when nothing should reseed.
 * A subject-only change always seeds from the new destination rather than a stale arrival selection.
 * @param previous The previously seen seed props.
 * @param next The current seed props.
 * @returns The next selection to seed, or null to keep the reader's current selection.
 */
function nextSeededSelection(previous: SeedProps, next: SeedProps): string[] | null {
	if (previous.arrival !== next.arrival || previous.selected !== next.selected) {
		return initialSelection(next);
	}
	if (previous.subject !== next.subject && next.subject !== null) {
		return [next.subject];
	}
	return null;
}

/**
 * One pane owns ordinary selection across asynchronous reads.
 * @param props The explicit starting subject and composed reader.
 * @param props.subject The destination selected by navigation, or no selection.
 * @param props.selected Explicit multi-subject selection from an agent arrival.
 * @param props.arrival Which time the pane has been pointed at a reading from outside.
 * @param props.children The header and model reader.
 * @returns Shared presentation state without a copy of model content.
 */
function ModelPane(props: {
	subject: string | null;
	selected?: readonly string[] | undefined;
	arrival?: number | undefined;
	children: ReactNode;
}): JSX.Element {
	const { subject, selected, arrival } = props;
	const initial = useMemo(() => initialSelection({ subject, selected }), [subject, selected]);
	const selection = useSubjectSelection(initial);
	const [seeded, setSeeded] = useState<SeedProps>({ subject, selected, arrival });
	// A new destination seeds the pane's selection. Leaving one keeps whatever the reader holds.
	const nextSeed = nextSeededSelection(seeded, { subject, selected, arrival });
	if (seeded.subject !== subject || seeded.selected !== selected || seeded.arrival !== arrival) {
		setSeeded({ subject, selected, arrival });
		if (nextSeed !== null) selection.seed(nextSeed);
	}
	const [handover] = useState(cameraHandover);
	const [head, attachHead] = useState<HTMLElement | null>(null);
	const [side, attachSide] = useState<HTMLElement | null>(null);
	const value = useMemo(
		() => ({ selection, handover, head, attachHead, side, attachSide }),
		[selection, handover, head, side],
	);
	return <ModelPaneContext value={value}>{props.children}</ModelPaneContext>;
}

export { ModelPane };

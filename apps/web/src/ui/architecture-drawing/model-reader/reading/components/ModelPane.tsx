import {
	cameraHandover,
	ModelPaneContext,
	type ClaimFrame,
	type ClaimFrames,
} from "#ui/architecture-drawing/model-reader/state/presentation.ts";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { useSubjectSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";

/** No surface holds a place for the claims. */
const NO_CLAIM_FRAMES: ClaimFrames = { walkthrough: null, about: null, picture: null, pane: null };

/**
 * One pane owns ordinary selection across asynchronous reads.
 * @param props The explicit starting subject and composed reader.
 * @param props.subject The destination selected by navigation, or no selection.
 * @param props.arrival Which time the pane has been pointed at a reading from outside.
 * @param props.children The header and model reader.
 * @returns Shared presentation state without a copy of model content.
 */
function ModelPane(props: {
	subject: string | null;
	arrival?: number | undefined;
	children: ReactNode;
}): JSX.Element {
	const initial = useMemo(() => (props.subject === null ? [] : [props.subject]), [props.subject]);
	const selection = useSubjectSelection(initial);
	const { subject, arrival } = props;
	const [seeded, setSeeded] = useState({ subject, arrival });
	// A new destination seeds the pane's selection. Leaving one keeps whatever the reader holds.
	if (seeded.subject !== subject || seeded.arrival !== arrival) {
		setSeeded({ subject, arrival });
		if (subject !== null || seeded.arrival !== arrival) selection.seed(initial);
	}
	const [handover] = useState(cameraHandover);
	const [head, attachHead] = useState<HTMLElement | null>(null);
	const [claimFrames, setClaimFrames] = useState(NO_CLAIM_FRAMES);
	const holdClaimFrame = useCallback((frame: ClaimFrame, element: HTMLElement) => {
		setClaimFrames((now) => ({ ...now, [frame]: element }));
		return (): void =>
			setClaimFrames((now) => (now[frame] === element ? { ...now, [frame]: null } : now));
	}, []);
	const value = useMemo(
		() => ({ selection, handover, head, attachHead, claimFrames, holdClaimFrame }),
		[selection, handover, head, claimFrames, holdClaimFrame],
	);
	return <ModelPaneContext value={value}>{props.children}</ModelPaneContext>;
}

export { ModelPane };

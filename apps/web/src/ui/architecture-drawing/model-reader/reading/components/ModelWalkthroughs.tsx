import { useCallback, useContext, useRef, type JSX } from "react";

import type { Model } from "@archboard/model/content";
import { Badge } from "@archboard/ui-kit/components";
import { ModelChoiceList } from "#ui/architecture-drawing/model-reader/reading/components/ModelChoiceList.tsx";
import { useRevealedRow } from "#ui/architecture-drawing/model-reader/reading/hooks/use-revealed-row.ts";
import { ModelWalkthroughContext } from "#ui/architecture-drawing/model-reader/state/presentation.ts";

type Walkthrough = Model["walkthroughs"][number];

/**
 * How long a walkthrough is.
 * @param walkthrough The walkthrough.
 * @returns Its number of steps.
 */
function stepCount(walkthrough: Walkthrough): JSX.Element {
	return (
		<Badge variant="count" size="technical" title="Steps">
			{walkthrough.beats.length}
		</Badge>
	);
}

/**
 * The walkthroughs, which stay listed while one plays, so the reader can go on to the next. The
 * one that plays stays in view, wherever it was started.
 * @param props The walkthroughs of the reading.
 * @param props.walkthroughs Every walkthrough of the model, whatever is open.
 * @returns The list.
 */
function ModelWalkthroughs(props: {
	readonly walkthroughs: readonly Walkthrough[];
}): JSX.Element | null {
	const playback = useContext(ModelWalkthroughContext);
	const select = playback?.select;
	const list = useRef<HTMLDivElement>(null);
	const lit = playback?.current ?? null;
	useRevealedRow(list, lit, 0);
	const choose = useCallback((entry: Walkthrough): void => select?.(entry.id), [select]);
	return (
		<div ref={list}>
			<ModelChoiceList
				label="Walkthroughs"
				entries={props.walkthroughs}
				lit={lit}
				attribute="data-walkthrough-id"
				onChoose={choose}
				facts={stepCount}
			/>
		</div>
	);
}

export { ModelWalkthroughs };

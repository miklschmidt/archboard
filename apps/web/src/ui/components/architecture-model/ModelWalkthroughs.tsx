import { useCallback, useContext, type JSX } from "react";

import type { Model } from "@archboard/model/content";
import { Badge } from "@archboard/ui-kit/components";
import { ModelChoiceList } from "#ui/components/architecture-model/ModelChoiceList.tsx";
import { ModelWalkthroughContext } from "#ui/state/architecture-model/presentation.ts";

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
 * The walkthroughs, which stay listed while one plays, so the reader can go on to the next.
 * @param props The walkthroughs of the reading.
 * @param props.walkthroughs Every walkthrough of the model, whatever is open.
 * @returns The list.
 */
function ModelWalkthroughs(props: {
	readonly walkthroughs: readonly Walkthrough[];
}): JSX.Element | null {
	const playback = useContext(ModelWalkthroughContext);
	const select = playback?.select;
	const choose = useCallback((entry: Walkthrough): void => select?.(entry.id), [select]);
	return (
		<ModelChoiceList
			label="Walkthroughs"
			entries={props.walkthroughs}
			lit={playback?.current ?? null}
			attribute="data-walkthrough-id"
			onChoose={choose}
			facts={stepCount}
			flat
		/>
	);
}

export { ModelWalkthroughs };

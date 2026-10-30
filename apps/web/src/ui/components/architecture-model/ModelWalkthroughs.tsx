import { useCallback, useContext, useMemo, type JSX } from "react";

import type { Model } from "@archboard/board/content";
import { ModelChoiceList } from "#ui/components/architecture-model/ModelChoiceList.tsx";
import { ModelWalkthroughContext } from "#ui/state/architecture-model/presentation.ts";

type Walkthrough = Model["walkthroughs"][number];

/**
 * How long a walkthrough is.
 * @param walkthrough The walkthrough.
 * @returns Its number of steps.
 */
function stepCount(walkthrough: Walkthrough): number {
	return walkthrough.beats.length;
}

/**
 * The walkthroughs, which stay listed while one plays, so the reader can go on to the next.
 * @param props The walkthroughs of the reading.
 * @param props.all Every walkthrough.
 * @param props.near The walkthroughs that concern the open scope.
 * @returns The list.
 */
function ModelWalkthroughs(props: {
	readonly all: readonly Walkthrough[];
	readonly near: readonly Walkthrough[];
}): JSX.Element | null {
	const { all, near } = props;
	const playback = useContext(ModelWalkthroughContext);
	const select = playback?.select;
	const rest = useMemo(() => all.filter((entry) => !near.includes(entry)), [all, near]);
	const choose = useCallback((entry: Walkthrough): void => select?.(entry.id), [select]);
	return (
		<ModelChoiceList
			label="Walkthroughs"
			near={near}
			rest={rest}
			restLabel="All walkthroughs"
			lit={playback?.current ?? null}
			attribute="data-walkthrough-id"
			onChoose={choose}
			facts={stepCount}
		/>
	);
}

export { ModelWalkthroughs };

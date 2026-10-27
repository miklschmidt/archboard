import { useContext, useCallback, type JSX } from "react";
import { RiPlayFill } from "@remixicon/react";
import type { Model } from "@archboard/board/content";
import { Button } from "@archboard/ui-kit/components";
import { ModelWalkthroughContext } from "#ui/state/architecture-model/presentation.ts";

/**
 * Start an authored narrative directly from the architecture sidebar.
 * @param props The narratives in this reading.
 * @param props.walkthroughs Authored choices resolved by stable identity.
 * @returns Narrative buttons, or nothing without a narrative.
 */
function ModelWalkthroughChoices(props: {
	walkthroughs: Model["walkthroughs"];
}): JSX.Element | null {
	const playback = useContext(ModelWalkthroughContext);
	if (playback === null || props.walkthroughs.length === 0) return null;
	return (
		<section data-slot="model-walkthroughs" className="border-border space-y-2 border-b px-4 py-4">
			<h3 className="text-body font-semibold">Walkthroughs</h3>
			{props.walkthroughs.map((walkthrough) => (
				<WalkthroughChoice
					key={walkthrough.id}
					walkthrough={walkthrough}
					onSelect={playback.select}
				/>
			))}
		</section>
	);
}

/**
 * Each narrative starts through the same captured presentation action.
 * @param props The authored choice and capture action.
 * @param props.walkthrough The complete narrative.
 * @param props.onSelect Starts its presentation.
 * @returns A native button without a popup that can outlive its reader.
 */
function WalkthroughChoice(props: {
	walkthrough: Model["walkthroughs"][number];
	onSelect: (id: string) => void;
}): JSX.Element {
	const { walkthrough, onSelect } = props;
	const select = useCallback(() => onSelect(walkthrough.id), [walkthrough.id, onSelect]);
	return (
		<Button
			variant="ghost"
			data-walkthrough-id={walkthrough.id}
			onClick={select}
			className="h-auto min-h-8 w-full justify-start px-2 py-2 text-left whitespace-normal"
		>
			<RiPlayFill className="size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1">{walkthrough.name}</span>
			<span className="text-body text-muted-foreground shrink-0">
				{walkthrough.beats.length} steps
			</span>
		</Button>
	);
}

export { ModelWalkthroughChoices };

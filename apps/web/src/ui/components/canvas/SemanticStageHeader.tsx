// The header a semantic pane puts over its reading, assembled from what the
// stage knows: where the model on screen sits, what the model says of itself,
// and the ways to read it.

import { useMemo, type JSX } from "react";

import type { SemanticRender } from "#ui/clients/canvas/reads/drawings.ts";
import { CodeWarnings } from "#ui/components/canvas/CodeWarnings.tsx";
import {
	PaneHeader,
	type CrumbPlace,
	type PaneHeaderProps,
} from "#ui/components/canvas/PaneHeader.tsx";
import type { DrillNavigation } from "#ui/hooks/canvas/use-drill-down.ts";
import { useDrillPlaces } from "#ui/hooks/canvas/use-drill-places.ts";
import type { Sidebar } from "#ui/hooks/canvas/use-sidebar.ts";
import type { VariantReading } from "#ui/rules/canvas/reading/document.ts";

/** What the stage hands its header. */
interface StageHeaderView {
	/** Pick a warned subject out and show it on the diagram, opening the whole model when a view hides it. */
	readonly onShow: (id: string) => void;
	/** What the model says about itself, or null while it has not arrived. */
	readonly reading: VariantReading | null;
	/** The query's answer for the model on screen. */
	readonly render: { readonly data: SemanticRender | undefined };
	/** Which model the pane is looking at, and how it got there. */
	readonly drill: Pick<DrillNavigation, "model" | "trail">;
	/**
	 * Go back to one of the models the reader came down through.
	 * @param depth Where it is in the trail: 0 is its first model.
	 */
	readonly onBackTo: (depth: number) => void;
	/**
	 * The models above one, outermost first, as the navigator places them.
	 * @param model The model on screen.
	 * @returns The models above it.
	 */
	readonly placeOf?: ((model: string) => readonly CrumbPlace[]) | undefined;
	/** The sidebar, which a control in the header shows and hides. */
	readonly sidebar: Sidebar;
}

/**
 * What the header says of the model from its own document: its level, the
 * variant on screen when the model's name opens another, and whether anything
 * it describes is built.
 * @param reading What the model says about itself, or null before it arrives.
 * @returns The header's facts.
 */
function headerFacts(
	reading: VariantReading | null,
): Pick<PaneHeaderProps, "level" | "variant" | "unbuilt"> {
	if (reading === null) {
		return { level: undefined, variant: null, unbuilt: false };
	}
	const { showing } = reading;
	return {
		level: reading.level,
		variant: showing !== null && showing.id !== reading.opens ? showing : null,
		unbuilt: !reading.variants.some((variant) => variant.lifecycle === "current"),
	};
}

/**
 * The pane's header: where the model on screen sits.
 * @param props What the stage knows.
 * @param props.view What the stage knows.
 * @returns The header.
 */
function StageHeader(props: { readonly view: StageHeaderView }): JSX.Element {
	const { view } = props;
	const facts = useMemo(() => headerFacts(view.reading), [view.reading]);
	const crumbs = useDrillPlaces(view.placeOf, view.drill, view.onBackTo);
	return (
		<PaneHeader
			{...facts}
			name={view.render.data?.model ?? view.drill.model}
			{...crumbs}
			sidebar={view.sidebar}
		>
			<CodeWarnings drawing={view.render.data} onShow={view.onShow} />
		</PaneHeader>
	);
}

export { StageHeader };

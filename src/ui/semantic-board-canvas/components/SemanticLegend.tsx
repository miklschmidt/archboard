// The key to the picture on screen: what each node kind's chip and each
// relationship kind's line mean, and what a line's weight and its streaks say.
//
// It keys only what the picture draws, in the order the picture draws it, with
// the picture's own symbols: a legend that lists what is not on the page is a
// legend a reader has to search (TASK-383, docs/design/pane-sidebar-hierarchy.md).
// It is the one explanation of appearance (ADR 0025), visible whenever the
// sidebar is, and it comes after the ways of reading the board because a reader
// needs it less with every board of the same vault.
//
// One heading, then the lists: the chips and the lines say which list is which,
// so neither needs a heading of its own under the legend's.

import type { JSX, ReactNode } from "react";

import {
	EmphasisSample,
	RelationshipSample,
	TrafficSample,
	TypeSample,
} from "@/ui/semantic-board-canvas/components/SemanticTypeSamples";
import { SidebarSection } from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import {
	sampleKey,
	type AppliedAppearance,
	type PictureKey,
} from "@/ui/semantic-board-canvas/lib/appearance";

/** How wide every sample of the legend is, so its labels start on one line. */
const SAMPLE_WIDTH = 28;

/**
 * The key to the picture on screen.
 * @param props What the picture draws.
 * @param props.picture Its kinds and relationship kinds.
 * @returns The legend.
 */
function SemanticLegend(props: { readonly picture: PictureKey }): JSX.Element {
	const { kinds, relationships } = props.picture;
	return (
		<SidebarSection title="Legend" slot="semantic-legend">
			{kinds.length > 0 && (
				<ul aria-label="Node kinds" className="flex flex-col">
					{kinds.map((item) => (
						<Entry key={sampleKey(item)} label={item.typeName}>
							<TypeSample appearance={item} className="size-5 [&>svg]:size-3.5" />
						</Entry>
					))}
				</ul>
			)}
			{relationships.length > 0 && <Lines relationships={relationships} />}
		</SidebarSection>
	);
}

/**
 * The relationship kinds, then the two things a line says beside its kind.
 * @param props The relationship kinds the picture draws.
 * @param props.relationships Those kinds.
 * @returns The list.
 */
function Lines(props: { readonly relationships: readonly AppliedAppearance[] }): JSX.Element {
	return (
		<ul aria-label="Relationships" className="flex flex-col pt-2">
			{props.relationships.map((item) => (
				<Entry key={sampleKey(item)} label={item.typeName}>
					<RelationshipSample appearance={item} width={SAMPLE_WIDTH} />
				</Entry>
			))}
			<Entry label="More emphasis">
				<EmphasisSample width={SAMPLE_WIDTH} />
			</Entry>
			<Entry label="Illustrated traffic">
				<TrafficSample width={SAMPLE_WIDTH} />
			</Entry>
		</ul>
	);
}

/**
 * One entry of the legend: the picture's symbol, then what it means.
 * @param props The meaning and the symbol.
 * @param props.label What it means.
 * @param props.children The symbol, as the picture draws it.
 * @returns The entry.
 */
function Entry(props: { readonly label: string; readonly children: ReactNode }): JSX.Element {
	return (
		<li className="text-body flex min-h-7 items-center gap-2">
			<span aria-hidden="true" className="flex w-7 shrink-0 items-center">
				{props.children}
			</span>
			{props.label}
		</li>
	);
}

export { SemanticLegend };

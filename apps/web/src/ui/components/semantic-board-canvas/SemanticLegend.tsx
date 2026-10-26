// The key to the picture on screen: what each node kind's chip and each
// relationship kind's line mean, and what a line's weight and its pulses say.
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
} from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import {
	SidebarGlyph,
	SidebarLabel,
	SidebarRow,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import {
	LINE_MARKS,
	sampleKey,
	type AppliedAppearance,
	type PictureKey,
} from "@archboard/renderer/picture";

/** One kind of line the key shows. */
type LineMark = (typeof LINE_MARKS)[number]["mark"];

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
			{LINE_MARKS.map(({ mark, word }) => (
				<Entry key={mark} label={word}>
					<LineMarkSample mark={mark} />
				</Entry>
			))}
		</ul>
	);
}

/**
 * The sample of one thing a line says beside its kind.
 * @param props Which mark.
 * @param props.mark The mark.
 * @returns Its sample.
 */
function LineMarkSample(props: { readonly mark: LineMark }): JSX.Element {
	return props.mark === "emphasis" ? (
		<EmphasisSample width={SAMPLE_WIDTH} />
	) : (
		<TrafficSample width={SAMPLE_WIDTH} />
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
		<SidebarRow as="li">
			<SidebarGlyph wide>{props.children}</SidebarGlyph>
			<SidebarLabel>{props.label}</SidebarLabel>
		</SidebarRow>
	);
}

export { SemanticLegend };

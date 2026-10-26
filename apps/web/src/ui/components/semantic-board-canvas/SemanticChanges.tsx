// What a variant changes, for a reader of any variant that is read against
// another: every variant but the current one, and on a board with no current
// variant every draft that came from another (ADR 0023).
//
// The marks on the picture are why somebody looks at a proposal, so their key
// sits at the top of the board tab, under the board's summary, rather than at
// the foot of the legend where a reader had to scroll to it (TASK-383). A row
// is drawn for each standing that occurs, with the pin the picture draws on the
// corner of such a subject and how many subjects stand so: colouring what was
// added and removed is what lets a reader count a change without error, and a
// count says at once whether a change is one part or half the board.
//
// The counts are of what the picture draws: the render answer keeps its
// standing to the subjects the renderer placed (TASK-497). Every reading draws
// part of the variant, the overview included (ADR 0052), and no grammar draws
// every kind of subject, so a reading in which nothing differs says so of the
// reading and keeps the control: the change is elsewhere, and the reader may
// want the marks when they read on.
//
// The control hides the marks and the removed context from the picture. While
// they are hidden the rows go too, and so does the line that says none
// differs: they would key nothing on screen, and a picture drawn without the
// removed context has fewer subjects to count;
// the heading, which says what the variant is read against, stays, because that
// is true either way. It is the section's own name: a heading "Changes" over a
// line that said what they were against said the one thing twice (TASK-388).

import { useId, type JSX } from "react";

import { Checkbox } from "@archboard/ui-kit/components";
import type { SemanticRender } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import {
	SidebarGlyph,
	SidebarLabel,
	SidebarRow,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { StandingSample } from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import { markCounts } from "@archboard/renderer/picture";

/** Inputs for the changes. */
interface SemanticChangesProps {
	/** How what the picture draws differs from the variant it is read against. */
	readonly changes: Changes;
	/** Whether the picture draws the comparison: its marks and removed context. */
	readonly comparison: boolean;
	/**
	 * Draw the comparison on the picture, or stop.
	 * @param comparison Whether to draw it.
	 */
	readonly onComparisonChange: (comparison: boolean) => void;
}

/**
 * The key and the count of what this variant changes, and the control that
 * draws the comparison.
 * @param props What changed, and whether the picture shows it.
 * @returns The section.
 */
function SemanticChanges(props: SemanticChangesProps): JSX.Element {
	return (
		<SidebarSection title={`Compared with ${props.changes.against.name}`} slot="semantic-changes">
			<ChangeKey
				counts={markCounts(props.changes.standing)}
				comparison={props.comparison}
				onComparisonChange={props.onComparisonChange}
			/>
		</SidebarSection>
	);
}

/**
 * The rows of the key while the comparison is drawn, or the word that this
 * view shows none of it, then the control.
 * @param props The counts, and whether and how the comparison is drawn.
 * @param props.counts What changed in the picture, by standing.
 * @param props.comparison Whether the picture draws the comparison.
 * @param props.onComparisonChange Draw it, or stop.
 * @returns The key and its control.
 */
function ChangeKey(props: {
	readonly counts: ReturnType<typeof markCounts>;
	readonly comparison: boolean;
	readonly onComparisonChange: (comparison: boolean) => void;
}): JSX.Element {
	const id = useId();
	return (
		<>
			{props.counts.length === 0 && props.comparison && (
				<p data-slot="semantic-change-none" className="text-body text-muted-foreground">
					Nothing in this view differs.
				</p>
			)}
			{props.counts.length > 0 && props.comparison && (
				<ul data-slot="semantic-change-key" className="flex flex-col">
					{props.counts.map((one) => (
						<SidebarRow key={one.standing} as="li" data-standing={one.standing}>
							<SidebarGlyph>
								<StandingSample standing={one.standing} />
							</SidebarGlyph>
							<SidebarLabel>{one.word}</SidebarLabel>
							<span data-slot="semantic-change-count" className="tabular-nums">
								{one.count}
							</span>
						</SidebarRow>
					))}
				</ul>
			)}
			<SidebarRow>
				<SidebarGlyph control>
					<Checkbox
						id={id}
						checked={props.comparison}
						onCheckedChange={props.onComparisonChange}
						data-slot="semantic-comparison-toggle"
					/>
				</SidebarGlyph>
				<label htmlFor={id}>Mark the changes on the picture</label>
			</SidebarRow>
		</>
	);
}

/** How a variant differs, as the render answer carries it. */
type Changes = NonNullable<SemanticRender["changes"]>;

export { SemanticChanges };

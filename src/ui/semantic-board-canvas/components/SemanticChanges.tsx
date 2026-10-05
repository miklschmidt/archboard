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
// The counts are of what the picture draws. A view draws part of the variant,
// so a view in which nothing differs says so of the view, and keeps the
// control: the change is elsewhere, and the reader may want the marks when
// they read on. Only a whole variant in which nothing differs has no marks to
// show, and says so plainly.
//
// The control hides the marks and the removed context from the picture. While
// they are hidden the rows go too, because they would key nothing on screen;
// the heading, which says what the variant is read against, stays, because that
// is true either way. It is the section's own name: a heading "Changes" over a
// line that said what they were against said the one thing twice (TASK-388).

import { useId, type JSX } from "react";

import { Checkbox } from "@/ui/components/checkbox";
import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	SidebarGlyph,
	SidebarLabel,
	SidebarRow,
	SidebarSection,
} from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import { StandingSample } from "@/ui/semantic-board-canvas/components/SemanticTypeSamples";

/** Inputs for the changes. */
interface SemanticChangesProps {
	/** How the variant on screen differs from the one it is read against. */
	readonly changes: Changes;
	/** Whether a view narrows the picture to part of the variant. */
	readonly inView: boolean;
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
	const counts = countsOf(props.changes.standing);
	const identical = counts.length === 0 && !props.inView;
	return (
		<SidebarSection title={`Compared with ${props.changes.against.name}`} slot="semantic-changes">
			{identical ? (
				<p className="text-body text-muted-foreground">Nothing differs.</p>
			) : (
				<ChangeKey
					counts={counts}
					comparison={props.comparison}
					onComparisonChange={props.onComparisonChange}
				/>
			)}
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
	readonly counts: readonly Count[];
	readonly comparison: boolean;
	readonly onComparisonChange: (comparison: boolean) => void;
}): JSX.Element {
	const id = useId();
	return (
		<>
			{props.counts.length === 0 && (
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

/** The standings a proposal marks, in the order a reader is told them. */
const MARKED = [
	{ standing: "added", word: "Added" },
	{ standing: "changed", word: "Changed" },
	{ standing: "removed", word: "Removed" },
] as const;

/** One marked standing and how many subjects stand so. */
type Count = (typeof MARKED)[number] & { readonly count: number };

/**
 * How many subjects stand each marked way, leaving out the standings nothing has.
 * @param standing How every subject of the comparison stands.
 * @returns The counts, in the order a reader is told them.
 */
function countsOf(standing: Changes["standing"]): readonly Count[] {
	const values = Object.values(standing);
	return MARKED.map((marked) => ({
		...marked,
		count: values.filter((one) => one === marked.standing).length,
	})).filter((marked) => marked.count > 0);
}

export { SemanticChanges };

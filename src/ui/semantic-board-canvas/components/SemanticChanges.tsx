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
// The control hides the marks and the removed context from the picture. While
// they are hidden the rows go too, because they would key nothing on screen;
// the line that says what the variant is read against stays, because that is
// true either way.

import { useId, type JSX } from "react";

import { Checkbox } from "@/ui/components/checkbox";
import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	SidebarGlyph,
	SidebarSection,
} from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import { StandingSample } from "@/ui/semantic-board-canvas/components/SemanticTypeSamples";

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

/** Inputs for the changes. */
interface SemanticChangesProps {
	/** How the variant on screen differs from the one it is read against. */
	readonly changes: Changes;
	/** Whether the picture draws the marks. */
	readonly marked: boolean;
	/**
	 * Draw the marks on the picture, or stop.
	 * @param marked Whether to draw them.
	 */
	readonly onMarkedChange: (marked: boolean) => void;
}

/**
 * The key and the count of what this variant changes, and the control that
 * draws its marks.
 * @param props What changed, and whether the picture shows it.
 * @returns The section.
 */
function SemanticChanges(props: SemanticChangesProps): JSX.Element {
	const counts = countsOf(props.changes.standing);
	return (
		<SidebarSection title="Changes" slot="semantic-changes">
			<p className="text-body text-muted-foreground">
				Compared with <span className="text-foreground">{props.changes.against.name}</span>
			</p>
			{counts.length === 0 ? (
				<p className="text-body text-muted-foreground">Nothing differs.</p>
			) : (
				<ChangeKey counts={counts} marked={props.marked} onMarkedChange={props.onMarkedChange} />
			)}
		</SidebarSection>
	);
}

/**
 * The rows of the key while the marks are drawn, then the control.
 * @param props The counts, and whether and how the marks are drawn.
 * @param props.counts What changed, by standing.
 * @param props.marked Whether the picture draws the marks.
 * @param props.onMarkedChange Draw them, or stop.
 * @returns The key and its control.
 */
function ChangeKey(props: {
	readonly counts: readonly Count[];
	readonly marked: boolean;
	readonly onMarkedChange: (marked: boolean) => void;
}): JSX.Element {
	const id = useId();
	return (
		<>
			{props.marked && (
				<ul data-slot="semantic-change-key" className="flex flex-col pt-1">
					{props.counts.map((one) => (
						<li
							key={one.standing}
							data-standing={one.standing}
							className="text-body flex min-h-6 items-center gap-2"
						>
							<SidebarGlyph>
								<StandingSample standing={one.standing} />
							</SidebarGlyph>
							<span className="flex-1">{one.word}</span>
							<span data-slot="semantic-change-count" className="tabular-nums">
								{one.count}
							</span>
						</li>
					))}
				</ul>
			)}
			<div className="text-body flex min-h-7 items-center gap-2">
				<Checkbox
					id={id}
					checked={props.marked}
					onCheckedChange={props.onMarkedChange}
					data-slot="semantic-comparison-toggle"
				/>
				<label htmlFor={id}>Mark the changes on the picture</label>
			</div>
		</>
	);
}

export { SemanticChanges };

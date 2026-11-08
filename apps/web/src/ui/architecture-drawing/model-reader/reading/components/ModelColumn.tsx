import { RiArrowRightSLine, type RemixiconComponentType } from "@remixicon/react";
import { useCallback, useId, type CSSProperties, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button, cn } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/architecture-drawing/canvas/picture/reads/hooks/use-pane-chrome.ts";
import { SectionLabel } from "#ui/shell/components/SectionLabel.tsx";
import { ROW_HEIGHT } from "#ui/shell/rules/tree-grid.ts";

/** A section of the column's one list. */
type ColumnSection = "changes" | "modules" | "flows" | "walkthroughs";

/**
 * What sticks in a section stands under its head, which is one row high: the stuck rows of a tree
 * and the names of its sections read `--stuck-top`.
 */
const SECTION_BODY_STYLE = { "--stuck-top": `${ROW_HEIGHT}px` } as CSSProperties;

/**
 * Put a reader's Find in the bar over the left column while its pane has focus.
 * @param props Find.
 * @param props.children Find.
 * @returns Find in the bar, or nothing while another pane has focus.
 */
function ColumnFind(props: { readonly children: ReactNode }): JSX.Element | null {
	const slot = usePaneChrome().column?.find ?? null;
	return slot === null ? null : <>{createPortal(props.children, slot)}</>;
}

/**
 * Put a reader's keys and its list in the left column while its pane has focus.
 * @param props The keys and the list.
 * @param props.children The {@link ColumnKeys} and the {@link ColumnSections}.
 * @returns The column's lists, or nothing while another pane has focus.
 */
function ColumnLists(props: { readonly children: ReactNode }): JSX.Element | null {
	const slot = usePaneChrome().column?.destinations ?? null;
	if (slot === null) return null;
	return (
		<>
			{createPortal(
				<div data-slot="model-column" className="flex min-h-0 flex-1 flex-col">
					{props.children}
				</div>,
				slot,
			)}
		</>
	);
}

/**
 * The keys over the list, each a {@link ColumnKey}, which open the dialogs.
 * @param props The keys.
 * @param props.children The keys.
 * @returns The row of keys.
 */
function ColumnKeys(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<div data-slot="model-column-keys" className="mx-2 mb-2 flex shrink-0 gap-2">
			{props.children}
		</div>
	);
}

/**
 * One list on the column's chrome, with a section for each thing the model lists, each a
 * {@link ColumnSectionList}.
 * @param props The sections.
 * @param props.children The sections.
 * @returns The list.
 */
function ColumnSections(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<div
			data-slot="column-list"
			className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden"
		>
			<div data-slot="model-sections" className="min-h-0 flex-1 overflow-y-auto">
				{props.children}
			</div>
		</div>
	);
}

/**
 * A key of the column that opens a dialog. It stays pressed in while its dialog is open.
 * @param props What the key opens and how.
 * @param props.dialog What it opens, for a reader of the page.
 * @param props.label Its words.
 * @param props.icon Its icon.
 * @param props.open Whether its dialog is open.
 * @param props.onOpen Open the dialog.
 * @returns The key.
 */
function ColumnKey(props: {
	readonly dialog: string;
	readonly label: string;
	readonly icon: RemixiconComponentType;
	readonly open: boolean;
	readonly onOpen: () => void;
}): JSX.Element {
	const { icon: Icon } = props;
	return (
		<Button
			variant="outline"
			data-column-dialog={props.dialog}
			aria-haspopup="dialog"
			aria-expanded={props.open}
			onClick={props.onOpen}
			className="min-w-0 flex-1"
		>
			<Icon aria-hidden="true" className="text-muted-foreground" />
			{props.label}
		</Button>
	);
}

/** Inputs for a section of the list. */
interface ColumnSectionProps {
	readonly section: ColumnSection;
	readonly label: string;
	/** How many things it lists, which its head says. */
	readonly count: number;
	readonly folded: boolean;
	readonly onFold: (section: ColumnSection) => void;
	readonly children: ReactNode;
}

/**
 * One section of the list: a head that stays at the top of the list while its rows scroll under
 * it, and folds them away, and the rows. The head's label stands at the column's inset and its fold
 * chevron at its end, so no chevron of the head stands over a row's chevron, and the rows keep the
 * room of the column.
 * @param props The section, its head and its rows.
 * @returns The section.
 */
function ColumnSectionList(props: ColumnSectionProps): JSX.Element {
	const { section, label, count, folded, onFold } = props;
	const body = useId();
	const fold = useCallback((): void => onFold(section), [onFold, section]);
	return (
		<section data-column-section={section} aria-label={label} className="flex flex-col">
			<h2 className="bg-sidebar sticky top-0 z-[11] m-0">
				<button
					type="button"
					aria-expanded={!folded}
					aria-controls={folded ? undefined : body}
					onClick={fold}
					className="group/head focus-visible:ring-ring flex h-7 w-full items-center justify-between gap-2 pr-3 pl-2 outline-none focus-visible:ring-1 focus-visible:ring-inset"
				>
					<SectionLabel title={label} count={count} />
					<RiArrowRightSLine
						aria-hidden="true"
						className={cn(
							"text-muted-foreground group-hover/head:text-foreground size-4 shrink-0 transition-transform motion-reduce:transition-none",
							!folded && "rotate-90",
						)}
					/>
				</button>
			</h2>
			{!folded && (
				<div id={body} style={SECTION_BODY_STYLE} className="pb-2">
					{props.children}
				</div>
			)}
		</section>
	);
}

/** The parts a reading puts in the left column. */
const ModelColumn = {
	Find: ColumnFind,
	Lists: ColumnLists,
	Keys: ColumnKeys,
	Key: ColumnKey,
	Sections: ColumnSections,
	Section: ColumnSectionList,
};

export { ModelColumn, type ColumnSection };

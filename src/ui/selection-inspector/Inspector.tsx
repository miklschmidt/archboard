// The right inspector: the selected element, its metadata, its code binding
// and the path-focus controls. Reads a projection; never touches the element.
// Its close control and Escape clear the pane's selection, which is
// presentation only: nothing here writes the board.

import { RiCloseLine, RiExternalLinkLine, RiFocus3Line, RiFocusLine } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import type { CodeBinding } from "@/shared/code-target";
import { Badge } from "@/ui/components/badge";
import { Button, buttonVariants } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import { describePathFocusReason, type PathFocusSnapshot } from "@/ui/path-focus";
import {
	SELECTION_METADATA_KEYS,
	hasSelectedElement,
	selectedElementTitle,
	type ElementSelection,
	type SelectedElement,
	type SelectionProjection,
} from "@/ui/selection-inspector";

/** What the inspector can ask for. */
interface InspectorActions {
	openCode(elementId: string): void;
	focusPath(elementId: string): void;
	exitPathFocus(): void;
	/** Clear the selection, which closes the inspector. */
	dismissSelection(): void;
}

/** The close control: a 28px ghost icon button inside a 32px hit area. */
const CLOSE_BUTTON_CLASS = buttonVariants({
	variant: "ghost",
	size: "icon-sm",
	className: "hit-area text-muted-foreground -mr-2",
});

/** Inputs for a section heading. */
interface SectionLabelProps {
	children: string;
}

/**
 * A section heading in the kicker role: small, uppercase, muted.
 * @param props The heading text.
 * @returns The heading.
 */
function SectionLabel(props: SectionLabelProps): JSX.Element {
	return <h3 className="text-kicker text-muted-foreground uppercase">{props.children}</h3>;
}

/** Inputs for one definition row. */
interface RowProps {
	label: string;
	value: string;
	/** True for identifiers, paths and times, which are set in the mono face. */
	technical: boolean;
}

/**
 * One row of the definition grid: a muted label, then the value, mono when
 * it is technical. The value carries the full text as a title so a
 * truncated path is still readable.
 * @param props The row.
 * @returns A definition pair.
 */
function Row(props: RowProps): JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground text-body truncate">{props.label}</dt>
			<dd
				title={props.value}
				className={
					props.technical
						? "text-technical truncate text-right font-mono"
						: "text-body truncate text-right"
				}
			>
				{props.value}
			</dd>
		</>
	);
}

/** Inputs for the element rows. */
interface ElementRowsProps {
	element: SelectedElement;
}

/**
 * The element's metadata keys, in the fixed order. The id sits under the
 * title when the title is the promoted name, so it is not repeated here.
 * @param props The element.
 * @returns The rows, or nothing when the element carries no metadata.
 */
function ElementRows(props: ElementRowsProps): JSX.Element | null {
	const { element } = props;
	const keys = SELECTION_METADATA_KEYS.filter(
		(key) => key !== "name" && element.metadata[key] !== undefined,
	);
	if (keys.length === 0) {
		return null;
	}
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2">
			{keys.map((key) => (
				<Row
					key={key}
					label={key}
					value={element.metadata[key] ?? ""}
					technical={key === "node" || key === "level"}
				/>
			))}
		</dl>
	);
}

/** Inputs for the binding rows. */
interface BindingRowsProps {
	binding: CodeBinding;
}

/**
 * The persisted code binding: repository, path and, when known, branch,
 * commit and confirmation time, all in the mono face on 24px rows.
 * @param props The binding.
 * @returns The bound repository rows.
 */
function BindingRows(props: BindingRowsProps): JSX.Element {
	const { binding } = props;
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2.5">
			<Row label="repo" value={binding.repo} technical />
			<Row label="path" value={binding.path} technical />
			{binding.branch !== undefined && <Row label="branch" value={binding.branch} technical />}
			{binding.commit !== undefined && <Row label="commit" value={binding.commit} technical />}
			{binding.confirmedAt !== undefined && (
				<Row label="confirmed" value={binding.confirmedAt} technical />
			)}
		</dl>
	);
}

/** Inputs for the binding section. */
interface BindingSectionProps {
	selection: ElementSelection;
	actions: InspectorActions;
}

/**
 * The bound-repository section and its "Open code" action.
 * @param props The selection and the actions.
 * @returns The section.
 */
function BindingSection(props: BindingSectionProps): JSX.Element {
	const { selection, actions } = props;
	const elementId = selection.element.id;
	const handleOpen = useCallback(() => actions.openCode(elementId), [actions, elementId]);
	return (
		<section className="flex flex-col gap-3">
			<SectionLabel>Bound repository</SectionLabel>
			{selection.kind === "bound" && <BindingRows binding={selection.binding} />}
			{selection.kind === "unbound" && (
				<p className="text-muted-foreground text-body">
					Not bound to code. Promote the element from the CLI to bind it.
				</p>
			)}
			{selection.kind === "malformed" && (
				<p className="text-body">The binding cannot be read. {selection.explanation}</p>
			)}
			{selection.kind === "bound" && (
				<Button
					variant="outline"
					size="sm"
					className="border-primary text-primary hover:bg-primary/10 hover:text-primary self-start"
					onClick={handleOpen}
				>
					<RiExternalLinkLine data-icon="inline-start" />
					Open code
				</Button>
			)}
		</section>
	);
}

/** Inputs for the path-focus section. */
interface PathFocusSectionProps {
	elementId: string;
	pathFocus: PathFocusSnapshot;
	actions: InspectorActions;
}

/**
 * The path-focus section: enter focus, or see why there is no path, or the
 * connected count and the exit. One control toggles in place, so the
 * pointer and the keyboard stay where they were.
 * @param props The element, the focus state and the actions.
 * @returns The section.
 */
function PathFocusSection(props: PathFocusSectionProps): JSX.Element {
	const { elementId, pathFocus, actions } = props;
	const focused = pathFocus.kind === "connected";
	const handleToggle = useCallback(() => {
		if (focused) {
			actions.exitPathFocus();
		} else {
			actions.focusPath(elementId);
		}
	}, [actions, elementId, focused]);
	return (
		<section className="flex flex-col gap-3">
			<SectionLabel>Path focus</SectionLabel>
			{pathFocus.kind === "no-path" && (
				<p className="text-muted-foreground text-body">
					{describePathFocusReason(pathFocus.reason)}
				</p>
			)}
			{pathFocus.kind === "connected" && (
				<p className="text-body">
					<span className="font-mono">{pathFocus.elementIds.length}</span> connected elements shown;
					Escape exits.
				</p>
			)}
			<Button
				variant="outline"
				size="sm"
				aria-pressed={focused}
				className={
					focused ? "border-primary text-primary hover:text-primary self-start" : "self-start"
				}
				onClick={handleToggle}
			>
				{focused ? (
					<RiFocusLine data-icon="inline-start" />
				) : (
					<RiFocus3Line data-icon="inline-start" />
				)}
				{focused ? "Exit focus" : "Focus path"}
			</Button>
		</section>
	);
}

/** Inputs for the inspector. */
interface InspectorProps {
	selection: SelectionProjection;
	pathFocus: PathFocusSnapshot;
	actions: InspectorActions;
}

/** Inputs for the title row. */
interface TitleRowProps {
	element: SelectedElement;
}

/**
 * The title row: the promoted name when the element has one, else its id,
 * with the element type beside it and the id in the mono face beneath a name.
 * @param props The element.
 * @returns The title block.
 */
function TitleRow(props: TitleRowProps): JSX.Element {
	const { element } = props;
	const title = selectedElementTitle(element);
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-title truncate">{title}</h2>
				<Badge variant="outline" size="technical" className="shrink-0 uppercase">
					{element.type}
				</Badge>
			</div>
			{title !== element.id && (
				<p className="text-technical text-muted-foreground truncate font-mono" title={element.id}>
					{element.id}
				</p>
			)}
		</div>
	);
}

/** Inputs for the element body. */
interface ElementInspectorProps {
	selection: ElementSelection;
	pathFocus: PathFocusSnapshot;
	actions: InspectorActions;
}

/**
 * The inspector body for one element: the title row, the metadata grid,
 * then the binding and focus sections under one-pixel rules.
 * @param props The element selection, the focus state and the actions.
 * @returns Title, rows, binding and focus sections.
 */
function ElementInspector(props: ElementInspectorProps): JSX.Element {
	const { selection } = props;
	return (
		<>
			<div className="flex flex-col gap-3 px-4 py-4">
				<TitleRow element={selection.element} />
				<ElementRows element={selection.element} />
			</div>
			<div className="border-border border-t px-4 py-4">
				<BindingSection selection={selection} actions={props.actions} />
			</div>
			<div className="border-border border-t px-4 py-4">
				<PathFocusSection
					elementId={selection.element.id}
					pathFocus={props.pathFocus}
					actions={props.actions}
				/>
			</div>
		</>
	);
}

/**
 * The inspector body by projection kind. A multiple or missing selection
 * gets a title of its own and a line saying what to do.
 * @param props The selection, the focus state and the actions.
 * @returns The body, or null for an empty selection.
 */
function InspectorBody(props: InspectorProps): JSX.Element | null {
	const { selection } = props;
	if (hasSelectedElement(selection)) {
		return (
			<ElementInspector selection={selection} pathFocus={props.pathFocus} actions={props.actions} />
		);
	}
	if (selection.kind === "multiple") {
		return (
			<div className="flex flex-col gap-1 px-4 py-4">
				<p className="text-title">
					<span className="font-mono">{selection.count}</span> elements selected.
				</p>
				<p className="text-muted-foreground text-body">
					Select one element to inspect its metadata and code binding.
				</p>
			</div>
		);
	}
	if (selection.kind === "missing") {
		return (
			<div className="flex flex-col gap-1 px-4 py-4">
				<p className="text-title">Element gone</p>
				<p className="text-muted-foreground text-body">
					Element <span className="font-mono">{selection.id}</span> is no longer on the board.
				</p>
			</div>
		);
	}
	return null;
}

/** Inputs for the inspector's header row. */
interface InspectorHeaderProps {
	actions: InspectorActions;
}

/**
 * The kicker and the close control.
 * @param props The actions.
 * @returns The 40px header row.
 */
function InspectorHeader(props: InspectorHeaderProps): JSX.Element {
	const { actions } = props;
	const handleClose = useCallback(() => actions.dismissSelection(), [actions]);
	return (
		<div className="border-border flex h-10 shrink-0 items-center justify-between border-b px-4">
			<SectionLabel>Inspect</SectionLabel>
			<Tooltip>
				<TooltipTrigger
					className={CLOSE_BUTTON_CLASS}
					aria-label="Close inspector"
					onClick={handleClose}
				>
					<RiCloseLine />
				</TooltipTrigger>
				<TooltipContent side="left">
					Close inspector
					<kbd
						data-slot="kbd"
						className="bg-background/15 text-technical ml-1 rounded-[2px] px-1 font-mono"
					>
						Esc
					</kbd>
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

/**
 * The inspector for the selected element. Hidden while nothing is selected.
 * Escape inside it clears the selection, heard by the application's document
 * listener (which leaves path focus first when that is on); the close
 * control does the same by pointer.
 * @param props The selection, the focus state and the actions.
 * @returns The 280px inspector column, or nothing.
 */
function Inspector(props: InspectorProps): JSX.Element | null {
	if (props.selection.kind === "empty") {
		return null;
	}
	return (
		<aside
			aria-label="Inspector"
			className="border-border bg-card flex w-[280px] shrink-0 flex-col overflow-y-auto border-l"
		>
			<InspectorHeader actions={props.actions} />
			<InspectorBody {...props} />
		</aside>
	);
}

export { Inspector, type InspectorProps, type InspectorActions };

// The right panel of a reading: a column that stands beside the picture on every Diagram reading,
// so a selection never moves the picture. It says what is selected, or what is open while nothing
// is, over what can be done and the legend. Long lists and evidence live on About.

import { RiCloseLine } from "@remixicon/react";
import {
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
	type ComponentProps,
	type CSSProperties,
	type JSX,
	type ReactNode,
	type RefObject,
} from "react";
import { SIDEBAR_MS } from "@archboard/timing";
import { cn, IconButton } from "@archboard/ui-kit/components";

/** The duration the stylesheet fades a new subject in with. */
const PANEL_STYLE: CSSProperties = {
	"--sidebar-subject-in-ms": `${SIDEBAR_MS.subjectIn}ms`,
};

/** How many rows of a list the panel shows before it offers the rest. */
const ROWS_SHOWN = 8;

/**
 * The foot lies on the two columns of the legend under it, which are 8px apart. A key takes half
 * its line less half that gap, so two keys stand on the columns and a key alone grows to the whole
 * line. A key that is too wide for half a line wraps to a line of its own. A foot with nothing in
 * it takes no room.
 */
const FOOT = [
	"flex flex-wrap gap-2 px-4 pt-2 empty:hidden",
	// The selection bar groups its parts for About, and here its parts stand in the line.
	"[&>[data-slot=model-selection-bar]]:contents",
	"[&_button]:h-8 [&_button]:flex-[1_1_calc(50%-0.25rem)]",
	// The agent's menu, the count of a selection and a note take the whole line.
	"[&_[data-slot=model-explain]]:basis-full [&_output]:basis-full [&_p]:basis-full",
	// The warnings take the whole line too, with their words flush with the keys under them and
	// their plate 8px wider on each side.
	"[&_[data-slot=code-warning-count]]:-mx-2 [&_[data-slot=code-warning-count]]:basis-[calc(100%+1rem)]",
].join(" ");

/** Inputs for the panel. */
interface ModelPanelProps {
	/** Let go of the selection, while there is one. */
	readonly onClose: (() => void) | undefined;
	/** Whether About lies over it. It then holds nothing and keeps its room, so the picture keeps its camera. */
	readonly covered: boolean;
	/** Its `ModelPanel.Subject`, then any `ModelPanel.Foot` and the legend. */
	readonly children: ReactNode;
}

/**
 * Give the keyboard to the picture beside the panel.
 * @param panel The panel's element.
 */
function focusPicture(panel: HTMLElement | null): void {
	panel?.parentElement?.querySelector<HTMLElement>('[data-slot="model-diagram"]')?.focus();
}

/**
 * Give the keyboard back to the picture when a selection lets go of what held it: the control that
 * held it left with the subject, so nothing holds it now.
 * @param panel The panel's element, which stands beside the picture.
 * @param selecting Whether a selection stands.
 */
function useFocusBack(panel: RefObject<HTMLElement | null>, selecting: boolean): void {
	const was = useRef(selecting);
	useLayoutEffect(() => {
		const letGo = was.current && !selecting;
		was.current = selecting;
		if (letGo && document.activeElement === document.body) focusPicture(panel.current);
	}, [panel, selecting]);
}

/**
 * The panel.
 * @param props What it holds and the way to let go.
 * @returns The column.
 */
function ModelPanelRoot(props: ModelPanelProps): JSX.Element {
	const panel = useRef<HTMLElement>(null);
	const { onClose } = props;
	useFocusBack(panel, onClose !== undefined);
	return (
		<aside
			ref={panel}
			aria-label="Right panel"
			data-slot="model-panel"
			style={PANEL_STYLE}
			className={cn(
				"bg-sidebar relative z-30 flex min-h-0 w-[min(360px,46%)] shrink-0 flex-col in-data-presenting:hidden",
				props.covered && "invisible",
				onClose === undefined && "@max-[900px]/reading:hidden",
			)}
		>
			{!props.covered && (
				<>
					{onClose !== undefined && (
						// Its ink, not its box, ends on the 16px edge that the panel's rows and cells end on, and
						// it centres on the first line of the name.
						<IconButton
							label="Clear selection"
							slot="semantic-selection-clear"
							className="absolute top-3.25 right-1.5 z-10"
							onClick={onClose}
						>
							<RiCloseLine />
						</IconButton>
					)}
					{props.children}
				</>
			)}
		</aside>
	);
}

/**
 * What the panel says of one subject. A caller keys it by the subject, so a new one opens at the
 * top and arrives with a fade.
 * @param props What it holds.
 * @param props.children What it says.
 * @returns The region that scrolls above the legend.
 */
function Subject(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<div data-slot="model-panel-subject" className="flex min-h-0 flex-1 flex-col">
			{props.children}
		</div>
	);
}

/**
 * What the panel says, which scrolls. Its words fade out over the last 12px, inside the 16px of
 * padding that the last row keeps, so a row that the foot would cut in two dissolves into the
 * chrome, and the last row at the end of the scroll stays whole.
 * @param props What it holds.
 * @param props.children The head and the sections.
 * @param props.slot Where a test finds what it explains.
 * @param props.moduleId The module it explains, when it explains one.
 * @returns The body.
 */
function Body(props: {
	readonly children: ReactNode;
	readonly slot: string;
	readonly moduleId?: string | undefined;
}): JSX.Element {
	return (
		<article
			data-slot={props.slot}
			data-module-id={props.moduleId}
			className="flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto [mask-image:linear-gradient(to_bottom,#000_calc(100%-12px),transparent)] p-4"
		>
			{props.children}
		</article>
	);
}

/**
 * Whose panel this is: the chip of its kind, when it has one, before its name, and under the name
 * one line that says what it is, as the site's mock panel heads a module.
 * @param props The mark, the name and the line.
 * @param props.mark The chip of its kind.
 * @param props.title The name.
 * @param props.children The line.
 * @returns The head.
 */
function Head(props: {
	readonly mark?: ReactNode;
	readonly title: ReactNode;
	readonly children?: ReactNode;
}): JSX.Element {
	return (
		<header className="flex items-start gap-2.5 pr-8">
			{props.mark}
			<div className="flex min-w-0 flex-col gap-0.5">
				<h3 className="title-name text-balance [overflow-wrap:anywhere]">{props.title}</h3>
				{props.children !== undefined && (
					<div className="text-body text-muted-foreground flex min-w-0 flex-wrap gap-x-2">
						{props.children}
					</div>
				)}
			</div>
		</header>
	);
}

/**
 * One list of the panel, under its count.
 * @param props The list.
 * @param props.title What it lists.
 * @param props.count How many it lists.
 * @param props.slot Where a test finds it.
 * @param props.action What acts on the list, at the end of its heading.
 * @param props.children Its rows.
 * @returns The section.
 */
function Section(props: {
	readonly title: string;
	readonly count?: number | undefined;
	readonly slot: string;
	readonly action?: ReactNode;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<section data-slot={props.slot} aria-label={props.title} className="flex flex-col gap-2">
			<div className="flex min-h-6 items-center justify-between gap-2">
				<h4 className="text-body text-foreground flex items-baseline gap-1.5 font-semibold">
					{props.title}
					{props.count !== undefined && (
						<span className="text-technical text-muted-foreground font-mono font-normal">
							{props.count}
						</span>
					)}
				</h4>
				{props.action}
			</div>
			<ul className="flex flex-col gap-0.5">{props.children}</ul>
		</section>
	);
}

/**
 * The rows of a list. Most lists show whole, and a long one offers the rest in place.
 * @param props The list.
 * @param props.items What it lists.
 * @param props.limit How many rows it shows before it offers the rest.
 * @param props.children One row.
 * @returns The rows.
 */
function Rows<Item>(props: {
	readonly items: readonly Item[];
	readonly limit?: number | undefined;
	readonly children: (item: Item) => ReactNode;
}): JSX.Element {
	const { items, limit = ROWS_SHOWN, children } = props;
	const [whole, setWhole] = useState(false);
	const showAll = useCallback((): void => setWhole(true), []);
	const shown = whole ? items : items.slice(0, limit);
	return (
		<>
			{shown.map((item) => children(item))}
			{shown.length < items.length && (
				<li>
					<button
						type="button"
						data-slot="model-panel-more"
						onClick={showAll}
						className="text-body text-muted-foreground hover:text-foreground rounded-control px-2 py-1"
					>
						{items.length - shown.length} more
					</button>
				</li>
			)}
		</>
	);
}

/**
 * One row of a list, which is an action. A long name stands over its detail.
 * @param props The row's words and the button's own attributes.
 * @param props.name What it names.
 * @param props.detail What it says of that.
 * @param props.stacked Whether the detail stands under the name.
 * @param props.action What else can be done with what it names, at its end.
 * @param props.foot A mark along the foot of the row, such as a meter.
 * @returns The row.
 */
function Row({
	name,
	detail,
	stacked = false,
	action,
	foot,
	...button
}: ComponentProps<"button"> & {
	readonly name: ReactNode;
	readonly detail?: ReactNode;
	readonly stacked?: boolean;
	readonly action?: ReactNode;
	readonly foot?: ReactNode;
}): JSX.Element {
	return (
		<li className="flex items-center">
			<button
				type="button"
				{...button}
				className={cn(
					// A row is a plate on the panel, as the site's inspector lists its parts; the row on
					// screen rises as a raised face.
					"bg-background hover:bg-face aria-pressed:bg-face aria-pressed:shadow-raised aria-[current=location]:bg-face aria-[current=location]:shadow-raised rounded-control flex min-h-7 min-w-0 flex-1 gap-x-2 px-2 py-1.25 text-left transition-colors",
					stacked ? "flex-col" : "items-baseline",
					foot !== undefined && "relative overflow-hidden",
				)}
			>
				<span
					className={cn(
						"text-control font-normal [overflow-wrap:anywhere]",
						!stacked && "max-w-3/4 shrink-0",
					)}
				>
					{name}
				</span>
				<span
					className={cn(
						"text-body text-muted-foreground min-w-0 flex-1 truncate",
						!stacked && "text-right",
					)}
				>
					{detail}
				</span>
				{foot}
			</button>
			{action}
		</li>
	);
}

/**
 * What can be done with the subject, pinned under it and over the legend, on the legend's columns.
 * @param props The actions.
 * @param props.children The actions.
 * @returns The foot.
 */
function Foot(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<footer data-slot="model-panel-foot" className={cn(FOOT, "shrink-0")}>
			{props.children}
		</footer>
	);
}

/** The panel, with its parts. */
const ModelPanel = Object.assign(ModelPanelRoot, { Subject, Body, Head, Section, Rows, Row, Foot });

export { ModelPanel };

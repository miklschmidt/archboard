// The right panel of a reading: what explains the selected thing, and nothing else. It is absent
// until a selection and lies over the picture, so the picture keeps its size and its camera.
// Long lists and evidence live on About.

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
import { useSidebarSlide } from "#ui/hooks/semantic-board-canvas/use-sidebar-slide.ts";
import { PANEL_CSS_WIDTH } from "#ui/rules/architecture-model/panel-room.ts";

/** Where the panel stands, and the durations the stylesheet eases it with. */
const PANEL_STYLE: CSSProperties = {
	width: PANEL_CSS_WIDTH,
	"--sidebar-float-in-ms": `${SIDEBAR_MS.floatIn}ms`,
	"--sidebar-float-out-ms": `${SIDEBAR_MS.floatOut}ms`,
	"--sidebar-subject-in-ms": `${SIDEBAR_MS.subjectIn}ms`,
};

/** How many rows of a list the panel shows before it offers the rest. */
const ROWS_SHOWN = 8;

/** Inputs for the panel. */
interface ModelPanelProps {
	readonly open: boolean;
	/** Which subject it explains: a new one opens at the top and arrives with a fade. */
	readonly subject: string;
	/** Let go of the selection. */
	readonly onClose: () => void;
	/** What it says, ending in its `ModelPanel.Foot`. */
	readonly children: ReactNode;
}

/**
 * Give the keyboard back to the picture when the panel leaves with it, by whatever means.
 * @param panel The panel's element, which lies beside the picture.
 * @param leaving Whether the panel is on its way out.
 */
function useFocusBack(panel: RefObject<HTMLElement | null>, leaving: boolean): void {
	useLayoutEffect(() => {
		const element = panel.current;
		if (!leaving || element?.contains(document.activeElement) !== true) return;
		element.parentElement?.querySelector<HTMLElement>('[data-slot="model-diagram"]')?.focus();
	}, [leaving, panel]);
}

/**
 * The panel, while a selection stands.
 * @param props What it explains and how it closes.
 * @returns The panel, or nothing.
 */
function ModelPanelRoot(props: ModelPanelProps): JSX.Element | null {
	const slide = useSidebarSlide(props.open ? "floating" : "away");
	const panel = useRef<HTMLElement>(null);
	useFocusBack(panel, slide.leaving);
	if (!slide.mounted) return null;
	return (
		<aside
			ref={panel}
			aria-label="Selection"
			data-slot="model-panel"
			data-place="floating"
			data-motion={slide.motion}
			data-leaving={slide.leaving ? "" : undefined}
			inert={slide.leaving}
			style={PANEL_STYLE}
			className="border-border bg-sidebar absolute inset-y-0 right-0 z-30 flex min-h-0 flex-col border-l shadow-[var(--elevation-float),var(--elevation-edge-side)] in-data-presenting:hidden in-data-walkthrough:hidden"
		>
			<IconButton
				label="Clear selection"
				slot="semantic-selection-clear"
				className="absolute top-3 right-3 z-10"
				onClick={props.onClose}
			>
				<RiCloseLine />
			</IconButton>
			<div
				key={props.subject}
				data-slot="model-panel-subject"
				className="flex min-h-0 flex-1 flex-col"
			>
				{props.children}
			</div>
		</aside>
	);
}

/**
 * What the panel says, which scrolls under its foot.
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
			className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-4"
		>
			{props.children}
		</article>
	);
}

/**
 * Whose panel this is: its name, then one line that says what it is.
 * @param props The name and the line.
 * @param props.title The name.
 * @param props.children The line.
 * @returns The head.
 */
function Head(props: { readonly title: ReactNode; readonly children?: ReactNode }): JSX.Element {
	return (
		<header className="flex flex-col gap-1 pr-8">
			<h3 className="text-subtitle font-semibold text-balance [overflow-wrap:anywhere]">
				{props.title}
			</h3>
			{props.children !== undefined && (
				<div className="text-body text-muted-foreground flex min-w-0 flex-wrap gap-x-2">
					{props.children}
				</div>
			)}
		</header>
	);
}

/**
 * One list of the panel, under its count.
 * @param props The list.
 * @param props.title What it lists.
 * @param props.count How many it lists.
 * @param props.slot Where a test finds it.
 * @param props.children Its rows.
 * @returns The section.
 */
function Section(props: {
	readonly title: string;
	readonly count?: number | undefined;
	readonly slot: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<section data-slot={props.slot} aria-label={props.title} className="flex flex-col gap-1">
			<h4 className="text-body text-muted-foreground flex items-baseline gap-2 font-semibold">
				{props.title}
				{props.count !== undefined && (
					<span className="text-technical font-mono font-normal">{props.count}</span>
				)}
			</h4>
			<ul className="-mx-2 flex flex-col">{props.children}</ul>
		</section>
	);
}

/**
 * The rows of a list. Most lists show whole, and a long one offers the rest in place.
 * @param props The list.
 * @param props.items What it lists.
 * @param props.whole Whether it shows whole from the start.
 * @param props.children One row.
 * @returns The rows.
 */
function Rows<Item>(props: {
	readonly items: readonly Item[];
	readonly whole?: boolean | undefined;
	readonly children: (item: Item) => ReactNode;
}): JSX.Element {
	const { items, children } = props;
	const [whole, setWhole] = useState(props.whole === true);
	const showAll = useCallback((): void => setWhole(true), []);
	const shown = whole ? items : items.slice(0, ROWS_SHOWN);
	return (
		<>
			{shown.map((item) => children(item))}
			{shown.length < items.length && (
				<li>
					<button
						type="button"
						data-slot="model-panel-more"
						onClick={showAll}
						className="text-body text-muted-foreground hover:text-foreground px-2 py-1"
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
 * @returns The row.
 */
function Row({
	name,
	detail,
	stacked = false,
	...button
}: ComponentProps<"button"> & {
	readonly name: ReactNode;
	readonly detail?: ReactNode;
	readonly stacked?: boolean;
}): JSX.Element {
	return (
		<li>
			<button
				type="button"
				{...button}
				className={cn(
					"hover:bg-muted/60 aria-pressed:bg-sidebar-accent rounded-control flex min-h-7 w-full gap-x-2 px-2 py-1 text-left",
					stacked ? "flex-col" : "items-baseline",
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
			</button>
		</li>
	);
}

/**
 * What can be done with the subject, pinned under what the panel says.
 * @param props The actions.
 * @param props.children The actions.
 * @returns The foot.
 */
function Foot(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<footer
			data-slot="model-panel-foot"
			className="border-border flex shrink-0 flex-wrap items-center gap-2 border-t p-3"
		>
			{props.children}
		</footer>
	);
}

/** The panel, with its parts. */
const ModelPanel = Object.assign(ModelPanelRoot, { Body, Head, Section, Rows, Row, Foot });

export { ModelPanel };

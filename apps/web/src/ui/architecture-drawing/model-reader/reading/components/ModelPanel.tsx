// The right panel of a reading: a column that stands beside the picture on every Diagram reading,
// so a selection never moves the picture. It says what is selected, or what is open while nothing
// is, and ends with the legend, over a foot that holds what can be done. Long lists and evidence
// live on About. Its sections and rows speak as the left column's do.

import { RiCloseLine } from "@remixicon/react";
import {
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useRef,
	useState,
	type ComponentProps,
	type CSSProperties,
	type JSX,
	type MouseEvent,
	type ReactNode,
	type RefObject,
} from "react";
import { SIDEBAR_MS } from "#ui/constants/durations.ts";
import { cn, IconButton } from "@archboard/ui-kit/components";
import { ClaimBadge } from "#ui/shell/components/ActivityLamp.tsx";
import { SectionLabel } from "#ui/shell/components/SectionLabel.tsx";
import { GROUP_LINE, rowTone, type RowState } from "#ui/shell/rules/row-tone.ts";
import { sectionRuns } from "#ui/architecture-drawing/model-reader/reading/rules/section-runs.ts";

/** The duration the stylesheet fades a new subject in with. */
const PANEL_STYLE: CSSProperties = {
	"--sidebar-subject-in-ms": `${SIDEBAR_MS.subjectIn}ms`,
};

/** No agent claims the subject. */
const NO_CLAIMS: readonly string[] = [];

/** The purposes of the claims that hold the subject of the panel, which its head shows. */
const SubjectClaims = createContext<readonly string[]>(NO_CLAIMS);

/** How many rows of a list the panel shows before it offers the rest. */
const ROWS_SHOWN = 8;

/**
 * The foot is a row of keys on the panel's ground, on two columns 8px apart, between the panel's
 * 16px edges. A key takes half its line less half that gap, so two keys stand on the columns and a
 * key alone grows to the whole line. A key that is too wide for half a line wraps to a line of its
 * own. A foot with nothing in it takes no room. A selection of parts keeps the foot one line high,
 * as it is with nothing selected, so a group's tag that selects them stays where it was.
 */
const FOOT = [
	"flex flex-wrap gap-2 px-4 pt-1 pb-4 empty:hidden",
	// The selection bar groups its parts for About, and here its parts stand in the line.
	"[&>[data-slot=model-selection-bar]]:contents",
	"[&_button]:h-8 [&_button]:flex-[1_1_calc(50%-0.25rem)]",
	// Beside Focus, the agent's menu says Explain, and its mark names the agent.
	"[&_[data-slot=model-selection-bar]_[data-slot=explain-agent]]:sr-only",
	// The head of the subject says how many are selected. A note takes the whole line.
	"[&_output]:sr-only [&_p]:basis-full",
	// The warnings take the whole line too, with their words flush with the keys under them and
	// their plate 8px wider on each side.
	"[&_[data-slot=code-warning-count]]:-mx-2 [&_[data-slot=code-warning-count]]:basis-[calc(100%+1rem)]",
].join(" ");

/**
 * A row of the panel lies on its ground as a row of the left column does. Its tone reaches 8px past
 * the panel's 16px edges, so its words stand on those edges, under the label of its section.
 */
const ROW = "-mx-2 flex min-w-0 flex-1 gap-x-2 px-2 py-1.25 text-left transition-colors";

/** Inputs for the panel. */
interface ModelPanelProps {
	/** Let go of the selection, while there is one. */
	readonly onClose: (() => void) | undefined;
	/** Whether About lies over it. It then holds nothing and keeps its room, so the picture keeps its camera. */
	readonly covered: boolean;
	/** Its `ModelPanel.Scroll`, then any `ModelPanel.Foot`. */
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
 * What the panel says, which scrolls: the subject, then what stands under every subject, such as
 * the legend. What stands under every subject ends the scroll, and while the subject is short it
 * stands at the foot of the panel, so a reader finds it in one place and a new short subject leaves
 * it where it was. Its words fade out over the last 12px, inside the 16px of padding that the last
 * row keeps, so a row that the foot would cut in two dissolves into the chrome, and the last row at
 * the end of the scroll stays whole. A new subject opens at the top. A press under the subject,
 * such as on a group's tag, keeps what stands there where it stood, so the pointer and the keyboard
 * stay on the control that changed the subject.
 * @param props What it holds.
 * @param props.subject What names the subject, which changes with it.
 * @param props.under What stands under every subject.
 * @param props.children The {@link Subject}.
 * @returns The region that scrolls.
 */
function Scroll(props: {
	readonly subject: string;
	readonly under: ReactNode;
	readonly children: ReactNode;
}): JSX.Element {
	const box = useRef<HTMLDivElement>(null);
	const under = useRef<HTMLDivElement>(null);
	const held = useRef<number | null>(null);
	const hold = useCallback((event: MouseEvent<HTMLDivElement>): void => {
		const part = under.current;
		const { target } = event;
		if (part === null || !(target instanceof Node) || !part.contains(target)) return;
		held.current = part.getBoundingClientRect().top;
		// A press that changes no subject lets go once its own work is done.
		setTimeout(() => {
			held.current = null;
		}, 0);
	}, []);
	const shown = useRef(props.subject);
	useLayoutEffect(() => {
		if (shown.current === props.subject) return;
		shown.current = props.subject;
		const scroll = box.current;
		const top = held.current;
		held.current = null;
		if (scroll === null) return;
		const part = under.current;
		if (top === null || part === null) scroll.scrollTop = 0;
		else scroll.scrollTop += part.getBoundingClientRect().top - top;
	}, [props.subject]);
	return (
		<div
			ref={box}
			data-slot="model-panel-scroll"
			onClickCapture={hold}
			className="flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto [mask-image:linear-gradient(to_bottom,#000_calc(100%-12px),transparent)] p-4"
		>
			{props.children}
			<div ref={under} className="mt-auto flex flex-col gap-5 empty:hidden">
				{props.under}
			</div>
		</div>
	);
}

/**
 * What the panel says of one subject. A caller keys it by the subject, so a new one arrives with a
 * fade. While agents claim the subject, its {@link Head} says so.
 * @param props What it holds.
 * @param props.claims The purposes of the claims that hold the subject, each once.
 * @param props.children What it says.
 * @returns The subject.
 */
function Subject(props: {
	readonly claims: readonly string[];
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<SubjectClaims value={props.claims}>
			<div data-slot="model-panel-subject" className="flex flex-col gap-5">
				{props.children}
			</div>
		</SubjectClaims>
	);
}

/**
 * What the panel says of its subject: its head and its sections.
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
		<article data-slot={props.slot} data-module-id={props.moduleId} className="flex flex-col gap-5">
			{props.children}
		</article>
	);
}

/**
 * Whose panel this is: the chip of its kind, when it has one, before its name, and under the name
 * one line that says what it is, as the site's mock panel heads a module. While agents claim the
 * subject, the line ends with the claim's badge.
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
	const claims = useContext(SubjectClaims);
	const claimed = claims.length > 0;
	return (
		<header className="flex items-start gap-2.5 pr-8">
			{props.mark}
			<div className="flex min-w-0 flex-col gap-0.5">
				<h3 className="title-name text-balance [overflow-wrap:anywhere]">{props.title}</h3>
				{(props.children !== undefined || claimed) && (
					<div className="text-body text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2">
						{props.children}
						{claimed && <ClaimBadge purposes={claims} />}
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
		<section data-slot={props.slot} aria-label={props.title} className="flex flex-col gap-1">
			<div className="flex min-h-6 items-center justify-between gap-2">
				<h4 className="m-0 min-w-0">
					<SectionLabel title={props.title} count={props.count} />
				</h4>
				{props.action}
			</div>
			<ul className="flex flex-col">{props.children}</ul>
		</section>
	);
}

/**
 * The rows of a list. Most lists show whole, and a long one offers the rest in place. A list whose
 * rows belong to groups, such as the flows of collections, stands each run of neighbours under the
 * name of its group.
 * @param props The list.
 * @param props.items What it lists.
 * @param props.limit How many rows it shows before it offers the rest.
 * @param props.groupOf The group of a row, when its rows belong to groups.
 * @param props.children One row.
 * @returns The rows.
 */
function Rows<Item>(props: {
	readonly items: readonly Item[];
	readonly limit?: number | undefined;
	readonly groupOf?: ((item: Item) => string) | undefined;
	readonly children: (item: Item) => ReactNode;
}): JSX.Element {
	const { items, limit = ROWS_SHOWN, groupOf, children } = props;
	const [whole, setWhole] = useState(false);
	const showAll = useCallback((): void => setWhole(true), []);
	const shown = whole ? items : items.slice(0, limit);
	return (
		<>
			{groupOf === undefined
				? shown.map((item) => children(item))
				: sectionRuns(shown, groupOf).map((run) => (
						<Group key={run.key} label={run.label}>
							{run.entries.map((item) => children(item))}
						</Group>
					))}
			{shown.length < items.length && (
				<li>
					<button
						type="button"
						data-slot="model-panel-more"
						onClick={showAll}
						className={cn(
							rowTone({ lit: false }),
							ROW,
							"text-body text-muted-foreground hover:text-foreground",
						)}
					>
						{items.length - shown.length} more
					</button>
				</li>
			)}
		</>
	);
}

/**
 * The state of a row, from its button: lit while it is pressed or marks where the reader is.
 * @param button The button's own attributes.
 * @returns The row's state.
 */
function rowState(button: ComponentProps<"button">): RowState {
	return {
		lit: button["aria-pressed"] === true || button["aria-current"] === "location",
		disabled: button.disabled === true,
	};
}

/**
 * One row of a list, which is an action. It lies on the panel's ground, with the tone of a row of
 * the left column. A long name stands over its detail.
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
					rowTone(rowState(button)),
					ROW,
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
 * Rows that belong together under one name, such as the flows of a collection, drawn as the left
 * column draws them: the name in full ink, and its rows one step deeper under a guide.
 * @param props The name and the rows.
 * @param props.label The name.
 * @param props.children The rows.
 * @returns The group, as one entry of its section's list.
 */
function Group(props: { readonly label: string; readonly children: ReactNode }): JSX.Element {
	return (
		<li className="flex flex-col">
			<span aria-hidden="true" className={cn(GROUP_LINE, "flex min-h-7 items-center truncate")}>
				{props.label}
			</span>
			<ul aria-label={props.label} className="relative flex flex-col pl-4">
				<span aria-hidden="true" className="bg-border absolute inset-y-0 left-1.5 w-px" />
				{props.children}
			</ul>
		</li>
	);
}

/**
 * What can be done with the subject, or with the reading while nothing is selected: a row of keys
 * pinned under what scrolls.
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
const ModelPanel = Object.assign(ModelPanelRoot, {
	Scroll,
	Subject,
	Body,
	Head,
	Section,
	Rows,
	Row,
	Group,
	Foot,
});

export { ModelPanel };

import { RiEyeLine, RiEyeOffLine } from "@remixicon/react";
import {
	useCallback,
	useMemo,
	useState,
	type CSSProperties,
	type JSX,
	type ReactNode,
} from "react";
import { LINE_MARKS, type LineMark } from "@archboard/renderer/picture";
import type { Model, ModelFilters, projectModel } from "@archboard/board/content";
import { cn } from "@archboard/ui-kit/components";
import {
	EmphasisSample,
	RelationshipSample,
	TrafficSample,
	TypeSample,
} from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import type {
	AppliedAppearance,
	PictureKey,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { paletteTag } from "#ui/rules/semantic-board-canvas/board/palette.ts";

type Projection = ReturnType<typeof projectModel>;
type Line = Projection["connections"][number]["line"];

/** How wide every line's sample is, so that the names start on one line. */
const SAMPLE_WIDTH = 22;

/** How a kind looks when the vault's policy no longer names it. */
const UNKNOWN_KIND = { color: "neutral", dash: "solid", arrowhead: "filled" } as const;

/** The two columns that the kinds and the line types stand in. */
const CELLS = "grid grid-cols-2 gap-x-2.5";

/** Inputs for the legend. */
interface ModelLegendProps {
	readonly model: Model;
	readonly projection: Projection;
	/** What the picture draws, or null while it draws nothing that a legend explains. */
	readonly picture: PictureKey | null;
	readonly filters: Pick<ModelFilters, "hideKinds">;
	readonly onToggle: (field: "hideKinds", id: string) => void;
}

/**
 * What the marks of a picture mean, at the foot of the right panel with no click: its kinds, its
 * line types and its groups. It lists what the picture draws and what a reader hid. Filter puts
 * the control that hides a line type on each row, and the head says how many are hidden.
 * @param props The reading and its visibility choices.
 * @returns The legend, or nothing while no picture stands.
 */
function ModelLegend(props: ModelLegendProps): JSX.Element | null {
	const { model, projection, picture } = props;
	const [filtering, setFiltering] = useState(false);
	const toggle = useCallback((): void => setFiltering((on) => !on), []);
	if (picture === null) return null;
	const lines = lineKinds(props, picture);
	return (
		<section
			aria-label="Legend"
			data-slot="model-legend"
			className="border-border flex shrink-0 flex-col gap-2.5 border-t px-4 pt-3 pb-4"
		>
			<LegendHead
				hidden={props.filters.hideKinds?.length ?? 0}
				filterable={lines.some((line) => line.hideable)}
				filtering={filtering}
				onFilter={toggle}
			/>
			<div className="divide-border flex flex-col divide-y *:py-2.5 *:first:pt-0 *:last:pb-0">
				<Kinds kinds={picture.kinds} />
				<Lines {...props} lines={lines} filtering={filtering} />
				<Groups model={model} ids={groupsOf(projection)} />
			</div>
		</section>
	);
}

/**
 * The legend's name, and the control that shows which line types a reader can hide.
 * @param props What the control says and does.
 * @param props.hidden How many kinds the picture leaves out.
 * @param props.filterable Whether the reading has a line type to hide.
 * @param props.filtering Whether each line type shows its control.
 * @param props.onFilter Show or put away those controls.
 * @returns The head.
 */
function LegendHead(props: {
	readonly hidden: number;
	readonly filterable: boolean;
	readonly filtering: boolean;
	readonly onFilter: () => void;
}): JSX.Element {
	const { hidden } = props;
	return (
		<header className="flex items-baseline justify-between gap-2">
			<h3 className="text-control font-semibold">Legend</h3>
			{props.filterable && (
				<button
					type="button"
					data-slot="model-legend-filter"
					aria-pressed={props.filtering}
					onClick={props.onFilter}
					className="text-control text-muted-foreground hover:text-foreground aria-pressed:text-foreground -my-1 min-h-6 font-normal"
				>
					Filter
					{hidden > 0 && <span data-slot="model-legend-hidden"> · {hidden} hidden</span>}
				</button>
			)}
		</header>
	);
}

/**
 * The kinds of part that the picture draws. It samples a kind as a card and as a container, and
 * the two are one kind to a reader.
 * @param props The kinds.
 * @param props.kinds The samples of each.
 * @returns Their list, or nothing when it draws none.
 */
function Kinds(props: { readonly kinds: readonly AppliedAppearance[] }): JSX.Element | null {
	const kinds = [...new Map(props.kinds.map((item) => [item.typeKind, item])).values()];
	if (kinds.length === 0) return null;
	return (
		<ul aria-label="Kinds" data-slot="model-legend-kinds" className={`${CELLS} gap-y-2`}>
			{kinds.map((item) => (
				<Cell key={item.id}>
					<Mark name={item.typeName}>
						<TypeSample appearance={item} className="size-5 [&>svg]:size-3.5" />
					</Mark>
				</Cell>
			))}
		</ul>
	);
}

/** One line type of the legend. */
interface LineKind {
	readonly item: AppliedAppearance;
	/** Whether a reader left it out. */
	readonly hidden: boolean;
	/** Whether a reader can leave it out: a mixed line is no kind of relationship. */
	readonly hideable: boolean;
}

/** Inputs for the line types. */
interface LinesProps extends ModelLegendProps {
	readonly lines: readonly LineKind[];
	/** Whether each line type shows the control that hides it. */
	readonly filtering: boolean;
}

/**
 * The line types of the picture, then the marks that its lines wear beside their kinds.
 * @param props The line types and how to change their visibility.
 * @returns Their list, or nothing when the picture draws no line.
 */
function Lines(props: LinesProps): JSX.Element | null {
	const { lines, projection } = props;
	if (lines.length === 0) return null;
	const marks = LINE_MARKS.filter(({ mark }) =>
		projection.connections.some(({ line }) => wears(line, mark)),
	);
	return (
		<ul aria-label="Line types" data-slot="model-legend-lines" className={`${CELLS} gap-y-1`}>
			{lines.map((line) => (
				<LineCell key={line.item.id} {...props} {...line} />
			))}
			{marks.map(({ mark, word }) => (
				<Cell key={mark}>
					<Mark name={word}>
						{mark === "emphasis" ? (
							<EmphasisSample width={SAMPLE_WIDTH} />
						) : (
							<TrafficSample width={SAMPLE_WIDTH} />
						)}
					</Mark>
				</Cell>
			))}
		</ul>
	);
}

/**
 * Whether a line wears a mark beside its kind.
 * @param line The line.
 * @param mark The mark.
 * @returns True when the picture draws it so.
 */
function wears(line: Line, mark: LineMark): boolean {
	return mark === "emphasis" ? line.emphasis === "hero" : line.traffic !== undefined;
}

/**
 * How a kind looks according to the vault's policy, because the picture has no sample of what it
 * does not draw.
 * @param model The reading.
 * @param id The kind.
 * @returns Its appearance.
 */
function policyLook(model: Model, id: string): AppliedAppearance {
	const look = { name: id, ...UNKNOWN_KIND, ...model.policy.relationshipKinds[id] };
	return {
		id,
		typeName: look.name,
		typeKind: id,
		iconSvg: "",
		depiction: "",
		typeColor: "neutral",
		lineColor: look.color ?? UNKNOWN_KIND.color,
		dash: look.dash,
		arrowhead: look.arrowhead,
	};
}

/**
 * What a reader can meet on this picture's lines: what it draws, then each kind that it does not
 * draw on a line of its own, because it lies inside a mixed line or a reader left it out.
 * @param props The reading.
 * @param picture What the picture draws.
 * @returns The rows, hidden kinds last.
 */
function lineKinds(props: ModelLegendProps, picture: PictureKey): readonly LineKind[] {
	const { model, projection, filters } = props;
	const hide = new Set(filters.hideKinds);
	const joined = projection.allConnections.flatMap(({ joins }) => joins.map((edge) => edge.kind));
	const kinds = new Set([...joined, ...hide]);
	const drawn = picture.relationships;
	const named = new Set(drawn.map((item) => item.typeKind));
	return [...drawn, ...[...kinds].filter((id) => !named.has(id)).map((id) => policyLook(model, id))]
		.map((item) => ({
			item,
			hidden: hide.has(item.typeKind),
			hideable: kinds.has(item.typeKind),
		}))
		.toSorted((a, b) => Number(a.hidden) - Number(b.hidden));
}

/**
 * The groups that reach this picture.
 * @param projection What it draws.
 * @returns Their identities, without duplicates.
 */
function groupsOf(projection: Projection): readonly string[] {
	const drawn = [...projection.children, ...projection.context].flatMap(
		(module) => module.groups ?? [],
	);
	return [...new Set(drawn)];
}

/**
 * One entry: a mark and what it means, then the control that changes the reading, if it has one.
 * @param props The entry.
 * @param props.children Its mark and control.
 * @returns The entry.
 */
function Cell(props: { readonly children: ReactNode }): JSX.Element {
	return <li className="flex min-w-0 items-center gap-2">{props.children}</li>;
}

/**
 * A mark, as the picture draws it, and what it means.
 * @param props The mark.
 * @param props.name What it means.
 * @param props.dimmed Whether the picture leaves it out.
 * @param props.children The mark.
 * @returns The two.
 */
function Mark(props: {
	readonly name: string;
	readonly dimmed?: boolean | undefined;
	readonly children: ReactNode;
}): JSX.Element {
	const dimmed = props.dimmed === true;
	return (
		<>
			<span aria-hidden="true" className={cn("flex shrink-0", dimmed && "opacity-40")}>
				{props.children}
			</span>
			<span
				title={props.name}
				className={cn(
					"text-control min-w-0 flex-1 truncate font-normal",
					dimmed && "text-muted-foreground",
				)}
			>
				{props.name}
			</span>
		</>
	);
}

/**
 * A line type, whether the picture draws it or leaves it out.
 * @param props The line type and how to change its visibility.
 * @returns The entry.
 */
function LineCell(props: LinesProps & LineKind): JSX.Element {
	const { item, hidden, hideable, onToggle, filtering } = props;
	const toggle = useCallback(
		(): void => onToggle("hideKinds", item.typeKind),
		[onToggle, item.typeKind],
	);
	return (
		<Cell>
			<Mark name={item.typeName} dimmed={hidden}>
				<RelationshipSample appearance={item} width={SAMPLE_WIDTH} />
			</Mark>
			{filtering && hideable && (
				<Visibility
					shown={!hidden}
					name={`${item.typeName} lines`}
					kind={item.typeKind}
					onToggle={toggle}
				/>
			)}
		</Cell>
	);
}

/**
 * The control that says whether the picture draws a kind, apart from the mark that explains it.
 * @param props What it controls.
 * @param props.shown Whether the picture draws it.
 * @param props.name What it is called.
 * @param props.kind The relationship kind it controls.
 * @param props.onToggle Change it.
 * @returns A switch.
 */
function Visibility(props: {
	readonly shown: boolean;
	readonly name: string;
	readonly kind: string;
	readonly onToggle: () => void;
}): JSX.Element {
	const { shown } = props;
	return (
		<button
			type="button"
			role="switch"
			aria-checked={shown}
			aria-label={`Show ${props.name}`}
			title={`${shown ? "Hide" : "Show"} ${props.name}`}
			data-filter-kind={props.kind}
			onClick={props.onToggle}
			className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-control aria-checked:text-foreground -my-1 flex size-6 shrink-0 items-center justify-center"
		>
			{shown ? (
				<RiEyeLine aria-hidden="true" className="size-4" />
			) : (
				<RiEyeOffLine aria-hidden="true" className="size-4" />
			)}
		</button>
	);
}

/**
 * The groups that the picture holds, which close the legend.
 * @param props The groups.
 * @param props.model The reading, whose policy names them.
 * @param props.ids Their identities.
 * @returns Their tags, or nothing for a reading with no groups.
 */
function Groups(props: {
	readonly model: Model;
	readonly ids: readonly string[];
}): JSX.Element | null {
	const { model, ids } = props;
	if (ids.length === 0) return null;
	return (
		<ul aria-label="Groups" data-slot="model-legend-groups" className="flex flex-wrap gap-2">
			{ids.map((id) => (
				<GroupTag
					key={id}
					name={model.policy.groups[id]?.name ?? id}
					color={model.policy.groups[id]?.color}
				/>
			))}
		</ul>
	);
}

/**
 * A group, as a tag with its name inside.
 * @param props The group.
 * @param props.name Its name.
 * @param props.color Its colour's name, when the vault defines it.
 * @returns The tag.
 */
function GroupTag(props: {
	readonly name: string;
	readonly color: string | undefined;
}): JSX.Element {
	const { color } = props;
	const style = useMemo<CSSProperties>(() => ({ "--tag": paletteTag(color) }), [color]);
	return (
		<li style={style} className="group-tag text-technical px-2 py-0.5 leading-4 whitespace-nowrap">
			{props.name}
		</li>
	);
}

export { ModelLegend };

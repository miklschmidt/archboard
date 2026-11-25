import { RiEyeLine, RiEyeOffLine, type RemixiconComponentType } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, type CSSProperties, type JSX, type ReactNode } from "react";
import type { Model, ModelFilters, projectModel } from "@archboard/model/content";
import { hiddenKinds } from "@archboard/model/policy";
import { cn } from "@archboard/ui-kit/components";
import { KindChip } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import {
	EffectSample,
	EmphasisSample,
	KindSample,
	StandingLineSample,
	TrafficSample,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticTypeSamples.tsx";
import { iconQuery } from "#ui/architecture-drawing/canvas/picture/reads/clients/queries.ts";
import type { PictureLegend } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { ModelLensPresets } from "#ui/architecture-drawing/model-reader/reading/components/ModelLens.tsx";
import type { FilterField } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import { SECTION_ICONS } from "#ui/architecture-drawing/model-reader/reading/constants/section-icons.ts";
import type { ModelSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";
import {
	comparisonRows,
	groupRows,
	kindRows,
	markRows,
	relationshipRows,
	soloed,
	toggled,
	type LegendEffect,
	type LegendGroup,
	type LegendKind,
	type LegendMark,
	type LegendRow,
	type LegendStanding,
	type LegendSwitch,
	type RelationshipRows,
} from "#ui/architecture-drawing/model-reader/reading/rules/legend-rows.ts";
import { paletteTag } from "#ui/architecture-drawing/canvas/picture/rules/palette.ts";
import { rowTone } from "#ui/shell/rules/row-tone.ts";

/**
 * How wide every line's sample is, and the box of every mark: as wide as a kind's chip, so that the
 * names start on one line.
 */
const SAMPLE_WIDTH = 24;

/**
 * The two columns that the kinds and the marks of lines stand in. The foot under the panel lies on
 * the same columns.
 */
const CELLS = "grid grid-cols-2 gap-x-2";
/** `Show all` looks like the panel's other keys on a label row, such as `Trace back` (`TraceToggle`). */
const PANEL_KEY =
	"text-body border-border hover:bg-sidebar-accent/50 rounded-control flex h-6 shrink-0 items-center border px-2 transition-colors";

/** Inputs for the legend. */
interface ModelLegendProps {
	readonly model: Model;
	readonly projection: ReturnType<typeof projectModel>;
	/** What the picture draws, or null while it draws nothing that a legend explains. */
	readonly picture: PictureLegend | null;
	/** How the vault's kinds look, with the icons the picture draws them with. */
	readonly look: KindLook;
	readonly filters: Pick<ModelFilters, "hideKinds" | "hideEffects">;
	/** Hide these kinds or effects besides what the lens leaves out, and show the rest. */
	readonly onHide: (field: FilterField, ids: readonly string[]) => void;
	/** Read the picture through another lens, or nothing for a flow, which draws every message. */
	readonly onLens: ((id: string) => void) | undefined;
	/** Read the picture through the lens of every relationship, with nothing hidden. */
	readonly onShowAll: () => void;
	readonly selection: ModelSelection;
}

/**
 * What the marks of a picture mean, as the last section of the right panel, under every subject,
 * with no click: its part kinds, its relationships and its groups. The relationships open with the
 * lenses, one press each, then each kind and each effect a reader can hide or show alone, then what
 * the lens leaves out, then the marks no reader hides. A group's tag selects the group's parts.
 * @param props The reading and its visibility choices.
 * @returns The section, or nothing while no picture stands.
 */
function ModelLegend(props: ModelLegendProps): JSX.Element | null {
	const { model, projection, picture, selection, filters, onHide } = props;
	const rows = useMemo(
		() => relationshipRows({ model, projection, ...filters }),
		[model, projection, filters],
	);
	const hideRows = useCallback(
		(field: FilterField, ids: readonly string[]): void => {
			const kinds = field === "hideKinds";
			const current = kinds ? hiddenKinds(filters.hideKinds, model.policy) : filters.hideEffects;
			const visibleRows = kinds ? rows.kinds : rows.effects;
			const unlisted = (current ?? []).filter((id) => !visibleRows.some((row) => row.id === id));
			onHide(field, [...unlisted, ...ids]);
		},
		[filters, model.policy, onHide, rows],
	);
	if (picture === null) return null;
	return (
		<div data-slot="model-legend" className="flex flex-col gap-5">
			<Kinds model={model} look={props.look} rows={kindRows({ model, projection, picture })} />
			<Relationships
				rows={rows}
				marks={markRows(projection)}
				standings={comparisonRows(projection)}
				lensName={projection.lens.name}
				leftOut={props.onLens === undefined ? 0 : projection.leftOut}
				onHide={hideRows}
				onShowAll={props.onShowAll}
			>
				{/* A reading with one lens, as one from before lenses, has nothing to choose. */}
				{props.onLens !== undefined && Object.keys(model.policy.lenses).length > 1 && (
					<ModelLensPresets model={model} lens={projection.lens.id} onSelect={props.onLens} />
				)}
			</Relationships>
			<Groups groups={groupRows(model, projection)} selection={selection} />
		</div>
	);
}

/**
 * One part of the legend, under its own label in the panel's label style.
 * @param props The list.
 * @param props.icon What kind of thing it lists.
 * @param props.label What it lists.
 * @param props.slot Where a test finds it.
 * @param props.className How its entries stand.
 * @param props.children Its entries.
 * @returns The list, as a section of the panel.
 */
function LegendList(props: {
	readonly icon: RemixiconComponentType;
	readonly label: string;
	readonly slot: string;
	readonly className: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<ModelPanel.Section icon={props.icon} title={props.label} slot={`${props.slot}-section`}>
			<li>
				<ul data-slot={props.slot} className={props.className}>
					{props.children}
				</ul>
			</li>
		</ModelPanel.Section>
	);
}

/**
 * The kinds of part in the reading, each with the chip that the head of the panel puts before a
 * module's name.
 * @param props The kinds.
 * @param props.model The reading, whose policy names the icon of a kind that the picture leaves out.
 * @param props.look How the vault's kinds look.
 * @param props.rows One row for each.
 * @returns Their list, or nothing when there are none.
 */
function Kinds(props: {
	readonly model: Model;
	readonly look: KindLook;
	readonly rows: readonly LegendRow[];
}): JSX.Element | null {
	const { model, look, rows } = props;
	if (rows.length === 0) return null;
	return (
		<LegendList
			icon={SECTION_ICONS.legend}
			label="Legend"
			slot="model-legend-kinds"
			className={CELLS}
		>
			{rows.map(({ item, dimmed }) => (
				<Cell key={item.typeKind}>
					<Mark name={item.typeName} dimmed={dimmed}>
						<LegendChip
							look={look}
							kind={item.typeKind}
							icon={dimmed ? model.policy.nodeKinds[item.typeKind]?.icon : undefined}
						/>
					</Mark>
				</Cell>
			))}
		</LegendList>
	);
}

/**
 * The chip of a kind. A kind that the picture does not draw now takes the icon that the policy
 * names, so that its row reads the same as when the picture draws the kind.
 * @param props The kind.
 * @param props.look How the vault's kinds look.
 * @param props.kind The kind.
 * @param props.icon The policy's icon for it, when the picture does not draw it.
 * @returns The chip.
 */
function LegendChip(props: {
	readonly look: KindLook;
	readonly kind: string;
	readonly icon: string | undefined;
}): JSX.Element {
	const { icon } = props;
	const paths = useQuery({ ...iconQuery(icon ?? ""), enabled: icon !== undefined }).data;
	const markup = useMemo(
		() =>
			paths === undefined
				? undefined
				: `<svg viewBox="0 0 24 24" aria-hidden="true">${paths.map((d) => `<path d="${d}"/>`).join("")}</svg>`,
		[paths],
	);
	return <KindChip look={props.look} kind={props.kind} icon={markup} />;
}

/** Inputs for the relationships. */
interface RelationshipsProps {
	readonly rows: RelationshipRows;
	readonly marks: readonly LegendMark[];
	readonly standings: readonly LegendStanding[];
	/** The name of the lens the picture draws through. */
	readonly lensName: string;
	/** The lens selector of a structural picture, which opens the list. */
	readonly children: ReactNode;
	/** How many lines a structural reading leaves out; none for a flow. */
	readonly leftOut: number;
	readonly onHide: ModelLegendProps["onHide"];
	readonly onShowAll: () => void;
}

/**
 * The relationships of the reading: the lens selector, then bounded sub-groups for kinds, effects,
 * rows hidden by the lens, and line marks that no reader hides.
 * @param props The rows and how to change what draws.
 * @returns The section, or nothing when the reading has no line.
 */
function Relationships(props: RelationshipsProps): JSX.Element | null {
	const { rows, onHide, onShowAll } = props;
	const { kinds, effects } = rows;
	const hidden = props.leftOut > 0 || [...kinds, ...effects].some((row) => row.hidden);
	const action = useMemo(
		() =>
			hidden ? (
				<button
					type="button"
					data-slot="model-legend-show-all"
					onClick={onShowAll}
					className={PANEL_KEY}
				>
					Show all
				</button>
			) : undefined,
		[hidden, onShowAll],
	);
	const hideKinds = useCallback((ids: readonly string[]) => onHide("hideKinds", ids), [onHide]);
	const hideEffects = useCallback((ids: readonly string[]) => onHide("hideEffects", ids), [onHide]);
	if (kinds.length === 0) return null;
	return (
		<ModelPanel.Section
			icon={SECTION_ICONS.relationships}
			title="Relationships"
			slot="model-legend-lines-section"
			action={action}
		>
			{props.children}
			<li className="flex flex-col">
				<Switches
					label="Kinds"
					slot="model-legend-lines"
					field="kind"
					rows={kinds}
					onHide={hideKinds}
				/>
				<Switches
					label="Effects"
					slot="model-legend-effects"
					field="effect"
					rows={effects}
					onHide={hideEffects}
				/>
				<LeftOut lensName={props.lensName} kinds={kinds} effects={effects} />
				<Marks marks={props.marks} standings={props.standings} />
			</li>
		</ModelPanel.Section>
	);
}

/**
 * One bounded sub-group inside Relationships, with a muted sentence-case heading and a hairline
 * rule between groups so each group stays unambiguous.
 * @param props The heading and its rows.
 * @param props.label The sub-group heading.
 * @param props.children The list of entries.
 * @returns The sub-group.
 */
function RelationshipGroup(props: {
	readonly label: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<div className="not-first:border-border/65 flex flex-col not-first:mt-3 not-first:border-t not-first:pt-2.5">
			<h5 title={props.label} className="text-body text-muted-foreground mb-1 truncate font-medium">
				{props.label}
			</h5>
			{props.children}
		</div>
	);
}

/**
 * The sample of a relationship row: a kind's line in its ink, or an effect's line with its head.
 * @param props The row.
 * @param props.row A kind or an effect.
 * @returns The sample.
 */
function RowSample(props: { readonly row: LegendKind | LegendEffect }): JSX.Element {
	const { row } = props;
	return "entry" in row ? (
		<EffectSample entry={row.entry} width={SAMPLE_WIDTH} />
	) : (
		<KindSample color={row.color} dash={row.dash} width={SAMPLE_WIDTH} />
	);
}

/**
 * The kinds or the effects a reader can switch, one to a row.
 * @param props The rows and how to hide some of them.
 * @param props.label The sub-group heading.
 * @param props.slot Where a test finds the list.
 * @param props.field Whether the rows are kinds or effects.
 * @param props.rows The rows, those the lens leaves out among them.
 * @param props.onHide Hide these rows and show the rest of the list.
 * @returns The list, or nothing when the lens leaves out every row.
 */
function Switches(props: {
	readonly label: string;
	readonly slot: string;
	readonly field: "kind" | "effect";
	readonly rows: readonly (LegendKind | LegendEffect)[];
	readonly onHide: (ids: readonly string[]) => void;
}): JSX.Element | null {
	const { label, rows, field, onHide } = props;
	const shown = rows.filter((row) => !row.leftOut);
	if (shown.length === 0) return null;
	return (
		<RelationshipGroup label={label}>
			<ul data-slot={props.slot} className="flex flex-col">
				{shown.map((row) => (
					<SwitchRow key={row.id} row={row} field={field} rows={rows} onHide={onHide} />
				))}
			</ul>
		</RelationshipGroup>
	);
}

/**
 * The rows that the lens hides, dimmed under a heading naming the active lens, with no switch: only
 * another lens draws them.
 * @param props The rows.
 * @param props.lensName The name of the active lens.
 * @param props.kinds The kinds.
 * @param props.effects The effects.
 * @returns The list, or nothing when the lens hides no row.
 */
function LeftOut(props: {
	readonly lensName: string;
	readonly kinds: readonly LegendKind[];
	readonly effects: readonly LegendEffect[];
}): JSX.Element | null {
	const rows = [...props.kinds, ...props.effects].filter((row) => row.leftOut);
	if (rows.length === 0) return null;
	return (
		<RelationshipGroup label={`Hidden by ${props.lensName}`}>
			<ul data-slot="model-legend-left-out" className={CELLS}>
				{rows.map((row) => (
					<Cell key={`${"entry" in row ? "effect" : "kind"}:${row.id}`}>
						<Mark name={row.name} dimmed>
							<RowSample row={row} />
						</Mark>
					</Cell>
				))}
			</ul>
		</RelationshipGroup>
	);
}

/**
 * What lines wear beside their kinds and effects, in two columns with no switch: their emphasis,
 * their traffic, and the colours a comparison gives them.
 * @param props The marks.
 * @param props.marks Emphasis and traffic, where the reading has them.
 * @param props.standings The standings a comparison colours lines with.
 * @returns The list, or nothing when the reading has none.
 */
function Marks(props: {
	readonly marks: readonly LegendMark[];
	readonly standings: readonly LegendStanding[];
}): JSX.Element | null {
	const { marks, standings } = props;
	if (marks.length + standings.length === 0) return null;
	return (
		<RelationshipGroup label="Line marks">
			<ul data-slot="model-legend-marks" className={CELLS}>
				{marks.map(({ mark, word, dimmed }) => (
					<Cell key={mark}>
						<Mark name={word} dimmed={dimmed}>
							{mark === "emphasis" ? (
								<EmphasisSample width={SAMPLE_WIDTH} />
							) : (
								<TrafficSample width={SAMPLE_WIDTH} />
							)}
						</Mark>
					</Cell>
				))}
				{standings.map(({ standing, word }) => (
					<Cell key={standing}>
						<Mark name={word} dimmed={false}>
							<StandingLineSample standing={standing} width={SAMPLE_WIDTH} />
						</Mark>
					</Cell>
				))}
			</ul>
		</RelationshipGroup>
	);
}

/**
 * One entry: a mark and what it means.
 * @param props The entry.
 * @param props.children Its mark.
 * @returns The entry.
 */
function Cell(props: { readonly children: ReactNode }): JSX.Element {
	return <li className="flex min-h-7 min-w-0 items-center gap-2">{props.children}</li>;
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
	readonly dimmed: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	const { dimmed } = props;
	return (
		<>
			<span
				aria-hidden="true"
				className={cn("flex w-6 shrink-0 justify-center", dimmed && "opacity-40")}
			>
				{props.children}
			</span>
			<span
				title={props.name}
				className={cn(
					"text-control min-w-0 flex-1 truncate text-left font-normal",
					dimmed && "text-muted-foreground",
				)}
			>
				{props.name}
			</span>
		</>
	);
}

/**
 * A kind or an effect that a reader can switch. Its name shows it alone, or every row again when it
 * already stands alone, and the eye at its end shows or hides it. The row takes the panel's tone
 * under the pointer.
 * @param props The row, its list and how to hide rows of it.
 * @param props.row The row.
 * @param props.field Whether it is a kind or an effect.
 * @param props.rows Every row of its list.
 * @param props.onHide Hide these rows and show the rest of the list.
 * @returns The entry.
 */
function SwitchRow(props: {
	readonly row: LegendKind | LegendEffect;
	readonly field: "kind" | "effect";
	readonly rows: readonly LegendSwitch[];
	readonly onHide: (ids: readonly string[]) => void;
}): JSX.Element {
	const { row, field, rows, onHide } = props;
	const { id, name, hidden, dimmed } = row;
	const solo = useCallback((): void => onHide(soloed(rows, id)), [onHide, rows, id]);
	const toggle = useCallback((): void => onHide(toggled(rows, id)), [onHide, rows, id]);
	const Eye = hidden ? RiEyeOffLine : RiEyeLine;
	return (
		<li
			className={cn(
				rowTone({ lit: false }),
				"group -mx-2 flex min-w-0 items-center gap-2 px-2 transition-colors",
			)}
		>
			<button
				type="button"
				{...{ [`data-solo-${field}`]: id }}
				aria-label={`Show only ${name} lines`}
				title={`Show only ${name} lines`}
				onClick={solo}
				className="focus-visible:ring-ring rounded-control flex min-h-7 min-w-0 flex-1 items-center gap-2 outline-none focus-visible:ring-2"
			>
				<Mark name={name} dimmed={dimmed}>
					<RowSample row={row} />
				</Mark>
			</button>
			<button
				type="button"
				role="switch"
				aria-checked={!hidden}
				aria-label={`Show ${name} lines`}
				{...{ [`data-filter-${field}`]: id }}
				onClick={toggle}
				className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-control flex size-7 shrink-0 items-center justify-end outline-none focus-visible:ring-2"
			>
				{/* The glyph leaves 0.75px inside its box, so its ink ends where the panel's words end. */}
				<Eye aria-hidden="true" className="-mr-[0.75px] size-4" />
			</button>
		</li>
	);
}

/**
 * The groups of the reading, which close the legend.
 * @param props The groups.
 * @param props.groups One row for each.
 * @param props.selection The selection that their tags choose.
 * @returns Their tags, or nothing for a reading with no groups.
 */
function Groups(props: {
	readonly groups: readonly LegendGroup[];
	readonly selection: ModelSelection;
}): JSX.Element | null {
	const { groups, selection } = props;
	if (groups.length === 0) return null;
	return (
		<LegendList
			icon={SECTION_ICONS.groups}
			label="Groups"
			slot="model-legend-groups"
			className="flex flex-wrap gap-x-2 gap-y-2.5"
		>
			{groups.map((group) => (
				<GroupTag key={group.id} group={group} selection={selection} />
			))}
		</LegendList>
	);
}

/**
 * A group, as a tag with its name inside. It selects what the picture draws of the group, and it
 * reads as on while the selection is exactly that. A group whose parts a filter took off the
 * picture has nothing to select, so its tag stays, dimmed.
 * @param props The group.
 * @param props.group Its name, its colour and its parts.
 * @param props.selection The selection that it chooses.
 * @returns The tag.
 */
function GroupTag(props: {
	readonly group: LegendGroup;
	readonly selection: ModelSelection;
}): JSX.Element {
	const { group, selection } = props;
	const { color, parts } = group;
	const { ids, selectMany, clear } = selection;
	const held = parts.length === 0;
	const on = !held && parts.length === ids.size && parts.every((id) => ids.has(id));
	const style = useMemo<CSSProperties>(() => ({ "--tag": paletteTag(color) }), [color]);
	const choose = useCallback((): void => {
		if (on) clear();
		else selectMany(parts);
	}, [on, clear, selectMany, parts]);
	return (
		<li>
			<button
				type="button"
				data-group-id={group.id}
				aria-pressed={on}
				disabled={held}
				title={held ? "A filter hides its parts" : on ? "Clear the selection" : "Select its parts"}
				style={style}
				onClick={choose}
				className="group-tag text-technical block px-2 py-0.5 leading-4 whitespace-nowrap disabled:opacity-40"
			>
				{group.name}
			</button>
		</li>
	);
}

export { ModelLegend };

import { RiEyeLine, RiEyeOffLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useId,
	useRef,
	type JSX,
	type ReactNode,
	type RefObject,
} from "react";
import { LINE_MARKS } from "@archboard/renderer/picture";
import type { Model, ModelFilters, projectModel } from "@archboard/board/content";
import { cn } from "@archboard/ui-kit/components";
import { SemanticGroupChip } from "#ui/components/semantic-board-canvas/SemanticGroupChip.tsx";
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

type Field = "hideKinds" | "showGroups";

/** How wide every line's sample is, so that the names start on one line. */
const SAMPLE_WIDTH = 28;

/** How a kind looks when the vault's policy no longer names it. */
const UNKNOWN_KIND = { color: "neutral", dash: "solid", arrowhead: "filled" } as const;

/** Inputs for the Key. */
interface ModelKeyProps {
	readonly model: Model;
	readonly projection: ReturnType<typeof projectModel>;
	/** What the picture draws, or null while it draws nothing that a key explains. */
	readonly picture: PictureKey | null;
	readonly filters: ModelFilters;
	readonly onToggle: (field: Field, id: string) => void;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

/**
 * The one entry point to what the marks of a picture mean and which of them it draws. A mark
 * explains, and the control at the end of its row changes the reading. It stands at the picture's
 * lower left, so it needs no placing, and it says how many kinds the picture leaves out.
 * @param props The reading and its visibility choices.
 * @returns The control, with the Key above it while it is open.
 */
function ModelKey(props: ModelKeyProps): JSX.Element {
	const { open, onOpenChange } = props;
	const root = useRef<HTMLDivElement>(null);
	const id = useId();
	const close = useCallback((): void => onOpenChange(false), [onOpenChange]);
	const toggle = useCallback((): void => onOpenChange(!open), [onOpenChange, open]);
	useDismiss(root, open, close);
	const hidden = props.filters.hideKinds?.length ?? 0;
	return (
		<div ref={root} className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2">
			{open && <KeySheet {...props} id={id} />}
			<button
				type="button"
				data-slot="model-key"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				onClick={toggle}
				className="text-control bg-card border-border shadow-raised hover:bg-muted rounded-control border px-3 py-1.5"
			>
				Key
				{hidden > 0 && (
					<span data-slot="model-key-hidden" className="text-muted-foreground font-normal">
						{" "}
						· {hidden} hidden
					</span>
				)}
			</button>
		</div>
	);
}

/**
 * Close on a press outside and on Escape, which then reaches nothing else, so the selection stays.
 * @param root What counts as inside.
 * @param open Whether it is open.
 * @param close Close it.
 */
function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
	useEffect(() => {
		if (!open) return undefined;
		/**
		 * Close on a press that lands outside.
		 * @param event The press.
		 */
		const press = (event: PointerEvent): void => {
			if (event.target instanceof Node && root.current?.contains(event.target) !== true) close();
		};
		/**
		 * Take Escape before the reading does.
		 * @param event The key.
		 */
		const key = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			close();
		};
		document.addEventListener("pointerdown", press, true);
		document.addEventListener("keydown", key, true);
		return (): void => {
			document.removeEventListener("pointerdown", press, true);
			document.removeEventListener("keydown", key, true);
		};
	}, [root, open, close]);
}

/**
 * What the Key says of the picture on screen: its cards, its lines, and its group regions.
 * @param props The reading.
 * @returns The sheet.
 */
function KeySheet(props: ModelKeyProps & { readonly id: string }): JSX.Element {
	const { picture, projection, filters } = props;
	const groups = groupsOf(projection, filters);
	const lines = lineKinds(props);
	const kinds = picture?.kinds ?? [];
	return (
		<section
			id={props.id}
			aria-label="Key"
			data-slot="model-key-sheet"
			className="bg-popover text-popover-foreground border-border shadow-float rounded-panel [container-type:normal] flex max-h-[calc(100cqh-4rem)] w-72 flex-col gap-4 overflow-y-auto border p-3"
		>
			{kinds.length > 0 && (
				<KeySection title="Cards">
					{kinds.map((item) => (
						<KeyRow key={item.id}>
							<KeyMark name={item.typeName}>
								<TypeSample appearance={item} className="size-5 [&>svg]:size-3.5" />
							</KeyMark>
						</KeyRow>
					))}
				</KeySection>
			)}
			<KeySection title="Lines">
				{lines.map((item) => (
					<LineRow key={item.item.id} {...props} {...item} />
				))}
				{LINE_MARKS.map(({ mark, word }) => (
					<KeyRow key={mark}>
						<KeyMark name={word}>
							{mark === "emphasis" ? (
								<EmphasisSample width={SAMPLE_WIDTH} />
							) : (
								<TrafficSample width={SAMPLE_WIDTH} />
							)}
						</KeyMark>
					</KeyRow>
				))}
			</KeySection>
			{groups.length > 0 && (
				<KeySection title="Group regions">
					{groups.map((id) => (
						<GroupRow key={id} {...props} id={id} />
					))}
				</KeySection>
			)}
		</section>
	);
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

/** One row of the Key's lines. */
interface LineKind {
	readonly item: AppliedAppearance;
	/** Whether a reader left it out. */
	readonly hidden: boolean;
	/** Whether a reader can leave it out: a mixed line is no kind of relationship. */
	readonly hideable: boolean;
}

/**
 * What a reader can meet on this picture's lines: what it draws, then each kind that it does not
 * draw on a line of its own, because it lies inside a mixed line or a reader left it out.
 * @param props The reading.
 * @returns The rows, hidden kinds last.
 */
function lineKinds(props: ModelKeyProps): readonly LineKind[] {
	const { model, picture, projection, filters } = props;
	const hide = new Set(filters.hideKinds);
	const joined = projection.allConnections.flatMap(({ joins }) => joins.map((edge) => edge.kind));
	const kinds = new Set([...joined, ...hide]);
	const drawn = picture?.relationships ?? [];
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
 * The groups that reach this picture, and any that a reader has shown.
 * @param projection What it draws.
 * @param filters The visibility choices.
 * @returns Their identities, without duplicates.
 */
function groupsOf(
	projection: ModelKeyProps["projection"],
	filters: ModelFilters,
): readonly string[] {
	const drawn = [...projection.children, ...projection.context].flatMap(
		(module) => module.groups ?? [],
	);
	return [...new Set([...drawn, ...(filters.showGroups ?? [])])];
}

/**
 * A heading and its rows.
 * @param props The section.
 * @param props.title What it keys.
 * @param props.children Its rows.
 * @returns The section.
 */
function KeySection(props: { readonly title: string; readonly children: ReactNode }): JSX.Element {
	return (
		<section aria-label={props.title} className="flex flex-col gap-1">
			<h3 className="text-body text-muted-foreground font-semibold">{props.title}</h3>
			<ul className="flex flex-col">{props.children}</ul>
		</section>
	);
}

/**
 * One entry: a mark and what it means, then the control that changes the reading, if it has one.
 * @param props The entry.
 * @param props.children Its mark and control.
 * @returns The row.
 */
function KeyRow(props: { readonly children: ReactNode }): JSX.Element {
	return <li className="flex min-h-7 items-center gap-2.5">{props.children}</li>;
}

/**
 * A mark, as the picture draws it, and what it means.
 * @param props The mark.
 * @param props.name What it means.
 * @param props.dimmed Whether the picture leaves it out.
 * @param props.children The mark.
 * @returns The two.
 */
function KeyMark(props: {
	readonly name: string;
	readonly dimmed?: boolean | undefined;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<>
			<span
				aria-hidden="true"
				className={cn("flex w-7 shrink-0 justify-center", props.dimmed === true && "opacity-40")}
			>
				{props.children}
			</span>
			<span
				className={cn(
					"text-control min-w-0 flex-1 font-normal",
					props.dimmed === true && "text-muted-foreground",
				)}
			>
				{props.name}
			</span>
		</>
	);
}

/**
 * A relationship kind, whether the picture draws it or leaves it out.
 * @param props The kind and how to change its visibility.
 * @returns The row.
 */
function LineRow(props: ModelKeyProps & LineKind): JSX.Element {
	const { item, hidden, hideable, onToggle } = props;
	const toggle = useCallback(
		(): void => onToggle("hideKinds", item.typeKind),
		[onToggle, item.typeKind],
	);
	return (
		<KeyRow>
			<KeyMark name={item.typeName} dimmed={hidden}>
				<RelationshipSample appearance={item} width={SAMPLE_WIDTH} />
			</KeyMark>
			{hideable && (
				<Visibility
					shown={!hidden}
					name={`${item.typeName} lines`}
					kind={item.typeKind}
					onToggle={toggle}
				/>
			)}
		</KeyRow>
	);
}

/**
 * A group's region, which the picture draws only when a reader turns it on.
 * @param props The group and how to change its visibility.
 * @returns The row.
 */
function GroupRow(props: ModelKeyProps & { readonly id: string }): JSX.Element {
	const { id, model, filters, onToggle } = props;
	const group = model.policy.groups[id];
	const toggle = useCallback((): void => onToggle("showGroups", id), [onToggle, id]);
	const shown = filters.showGroups?.includes(id) === true;
	const name = group?.name ?? id;
	return (
		<KeyRow>
			<KeyMark name={name} dimmed={!shown}>
				<SemanticGroupChip color={group?.color} selected={false} />
			</KeyMark>
			<Visibility shown={shown} name={`${name} region`} group={id} onToggle={toggle} />
		</KeyRow>
	);
}

/**
 * The control that says whether the picture draws something, apart from the mark that explains it.
 * @param props What it controls.
 * @param props.shown Whether the picture draws it.
 * @param props.name What it is called.
 * @param props.kind The relationship kind it controls.
 * @param props.group The group it controls.
 * @param props.onToggle Change it.
 * @returns A switch.
 */
function Visibility(props: {
	readonly shown: boolean;
	readonly name: string;
	readonly kind?: string | undefined;
	readonly group?: string | undefined;
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
			data-filter-group={props.group}
			onClick={props.onToggle}
			className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-control aria-checked:text-foreground flex size-7 shrink-0 items-center justify-center"
		>
			{shown ? (
				<RiEyeLine aria-hidden="true" className="size-4" />
			) : (
				<RiEyeOffLine aria-hidden="true" className="size-4" />
			)}
		</button>
	);
}

export { ModelKey };

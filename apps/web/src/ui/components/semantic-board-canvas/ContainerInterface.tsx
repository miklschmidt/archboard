// What a picked container offers the parts outside it: its entry points, how
// many of its parts are hidden, and who calls it (ADR 0044).
//
// Nothing here is stored or worked out a second time. The shared model's
// `inspectContainer` derives the interface from the content of the variant on
// screen, the same function `semantic inspect` answers with, so the pane and
// the CLI cannot disagree about a container. A pass-through entry point is said
// in words on its row; the picture draws no mark for it.

import { useCallback, useMemo, type JSX, type ReactNode } from "react";

import { inspectContainer } from "@archboard/board/container-interface";
import type { SemanticNode, VariantContent } from "@archboard/board/content";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarHeading,
	SidebarLabel,
	SidebarMeta,
	SidebarRegion,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { usePeekControl } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

type Derived = Extract<ReturnType<typeof inspectContainer>, { holdsParts: true }>;
type Caller = Derived["callers"][number];

/** Inputs for the interface. */
interface ContainerInterfaceProps {
	/** What the variant on screen says, whole, before any view narrows it. */
	readonly content: VariantContent;
	/** The picked part. */
	readonly node: SemanticNode;
	readonly look: KindLook;
	/**
	 * Pick another part out: an entry point or a caller.
	 * @param id The part.
	 */
	readonly onPick: (id: string) => void;
}

/**
 * The interface of a picked part that holds parts, or nothing for one that
 * holds none: a part with no children has no interface, which is not an
 * interface of nothing.
 * @param props The variant, the part and what to do with a pick.
 * @returns The region, or nothing.
 */
function ContainerInterface(props: ContainerInterfaceProps): JSX.Element | null {
	const { content, node, look, onPick } = props;
	const inspection = useMemo(() => inspectContainer(content, node), [content, node]);
	if (!inspection.holdsParts) {
		return null;
	}
	const { measures } = inspection;
	return (
		<SidebarRegion slot="semantic-inspector-interface">
			<Measure
				title="Entry points"
				count={measures.entryPoints}
				slot="semantic-inspector-entry-points"
			>
				{measures.entryPoints > 0 && (
					<SidebarChoices label="Entry points" slot="semantic-inspector-entry-point-list">
						{inspection.entryPoints.map(({ node: entry }) => (
							<PartRow
								key={entry.id}
								part={entry}
								slot="semantic-inspector-entry-point"
								look={look}
								onPick={onPick}
								note={passesThrough(inspection, entry.id) ? "passes one call on" : undefined}
							/>
						))}
					</SidebarChoices>
				)}
			</Measure>
			<Measure
				title="Hidden parts"
				count={measures.hiddenParts}
				slot="semantic-inspector-hidden-parts"
			/>
			<Measure title="Callers" count={measures.callers} slot="semantic-inspector-callers">
				{measures.callers === 0 ? (
					<p className="text-muted-foreground text-body">No part on this board calls it.</p>
				) : (
					<SidebarChoices label="Callers" slot="semantic-inspector-caller-list">
						{inspection.callers.map((caller) => (
							<PartRow
								key={caller.node.id}
								part={caller.node}
								slot="semantic-inspector-caller"
								look={look}
								onPick={onPick}
								note={whatItReaches(caller, inspection)}
							/>
						))}
					</SidebarChoices>
				)}
			</Measure>
		</SidebarRegion>
	);
}

/** Inputs for one measure. */
interface MeasureProps {
	readonly title: string;
	readonly count: number;
	/** Where tests and styles find it. */
	readonly slot: string;
	/** The parts behind the count, when the measure lists them. */
	readonly children?: ReactNode;
}

/**
 * One interface measure: its name and its count, then the parts behind it.
 * @param props The measure.
 * @returns The section.
 */
function Measure(props: MeasureProps): JSX.Element {
	return (
		<section
			data-slot={props.slot}
			data-count={props.count}
			aria-label={props.title}
			className="flex flex-col gap-1"
		>
			<SidebarHeading level={3}>
				{props.title}{" "}
				<span className="text-technical ml-0.5 font-mono font-normal">{props.count}</span>
			</SidebarHeading>
			{props.children}
		</section>
	);
}

/** Inputs for one part of the interface. */
interface PartRowProps {
	readonly part: SemanticNode;
	readonly slot: string;
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
	/** A quiet line under the name, when there is something to add. */
	readonly note: string | undefined;
}

/**
 * One part the interface names, as the choice that picks it out. Pointing at
 * it, or focusing it, lights the part on the picture.
 * @param props The part and what to do with a pick.
 * @returns The row.
 */
function PartRow(props: PartRowProps): JSX.Element {
	const { part, look, onPick, note } = props;
	const { point } = usePeekControl();
	const aim = useCallback((): void => point(part.id), [point, part.id]);
	const leave = useCallback((): void => point(null), [point]);
	const choose = useCallback((): void => onPick(part.id), [onPick, part.id]);
	return (
		<SidebarChoice
			data-slot={props.slot}
			data-part={part.id}
			onClick={choose}
			onPointerEnter={aim}
			onPointerLeave={leave}
			onFocus={aim}
			onBlur={leave}
		>
			<SidebarGlyph>
				<KindIcon look={look} kind={part.kind} className="text-foreground/80 size-4" />
			</SidebarGlyph>
			<SidebarLabel>
				{part.name}
				{note !== undefined && <SidebarMeta>{note}</SidebarMeta>}
			</SidebarLabel>
		</SidebarChoice>
	);
}

/**
 * Whether an entry point only passes one call on.
 * @param inspection The interface.
 * @param id The entry point.
 * @returns True when the derivation names it a pass-through.
 */
function passesThrough(inspection: Derived, id: string): boolean {
	return inspection.passThrough.some((node) => node.id === id);
}

/**
 * What a caller reaches, in words: the entry points it calls, and the
 * container itself when a relationship of its ends there and names no part.
 * @param caller The caller.
 * @param inspection The interface it calls.
 * @returns The line.
 */
function whatItReaches(caller: Caller, inspection: Derived): string {
	const reached = inspection.entryPoints
		.filter(({ node }) => caller.reaches.includes(node.id))
		.map(({ node }) => node.name);
	const container = inspection.container;
	if (caller.edges.some((edge) => edge.to === container.id)) {
		reached.push(`${container.name} itself`);
	}
	return `to ${reached.join(", ")}`;
}

export { ContainerInterface };

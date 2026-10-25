// What a proposal changed about each container's interface, said first
// (TASK-538.01). An interface change costs every caller and an implementation
// change costs one module, so the Board tab lists the containers whose
// interface moved before it counts what changed (ADR 0044), as `semantic
// compare` does. Each part is named with how it moved. A row lights its part
// while the pointer rests on it and shows it on the picture when chosen. Nothing
// here sets a comparison status.

import { useCallback, type JSX } from "react";

import type { InterfaceChange } from "@archboard/board/container-interface";
import type { SemanticNode } from "@archboard/board/content";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarHeading,
	SidebarLabel,
	SidebarMeta,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { usePeekControl } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import {
	movedParts,
	type InterfaceMove,
} from "#ui/rules/semantic-board-canvas/board/interface-changes.ts";

/** How each move is said under the part's name. */
const MOVE_WORDS: Readonly<Record<InterfaceMove, string>> = {
	entryPointsAdded: "entry point added",
	entryPointsRemoved: "entry point removed",
	becameEntryPoints: "now an entry point",
	becameHidden: "now hidden",
	callersGained: "caller gained",
	callersLost: "caller lost",
};

/** Inputs for the interface changes. */
interface InterfaceChangesProps {
	/** The containers whose interface changed, in the order the variants list them. */
	readonly changed: readonly InterfaceChange[];
	readonly look: KindLook;
	/**
	 * Pick a part out and show it on the picture.
	 * @param id The part.
	 */
	readonly onShow: (id: string) => void;
}

/**
 * The containers whose interface the variant on screen changed.
 * @param props The changes, and what showing a part does.
 * @returns The section.
 */
function InterfaceChanges(props: InterfaceChangesProps): JSX.Element {
	const { changed } = props;
	return (
		<section
			data-slot="semantic-interface-changes"
			data-count={changed.length}
			aria-label="Interface changes"
			className="flex flex-col gap-1"
		>
			<SidebarHeading level={3}>
				Interface changes{" "}
				<span className="text-technical ml-0.5 font-mono font-normal">{changed.length}</span>
			</SidebarHeading>
			{changed.length === 0 ? (
				<p data-slot="semantic-interface-unchanged" className="text-body text-muted-foreground">
					No container&apos;s interface changed.
				</p>
			) : (
				changed.map((change) => (
					<ContainerChange key={change.container.id} change={change} {...props} />
				))
			)}
		</section>
	);
}

/** Inputs for one container's change. */
interface ContainerChangeProps extends InterfaceChangesProps {
	readonly change: InterfaceChange;
}

/**
 * One container whose interface changed, and each part that moved in it.
 * @param props The change.
 * @returns The list.
 */
function ContainerChange(props: ContainerChangeProps): JSX.Element {
	const { change } = props;
	const { container, holdsParts } = change;
	const sided = holdsParts.after === holdsParts.before ? null : holdsParts.after;
	return (
		<SidebarChoices
			label={`What changed about the interface of ${container.name}`}
			slot="semantic-interface-change"
		>
			<PartRow
				{...props}
				part={container}
				slot="semantic-interface-container"
				meta={sided === null ? null : sided ? "new container" : "holds no parts now"}
			/>
			{/* Each part that moved sits under its container, its mark under the container's name. */}
			<div className="flex flex-col pl-6">
				{movedParts(change).map(({ part, move }) => (
					<PartRow
						key={`${move}:${part.id}`}
						{...props}
						part={part}
						slot="semantic-interface-move"
						move={move}
						meta={MOVE_WORDS[move]}
					/>
				))}
			</div>
		</SidebarChoices>
	);
}

/** Inputs for one row. */
interface PartRowProps extends InterfaceChangesProps {
	readonly part: SemanticNode;
	readonly slot: string;
	/** How the part moved, or none for the container itself. */
	readonly move?: InterfaceMove;
	/** What is said under the name, if anything. */
	readonly meta: string | null;
}

/**
 * One part: the choice that shows it on the picture.
 * @param props The part, and what is said about it.
 * @returns The row.
 */
function PartRow(props: PartRowProps): JSX.Element {
	const { part, look, onShow, meta } = props;
	const { point } = usePeekControl();
	const aim = useCallback((): void => point(part.id), [point, part.id]);
	const leave = useCallback((): void => point(null), [point]);
	const show = useCallback((): void => onShow(part.id), [onShow, part.id]);
	return (
		<SidebarChoice
			data-slot={props.slot}
			data-part={part.id}
			data-move={props.move}
			onClick={show}
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
				{meta !== null && <SidebarMeta>{meta}</SidebarMeta>}
			</SidebarLabel>
		</SidebarChoice>
	);
}

export { InterfaceChanges };

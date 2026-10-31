// The table of About: the look that the parts, the nearby modules and the connections share.
// The head names the columns of the rows under it, and each row ends in the control that shows
// its subject on the diagram.

import { RiFocus3Line } from "@remixicon/react";
import { useMemo, type CSSProperties, type JSX, type ReactNode } from "react";

import { cn, IconButton } from "@archboard/ui-kit/components";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/**
 * The names of a list's columns, over the columns of its rows: as wide as a row's cells, short of
 * the control at the row's end. Assistive technology reads each row whole, so the names are for
 * the eye.
 * @param props The columns, and their names.
 * @param props.grid The columns the rows lay their cells in.
 * @param props.children The names.
 * @returns The head.
 */
function TableHead(props: { readonly grid: string; readonly children: ReactNode }): JSX.Element {
	return (
		<div aria-hidden="true" className="flex">
			<div className={cn(props.grid, "text-body text-muted-foreground h-row flex-1 font-semibold")}>
				{props.children}
			</div>
			<span className="w-11 shrink-0" />
		</div>
	);
}

/**
 * The gold mark on the edge of a row that is picked out, as the left column marks what is open.
 * @returns The mark.
 */
function PickedMark(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="bg-primary-mark absolute inset-y-1 left-0 w-0.5 rounded-full"
		/>
	);
}

/**
 * The control at the end of a row that picks its subject and shows it on the diagram.
 * @param props What the subject is called, and the way to show it.
 * @param props.name What the subject is called.
 * @param props.onShow Pick it out and show it on the diagram.
 * @returns The control.
 */
function ShowOnDiagram(props: { readonly name: string; readonly onShow: () => void }): JSX.Element {
	return (
		<span className="flex w-11 shrink-0 items-start justify-center py-2">
			<IconButton
				label={`Show ${props.name} on the diagram`}
				tip="Show on the diagram"
				slot="about-show"
				className="text-muted-foreground hover:text-foreground"
				onClick={props.onShow}
			>
				<RiFocus3Line />
			</IconButton>
		</span>
	);
}

/**
 * A kind's chip: its icon in its colour.
 * @param props The kind, and how kinds look.
 * @param props.kind The kind.
 * @param props.look How the vault's kinds look.
 * @returns The chip.
 */
function KindChip(props: { readonly kind: string; readonly look: KindLook }): JSX.Element {
	const { kind, look } = props;
	const ink = useMemo<CSSProperties>(() => ({ "--kind": look.nodeColor(kind) }), [look, kind]);
	return (
		<span
			aria-hidden="true"
			className="inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-(color:--kind)/45 bg-(color:--kind)/14 text-(color:--kind)"
			style={ink}
		>
			<KindIcon look={look} kind={kind} className="size-4" />
		</span>
	);
}

const ModelAboutTable = { Head: TableHead, Picked: PickedMark, Show: ShowOnDiagram };

export { KindChip, ModelAboutTable };

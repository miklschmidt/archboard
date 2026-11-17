import { useCallback, type JSX, type MouseEvent } from "react";
import { Button, cn } from "@archboard/ui-kit/components";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { KindChip } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import { EmptyList } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/EmptyList.tsx";
import {
	commitsOf,
	footprintLists,
	type FootprintList,
	type FootprintModule,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/footprint-lists.ts";
import {
	footprintShow,
	type FootprintShow,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/show-on-picture.ts";
import { rowTone } from "#ui/shell/rules/row-tone.ts";

/** Inputs for the lists. */
interface FootprintListsProps {
	readonly answer: BranchFootprintAnswer;
	/** How kinds look, for each module's chip. */
	readonly look: KindLook;
	/**
	 * The kind of each module of the model that the footprint reads and of the reading on screen. A
	 * module that only a proposal adds has none.
	 */
	readonly kinds: ReadonlyMap<string, string>;
	/** The module selected on the picture, or null. */
	readonly selected: string | null;
	/** Select a module on its picture, here or in the other pane. */
	readonly onChoose: (id: string, beside: boolean) => void;
	/** Show a list on its picture. */
	readonly onShow: (target: FootprintShow) => void;
}

/**
 * The modules a footprint lists, one card for each list, side by side in a well. A card's modules
 * scroll inside it. A row selects its module on its picture, beside the reading with Alt, as a row
 * of the other Measures tables does.
 * @param props The answer and what a row does.
 * @returns The lists.
 */
function FootprintLists(props: FootprintListsProps): JSX.Element {
	const lists = footprintLists(props.answer);
	return (
		<div
			data-slot="footprint-lists"
			className={cn(
				"bg-tray-sink shadow-well rounded-panel grid min-h-40 flex-1 gap-1.5 overflow-y-auto p-1.5",
				lists.length > 1 && "md:grid-cols-3 md:overflow-hidden",
			)}
		>
			{lists.map((list) => (
				<ListCard key={list.key} {...props} list={list} />
			))}
		</div>
	);
}

/**
 * One list: its name and count, its modules, the question it asks, and the key that shows it on
 * its picture, or what its emptiness means. The list of work outside the plan takes the changed
 * tone while it holds modules.
 * @param props The list and what a row does.
 * @returns The card.
 */
function ListCard(props: FootprintListsProps & { readonly list: FootprintList }): JSX.Element {
	const { answer, list, onShow } = props;
	const heading = `footprint-list-${list.key}`;
	// An empty list outside the plan is good news, so only a list that holds modules takes the tone.
	const alarm = list.outside && list.modules.length > 0;
	const show = useCallback(
		(): void =>
			onShow(
				footprintShow(
					answer,
					list.modules.map((module) => module.subject.id),
				),
			),
		[answer, list.modules, onShow],
	);
	return (
		<section
			data-footprint-list={list.key}
			aria-labelledby={heading}
			className={cn(
				"rounded-control shadow-raised flex flex-col gap-3.5 p-3.5 inset-ring md:min-h-0",
				alarm
					? "inset-ring-standing-changed/45 bg-[color-mix(in_srgb,var(--standing-changed)_6%,var(--face))]"
					: "bg-face inset-ring-border",
			)}
		>
			<header className="flex items-baseline justify-between gap-3">
				<h3
					id={heading}
					className={cn("text-control font-semibold", alarm && "text-standing-changed")}
				>
					{list.label}
				</h3>
				<span className="text-technical text-muted-foreground font-mono">
					{list.modules.length}
				</span>
			</header>
			{list.modules.length === 0 ? (
				<EmptyList list={list} />
			) : (
				<>
					<ul className="-mx-1.5 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
						{list.modules.map((module) => (
							<ModuleRow key={module.subject.id} {...props} module={module} />
						))}
					</ul>
					<footer className="mt-auto flex flex-col items-start gap-2.5">
						<p className="text-body text-muted-foreground">{list.note}</p>
						<Button variant="outline" size="xs" data-footprint-show={list.key} onClick={show}>
							Show on picture
						</Button>
					</footer>
				</>
			)}
		</section>
	);
}

/**
 * One module of a list: its kind's chip and its name. The lines under the cards count the commits.
 * @param props The module and what choosing it does.
 * @returns The row.
 */
function ModuleRow(props: FootprintListsProps & { readonly module: FootprintModule }): JSX.Element {
	const { answer, module, look, kinds, selected, onChoose } = props;
	const { id, name } = module.subject;
	const kind = kinds.get(id);
	const commits = commitsOf(answer, module);
	const choose = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => onChoose(id, event.altKey),
		[id, onChoose],
	);
	return (
		<li data-footprint-module={id} data-commits={commits.length}>
			<button
				type="button"
				title={name}
				onClick={choose}
				className={cn(
					rowTone({ lit: id === selected }),
					"flex min-h-9 w-full items-center gap-2.5 px-1.5 py-1 text-left",
				)}
			>
				{kind === undefined ? (
					<span aria-hidden="true" className="size-6 shrink-0" />
				) : (
					<KindChip look={look} kind={kind} />
				)}
				<span className="text-control min-w-0 flex-1 truncate">{name}</span>
			</button>
		</li>
	);
}

export { FootprintLists };

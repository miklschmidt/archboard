import { useCallback, type JSX, type MouseEvent } from "react";
import { cn } from "@archboard/ui-kit/components";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import {
	commitsOf,
	footprintLists,
	namedWords,
	type FootprintList,
	type FootprintModule,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/footprint-lists.ts";
import { rowTone } from "#ui/shell/rules/row-tone.ts";

/** Inputs for the lists. */
interface FootprintListsProps {
	readonly answer: BranchFootprintAnswer;
	/** The module selected on the picture, or null. */
	readonly selected: string | null;
	/** Select a module on its picture, here or in the other pane. */
	readonly onChoose: (id: string, beside: boolean) => void;
}

/**
 * The modules a footprint lists, one section for each list, in a well that scrolls. A row selects
 * its module on its picture, beside the reading with Alt, as a row of the other Measures tables does.
 * @param props The answer and what a row does.
 * @returns The lists.
 */
function FootprintLists(props: FootprintListsProps): JSX.Element {
	const { answer } = props;
	return (
		<div
			data-slot="footprint-lists"
			className="bg-tray-sink shadow-well rounded-panel flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3"
		>
			{footprintLists(answer).map((list) => (
				<ListSection key={list.key} {...props} list={list} />
			))}
		</div>
	);
}

/**
 * One list: its name, its count, what it holds, and its rows.
 * @param props The list and what a row does.
 * @returns The section.
 */
function ListSection(props: FootprintListsProps & { readonly list: FootprintList }): JSX.Element {
	const { list } = props;
	const heading = `footprint-list-${list.key}`;
	return (
		<section
			data-footprint-list={list.key}
			aria-labelledby={heading}
			className="flex flex-col gap-1"
		>
			<header className="flex items-baseline gap-2">
				<h3 id={heading} className="text-title">
					{list.label}
				</h3>
				<span className="text-technical text-muted-foreground font-mono">
					{list.modules.length}
				</span>
			</header>
			<p className="text-body text-muted-foreground">{list.gloss}</p>
			{list.modules.length === 0 ? (
				<p className="text-body text-muted-foreground">None.</p>
			) : (
				<ul className="flex flex-col">
					{list.modules.map((module) => (
						<ModuleRow key={module.subject.id} {...props} module={module} />
					))}
				</ul>
			)}
		</section>
	);
}

/**
 * One module of a list: its name, its commits, why the plan names it, and the changed modules
 * that it holds.
 * @param props The module and what choosing it does.
 * @returns The row.
 */
function ModuleRow(props: FootprintListsProps & { readonly module: FootprintModule }): JSX.Element {
	const { answer, module, selected, onChoose } = props;
	const { id, name } = module.subject;
	const commits = commitsOf(answer, module);
	const large = commits.filter((one) => one.large).length;
	const choose = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => onChoose(id, event.altKey),
		[id, onChoose],
	);
	return (
		<li data-footprint-module={id}>
			<button
				type="button"
				onClick={choose}
				className={cn(
					rowTone({ lit: id === selected }),
					"flex min-h-9 w-full items-center gap-3 px-2 py-1 text-left",
				)}
			>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="text-control truncate">{name}</span>
					<span className="text-body text-muted-foreground truncate">{detailOf(module)}</span>
				</span>
				{commits.length > 0 && (
					<span className="text-technical text-muted-foreground shrink-0 font-mono">
						{commits.length} {commits.length === 1 ? "commit" : "commits"}
						{large > 0 && `, ${large} large`}
					</span>
				)}
			</button>
		</li>
	);
}

/**
 * What a row says under a module's name: why the plan names it and what it holds.
 * @param module The module.
 * @returns The words, or its bound path when there is nothing else to say.
 */
function detailOf(module: FootprintModule): string {
	const words = namedWords(module.named);
	if (module.holds.length > 0)
		words.push(
			`holds ${module.holds.length} changed ${module.holds.length === 1 ? "module" : "modules"}`,
		);
	return words.length === 0 ? module.path : words.join("; ");
}

export { FootprintLists };

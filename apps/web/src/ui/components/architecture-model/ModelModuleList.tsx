import type { JSX } from "react";
import type { Model, projectModel } from "@archboard/board/content";
import type { ChangeKind } from "@archboard/board/comparison";
import { KindChip, PickedMark } from "#ui/components/semantic-board-canvas/AboutParts.tsx";
import { StandingSample } from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

type Projection = ReturnType<typeof projectModel>;

/**
 * A list of the modules of a reading. A row selects, and the page stays, so a person builds a
 * selection here from the keyboard: Enter selects a row, and a modifier with Enter adds it.
 * @param props The modules and the canonical selection.
 * @param props.model The complete model.
 * @param props.projection The reading.
 * @param props.modules The modules to list.
 * @param props.selection The immediate selection actions.
 * @param props.look How the vault's kinds look.
 * @param props.slot Where a test finds the list.
 * @returns The list.
 */
function ModelModuleList(props: {
	model: Model;
	projection: Projection;
	modules: Projection["children"];
	selection: ModelSelection;
	look: KindLook;
	slot: string;
}): JSX.Element {
	const { projection, selection, look } = props;
	return (
		<ul data-slot={props.slot} className="border-border -mx-3 border-t">
			{props.modules.map((entry) => (
				<ModuleRow
					key={entry.id}
					module={entry}
					look={look}
					selected={selection.ids.has(entry.id)}
					standing={projection.standing?.[entry.id]}
					onSelect={selection.select}
				/>
			))}
		</ul>
	);
}

interface ModuleRowProps {
	module: Projection["children"][number];
	look: KindLook;
	selected: boolean;
	standing: ChangeKind | undefined;
	onSelect: ModelSelection["select"];
}

/**
 * A native button keeps each module reachable from the keyboard.
 * @param props The module, its selection state, and the selection action.
 * @returns One row.
 */
function ModuleRow(props: ModuleRowProps): JSX.Element {
	const { module, look, onSelect } = props;
	const { id } = module;
	const pick = useModelPick(id, onSelect);
	return (
		<li className="border-border hover:bg-muted/50 has-aria-pressed:bg-sidebar-accent relative flex min-w-0 border-b">
			{props.selected && <PickedMark />}
			<button
				type="button"
				data-module-id={id}
				data-standing={props.standing}
				aria-pressed={props.selected}
				{...pick}
				className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-x-6 gap-y-1.5 px-3 py-2.5 text-left"
			>
				<span className="flex min-w-0 items-start gap-2.5">
					<KindChip look={look} kind={module.kind} />
					<span className="flex min-w-0 flex-col">
						<span className="text-control flex items-center gap-2 leading-6">
							<span data-slot="model-module-name" className="min-w-0 [overflow-wrap:anywhere]">
								{module.name}
							</span>
							{props.standing !== undefined && props.standing !== "unchanged" && (
								<>
									<StandingSample standing={props.standing} />
									<span className="text-body text-muted-foreground font-normal capitalize">
										{props.standing}
									</span>
								</>
							)}
						</span>
						<span className="text-body text-muted-foreground">{look.nodeName(module.kind)}</span>
					</span>
				</span>
				<span className="text-control text-foreground/85 min-w-0 font-normal">
					{module.responsibility}
				</span>
			</button>
		</li>
	);
}

export { ModelModuleList };

import type { JSX } from "react";
import type { Model, projectModel } from "@archboard/board/content";
import type { ChangeKind } from "@archboard/board/comparison";
import { StandingSample } from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import { ModelConnections } from "#ui/components/architecture-model/ModelConnections.tsx";

/**
 * Explore the modules and connections in the currently visible scope.
 * @param props The projected reading and canonical selection.
 * @param props.model The complete model.
 * @param props.projection The visible modules and context.
 * @param props.selection The immediate selection actions.
 * @param props.grammar The chosen diagram mode.
 * @returns The architecture tab navigation.
 */
function ModelModuleList(props: {
	model: Model;
	projection: ReturnType<typeof projectModel>;
	selection: ModelSelection;
	grammar: string;
}): JSX.Element {
	const { model } = props;
	const { ids: selected, select } = props.selection;
	const { children, context } = props.projection;
	return (
		<nav
			data-slot="model-navigation"
			aria-label={props.grammar === "architecture" ? "Modules" : "Participants"}
			className="space-y-4 px-4 py-4"
		>
			<h3 className="text-body mb-3 font-semibold">
				{props.grammar === "architecture" ? "Modules" : "Participants"}
			</h3>
			{children.length === 0 && (
				<p className="text-body text-muted-foreground">This scope has no child modules.</p>
			)}
			<ul data-slot="module-list" className="space-y-1">
				{children.map((entry) => (
					<ModuleRow
						key={entry.id}
						module={entry}
						selected={selected.has(entry.id)}
						standing={props.projection.standing?.[entry.id]}
						onSelect={select}
					/>
				))}
			</ul>
			{context.length > 0 && (
				<>
					<h3 className="text-body mt-6 mb-3 font-semibold">Nearby modules</h3>
					<ul data-slot="module-context" className="space-y-1">
						{context.map((entry) => (
							<ModuleRow
								key={entry.id}
								module={entry}
								selected={selected.has(entry.id)}
								standing={props.projection.standing?.[entry.id]}
								onSelect={select}
							/>
						))}
					</ul>
				</>
			)}
			<ModelConnections
				model={model}
				connections={props.projection.connections}
				reference={props.projection.reference}
				selected={selected}
				onSelect={select}
			/>
		</nav>
	);
}

interface ModuleRowProps {
	module: ReturnType<typeof projectModel>["children"][number];
	selected: boolean;
	standing: ChangeKind | undefined;
	onSelect: ModelSelection["select"];
}

/**
 * A native button keeps each module reachable from the keyboard.
 * @param props The module, its selection state, and the selection action.
 * @returns One root module row.
 */
function ModuleRow(props: ModuleRowProps): JSX.Element {
	const { module, onSelect } = props;
	const { id } = module;
	const pick = useModelPick(id, onSelect);
	return (
		<li>
			<button
				type="button"
				data-module-id={id}
				data-standing={props.standing}
				aria-pressed={props.selected}
				{...pick}
				className="hover:bg-muted aria-pressed:bg-muted aria-pressed:shadow-raised rounded-control w-full space-y-1 px-3 py-3 text-left"
			>
				<span className="text-control flex items-center gap-2 font-semibold">
					<span data-slot="model-module-name" className="min-w-0 flex-1">
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
				{module.responsibility && (
					<span className="text-body text-muted-foreground block">{module.responsibility}</span>
				)}
			</button>
		</li>
	);
}

export { ModelModuleList };

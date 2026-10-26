import { useCallback, useState, type JSX } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { Button } from "@archboard/ui-kit/components";
import { ModuleDetails } from "#ui/components/architecture-model/ModuleDetails.tsx";
import { ModelDiagram } from "#ui/components/architecture-model/ModelDiagram.tsx";

type Model = Extract<ArchitectureModelRead, { success: true }>;
interface ModelReadingProps {
	model: Model;
}

/**
 * Only selection is local state; authored content remains the query snapshot.
 * @param props The coherent model.
 * @returns Root selection beside authored details.
 */
function ModelReading(props: ModelReadingProps): JSX.Element {
	const { model } = props;
	const [selected, select] = useState<string | null>(null);
	const module = model.modules.find((entry) => entry.id === selected);
	const roots = model.roots.flatMap((id) => model.modules.filter((entry) => entry.id === id));
	const clear = useCallback((): void => select(null), []);
	return (
		<div className="flex min-h-0 flex-1">
			<nav
				aria-label="Modules"
				className="border-border w-80 shrink-0 overflow-y-auto border-r px-6 py-8"
			>
				<h3 className="text-title mb-4 font-semibold">Modules</h3>
				{roots.length === 0 && (
					<p className="text-body text-muted-foreground">This model has no modules.</p>
				)}
				<ul data-slot="module-list" className="space-y-1">
					{roots.map((entry) => (
						<ModuleRow
							key={entry.id}
							module={entry}
							selected={selected === entry.id}
							onSelect={select}
						/>
					))}
				</ul>
			</nav>
			<ModelDiagram model={model} selected={selected} onSelect={select} />
			<div className="border-border w-80 shrink-0 overflow-y-auto border-l px-6 py-8">
				{module !== undefined ? (
					<ModuleDetails module={module} model={model} />
				) : selected !== null ? (
					<div className="text-body space-y-3">
						<output className="block">
							The selected module is no longer available in this reading.
						</output>
						<Button variant="outline" onClick={clear}>
							Return to modules
						</Button>
					</div>
				) : (
					<ModelIntroduction model={model} />
				)}
			</div>
		</div>
	);
}

interface ModuleRowProps {
	module: Model["modules"][number];
	selected: boolean;
	onSelect: (id: string) => void;
}

/**
 * A native button keeps each module reachable from the keyboard.
 * @param props The module, its selection state, and the selection action.
 * @returns One root module row.
 */
function ModuleRow(props: ModuleRowProps): JSX.Element {
	const { module, onSelect } = props;
	const { id } = module;
	const choose = useCallback((): void => onSelect(id), [onSelect, id]);
	return (
		<li>
			<button
				type="button"
				data-module-id={id}
				aria-pressed={props.selected}
				onClick={choose}
				className="hover:bg-muted aria-pressed:bg-muted aria-pressed:shadow-raised rounded-control w-full space-y-1 px-3 py-3 text-left"
			>
				<span className="text-control block font-semibold">{module.name}</span>
				{module.responsibility && (
					<span className="text-body text-muted-foreground block">{module.responsibility}</span>
				)}
			</button>
		</li>
	);
}

/**
 * The model introduces itself until the reader selects a module.
 * @param props The coherent model.
 * @returns Its authored name, current state, and summary.
 */
function ModelIntroduction(props: ModelReadingProps): JSX.Element {
	const { model } = props;
	const current = model.manifest.current;
	return (
		<div className="max-w-prose space-y-4">
			<h3 className="text-figure font-display uppercase">{model.manifest.name}</h3>
			<p className="text-control text-muted-foreground">{current?.name ?? "Not built"}</p>
			{current?.summary && <p className="text-reading">{current.summary}</p>}
			{model.roots.length > 0 && (
				<p className="text-body text-muted-foreground">
					Select a module to read its responsibility and connections.
				</p>
			)}
		</div>
	);
}

export { ModelReading };

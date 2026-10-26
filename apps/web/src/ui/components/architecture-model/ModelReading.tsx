import { useCallback, useMemo, useState, type JSX } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { Button } from "@archboard/ui-kit/components";
import { ModuleDetails } from "#ui/components/architecture-model/ModuleDetails.tsx";
import {
	ModelConnections,
	ConnectionDetails,
} from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelInterface } from "#ui/components/architecture-model/ModelInterface.tsx";
import { ModelDiagram } from "#ui/components/architecture-model/ModelDiagram.tsx";
import { ModelBreadcrumbs } from "#ui/components/architecture-model/ModelBreadcrumbs.tsx";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { projectModel } from "#ui/rules/architecture-model/projection.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;
interface ModelReadingProps {
	model: Model;
	paneId: string;
	reducedMotion: boolean;
}

/**
 * A scope changes the reading of the existing model without copying its content.
 * @param props The coherent model.
 * @returns Recursive navigation and the selected scope.
 */
function ModelReading(props: ModelReadingProps): JSX.Element {
	const { model } = props;
	const { scope, open } = useModelLocation(props.paneId);
	const { id } = model.manifest;
	const onOpen = useCallback((next: string | null): void => open(id, next), [id, open]);
	const projection = useMemo(() => projectModel(model, scope), [model, scope]);
	return (
		<div
			data-slot="model-reading"
			data-scope={scope ?? ""}
			className="flex min-h-0 flex-1 flex-col"
		>
			<ModelBreadcrumbs
				name={model.manifest.name}
				scope={scope}
				trail={projection.trail}
				onOpen={onOpen}
			/>
			{projection.missing ? (
				<output data-slot="model-missing-scope" className="text-body p-8">
					The requested module is absent from this reading: {scope}. Open the repository from the
					path above.
				</output>
			) : (
				<ScopedModelReading
					key={scope ?? "root"}
					model={model}
					scope={scope}
					projection={projection}
					reducedMotion={props.reducedMotion}
					onOpen={onOpen}
				/>
			)}
		</div>
	);
}

interface ScopedModelReadingProps {
	model: Model;
	scope: string | null;
	projection: ReturnType<typeof projectModel>;
	reducedMotion: boolean;
	onOpen: (scope: string | null) => void;
}

/**
 * Only selection is local state; authored content remains the query snapshot.
 * @param props The coherent model and scope projection.
 * @returns Immediate children, nearby context, and authored details.
 */
function ScopedModelReading(props: ScopedModelReadingProps): JSX.Element {
	const { model } = props;
	const [selected, select] = useState<string | null>(null);
	const module = model.modules.find((entry) => entry.id === selected);
	const { children, context } = props.projection;
	const connection = props.projection.connections.find(({ joins }) =>
		joins.some((edge) => edge.id === selected),
	);
	const clear = useCallback((): void => select(null), []);
	return (
		<div className="flex min-h-0 flex-1">
			<nav
				aria-label="Modules"
				className="border-border w-80 shrink-0 overflow-y-auto border-r px-6 py-8"
			>
				<h3 className="text-title mb-4 font-semibold">Modules</h3>
				{children.length === 0 && (
					<p className="text-body text-muted-foreground">This scope has no child modules.</p>
				)}
				<ul data-slot="module-list" className="space-y-1">
					{children.map((entry) => (
						<ModuleRow
							key={entry.id}
							module={entry}
							selected={selected === entry.id}
							onSelect={select}
						/>
					))}
				</ul>
				{context.length > 0 && (
					<>
						<h3 className="text-title mt-8 mb-4 font-semibold">Nearby modules</h3>
						<ul data-slot="module-context" className="space-y-1">
							{context.map((entry) => (
								<ModuleRow
									key={entry.id}
									module={entry}
									selected={selected === entry.id}
									onSelect={select}
								/>
							))}
						</ul>
					</>
				)}
				<ModelConnections
					model={model}
					connections={props.projection.connections}
					selected={selected}
					onSelect={select}
				/>
			</nav>
			<ModelDiagram
				model={model}
				projection={props.projection}
				selected={selected}
				onSelect={select}
				onOpen={props.onOpen}
				reducedMotion={props.reducedMotion}
			/>
			<div className="border-border w-80 shrink-0 overflow-y-auto border-l px-6 py-8">
				{module !== undefined ? (
					<>
						<OpenModule id={module.id} onOpen={props.onOpen} />
						<ModuleDetails module={module} model={model} />
					</>
				) : connection !== undefined ? (
					<ConnectionDetails connection={connection} model={model} />
				) : selected !== null ? (
					<div data-slot="module-missing-selection" className="text-body space-y-3">
						<output className="block">
							The selected module is no longer available in this reading.
						</output>
						<Button variant="outline" onClick={clear}>
							Return to modules
						</Button>
					</div>
				) : (
					<>
						<ScopeIntroduction model={model} scope={props.scope} />
						<ModelInterface model={model} projection={props.projection} onSelect={select} />
					</>
				)}
			</div>
		</div>
	);
}

interface ModuleRowProps {
	module: ReturnType<typeof projectModel>["children"][number];
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
 * Opening a module makes that module the subject of the explanation.
 * @param props The coherent model and current scope.
 * @param props.model The complete reading.
 * @param props.scope The open module, or repository roots.
 * @returns Authored module meaning or the repository introduction.
 */
function ScopeIntroduction(props: { model: Model; scope: string | null }): JSX.Element {
	const module = props.model.modules.find((entry) => entry.id === props.scope);
	if (module === undefined) return <ModelIntroduction model={props.model} />;
	return (
		<section data-slot="model-scope-introduction" className="space-y-3">
			<h3 className="text-figure font-display uppercase">{module.name}</h3>
			{module.responsibility && <p className="text-reading">{module.responsibility}</p>}
			{module.description && <p className="text-body whitespace-pre-wrap">{module.description}</p>}
		</section>
	);
}

/**
 * The model introduces itself until the reader selects a module.
 * @param props The coherent model.
 * @returns Its authored name, current state, and summary.
 */
function ModelIntroduction(props: Pick<ModelReadingProps, "model">): JSX.Element {
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

/**
 * Opening changes scope while preserving the selected module identity.
 * @param props The module destination and navigation action.
 * @param props.id The existing module identity.
 * @param props.onOpen The scope navigation action.
 * @returns A keyboard-accessible opening action.
 */
function OpenModule(props: { id: string; onOpen: (scope: string | null) => void }): JSX.Element {
	const { id, onOpen } = props;
	const open = useCallback((): void => onOpen(id), [id, onOpen]);
	return (
		<Button variant="outline" data-slot="module-open" className="mb-6" onClick={open}>
			Open module
		</Button>
	);
}

export { ModelReading };

import { useCallback, type JSX, type PointerEvent } from "react";
import { Button } from "@archboard/ui-kit/components";
import { ModelState } from "#ui/architecture-drawing/model-reader/reading/components/ModelState.tsx";
import {
	emptyWithFilters,
	type AcceptedScene,
} from "#ui/architecture-drawing/model-reader/rules/scene.ts";
import { kindLookOf } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { effectKey } from "@archboard/renderer/picture";

/** What an empty reading says, and what its key does. */
interface EmptyWords {
	readonly title: string;
	readonly line: string;
	readonly action: string;
}

/** Joins the names of hidden kinds as a sentence does: "HTTP and Data". */
const AND = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * An empty coherent reading is a finished picture too. An unavailable one says why itself.
 * @param props The scene and whether another reading is on its way.
 * @param props.scene The scene on screen.
 * @param props.pending Whether another reading is on its way.
 * @param props.onWholeScope Lift what narrows the reading, when something does.
 * @param props.onOpenState Read another state of the model.
 * @returns The diagram's live status and its empty state when nothing is visible.
 */
function ModelEmptyReading(props: {
	scene: AcceptedScene;
	pending: boolean;
	onWholeScope: (() => void) | undefined;
	onOpenState: ((state: string) => void) | undefined;
}): JSX.Element {
	const { scene, pending, onWholeScope, onOpenState } = props;
	let message = "";
	let content: JSX.Element | null = null;
	if (scene.picture.svg === "" && scene.grammar !== null && !pending) {
		if (isPlanned(scene)) {
			content = <ModelPlanned model={scene.model} onOpenState={onOpenState} />;
		} else {
			const words = emptyWords(scene);
			message = `${words.title}. ${words.line}`;
			content = <ModelEmptyState words={words} onWholeScope={onWholeScope} />;
		}
	}
	return (
		<>
			{/* Keep the live region mounted while the diagram still has content. */}
			<output className="sr-only" aria-live="polite">
				{message}
			</output>
			{content}
		</>
	);
}

/**
 * The explanation on the diagram and its action, when the reading can be widened.
 * @param props The message and the way back to the whole scope.
 * @param props.words The title, line and action label.
 * @param props.onWholeScope Widen the reading when an action is available.
 * @returns The pane's empty state.
 */
function ModelEmptyState(props: {
	readonly words: EmptyWords;
	readonly onWholeScope: (() => void) | undefined;
}): JSX.Element {
	const { words, onWholeScope } = props;
	return (
		<ModelState slot="model-empty-diagram" cover>
			<ModelState.Title>{words.title}</ModelState.Title>
			<ModelState.Line>{words.line}</ModelState.Line>
			{onWholeScope !== undefined && (
				<Button
					size="sm"
					data-slot="model-whole-scope"
					onPointerDown={stopPropagation}
					onClick={onWholeScope}
				>
					{words.action}
				</Button>
			)}
		</ModelState>
	);
}

/**
 * Why a reading draws nothing, in words that name what the reader chose.
 * @param scene The empty scene.
 * @returns Its title, its line and the words of the key that lifts what narrows it.
 */
function emptyWords(scene: AcceptedScene): EmptyWords {
	const focused = scene.projection.focused !== null;
	if (!focused && !emptyWithFilters(scene))
		return {
			title: "Nothing to draw",
			line: "No module is visible in this reading.",
			action: "Show whole scope",
		};
	const names = hiddenNames(scene);
	const hidden = AND.format(names);
	if (focused) {
		const line =
			names.length === 0
				? "The focus names no module in this reading."
				: `The focus names no module in this reading, and ${hidden} lines are hidden.`;
		return { title: "Nothing to draw", line, action: "Show whole scope" };
	}
	return hiddenWords(scene, names);
}

/**
 * The names of the kinds and the effects a reader hid, as the legend says them.
 * @param scene The empty scene.
 * @returns The names, kinds first.
 */
function hiddenNames(scene: AcceptedScene): readonly string[] {
	const { hideKinds, hideEffects } = scene.reading.filters;
	const look = kindLookOf(scene.model.policy, new Map());
	const words = new Map(effectKey().map(({ effect, word }) => [effect, word]));
	return [
		...hideKinds.map((kind) => look.relationship(kind).name),
		...hideEffects.map((effect) => words.get(effect) ?? effect),
	];
}

/**
 * Why every module left a picture: the lens, or the kinds and effects the reader hid, took all of
 * its lines.
 * @param scene The empty scene.
 * @param names The names of the hidden kinds and effects.
 * @returns Its title, its line and the words of the key that shows them again.
 */
function hiddenWords(scene: AcceptedScene, names: readonly string[]): EmptyWords {
	const hidden = AND.format(names);
	const title = "Every module is hidden";
	if (names.length === 0)
		return {
			title,
			line: `${scene.projection.lens.name} leaves out every line of this scope.`,
			action: "Show every relationship",
		};
	return {
		title,
		line: `Each module here draws only ${hidden} lines, and you hid them.`,
		action: names.length > 2 ? "Show every relationship" : `Show ${hidden}`,
	};
}

/**
 * Whether the reader looks at the Current of a model that has none.
 * @param scene The scene on screen.
 * @returns True for a planning model, read with no proposal chosen. A preview says so itself.
 */
function isPlanned(scene: AcceptedScene): boolean {
	const { manifest, selectedState, migrationPreview } = scene.model;
	return manifest.current === null && selectedState === null && migrationPreview === undefined;
}

/**
 * A planning model has no Current to draw. Its newest proposal is what it holds.
 * @param props The model and the way to a proposal.
 * @param props.model The model.
 * @param props.onOpenState Read a proposal.
 * @returns The state that nothing is implemented, and the way to the plan.
 */
function ModelPlanned(props: {
	model: AcceptedScene["model"];
	onOpenState: ((state: string) => void) | undefined;
}): JSX.Element {
	const { model, onOpenState } = props;
	const proposal = model.proposals.at(-1);
	const open = useCallback((): void => {
		if (proposal !== undefined) onOpenState?.(proposal.id);
	}, [proposal, onOpenState]);
	return (
		<ModelState slot="model-planned" cover>
			<ModelState.Title>Nothing implemented yet</ModelState.Title>
			<ModelState.Line>
				{proposal === undefined
					? `${model.manifest.name} has no proposal yet.`
					: `${model.manifest.name} is a plan, and its proposals hold it.`}
			</ModelState.Line>
			{proposal === undefined ? (
				<ModelState.Ask
					label="Ask the agent to propose a design"
					draft="Read this repository and propose its first architecture."
				/>
			) : (
				<Button
					size="sm"
					data-slot="model-open-proposal"
					onPointerDown={stopPropagation}
					onClick={open}
				>
					Open {proposal.name}
				</Button>
			)}
		</ModelState>
	);
}

/**
 * Keep a press on a control from starting a gesture on the picture around it.
 * @param event The press.
 */
function stopPropagation(event: PointerEvent<HTMLElement>): void {
	event.stopPropagation();
}

export { ModelEmptyReading };

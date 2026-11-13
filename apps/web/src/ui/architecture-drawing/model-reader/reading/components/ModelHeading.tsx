import { useCallback, useContext, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/model/content";
import { ModelSwitch } from "#ui/architecture-drawing/model-reader/reading/components/ModelSwitch.tsx";
import { sharedNameTouches } from "#ui/architecture-drawing/model-reader/reading/rules/draft-touches.ts";
import { checkpointTime } from "#ui/architecture-drawing/model-reader/rules/history-time.ts";
import { standingSuffix } from "#ui/architecture-drawing/model-reader/rules/standing.ts";
import { ModelPaneContext } from "#ui/architecture-drawing/model-reader/state/presentation.ts";

/** How an open module can be read. */
const PAGES = [
	{ value: "diagram", label: "Diagram" },
	{ value: "about", label: "About" },
] as const;

type Page = (typeof PAGES)[number]["value"];

/** Inputs for the header of a reading. */
interface ModelHeadingProps {
	/** The crumbs, the code path and the state chip. */
	readonly children: ReactNode;
	readonly page: Page;
	readonly onPage: (page: Page) => void;
}

/**
 * What the header says about a reading, with `Diagram | About` at its end.
 * @param props The parts.
 * @returns The parts in the header of the pane.
 */
function ModelHeading(props: ModelHeadingProps): JSX.Element | null {
	const slot = useContext(ModelPaneContext)?.head ?? null;
	if (slot === null) return null;
	return (
		<>
			{createPortal(
				<>
					{props.children}
					<span className="ml-auto shrink-0 pl-2">
						<ModelSwitch
							label="Read as"
							slot="model-page"
							choices={PAGES}
							value={props.page}
							onChange={props.onPage}
						/>
					</span>
				</>,
				slot,
			)}
		</>
	);
}

/**
 * A code path. A long path keeps its tail, which is the part that says where it is.
 * @param props The path.
 * @param props.path The path.
 * @returns The path.
 */
function ModelCodePath(props: { readonly path: string | undefined }): JSX.Element | null {
	if (props.path === undefined) return null;
	return (
		<code
			data-slot="model-code-path"
			title={props.path}
			className="text-technical text-muted-foreground max-w-60 min-w-8 shrink-[2] truncate text-left font-mono [direction:rtl]"
		>
			<bdi>{props.path}</bdi>
		</code>
	);
}

/**
 * Label the requested reading without silently replacing unavailable intent.
 * @param props The selected address and coherent metadata.
 * @param props.model The reading.
 * @param props.state The requested state.
 * @param props.checkpoint The requested checkpoint.
 * @returns Its explicit current, draft, or retained label, with no identity in it.
 */
function readingLabel(props: {
	readonly model: Model;
	readonly state: string | null;
	readonly checkpoint: string | null;
}): string {
	const { model, state, checkpoint } = props;
	if (checkpoint !== null) return savedLabel(model, checkpoint);
	const at = model.sourceRef;
	// A branch reading names its ref and commit first, so it is never taken for the checkout.
	if (at !== undefined)
		return `${at.ref} at ${at.commit.slice(0, 7)} · ${stateLabel(model, state)}`;
	return stateLabel(model, state);
}

/**
 * Label the state of a reading of live inputs: the vault on disk, or the vault at a ref.
 * @param model The reading.
 * @param state The requested state.
 * @returns Its current, planning or draft label.
 */
function stateLabel(model: Model, state: string | null): string {
	if (state === null) return model.manifest.current === null ? "Planning" : "Current";
	const selected = model.selectedState;
	if (selected === null) return "Unavailable state";
	const { id, name, lifecycle } = selected;
	const word = `${lifecycle.charAt(0).toUpperCase()}${lifecycle.slice(1)}`;
	const touches = sharedNameTouches(model).get(id);
	// Where the reading stands comes first, because a long name is what the chip cuts.
	return [`${word}${standingSuffix(selected)}`, name, touches].filter(Boolean).join(" · ");
}

/**
 * Label a saved reading by when it was saved, once the reading on show is that one.
 * @param model The reading on show.
 * @param checkpoint The requested checkpoint.
 * @returns The label.
 */
function savedLabel(model: Model, checkpoint: string): string {
	const saved = model.checkpoint;
	return saved?.id === checkpoint ? `Saved · ${checkpointTime(saved.createdAt)}` : "Saved reading";
}

/**
 * The state of the reading, which opens the History dialog.
 * @param props The reading and what the chip does.
 * @param props.model The reading.
 * @param props.state The requested state.
 * @param props.checkpoint The requested checkpoint.
 * @param props.onOpen Open the record of the model.
 * @returns The chip.
 */
function ModelStateChip(props: {
	readonly model: Model;
	readonly state: string | null;
	readonly checkpoint: string | null;
	readonly onOpen: () => void;
}): JSX.Element {
	const { onOpen } = props;
	const open = useCallback((): void => onOpen(), [onOpen]);
	const label = readingLabel(props);
	return (
		<Button
			variant="outline"
			size="sm"
			data-slot="model-reading-selector"
			aria-label={`Reading ${label}. Open History.`}
			title={label}
			onClick={open}
			className="max-w-72 min-w-32 shrink-[2] font-medium"
		>
			<span className="truncate">{label}</span>
		</Button>
	);
}

export { ModelCodePath, ModelHeading, ModelStateChip, type Page };

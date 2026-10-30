import { useCallback, useContext, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/board/content";
import { ModelSwitch } from "#ui/components/architecture-model/ModelSwitch.tsx";
import { standingSuffix } from "#ui/rules/architecture-model/standing.ts";
import { ModelPaneContext } from "#ui/state/architecture-model/presentation.ts";

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
 * @returns Its explicit current, draft, or retained label.
 */
function readingLabel(props: {
	readonly model: Model;
	readonly state: string | null;
	readonly checkpoint: string | null;
}): string {
	const { model, state, checkpoint } = props;
	if (checkpoint !== null) return `Saved · ${checkpoint.slice(0, 8)}`;
	if (state === null) return model.manifest.current === null ? "Choose state" : "Current";
	const selected = model.selectedState;
	if (selected === null) return state;
	return `${selected.name} · ${selected.lifecycle}${standingSuffix(selected)}`;
}

/**
 * The state of the reading, which opens the History destination.
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
			className="max-w-56 shrink-0 font-medium"
		>
			<span className="truncate">{label}</span>
		</Button>
	);
}

export { ModelCodePath, ModelHeading, ModelStateChip, type Page };

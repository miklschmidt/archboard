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
	/** Where the reader is: the crumbs and the code path. */
	readonly children: ReactNode;
	/** What the reader reads: the state, what it is compared with and a standing focus. */
	readonly reading: ReactNode;
	readonly page: Page;
	readonly onPage: (page: Page) => void;
}

/**
 * What the header says about a reading. Over the picture, where the reader is at its start, and
 * at its end what the reader reads, so no control of the reading stands among the crumbs. Over the
 * right panel, `Diagram | About`, which says what the panel's column shows.
 * @param props The parts.
 * @returns The parts in the header of the pane.
 */
function ModelHeading(props: ModelHeadingProps): JSX.Element | null {
	const slot = useContext(ModelPaneContext)?.head ?? null;
	if (slot === null) return null;
	return (
		<>
			<HeadingSide page={props.page} onPage={props.onPage} />
			{createPortal(
				<>
					<div data-slot="model-location" className="flex min-w-36 flex-1 items-center gap-3">
						{props.children}
					</div>
					<div data-slot="model-reading-head" className="flex min-w-0 shrink items-center gap-2">
						{props.reading}
					</div>
				</>,
				slot,
			)}
		</>
	);
}

/**
 * `Diagram | About`, in the part of the header over the right panel.
 * @param props The page and how it changes.
 * @returns The switch in the header, or nothing for a header with no such part.
 */
function HeadingSide(props: Pick<ModelHeadingProps, "page" | "onPage">): JSX.Element | null {
	const side = useContext(ModelPaneContext)?.side ?? null;
	if (side === null) return null;
	return (
		<>
			{createPortal(
				<ModelSwitch
					label="Read as"
					slot="model-page"
					choices={PAGES}
					value={props.page}
					onChange={props.onPage}
				/>,
				side,
			)}
		</>
	);
}

/**
 * The state of a reading and what it is compared with, as one control in two parts, because they
 * say one thing: this state, read against that one.
 * @param props The parts.
 * @param props.children The state chip, then the comparison.
 * @returns The joined parts.
 */
function ModelReadingControls(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<div
			data-slot="model-reading-controls"
			className="flex min-w-0 items-center [&>*+*]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none"
		>
			{props.children}
		</div>
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
			data-source-ref={props.model.sourceRef?.ref}
			aria-label={`Reading ${label}. Open History.`}
			title={label}
			onClick={open}
			className="max-w-72 min-w-16 shrink-[2] font-medium"
		>
			<span className="truncate">{label}</span>
		</Button>
	);
}

export { ModelCodePath, ModelHeading, ModelReadingControls, ModelStateChip, type Page };

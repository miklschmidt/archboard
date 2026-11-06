// The walkthroughs on About, each laid out as a script: what each step says beside what it shows.
// Each step has its number, set as a drawing's sheet number is, its heading and its words, and
// beside them the reading it opens and the subjects it lights. A walkthrough is presented or
// narrated from its head, and presented from any step. Choosing a subject selects it, as a row of
// the page does. The Walkthroughs destination of the left column goes on navigating them. The
// root of a model holds many, so past a few a card opens on its head and its steps wait.
//
// Presenting and narrating are readings: nothing is written and no revision moves.

import {
	RiArrowDownSLine,
	RiArrowRightLine,
	RiMicLine,
	RiPlayCircleLine,
	RiPlayLine,
} from "@remixicon/react";
import { useCallback, useContext, useMemo, useState, type CSSProperties, type JSX } from "react";

import { Button, cn, IconButton } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/model/content";
import { KindIcon } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import { useModelPick } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-pick.ts";
import type { ModelSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";
import {
	modelSubjects,
	subjectName,
} from "#ui/architecture-drawing/model-reader/rules/flow-reading.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { ModelWalkthroughContext } from "#ui/architecture-drawing/model-reader/state/presentation.ts";

type Walkthrough = Model["walkthroughs"][number];
type Beat = Walkthrough["beats"][number];

/** Inputs for the walkthroughs. */
interface ModelAboutWalkthroughsProps {
	readonly model: Model;
	readonly walkthroughs: readonly Walkthrough[];
	readonly selection: ModelSelection;
	readonly look: KindLook;
}

/** How many walkthroughs a page shows step by step from the start. */
const OPEN_SCRIPTS = 3;

/**
 * Every walkthrough of a subject, each as a script.
 * @param props The walkthroughs and the reading they belong to.
 * @returns The walkthroughs.
 */
function ModelAboutWalkthroughs(props: ModelAboutWalkthroughsProps): JSX.Element {
	return (
		<ol className="flex flex-col gap-6">
			{props.walkthroughs.map((walkthrough) => (
				<WalkthroughScript key={walkthrough.id} {...props} walkthrough={walkthrough} />
			))}
		</ol>
	);
}

/** Inputs for one walkthrough. */
interface WalkthroughScriptProps extends ModelAboutWalkthroughsProps {
	readonly walkthrough: Walkthrough;
}

/**
 * One walkthrough: its head, with its name, its length, its summary and the ways to present and
 * narrate it, and then every step.
 * @param props The walkthrough and what a reader can do with it.
 * @returns The script.
 */
function WalkthroughScript(props: WalkthroughScriptProps): JSX.Element {
	const { walkthrough } = props;
	const steps = walkthrough.beats.length;
	const [open, setOpen] = useState(props.walkthroughs.length <= OPEN_SCRIPTS);
	const toggle = useCallback((): void => setOpen((was) => !was), []);
	return (
		<li
			data-slot="about-walkthrough"
			data-walkthrough={walkthrough.id}
			className="bg-card border-border shadow-card rounded-panel min-w-0 border"
		>
			<div className="flex items-start gap-6 px-5 pt-5 pb-4">
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<h4 className="flex min-w-0 items-baseline gap-3">
						<span className="title-name min-w-0">{walkthrough.name}</span>
						<button
							type="button"
							aria-expanded={open}
							data-slot="about-steps"
							onClick={toggle}
							className="text-body text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-0.5 font-normal"
						>
							{steps === 1 ? "1 step" : `${steps} steps`}
							<RiArrowDownSLine
								aria-hidden="true"
								className={cn("size-4 transition-transform", open && "rotate-180")}
							/>
						</button>
					</h4>
					{walkthrough.summary !== undefined && (
						<p className="text-control text-muted-foreground max-w-[72ch] font-normal">
							{walkthrough.summary}
						</p>
					)}
				</div>
				<ScriptActions walkthrough={walkthrough} />
			</div>
			{open && (
				<ol aria-label={`Steps of ${walkthrough.name}`} className="border-border border-t">
					{walkthrough.beats.map((beat, index) => (
						<StepRow key={beat.id} {...props} beat={beat} index={index} />
					))}
				</ol>
			)}
		</li>
	);
}

/**
 * The ways to present a walkthrough and to narrate it.
 * @param props The walkthrough.
 * @param props.walkthrough The walkthrough.
 * @returns The controls.
 */
function ScriptActions(props: { readonly walkthrough: Walkthrough }): JSX.Element {
	const { id, name } = props.walkthrough;
	const playback = useContext(ModelWalkthroughContext);
	const start = playback?.select;
	const narration = playback?.narration;
	const present = useCallback((): void => start?.(id), [start, id]);
	const narrate = useCallback((): void => narration?.start(id), [narration, id]);
	return (
		<div className="flex shrink-0 items-center gap-1">
			<Button
				variant="outline"
				data-slot="about-present"
				aria-label={`Present ${name}`}
				onClick={present}
			>
				<RiPlayCircleLine aria-hidden="true" />
				Present
			</Button>
			{narration != null && (
				<IconButton
					label={`Narrate ${name}`}
					tip="Narrate aloud"
					held={narration.held}
					slot="about-narrate"
					onClick={narrate}
				>
					<RiMicLine />
				</IconButton>
			)}
		</div>
	);
}

/** Inputs for one step. */
interface StepRowProps extends WalkthroughScriptProps {
	readonly beat: Beat;
	/** Which step, counted from zero. */
	readonly index: number;
}

/**
 * One step: its number, what it says, and what it shows, with the way to present the walkthrough
 * from it. While the page is narrow, what it shows stands under what it says.
 * @param props The step and what a reader can do with it.
 * @returns The step.
 */
function StepRow(props: StepRowProps): JSX.Element {
	const { walkthrough, beat, index } = props;
	const number = index + 1;
	const start = useContext(ModelWalkthroughContext)?.select;
	const present = useCallback(
		(): void => start?.(walkthrough.id, index),
		[start, walkthrough.id, index],
	);
	return (
		<li
			data-slot="about-step"
			data-step={beat.id}
			className="border-border grid grid-cols-[48px_minmax(0,1fr)_auto] gap-x-5 gap-y-3 border-t px-5 py-4 first:border-t-0 @min-[860px]/sheet:grid-cols-[48px_minmax(0,1.15fr)_minmax(0,1fr)_auto]"
		>
			<span
				aria-hidden="true"
				className="border-border title-name text-muted-foreground row-span-2 border-r pr-3 text-right tabular-nums @min-[860px]/sheet:row-span-1"
			>
				{number}
			</span>
			<div className="flex min-w-0 flex-col gap-1">
				<h5 className="text-title">
					<span className="sr-only">Step {number}. </span>
					{beat.title}
				</h5>
				<p className="text-control text-foreground/85 max-w-[72ch] font-normal whitespace-pre-line">
					{beat.narrative}
				</p>
			</div>
			<div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-2 @min-[860px]/sheet:col-start-3 @min-[860px]/sheet:row-start-1">
				<StepReading model={props.model} beat={beat} />
				<StepSubjects {...props} />
			</div>
			<div className="col-start-3 row-start-1 @min-[860px]/sheet:col-start-4">
				<IconButton
					label={`Present ${walkthrough.name} from step ${number}`}
					tip="Present from here"
					slot="about-present-step"
					onClick={present}
				>
					<RiPlayLine />
				</IconButton>
			</div>
		</li>
	);
}

/**
 * What a step opens: the flow it reads, or else the module, or else the model.
 * @param model The model.
 * @param beat The step.
 * @returns The name.
 */
function readingName(model: Model, beat: Beat): string {
	const { flow, scope } = beat.reading;
	const flows = model.collections.flatMap((collection) => collection.flows);
	const named = flows.find((entry) => entry.id === flow);
	const opened = model.modules.find((module) => module.id === scope);
	return named?.name ?? opened?.name ?? model.manifest.name;
}

/**
 * The reading a step opens.
 * @param props The step and its model.
 * @param props.model The model.
 * @param props.beat The step.
 * @returns The line.
 */
function StepReading(props: { readonly model: Model; readonly beat: Beat }): JSX.Element {
	return (
		<p data-slot="about-step-reading" className="text-body flex min-w-0 items-baseline gap-2">
			<span className="text-muted-foreground w-12 shrink-0">Opens</span>
			<span className="text-foreground min-w-0 font-medium">
				{readingName(props.model, props.beat)}
			</span>
		</p>
	);
}

/**
 * The subjects a step lights, or else the subjects it focuses, each a chip that selects it. A
 * subject the reading on screen does not hold has nothing to select, and names nothing here.
 * @param props The step, its model and the selection.
 * @returns The chips, or nothing for a step about the whole picture.
 */
function StepSubjects(props: StepRowProps): JSX.Element | null {
	const { beat, model } = props;
	const { selection: lit, focus } = beat.reading;
	const known = useMemo(
		() => new Map(modelSubjects(model).map((subject) => [subject.id, subject])),
		[model],
	);
	const kinds = useMemo(
		() => new Map(model.modules.map((module) => [module.id, module.kind])),
		[model.modules],
	);
	const subjects = (lit.length > 0 ? lit : focus).flatMap((id) => {
		const subject = known.get(id);
		return subject === undefined ? [] : [{ id, name: subjectName(subject) }];
	});
	if (subjects.length === 0) return null;
	return (
		<div className="text-body flex min-w-0 items-baseline gap-2">
			<span className="text-muted-foreground w-12 shrink-0">Focus</span>
			<ul className="flex min-w-0 flex-wrap gap-1">
				{subjects.map(({ id, name }) => (
					<SubjectChip
						key={id}
						id={id}
						name={name}
						kind={kinds.get(id)}
						look={props.look}
						selection={props.selection}
					/>
				))}
			</ul>
		</div>
	);
}

/**
 * One subject of a step: a module with its kind's icon in its kind's colour, or any other subject
 * with an arrow.
 * @param props The subject and the selection.
 * @param props.id The subject's identity.
 * @param props.name What the model calls it.
 * @param props.kind Its kind, when it is a module.
 * @param props.look How the vault's kinds look.
 * @param props.selection The selection.
 * @returns The chip.
 */
function SubjectChip(props: {
	readonly id: string;
	readonly name: string;
	readonly kind: string | undefined;
	readonly look: KindLook;
	readonly selection: ModelSelection;
}): JSX.Element {
	const { id, kind, look, selection } = props;
	const pick = useModelPick(id, selection.select);
	const ink = useMemo<CSSProperties | undefined>(
		() => (kind === undefined ? undefined : { color: look.nodeColor(kind) }),
		[look, kind],
	);
	return (
		<li className="min-w-0">
			<button
				type="button"
				aria-pressed={selection.ids.has(id)}
				data-slot="about-step-subject"
				data-subject={id}
				{...pick}
				className="border-border bg-background hover:bg-muted aria-pressed:bg-primary-subtle aria-pressed:border-primary-mark rounded-control flex h-6 max-w-full min-w-0 items-center gap-1 border px-1.5"
			>
				{kind === undefined ? (
					<RiArrowRightLine
						aria-hidden="true"
						className="text-muted-foreground size-3.5 shrink-0"
					/>
				) : (
					<KindIcon look={look} kind={kind} className="size-3.5" style={ink} />
				)}
				<span className="truncate">{props.name}</span>
			</button>
		</li>
	);
}

export { ModelAboutWalkthroughs };

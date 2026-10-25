// The About page's walkthroughs, each laid out as a script: what each step
// says beside what it shows. Each step has its number, set as a drawing's sheet
// number is, its heading and its words, and beside them the view it is told
// through and the subjects it focuses. A step that names no view is told
// through the view on screen when it is presented, and says so. A walkthrough is
// presented or narrated from its head, and presented from any step. Choosing a
// subject picks it in the pane, as a row of the page does.
//
// Presenting and narrating are readings, as on the sidebar: nothing is written
// and no version moves (ADR 0023).

import { RiArrowRightLine, RiMicLine, RiPlayCircleLine, RiPlayLine } from "@remixicon/react";
import { useCallback, useMemo, type CSSProperties, type JSX } from "react";

import type { SemanticView } from "@archboard/board/views";
import { Button, IconButton } from "@archboard/ui-kit/controls";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";
import type { WalkthroughBeatSchema } from "@archboard/board/content";
import type { z } from "zod";
import type { VariantContent } from "@archboard/board/content";

type SemanticWalkthrough = VariantContent["walkthroughs"][number];

type WalkthroughBeat = z.infer<typeof WalkthroughBeatSchema>;

/** Inputs for the walkthroughs. */
interface AboutWalkthroughsProps {
	/** What the board says about the variant on screen. */
	readonly reading: VariantReading;
	readonly look: KindLook;
	/** What is picked out, or null. */
	readonly selection: string | null;
	/**
	 * Pick a subject out, or let it go.
	 * @param id The semantic id, or null.
	 */
	readonly onPick: (id: string | null) => void;
	/**
	 * Present a walkthrough from one of its steps.
	 * @param walkthrough The walkthrough's id.
	 * @param beat Which step, counted from zero.
	 */
	readonly onPresent: (walkthrough: string, beat: number) => void;
	/** Narrating a walkthrough aloud, when the shell can. */
	readonly narration: WalkthroughNarration | undefined;
}

/**
 * Every walkthrough of the variant, each as a script.
 * @param props The reading and what a reader can do with it.
 * @returns The walkthroughs.
 */
function AboutWalkthroughs(props: AboutWalkthroughsProps): JSX.Element {
	return (
		<ol className="flex flex-col gap-6">
			{props.reading.walkthroughs.map((walkthrough) => (
				<WalkthroughScript key={walkthrough.id} {...props} walkthrough={walkthrough} />
			))}
		</ol>
	);
}

/** Inputs for one walkthrough. */
interface WalkthroughScriptProps extends AboutWalkthroughsProps {
	readonly walkthrough: SemanticWalkthrough;
}

/**
 * One walkthrough: its head, with its name, its length, its summary and the
 * ways to present and narrate it, and then every step.
 * @param props The walkthrough and what a reader can do with it.
 * @returns The script.
 */
function WalkthroughScript(props: WalkthroughScriptProps): JSX.Element {
	const { walkthrough, onPresent, narration } = props;
	const steps = walkthrough.beats.length;
	const present = useCallback((): void => {
		onPresent(walkthrough.id, 0);
	}, [onPresent, walkthrough.id]);
	// The server opens the walkthrough on its first step once voice is starting.
	const narrate = useCallback((): void => {
		narration?.start(walkthrough.id);
	}, [narration, walkthrough.id]);
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
						<span className="text-body text-muted-foreground shrink-0 font-normal">
							{steps === 1 ? "1 step" : `${steps} steps`}
						</span>
					</h4>
					{walkthrough.summary !== undefined && (
						<p className="text-control text-muted-foreground max-w-[72ch] font-normal">
							{walkthrough.summary}
						</p>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						variant="outline"
						data-slot="about-present"
						aria-label={`Present ${walkthrough.name}`}
						onClick={present}
					>
						<RiPlayCircleLine aria-hidden="true" />
						Present
					</Button>
					{narration !== undefined && (
						<IconButton
							label={`Narrate ${walkthrough.name}`}
							tip="Narrate aloud"
							held={narration.held}
							slot="about-narrate"
							onClick={narrate}
						>
							<RiMicLine />
						</IconButton>
					)}
				</div>
			</div>
			<ol aria-label={`Steps of ${walkthrough.name}`} className="border-border border-t">
				{walkthrough.beats.map((beat, index) => (
					<StepRow key={beat.id} {...props} beat={beat} index={index} />
				))}
			</ol>
		</li>
	);
}

/** Inputs for one step. */
interface StepRowProps extends WalkthroughScriptProps {
	readonly beat: WalkthroughBeat;
	/** Which step, counted from zero. */
	readonly index: number;
}

/**
 * One step: its number, what it says, and what it shows, with the way to
 * present the walkthrough from it. While the page is narrow, what it shows
 * stands under what it says.
 * @param props The step and what a reader can do with it.
 * @returns The step.
 */
function StepRow(props: StepRowProps): JSX.Element {
	const { walkthrough, beat, index, onPresent } = props;
	const number = index + 1;
	const present = useCallback((): void => {
		onPresent(walkthrough.id, index);
	}, [onPresent, walkthrough.id, index]);
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
					{beat.heading}
				</h5>
				<p className="text-control text-foreground/85 max-w-[72ch] font-normal whitespace-pre-line">
					{beat.body}
				</p>
			</div>
			<div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-2 @min-[860px]/sheet:col-start-3 @min-[860px]/sheet:row-start-1">
				<StepView beat={beat} views={props.reading.views} />
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
 * The view a step is told through: the one it names, with what the view
 * answers on hover, or the view on screen when it names none.
 * @param props The step and the board's views.
 * @param props.beat The step.
 * @param props.views Every view of the board.
 * @returns The line.
 */
function StepView(props: {
	readonly beat: WalkthroughBeat;
	readonly views: readonly SemanticView[];
}): JSX.Element {
	const { beat } = props;
	const view =
		beat.view === undefined ? undefined : props.views.find((one) => one.id === beat.view);
	return (
		<p
			data-slot="about-step-view"
			data-view={beat.view}
			className="text-body flex min-w-0 items-baseline gap-2"
		>
			<span className="text-muted-foreground w-12 shrink-0">View</span>
			{beat.view === undefined ? (
				<span className="text-muted-foreground min-w-0">The view on screen</span>
			) : (
				<span className="text-foreground min-w-0 font-medium" title={view?.summary}>
					{view?.name ?? "A view this board no longer has"}
				</span>
			)}
		</p>
	);
}

/**
 * The subjects a step focuses, each a chip that picks it in the pane.
 * @param props The step, the reading that names its subjects and the pick.
 * @returns The chips, or nothing when the step is about the whole picture.
 */
function StepSubjects(props: StepRowProps): JSX.Element | null {
	const { beat, reading } = props;
	const kinds = useMemo(
		() => new Map(reading.variant?.content.nodes.map((node) => [node.id, node.kind]) ?? []),
		[reading.variant],
	);
	if (beat.subjects.length === 0) {
		return null;
	}
	return (
		<div className="text-body flex min-w-0 items-baseline gap-2">
			<span className="text-muted-foreground w-12 shrink-0">Focus</span>
			<ul className="flex min-w-0 flex-wrap gap-1">
				{beat.subjects.map((id) => (
					<SubjectChip
						key={id}
						id={id}
						name={reading.nameOf(id)}
						kind={kinds.get(id)}
						look={props.look}
						picked={props.selection === id}
						onPick={props.onPick}
					/>
				))}
			</ul>
		</div>
	);
}

/**
 * One subject of a step: a part with its kind's icon in its kind's colour, or
 * a relationship, a sequence or a message of one with an arrow. Choosing it picks it out, and choosing it
 * again lets it go.
 * @param props The subject and the pick.
 * @param props.id The subject's id.
 * @param props.name What the variant calls it.
 * @param props.kind Its kind, when it is a part.
 * @param props.look How the vault's kinds look.
 * @param props.picked Whether it is picked out.
 * @param props.onPick Pick it out, or let it go.
 * @returns The chip.
 */
function SubjectChip(props: {
	readonly id: string;
	readonly name: string;
	readonly kind: string | undefined;
	readonly look: KindLook;
	readonly picked: boolean;
	readonly onPick: (id: string | null) => void;
}): JSX.Element {
	const { id, kind, look, picked, onPick } = props;
	const pick = useCallback((): void => {
		onPick(picked ? null : id);
	}, [onPick, picked, id]);
	const ink = useMemo<CSSProperties | undefined>(
		() => (kind === undefined ? undefined : { color: look.nodeColor(kind) }),
		[look, kind],
	);
	return (
		<li className="min-w-0">
			<button
				type="button"
				aria-pressed={picked}
				data-slot="about-step-subject"
				data-subject={id}
				onClick={pick}
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

export { AboutWalkthroughs, type AboutWalkthroughsProps };

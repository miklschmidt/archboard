// The rail: one explanation of this variant, read beside the picture of it.
//
// It is prose in a column, in the order its author wrote it, and the reader
// moves through it by scrolling — which is how anyone reads anything. One beat
// is current at a time: the last one to have passed the reading line, a third
// of the way down the rail, where the eye actually is. Moving to another beat
// is what sends the diagram to that beat's subjects, so scrolling the words is
// what moves the picture.
//
// Nothing here animates. A jump to a beat arrives rather than gliding, for the
// reason written over `scrollBeatToLine`, and the camera move it causes eases
// or does not under the shell's reduced-motion preference, which
// `SemanticDiagram` already owns.
//
// Keys are on the beat headings rather than on the scrolling column. A column
// of prose is not an interactive widget and every role that would let it take a
// tab stop would be a lie about what it is; its headings are buttons already,
// they are the natural tab stops, and moving between them with the arrows is
// both keyboard navigation and the thing a reader wants. Closing is the control
// in the header, not an Escape key that would mean something different here
// from what it means over the diagram an inch away.

import { RiCloseLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
} from "react";

import type { SemanticWalkthrough, WalkthroughBeat } from "@/shared/semantic-board/index";
import { Button } from "@/ui/components/button";
import {
	beatAtLine,
	beatForKey,
	readingLineAt,
	tailAfterLastBeat,
} from "@/ui/semantic-board-canvas/lib/narrative";

/** The attribute each beat carries, so the rail can measure where they sit. */
const BEAT_ATTRIBUTE = "data-semantic-beat";

/** The close control: a 28px ghost icon button inside a 32px hit area. */
const CLOSE_BUTTON_CLASS = "hit-area text-muted-foreground -mr-2";

/**
 * Where each beat sits, measured from the top of the rail.
 *
 * Measured rather than remembered: prose reflows when the pane is resized, and
 * a remembered offset would send the reader to where a beat used to be.
 * @param rail The scrolling column.
 * @returns Each beat's top, in the rail's own pixels, in order.
 */
function beatTops(rail: HTMLElement): number[] {
	const top = rail.getBoundingClientRect().top;
	return [...rail.querySelectorAll<HTMLElement>(`[${BEAT_ATTRIBUTE}]`)].map(
		(beat) => beat.getBoundingClientRect().top - top,
	);
}

/**
 * How far down the rail the reading line is.
 * @param rail The scrolling column.
 * @returns The line, in the rail's own pixels.
 */
function readingLine(rail: HTMLElement): number {
	return readingLineAt(rail.getBoundingClientRect().height);
}

/**
 * Bring one beat to the reading line, at once.
 *
 * At once rather than gliding, and that is a decision rather than an omission.
 * A glide emits a scroll event at every position it passes through, and this
 * rail reads the current beat out of exactly those events — so jumping from the
 * first beat to the fifth would make every beat between them current in turn,
 * fly the camera through subjects nobody asked to see, and ask the server for
 * the picture of any view those beats are told through. Arriving means one
 * gesture is one beat. Scrolling by hand, where the reader is moving through
 * the beats on purpose, is where the narrative follows them.
 *
 * A DOM without `scrollTo` still moves the reader's place to the beat; only the
 * column's position differs, which is the same tolerance the diagram's pointer
 * capture takes.
 * @param rail The scrolling column.
 * @param index Which beat.
 */
function scrollBeatToLine(rail: HTMLElement, index: number): void {
	const top = beatTops(rail)[index];
	if (top === undefined || typeof rail.scrollTo !== "function") {
		return;
	}
	rail.scrollTo({ top: rail.scrollTop + top - readingLine(rail), behavior: "auto" });
}

/**
 * The blank space under the last beat, as a style.
 *
 * A style rather than a class because it is a measurement: the tail depends on
 * how tall the scrollport actually is, and every class that could express it
 * would be a guess about one pane height.
 * @param room How tall the scrollport is, or 0 before it has been measured.
 * @returns The padding to leave after the last beat.
 */
function tailStyle(room: number): CSSProperties {
	return { paddingBottom: `${tailAfterLastBeat(room)}px` };
}

/** Nothing of this beat is missing from the picture. */
const NOTHING_MISSING: readonly string[] = Object.freeze([]);

/** Inputs for the note about what a reading does not draw. */
interface BeatMissingProps {
	/** What this reading does not draw of the beat's subjects, in the board's words. */
	missing: readonly string[];
}

/**
 * What the picture beside this beat cannot show.
 *
 * Said out loud rather than left to be inferred from a camera that did not
 * move. A beat about parts this reading does not draw is a normal thing in a
 * narrative told across several views, and a reader who is not told would take
 * whatever the camera is pointing at for the subject.
 * @param props What is missing.
 * @returns The note, or null when this reading draws everything the beat is about.
 */
function BeatMissing(props: BeatMissingProps): JSX.Element | null {
	if (props.missing.length === 0) {
		return null;
	}
	return (
		<p
			data-slot="semantic-beat-missing"
			className="text-technical text-muted-foreground border-border mt-2 border-l-2 pl-2"
		>
			This reading does not draw {props.missing.join(", ")}.
		</p>
	);
}

/** Inputs for one beat. */
interface BeatItemProps {
	/** The beat. */
	beat: WalkthroughBeat;
	/** Where it sits in the explanation. */
	index: number;
	/** How many beats the explanation has, for the keys that move between them. */
	count: number;
	/** Whether it is the one being read. */
	current: boolean;
	/** What this view does not draw of it, in the words the board uses. */
	missing: readonly string[];
	/**
	 * Move to a beat.
	 * @param index Which beat.
	 * @param withFocus Whether to put the keyboard on it as well.
	 */
	onGo: (index: number, withFocus: boolean) => void;
}

/**
 * One beat: what it says, and what the reader is told when the picture beside
 * it cannot show what it is about.
 * @param props The beat, where it sits, whether it is current, and what moves.
 * @returns The beat.
 */
function BeatItem(props: BeatItemProps): JSX.Element {
	const { beat, index, count, current, missing, onGo } = props;
	const go = useCallback((): void => {
		onGo(index, false);
	}, [index, onGo]);
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>): void => {
			const next = beatForKey(event.key, index, count);
			if (next === null) {
				return;
			}
			event.preventDefault();
			onGo(next, true);
		},
		[count, index, onGo],
	);
	// The beat being read is at full strength and the rest are stood down, so
	// that the column says where the reader is without a second ornament for it.
	const tone = current ? "" : "text-muted-foreground";
	return (
		<li
			data-slot="semantic-beat"
			data-semantic-beat={beat.id}
			aria-current={current ? "step" : undefined}
			className={`border-l-2 py-3 pl-4 ${current ? "border-foreground" : "border-transparent"}`}
		>
			<h3>
				<button
					type="button"
					data-slot="semantic-beat-heading"
					onClick={go}
					onKeyDown={onKeyDown}
					className={`text-title cursor-pointer text-left outline-none ${tone}`}
				>
					{beat.heading}
				</button>
			</h3>
			<p className={`text-body mt-1.5 whitespace-pre-line ${tone}`}>{beat.body}</p>
			<BeatMissing missing={missing} />
		</li>
	);
}

/** Inputs for the rail. */
interface SemanticNarrativeProps {
	/** The explanation being read. */
	walkthrough: SemanticWalkthrough;
	/** Which beat is current. */
	beatIndex: number;
	/** What this view does not draw of the current beat's subjects, named. */
	missing: readonly string[];
	/**
	 * The reader moved to a beat.
	 * @param index Which beat.
	 */
	onBeat: (index: number) => void;
	/** The reader closed the explanation. */
	onClose: () => void;
}

/**
 * One walkthrough, read beside the diagram.
 * @param props The explanation, where the reader is, and what moves them.
 * @returns The rail.
 */
function SemanticNarrative(props: SemanticNarrativeProps): JSX.Element {
	const { walkthrough, beatIndex, onBeat } = props;
	const [rail, setRail] = useState<HTMLElement | null>(null);
	const beats = walkthrough.beats;
	// How tall the scrollport is, watched rather than read once: the pane is
	// resized by things that have nothing to do with this rail — the workbench
	// collapsing, a standing block appearing above the diagram — and both the
	// tail after the last beat and the reading line are measured from it.
	const [room, setRoom] = useState(0);
	// A resize moves the column without the reader having asked for anything, and
	// the scroll events it causes must not be read as them moving through the
	// beats. The beat they were on is the beat they are on.
	const settled = useRef<number | null>(null);
	const resizing = useRef(false);

	useEffect(() => {
		if (rail === null) {
			return undefined;
		}
		/** Take the rail's height, whenever it has a new one. */
		function measure(): void {
			if (rail === null) {
				return;
			}
			const height = rail.getBoundingClientRect().height;
			setRoom((current) => {
				if (current === height) {
					return current;
				}
				resizing.current = true;
				return height;
			});
		}
		measure();
		if (typeof ResizeObserver !== "function") {
			return undefined;
		}
		const observer = new ResizeObserver(measure);
		observer.observe(rail);
		return (): void => observer.disconnect();
	}, [rail]);

	// Put the reader back where they were, once the new tail is on the page. The
	// beat they were reading returns to the reading line, so the scroll the
	// browser did on its own is undone rather than interpreted.
	useEffect(() => {
		if (rail === null || settled.current === room) {
			return;
		}
		settled.current = room;
		scrollBeatToLine(rail, beatIndex);
		resizing.current = false;
	}, [beatIndex, rail, room]);

	// A jump scrolls; scrolling does not jump. Snapping the column back under a
	// reader who is scrolling it is the one thing a narrative rail must never do.
	const onGo = useCallback(
		(index: number, withFocus: boolean): void => {
			onBeat(index);
			if (rail === null) {
				return;
			}
			scrollBeatToLine(rail, index);
			if (withFocus) {
				rail.querySelectorAll<HTMLElement>("[data-slot='semantic-beat-heading']")[index]?.focus();
			}
		},
		[onBeat, rail],
	);

	const onScroll = useCallback((): void => {
		if (rail === null || resizing.current) {
			return;
		}
		const at = beatAtLine(beatTops(rail), readingLine(rail));
		if (at !== beatIndex) {
			onBeat(at);
		}
	}, [beatIndex, onBeat, rail]);

	return (
		<aside
			data-slot="semantic-narrative"
			data-semantic-walkthrough={walkthrough.id}
			aria-label={`Walkthrough ${walkthrough.name}`}
			className="border-border bg-background flex w-[22rem] shrink-0 flex-col border-r"
		>
			<div className="border-border flex flex-col gap-1 border-b px-4 py-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-title truncate" title={walkthrough.name}>
						{walkthrough.name}
					</h2>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Close this walkthrough"
						data-slot="semantic-narrative-close"
						className={CLOSE_BUTTON_CLASS}
						onClick={props.onClose}
					>
						<RiCloseLine aria-hidden="true" />
					</Button>
				</div>
				{walkthrough.summary !== undefined && (
					<p className="text-body text-muted-foreground">{walkthrough.summary}</p>
				)}
				<p className="text-technical text-muted-foreground font-mono">
					{beatIndex + 1} of {beats.length}
				</p>
			</div>
			{/* Keyed by the explanation, so choosing another opens it at its
			    beginning rather than at the last one's scroll position. The tail of
			    blank space under the last beat is what lets it reach the reading
			    line, and it is measured from the scrollport because a fixed one is
			    enough room at one pane height and not at another. */}
			<ol
				key={walkthrough.id}
				ref={setRail}
				data-slot="semantic-narrative-beats"
				onScroll={onScroll}
				style={tailStyle(room)}
				className="min-h-0 flex-1 overflow-y-auto px-3 pt-4"
			>
				{beats.map((beat, index) => (
					<BeatItem
						key={beat.id}
						beat={beat}
						index={index}
						count={beats.length}
						current={index === beatIndex}
						missing={index === beatIndex ? props.missing : NOTHING_MISSING}
						onGo={onGo}
					/>
				))}
			</ol>
		</aside>
	);
}

export { SemanticNarrative, type SemanticNarrativeProps };

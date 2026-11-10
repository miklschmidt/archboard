import { useCallback, useContext, type JSX, type ReactNode } from "react";
import { Button, cn } from "@archboard/ui-kit/components";
import { ModelDraftContext } from "#ui/architecture-drawing/model-reader/state/draft.ts";

/** Inputs for a state. */
interface ModelStateProps {
	readonly slot: string;
	/** Lay the state over a surface that stays mounted under it. */
	readonly cover?: boolean;
	readonly children: ReactNode;
}

/**
 * What a pane shows while it has no picture to show: what stands here, and the one way on.
 * @param props The state's slot and parts.
 * @returns The state, in the middle of the ground.
 */
function ModelState(props: ModelStateProps): JSX.Element {
	return (
		<section
			data-slot={props.slot}
			className={cn(
				"bg-background flex min-h-0 items-center justify-center p-10",
				props.cover === true ? "absolute inset-0 z-10" : "flex-1",
			)}
		>
			<div className="w-[46ch] max-w-full space-y-3">{props.children}</div>
		</section>
	);
}

/**
 * What the state is about.
 * @param props The words.
 * @param props.children The name.
 * @returns The title.
 */
function ModelStateTitle(props: { readonly children: ReactNode }): JSX.Element {
	return <h2 className="font-display text-name break-words uppercase">{props.children}</h2>;
}

/**
 * How it stands.
 * @param props The words.
 * @param props.children The statement.
 * @returns The line.
 */
function ModelStateLine(props: { readonly children: ReactNode }): JSX.Element {
	return <p className="text-control text-muted-foreground font-normal">{props.children}</p>;
}

/**
 * The one way on: it fills the composer, and the reader sends it.
 * @param props The label and the words.
 * @param props.label What the button says.
 * @param props.draft What the composer receives.
 * @returns The action.
 */
function ModelStateAsk(props: { readonly label: string; readonly draft: string }): JSX.Element {
	const { draft } = props;
	const fill = useContext(ModelDraftContext);
	const ask = useCallback((): void => fill?.(draft), [fill, draft]);
	return (
		<Button size="sm" data-slot="model-state-ask" onClick={ask}>
			{props.label}
		</Button>
	);
}

/**
 * A wait that lasted, under the top of the pane, which it never moves.
 * @param props The words.
 * @param props.children What the wait is for.
 * @returns The message.
 */
function ModelStateWaiting(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<output
			data-slot="model-waiting"
			className="text-body text-body-foreground bg-popover border-border shadow-float rounded-panel animate-in fade-in-0 slide-in-from-top-1 mt-3 inline-flex h-7.5 items-center gap-2 self-center border pr-3 pl-2 duration-200 motion-reduce:animate-none"
		>
			<DrawingMark />
			<span>{props.children}</span>
		</output>
	);
}

/** The cards of the wait's little picture, by their top left corners. */
const MARK_CARDS = [
	[1, 1],
	[22, 1],
	[11.5, 11],
] as const;

/**
 * The lines of the little picture, in the order a spark draws them: each line,
 * its arrowhead, and the two ways round the card it lands on.
 */
const MARK_LINES = [
	{
		path: "M10 4H22",
		head: "M19.6 2.6L22 4L19.6 5.4Z",
		rims: [
			"M22 4V2.5A1.5 1.5 0 0 1 23.5 1H29.5A1.5 1.5 0 0 1 31 2.5V4",
			"M22 4V5.5A1.5 1.5 0 0 0 23.5 7H29.5A1.5 1.5 0 0 0 31 5.5V4",
		],
	},
	{
		path: "M26.5 7V12A2 2 0 0 1 24.5 14H20.5",
		head: "M22.9 12.6L20.5 14L22.9 15.4Z",
		rims: [
			"M20.5 14V12.5A1.5 1.5 0 0 0 19 11H13A1.5 1.5 0 0 0 11.5 12.5V14",
			"M20.5 14V15.5A1.5 1.5 0 0 1 19 17H13A1.5 1.5 0 0 1 11.5 15.5V14",
		],
	},
] as const;

/**
 * A little picture that a spark draws again and again while the wait lasts, as
 * the picture itself arrives (DESIGN.md, The Spark Rule). Its motion is in app.css.
 * @returns The mark, which assistive technology skips.
 */
function DrawingMark(): JSX.Element {
	return (
		<svg data-slot="drawing-mark" viewBox="0 0 32 18" aria-hidden="true" focusable="false">
			{MARK_CARDS.map(([x, y]) => (
				<rect key={`${x} ${y}`} data-part="card" x={x} y={y} width="9" height="6" rx="1.5" />
			))}
			<g data-part="round">
				{MARK_LINES.map((line, index) => (
					<g key={line.path} data-line={index + 1}>
						<path data-part="ink" pathLength={1} d={line.path} />
						<path data-part="head" d={line.head} />
						{line.rims.map((rim) => (
							<path key={rim} data-part="rim" pathLength={1} d={rim} />
						))}
						<path data-part="glow" pathLength={1} d={line.path} />
						<path data-part="spark" pathLength={1} d={line.path} />
					</g>
				))}
			</g>
		</svg>
	);
}

ModelState.Title = ModelStateTitle;
ModelState.Line = ModelStateLine;
ModelState.Ask = ModelStateAsk;
ModelState.Waiting = ModelStateWaiting;

export { ModelState };

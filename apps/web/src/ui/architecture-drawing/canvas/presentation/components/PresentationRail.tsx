// The rail along the top of a presented walkthrough's column: one segment for each step, and a way
// to its step in each. It says where the reader is in the walkthrough at a glance, and it is how a
// step is chosen out of order.
//
// The step shown is marked by one piece of gold that is as wide as a segment and travels along the
// rail to the new step, with a paler wake that arrives a little after it, so a long jump is
// followed across the rail and a short one is a step. The segments before it are gold too, so the
// rail fills up to the step shown, as the site's walkthrough player does. The segments after it
// are in a tone that keeps the contrast of a mark against the column, because they are controls.
// Only a transform moves the gold piece; the stylesheet (app.css, `semantic-presentation-rail`)
// does it.

import { useCallback, useMemo, type CSSProperties, type JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import { KeyTip } from "#ui/architecture-drawing/canvas/presentation/components/PresentationKeys.tsx";
import type { VariantContent } from "@archboard/model/content";

type SemanticWalkthrough = VariantContent["walkthroughs"][number];

/** Inputs for one segment. */
interface StepSegmentProps {
	/** The step it goes to. */
	readonly index: number;
	/** The step's heading, for its name. */
	readonly heading: string;
	/** Whether it is the step shown. */
	readonly current: boolean;
	/** Whether the step comes before the one shown, so its segment is filled. */
	readonly done: boolean;
	/**
	 * Show a step.
	 * @param index The step.
	 */
	readonly onGo: (index: number) => void;
}

/**
 * One step's segment, which goes to that step.
 * @param props The step, whether it is shown, and what choosing it does.
 * @returns The segment.
 */
function StepSegment(props: StepSegmentProps): JSX.Element {
	const { index, onGo, current } = props;
	const go = useCallback((): void => {
		onGo(index);
	}, [onGo, index]);
	const name = `Step ${index + 1}: ${props.heading}`;
	return (
		<KeyTip label={name}>
			<button
				type="button"
				data-slot="semantic-presentation-step"
				data-step={index}
				aria-current={current ? "step" : undefined}
				aria-label={name}
				onClick={go}
				className="hit-area group flex h-5 min-w-0 flex-1 items-center outline-none"
			>
				<span
					className={cn(
						"group-focus-visible:ring-ring block h-1 w-full rounded-full transition-colors duration-150 group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-(--sidebar) motion-reduce:transition-none",
						props.done
							? "bg-primary-mark"
							: "bg-muted-foreground/70 group-hover:bg-muted-foreground",
					)}
				/>
			</button>
		</KeyTip>
	);
}

/** Inputs for the rail. */
interface PresentationRailProps {
	/** The walkthrough, for the steps it has. */
	readonly walkthrough: SemanticWalkthrough;
	/** Which step is shown. */
	readonly index: number;
	/**
	 * Show a step.
	 * @param index The step.
	 */
	readonly onGo: (index: number) => void;
}

/**
 * The rail of steps.
 * @param props The walkthrough, the step shown, and what choosing a step does.
 * @returns The rail.
 */
function PresentationRail(props: PresentationRailProps): JSX.Element {
	const { beats } = props.walkthrough;
	const placed = useMemo<CSSProperties>(
		() => ({ "--at": props.index, "--count": beats.length }),
		[props.index, beats.length],
	);
	return (
		<nav
			aria-label="Steps"
			data-slot="semantic-presentation-rail"
			style={placed}
			className="relative flex gap-1"
		>
			{beats.map((beat, at) => (
				<StepSegment
					key={beat.id}
					index={at}
					heading={beat.heading}
					current={at === props.index}
					done={at < props.index}
					onGo={props.onGo}
				/>
			))}
			<span aria-hidden="true" data-mark="wake" className="bg-primary-mark/40" />
			<span aria-hidden="true" data-mark="gold" className="bg-primary-mark" />
		</nav>
	);
}

export { PresentationRail };

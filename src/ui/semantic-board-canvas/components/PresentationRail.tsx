// The rail along the top of a presented walkthrough's box: one segment for each step, the one
// shown in gold, each a way to its step. It says where the reader is in the walkthrough at a
// glance, and it is how a step is chosen out of order.

import { useCallback, type JSX } from "react";

import type { SemanticWalkthrough } from "@/shared/semantic-board/index";
import { cn } from "@/ui/components/class-names";

/** Inputs for one segment. */
interface StepSegmentProps {
	/** The step it goes to. */
	readonly index: number;
	/** The step's heading, for its name. */
	readonly heading: string;
	/** Whether it is the step shown. */
	readonly current: boolean;
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
	return (
		<button
			type="button"
			data-slot="semantic-presentation-step"
			data-step={index}
			aria-current={current ? "step" : undefined}
			aria-label={`Step ${index + 1}: ${props.heading}`}
			onClick={go}
			className="hit-area group flex h-5 min-w-0 flex-1 items-center outline-none"
		>
			<span
				className={cn(
					"group-focus-visible:ring-ring block h-1.5 w-full rounded-full transition-colors duration-150 group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-(--card) motion-reduce:transition-none",
					current ? "bg-primary-mark" : "bg-border group-hover:bg-muted-foreground/60",
				)}
			/>
		</button>
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
	return (
		<nav aria-label="Steps" data-slot="semantic-presentation-rail" className="flex gap-1">
			{props.walkthrough.beats.map((beat, at) => (
				<StepSegment
					key={beat.id}
					index={at}
					heading={beat.heading}
					current={at === props.index}
					onGo={props.onGo}
				/>
			))}
		</nav>
	);
}

export { PresentationRail, type PresentationRailProps };

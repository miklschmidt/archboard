// The voice, seen: one quiet gold ring around a waveform, the agent's name, what
// it is doing, and the steps of its plan, done, now and next. It sits just above
// the agent bar, where the agent's state is, and it is there only while voice is
// live.
//
// The waveform follows the model's measured output level while it speaks and
// breathes slowly while it listens. Nothing here listens to the microphone.

import { RiCheckLine } from "@remixicon/react";
import type { CSSProperties, JSX } from "react";

import { AGENT_ELAPSED_TICK_MS } from "@/shared/timing/timing";
import { clockDuration } from "@/ui/components/age";
import { cn } from "@/ui/components/class-names";
import { useClock } from "@/ui/components/use-clock";
import type { CardStep } from "@/ui/workbench/lib/voice-card";

/** How many bars the waveform has. */
const BARS = 21;

/**
 * How tall a bar stands by its place: tallest in the middle, falling away to the
 * sides in a diamond.
 * @param index The bar.
 * @returns A fraction of the full height, never below a tenth.
 */
function envelope(index: number): number {
	const distance = Math.abs(index - (BARS - 1) / 2) / ((BARS - 1) / 2);
	return Math.max(0.1, 1 - distance * 0.9);
}

/** Inputs for the ring. */
interface VoiceRingProps {
	/** The model's output level, 0 to 1. */
	readonly level: number;
	/** Whether the voice is speaking; otherwise it is listening. */
	readonly speaking: boolean;
}

/**
 * The ring and the waveform inside it.
 * @param props The level and whether the voice is speaking.
 * @returns The ring.
 */
function VoiceRing(props: VoiceRingProps): JSX.Element {
	const level: CSSProperties = { ["--level" as string]: props.speaking ? props.level : 0.08 };
	return (
		<div
			aria-hidden="true"
			data-slot="voice-ring"
			data-speaking={props.speaking ? "" : undefined}
			style={level}
			className="relative flex size-[92px] shrink-0 items-center justify-center"
		>
			<i className="voice-ring absolute inset-0 rounded-full" />
			<div className="flex h-9 items-center gap-[1.6px]">
				{Array.from({ length: BARS }, (_, index) => (
					<b
						key={index}
						className="voice-bar block w-[1.8px] rounded-full"
						style={
							{
								["--envelope" as string]: envelope(index),
								animationDelay: `${((index * 37) % 17) * -0.09}s`,
							} satisfies CSSProperties
						}
					/>
				))}
			</div>
		</div>
	);
}

/** Inputs for the steps. */
interface StepsProps {
	readonly steps: readonly CardStep[];
	/** When the turn started, for the clock beside the step it is on; null when it did not. */
	readonly sinceMs: number | null;
}

/**
 * The plan: a check for a step done, a lit ring for the one it is on, a quiet ring for each to come.
 * @param props The steps and when the turn began.
 * @returns The list.
 */
function Steps(props: StepsProps): JSX.Element {
	const now = useClock(AGENT_ELAPSED_TICK_MS, props.sinceMs !== null);
	return (
		<ol aria-label="The plan" className="mt-1.5 flex flex-col gap-1">
			{props.steps.map((step, index) => (
				<li
					key={`${index}-${step.text}`}
					data-state={step.state}
					className={cn(
						"text-body flex h-[18px] items-center gap-2.5",
						step.state === "now" && "text-foreground font-medium",
						step.state === "done" && "text-muted-foreground",
						step.state === "next" && "text-muted-foreground/70",
					)}
				>
					<span aria-hidden="true" className="flex size-3.5 shrink-0 items-center justify-center">
						{step.state === "done" ? (
							<RiCheckLine className="text-primary-text size-3.5" />
						) : (
							<i
								className={cn(
									"block size-3 rounded-full border-[1.5px]",
									step.state === "now"
										? "border-primary shadow-[0_0_6px_var(--primary)] motion-safe:animate-pulse"
										: "border-muted-foreground/50",
								)}
							/>
						)}
					</span>
					<span className="min-w-0 truncate">{step.text}</span>
					{step.state === "now" && props.sinceMs !== null && (
						<span className="text-technical text-muted-foreground shrink-0 font-mono">
							{clockDuration(now - props.sinceMs)}
						</span>
					)}
				</li>
			))}
		</ol>
	);
}

/** Inputs for the card. */
interface VoiceCardProps {
	/** The agent's name. */
	readonly agent: string;
	/** What it is doing, in a line. */
	readonly doing: string;
	/** The steps of its plan; none when it has none. */
	readonly steps: readonly CardStep[];
	/** When the running turn started, or null while none runs. */
	readonly sinceMs: number | null;
	/** The model's output level, 0 to 1. */
	readonly level: number;
	/** Whether the voice is speaking, or listening. */
	readonly speaking: boolean;
	/** Whether the voice is muted, which the card says. */
	readonly muted: boolean;
	/** Where it sits, from its container. */
	readonly className?: string | undefined;
}

/**
 * The voice card.
 * @param props The agent, what it is doing, its plan and the voice.
 * @returns The card.
 */
function VoiceCard(props: VoiceCardProps): JSX.Element {
	return (
		<section
			aria-label={`${props.agent}, voice`}
			data-slot="voice-card"
			className={cn(
				"border-border bg-popover text-popover-foreground flex w-[372px] max-w-[calc(100vw-32px)] items-center gap-4 rounded-[6px] border py-3 pr-4 pl-3 shadow-md",
				props.className,
			)}
		>
			<VoiceRing level={props.level} speaking={props.speaking && !props.muted} />
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex items-center gap-2">
					<h2 className="text-title">{props.agent}</h2>
					<span className="border-primary/60 bg-primary/10 text-primary-text text-body rounded-full border px-2 leading-[18px]">
						{props.muted ? "Muted" : "Agent"}
					</span>
				</div>
				<p className="text-control mt-0.5 truncate font-normal" title={props.doing}>
					{props.doing}
				</p>
				<Steps steps={props.steps} sinceMs={props.sinceMs} />
			</div>
		</section>
	);
}

export { VoiceCard, type VoiceCardProps };

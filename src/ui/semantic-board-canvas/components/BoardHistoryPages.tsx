// The variants page and the walkthroughs page: how the board has changed, and
// how the author reads it aloud. Both are in the author's own words.

import type { JSX } from "react";

import type { Adoption, SemanticWalkthrough } from "@/shared/semantic-board/index";
import { cn } from "@/ui/components/class-names";
import { Lifecycle } from "@/ui/semantic-board-canvas/components/BoardPageParts";
import type { OfferedVariant } from "@/ui/semantic-board-canvas/lib/board-document";
import { variantOrder } from "@/ui/variant-lifecycle";

/** A heading over a part of a page: the sidebar's own, sentence case in the body size. */
function PageHeading(props: { readonly children: string }): JSX.Element {
	return <h2 className="text-body text-muted-foreground mb-2 font-semibold">{props.children}</h2>;
}

/** Inputs for the variants page. */
interface VariantsPageProps {
	/** Every variant of the board, in the order the board states them. */
	readonly variants: readonly OfferedVariant[];
	/** Every time the designation of the current architecture moved. */
	readonly adoptions: readonly Adoption[];
	/** The id of the variant the board's name opens, or null. */
	readonly opens: string | null;
	/** The id of the variant on screen, or null while that is not known. */
	readonly showing: string | null;
	/**
	 * The person chose a variant to read.
	 * @param variant The variant's id.
	 */
	readonly onChoose: ((variant: string) => void) | undefined;
}

/** Inputs for one variant's card. */
interface VariantCardProps {
	readonly variant: OfferedVariant;
	readonly drawn: boolean;
	readonly onChoose: ((variant: string) => void) | undefined;
}

/**
 * One variant: its name, where it stands and what it says about itself.
 * @param props The variant, whether it is on screen and how to choose it.
 * @returns The card.
 */
function VariantCard(props: VariantCardProps): JSX.Element {
	const { variant, drawn, onChoose } = props;
	return (
		<li className="min-w-0">
			<button
				type="button"
				aria-pressed={drawn}
				disabled={onChoose === undefined}
				data-slot="variant-card"
				data-variant={variant.id}
				onClick={() => onChoose?.(variant.id)}
				className="border-border bg-card hover:border-foreground/25 aria-pressed:border-primary-text aria-pressed:bg-primary-subtle rounded-panel flex h-full w-full min-w-0 flex-col gap-2 border p-4 text-left"
			>
				<span className="flex items-center justify-between gap-3">
					<span className="title-name truncate">{variant.name}</span>
					<Lifecycle lifecycle={variant.lifecycle} />
				</span>
				<span className="text-control text-muted-foreground">
					{variant.summary ?? "This variant has no summary."}
				</span>
				{drawn && (
					<span className="text-body text-primary-text mt-auto pt-1 font-medium">On screen</span>
				)}
			</button>
		</li>
	);
}

/**
 * The board's variants, and the record of when the current architecture moved.
 * @param props The variants, the adoptions and the one on screen.
 * @returns The page.
 */
function VariantsPage(props: VariantsPageProps): JSX.Element {
	const { variants, adoptions } = props;
	const nameOf = (id: string): string => variants.find((one) => one.id === id)?.name ?? id;
	return (
		<div className="flex flex-col gap-6">
			<ul className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
				{variantOrder(variants, props.opens).map((variant) => (
					<VariantCard
						key={variant.id}
						variant={variant}
						drawn={variant.id === props.showing}
						onChoose={props.onChoose}
					/>
				))}
			</ul>
			{adoptions.length > 0 && (
				<section aria-label="Adoptions">
					<PageHeading>Adoptions</PageHeading>
					<ol>
						{adoptions.toReversed().map((adoption) => (
							<li
								key={`${adoption.variant}-${adoption.at}`}
								className="border-border text-control grid grid-cols-[88px_minmax(0,180px)_1fr] gap-3 border-t py-2"
							>
								<time
									dateTime={adoption.at}
									className="text-technical text-muted-foreground font-mono"
								>
									{adoption.at.slice(0, 10)}
								</time>
								<span className="truncate font-medium">{nameOf(adoption.variant)}</span>
								<span className="text-muted-foreground">{adoption.reason ?? ""}</span>
							</li>
						))}
					</ol>
				</section>
			)}
		</div>
	);
}

/** Inputs for the walkthroughs page. */
interface WalkthroughsPageProps {
	/** Every explanation the variant states. */
	readonly walkthroughs: readonly SemanticWalkthrough[];
	/**
	 * The person chose a step of a walkthrough to read.
	 * @param walkthrough The walkthrough's id.
	 * @param beat Which step, counted from zero.
	 */
	readonly onChoose: (walkthrough: string, beat: number) => void;
}

/** Inputs for one walkthrough's card. */
interface WalkthroughCardProps extends WalkthroughsPageProps {
	readonly walkthrough: SemanticWalkthrough;
}

/**
 * One walkthrough: its name, how many steps it has, and the steps, each of
 * which presents the walkthrough from there.
 * @param props The walkthrough and how to read it.
 * @returns The card.
 */
function WalkthroughCard(props: WalkthroughCardProps): JSX.Element {
	const { walkthrough } = props;
	const count = walkthrough.beats.length;
	return (
		<li className="border-border bg-card rounded-panel min-w-0 border p-4">
			<div className="flex items-center justify-between gap-3">
				<h3 className="title-name truncate">{walkthrough.name}</h3>
				<span className="text-body text-muted-foreground shrink-0">
					{count} {count === 1 ? "step" : "steps"}
				</span>
			</div>
			{walkthrough.summary !== undefined && (
				<p className="text-control text-muted-foreground mt-2">{walkthrough.summary}</p>
			)}
			<ol className="mt-3">
				{walkthrough.beats.map((beat, index) => (
					<li key={beat.id} className={cn("border-border border-t")}>
						<button
							type="button"
							data-slot="walkthrough-beat"
							onClick={() => props.onChoose(walkthrough.id, index)}
							className="text-control hover:bg-muted/60 rounded-control -mx-2 flex min-h-9 w-[calc(100%+16px)] items-center gap-3 px-2 py-1.5 text-left"
						>
							<span className="text-technical text-muted-foreground w-4 shrink-0 font-mono">
								{index + 1}
							</span>
							<span className="min-w-0">{beat.heading}</span>
						</button>
					</li>
				))}
			</ol>
		</li>
	);
}

/**
 * The explanations this variant gives of itself.
 * @param props The walkthroughs and how to read one.
 * @returns The page.
 */
function WalkthroughsPage(props: WalkthroughsPageProps): JSX.Element {
	if (props.walkthroughs.length === 0) {
		return (
			<p className="text-muted-foreground text-control py-2">This variant has no walkthrough.</p>
		);
	}
	return (
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(360px,460px))] gap-3">
			{props.walkthroughs.map((walkthrough) => (
				<WalkthroughCard key={walkthrough.id} {...props} walkthrough={walkthrough} />
			))}
		</ul>
	);
}

export { VariantsPage, WalkthroughsPage, type VariantsPageProps, type WalkthroughsPageProps };

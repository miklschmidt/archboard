// The tip about the part of the picture the pointer rests on: a small card that
// says what the part is, drawn as the picture draws its kind, and what the
// picture leaves out about it. It stands against the part, on the spot that
// leaves what the part lights in view.

import { useQuery } from "@tanstack/react-query";
import {
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type ReactNode,
} from "react";

import { cn } from "@archboard/ui-kit/components";

import { RelationshipSample, TypeSample } from "#ui/components/canvas/SemanticTypeSamples.tsx";
import type { AppliedAppearance } from "#ui/clients/canvas/reads/drawings.ts";
import type { VariantReading } from "#ui/rules/canvas/reading/document.ts";
import { vaultCheckQuery } from "#ui/clients/canvas/reads/queries.ts";
import {
	subjectTip,
	type SubjectTip,
	type TipTarget,
} from "#ui/clients/canvas/subjects/subject-tips.ts";
import { usePaneVault } from "#ui/hooks/canvas/use-pane-vault.ts";
import { useTipPlace, type PlacedTip } from "#ui/hooks/canvas/use-tip-place.ts";

/**
 * What the picture has to add about the part under the pointer, placed against it.
 * @param props The part, the reading it is described from and how far away the picture is seen.
 * @param props.target The part whose tip is open, or null.
 * @param props.appearance How the render reply draws the subject under the pointer.
 * @param props.reading What the model says about the variant the picture draws, or null.
 * @param props.far Whether the picture is seen from far away, where a card says only the start of its responsibility.
 * @param props.overview Whether the picture is the overview, whose joined lines are subjects of their own.
 * @returns The tip, or nothing when there is nothing to add.
 */
function SemanticSubjectTip(props: {
	readonly target: TipTarget | null;
	readonly appearance: AppliedAppearance | undefined;
	readonly reading: VariantReading | null;
	readonly far: boolean;
	readonly overview: boolean;
}): JSX.Element | null {
	const { target } = props;
	const levels = useQuery(vaultCheckQuery(usePaneVault())).data?.policy.levels;
	const tip =
		target === null
			? null
			: tipOver(target, props.appearance, props.reading, props.far, levels, props.overview);
	return <SubjectTipBox tip={tip} />;
}

/**
 * Where a picture's tips stand. It rests in the pane's corner and moves by a
 * transform, so that the room it has never narrows the tip it measures.
 * @param props The open tip, the light and the tips.
 * @param props.tip The open tip.
 * @param props.standing What the light leaves standing, or null.
 * @param props.children The tips.
 * @returns The place, which takes no pointer.
 */
function TipPlace(props: {
	readonly tip: PlacedTip;
	readonly standing: ReadonlySet<string> | null;
	readonly children: ReactNode;
}): JSX.Element {
	const { place, style } = useTipPlace(props.tip, props.standing);
	return (
		<div
			ref={place}
			data-slot="picture-tip-place"
			className="pointer-events-none absolute top-0 left-0 z-10 flex max-h-[calc(100%-1.5rem)] max-w-[min(24rem,calc(100%-1.5rem))] flex-col gap-2"
			style={style}
		>
			{props.children}
		</div>
	);
}

/**
 * One tip's card: a small panel on the popover surface.
 * @param props The card.
 * @param props.slot What the card is.
 * @param props.children What it says.
 * @returns The card.
 */
function TipCard(props: { readonly slot: string; readonly children: ReactNode }): JSX.Element {
	return (
		<div
			data-slot={props.slot}
			className="bg-popover text-popover-foreground border-border text-body shadow-float animate-in fade-in-0 flex min-h-0 w-max max-w-full min-w-[min(14rem,100%)] flex-col items-stretch gap-2.5 rounded-lg border px-3.5 py-3 [overflow-wrap:anywhere]"
		>
			{props.children}
		</div>
	);
}

/**
 * A tip about a part of the picture.
 * @param props What to say.
 * @param props.tip What the tip says, or null.
 * @param props.children What a reader of this subject says beside it.
 * @returns The tip, or nothing.
 */
function SubjectTipBox(props: {
	readonly tip: SubjectTip | null;
	readonly children?: ReactNode;
}): JSX.Element | null {
	const { tip } = props;
	if (tip === null) {
		return null;
	}
	return (
		<TipCard slot="semantic-subject-tip">
			<TipLines tip={tip}>{props.children}</TipLines>
		</TipCard>
	);
}

/**
 * A tip's lines, in reading order: what it is about, what the far view hides,
 * the longer account, and what a double-click does.
 * @param props The tip.
 * @param props.tip What it says.
 * @param props.children What stands before the last line.
 * @returns The lines that have something to say.
 */
function TipLines(props: { readonly tip: SubjectTip; readonly children?: ReactNode }): JSX.Element {
	const { tip } = props;
	return (
		<>
			<TipHeading tip={tip} />
			{tip.lead !== undefined && <p className="text-body shrink-0">{tip.lead}</p>}
			{tip.body !== undefined && <TipBody key={tip.body} text={tip.body} />}
			{props.children}
			{tip.hint !== undefined && (
				<p
					data-slot="semantic-subject-tip-hint"
					className="border-border text-technical text-muted-foreground shrink-0 border-t pt-2"
				>
					{tip.hint}
				</p>
			)}
		</>
	);
}

/**
 * What the tip over one part of the picture says, once the model has been read.
 * @param target The part under the pointer.
 * @param appearance How the picture draws that subject, when it names its type.
 * @param reading What the model says about the variant the picture draws, or null.
 * @param far Whether the picture is seen from far away.
 * @param levels The vault's levels, coarsest first, which place the model a part opens.
 * @param overview Whether the picture is the overview.
 * @returns The tip, or null when there is nothing to add.
 */
function tipOver(
	target: TipTarget,
	appearance: AppliedAppearance | undefined,
	reading: VariantReading | null,
	far: boolean,
	levels: readonly string[] | undefined,
	overview: boolean,
): SubjectTip | null {
	const variant = reading?.variant ?? null;
	return variant === null
		? null
		: subjectTip(variant, target, appearance, far, { here: reading?.level, levels }, overview);
}

/**
 * What the tip is about: the kind drawn small, as the picture draws it, beside
 * the part's name or a label's words and the kind's name.
 * @param props The tip.
 * @param props.tip What it says.
 * @returns The heading.
 */
function TipHeading(props: { readonly tip: SubjectTip }): JSX.Element {
	const { title, kind, appearance } = props.tip;
	return (
		<div data-slot="semantic-subject-tip-heading" className="flex shrink-0 items-center gap-2.5">
			{appearance !== undefined &&
				(appearance.depiction === "" ? (
					<RelationshipSample appearance={appearance} />
				) : (
					<TypeSample appearance={appearance} />
				))}
			<div className="flex min-w-0 flex-col">
				<p className="leading-snug font-semibold">{title}</p>
				{kind !== undefined && (
					<p className="text-technical text-muted-foreground leading-snug">{kind}</p>
				)}
			</div>
		</div>
	);
}

/** How many lines of a description a tip shows before it points to the inspector. */
const BODY_LINES = 10;

/**
 * A description, as its author broke it into lines, shown up to
 * {@link BODY_LINES} lines, and fewer when the screen leaves the tip less
 * room: it is the part of the tip that gives way. Cut short either way, it
 * fades out and says where the rest is. It is keyed by its text, so another
 * description is measured afresh.
 * @param props The description.
 * @param props.text What it says.
 * @returns The description.
 */
function TipBody(props: { readonly text: string }): JSX.Element {
	const body = useRef<HTMLParagraphElement>(null);
	const cut = useCut(body);
	const style = useMemo<CSSProperties>(() => ({ WebkitLineClamp: BODY_LINES }), []);
	return (
		<div className="flex min-h-0 flex-col gap-1.5">
			<p
				ref={body}
				data-slot="semantic-subject-tip-body"
				className={cn(
					"text-body text-popover-foreground/85 [display:-webkit-box] min-h-0 overflow-hidden leading-relaxed whitespace-pre-line [-webkit-box-orient:vertical]",
					cut && "[mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75em),transparent)]",
				)}
				style={style}
			>
				{props.text}
			</p>
			{cut && (
				<p
					data-slot="semantic-subject-tip-more"
					className="text-technical text-muted-foreground shrink-0"
				>
					Select it to read the rest in the inspector.
				</p>
			)}
		</div>
	);
}

/**
 * Whether an element shows less than it holds, kept up to date as its box changes.
 * @param element The element's ref.
 * @param element.current The element, once it is drawn.
 * @returns True while some of it is hidden.
 */
function useCut(element: { readonly current: HTMLElement | null }): boolean {
	const [cut, setCut] = useState(false);
	useLayoutEffect(() => {
		const shown = element.current;
		if (shown === null) return undefined;
		/** Compare what the element holds with what it shows. */
		const measure = (): void => {
			setCut(shown.scrollHeight > shown.clientHeight + 1);
		};
		measure();
		const watching = new ResizeObserver(measure);
		watching.observe(shown);
		return () => {
			watching.disconnect();
		};
	}, [element]);
	return cut;
}

export { SemanticSubjectTip, SubjectTipBox, TipCard, TipPlace };

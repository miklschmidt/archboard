// The tip over the part of the picture the pointer rests on: a small card that
// says what the part is, drawn as the picture draws its kind, and what the
// picture leaves out about it.

import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react";

import { cn } from "@archboard/ui-kit/class-names";

import { lineInk } from "@archboard/renderer/picture";
import { TooltipContent, Tooltip } from "@archboard/ui-kit/overlays";
import {
	RelationshipSample,
	TypeSample,
} from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import type { AppliedAppearance } from "@archboard/renderer/picture";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import { paletteInk } from "#ui/rules/semantic-board-canvas/board/palette.ts";
import { vaultCheckQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import {
	subjectTip,
	tipAnchor,
	type SubjectTip,
	type TipAnchor,
	type TipTarget,
} from "#ui/clients/semantic-board-canvas/subjects/subject-tips.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";

/**
 * What the picture has to add about the part under the pointer, placed against it.
 * @param props The part, the reading it is described from and how far away the picture is seen.
 * @param props.target The part whose tip is open, or null.
 * @param props.reading What the board says about the variant the picture draws, or null.
 * @param props.far Whether the picture is seen from far away, where a card says only the start of its responsibility.
 * @param props.overview Whether the picture is the overview, whose joined lines are subjects of their own.
 * @returns The tip, or nothing when there is nothing to add.
 */
function SemanticSubjectTip(props: {
	readonly target: TipTarget | null;
	readonly reading: VariantReading | null;
	readonly far: boolean;
	readonly overview: boolean;
}): JSX.Element | null {
	const { target } = props;
	const levels = useQuery(vaultCheckQuery(usePaneVault())).data?.policy.levels;
	const tip =
		target === null ? null : tipOver(target, props.reading, props.far, levels, props.overview);
	const anchor = useTipAnchor(target);
	if (tip === null || anchor === null) {
		return null;
	}
	return (
		<Tooltip open>
			<TooltipContent
				anchor={anchor}
				sideOffset={10}
				look="card"
				data-slot="semantic-subject-tip"
				className="w-max min-w-56 flex-col items-stretch gap-2.5"
				style={accentOf(tip.appearance)}
			>
				<TipLines tip={tip} />
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * What a tip is placed against: the part it is over, drawn without its traffic.
 * The same for as long as the tip is over one part, so the tip is not placed
 * afresh on every render.
 * @param target The part whose tip is open, or null.
 * @returns The anchor, or null when no tip is open.
 */
function useTipAnchor(target: TipTarget | null): TipAnchor | null {
	const part = target?.anchor ?? null;
	return useMemo(() => (part === null ? null : tipAnchor(part)), [part]);
}

/**
 * A tip's lines, in reading order: what it is about, what the far view hides,
 * the longer account, and what a double-click does.
 * @param props The tip.
 * @param props.tip What it says.
 * @returns The lines that have something to say.
 */
function TipLines(props: { readonly tip: SubjectTip }): JSX.Element {
	const { tip } = props;
	return (
		<>
			<TipHeading tip={tip} />
			{tip.lead !== undefined && <p className="text-body shrink-0">{tip.lead}</p>}
			{tip.body !== undefined && <TipBody key={tip.body} text={tip.body} />}
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
 * What the tip over one part of the picture says, once the board has been read.
 * @param target The part under the pointer.
 * @param reading What the board says about the variant the picture draws, or null.
 * @param far Whether the picture is seen from far away.
 * @param levels The vault's levels, coarsest first, which place the board a part opens.
 * @param overview Whether the picture is the overview.
 * @returns The tip, or null when there is nothing to add.
 */
function tipOver(
	target: TipTarget,
	reading: VariantReading | null,
	far: boolean,
	levels: readonly string[] | undefined,
	overview: boolean,
): SubjectTip | null {
	const variant = reading?.variant ?? null;
	return variant === null
		? null
		: subjectTip(variant, target, far, { here: reading?.level, levels }, overview);
}

/**
 * The tip's edge in the ink the picture draws the part's kind with: a card's
 * kind colour, a line's colour at its line strength.
 * @param appearance How the picture draws the part, when it names its type.
 * @returns The edge's style, or none when the picture names no type.
 */
function accentOf(appearance: AppliedAppearance | undefined): CSSProperties | undefined {
	if (appearance === undefined) return undefined;
	const ink =
		appearance.depiction === "" ? lineInk(appearance.lineColor) : paletteInk(appearance.typeColor);
	return { borderLeftColor: ink, borderLeftWidth: 3 };
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

export { SemanticSubjectTip };

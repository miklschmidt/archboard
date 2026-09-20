import { useId, useMemo, type JSX, type ReactNode } from "react";

import { PaletteColorSchema } from "@/shared/semantic-policy/index";
import { STANDING_COLORS } from "@/shared/theme/index";
import { Checkbox } from "@/ui/components/checkbox";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";

/**
 * A browser-only key to the channels in the current picture.
 * @param props The appearance facts and theme of the drawing.
 * @param props.appearances Facts emitted for its visible subjects.
 * @param props.comparison Whether comparison treatment is visible.
 * @param props.comparisonAvailable Whether this variant has a predecessor.
 * @param props.onComparisonChange Change the canvas treatment.
 * @returns The key, as a part of the sidebar's board tab.
 */
function SemanticLegend(props: {
	readonly appearances: ReadonlyMap<string, AppliedAppearance>;
	readonly comparison: boolean;
	readonly comparisonAvailable: boolean;
	readonly onComparisonChange: (enabled: boolean) => void;
}): JSX.Element {
	const comparisonId = useId();
	const standing = STANDING_COLORS;
	const entries = [...props.appearances.values()];
	const kinds = uniqueTypes(entries.filter((item) => item.depiction !== ""));
	const relationships = uniqueTypes(entries.filter((item) => item.depiction === ""));
	return (
		<section aria-label="Diagram legend" data-slot="semantic-legend" className="flex flex-col">
			<h2 className="text-kicker text-muted-foreground px-4 pt-4 pb-1 uppercase">Legend</h2>
			<div className="px-4 pb-4">
				{kinds.length > 0 && (
					<LegendSection title="Node types">
						<ul className="space-y-2.5">
							{kinds.map((item) => (
								<li key={sampleKey(item)} className="text-body flex items-center gap-3">
									<TypeSample appearance={item} />
									{item.typeName}
								</li>
							))}
						</ul>
					</LegendSection>
				)}
				{relationships.length > 0 && (
					<LegendSection title="Relationships">
						<ul className="space-y-2.5">
							{relationships.map((item) => (
								<li key={sampleKey(item)} className="text-body flex items-center gap-3">
									<RelationshipSample appearance={item} />
									{item.typeName}
								</li>
							))}
						</ul>
						<p className="text-muted-foreground text-body mt-3 leading-relaxed">
							Line weight shows emphasis. Moving dots illustrate authored traffic.
						</p>
					</LegendSection>
				)}
				<LegendSection title="Comparison and attention">
					{props.comparisonAvailable && (
						<div className="text-body mb-4 flex items-center gap-2">
							<Checkbox
								id={comparisonId}
								checked={props.comparison}
								onCheckedChange={props.onComparisonChange}
								data-slot="semantic-comparison-toggle"
							/>
							<label htmlFor={comparisonId}>Show comparison on canvas</label>
						</div>
					)}
					<div className="text-body grid grid-cols-2 gap-x-3 gap-y-2.5">
						{props.comparisonAvailable && props.comparison && (
							<>
								<StandingSample color={standing.added}>Added</StandingSample>
								<StandingSample color={standing.changed}>Changed</StandingSample>
								<StandingSample color={standing.removed}>Removed</StandingSample>
							</>
						)}
						<StandingSample color={standing.selected} outer>
							Selected
						</StandingSample>
					</div>
				</LegendSection>
			</div>
		</section>
	);
}

/**
 * One section in the legend with space between independent visual channels.
 * @param props Its heading and content.
 * @param props.title The channel explained.
 * @param props.children Its key.
 * @returns The section.
 */
function LegendSection(props: {
	readonly title: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<section className="border-border border-t py-4 last:pb-0">
			<h3 className="text-body mb-3 font-semibold">{props.title}</h3>
			{props.children}
		</section>
	);
}

/**
 * Resolve a curated color name, retaining a neutral fallback.
 * @param color The renderer's color name.
 * @param fallback Token for an uncolored type or relationship.
 * @returns A CSS color.
 */
function ink(color: string, fallback = "--muted-foreground"): string {
	const parsed = PaletteColorSchema.safeParse(color);
	return parsed.success ? `var(--semantic-${parsed.data})` : `var(${fallback})`;
}

/**
 * Keep each configured kind and its applied sample, even when display names repeat.
 * @param appearances Visible appearance facts.
 * @returns Unique types in drawing order.
 */
function uniqueTypes(appearances: readonly AppliedAppearance[]): AppliedAppearance[] {
	return [...new Map(appearances.map((item) => [sampleKey(item), item])).values()];
}

/**
 * Identify the configured kind and the visual meaning of its sample.
 * @param item One depicted type.
 * @returns A stable key independent of the subject or containment scope.
 */
function sampleKey(item: AppliedAppearance): string {
	return JSON.stringify([
		item.typeKind,
		item.typeName,
		item.iconSvg,
		item.typeColor,
		item.lineColor,
		item.dash,
		item.arrowhead,
	]);
}

/**
 * Show the configured relationship color, dash and arrowhead.
 * @param props One applied relationship and the picture's theme.
 * @param props.appearance The line appearance.
 * @returns The line sample.
 */
function RelationshipSample(props: { readonly appearance: AppliedAppearance }): JSX.Element {
	const { appearance } = props;
	const style = useMemo(
		() => ({ color: ink(appearance.lineColor, "--diagram-edge") }),
		[appearance.lineColor],
	);
	const dash =
		appearance.dash === "dotted" ? "1 4" : appearance.dash === "dashed" ? "6 4" : undefined;
	return (
		<svg
			aria-hidden="true"
			width="36"
			height="20"
			viewBox="0 0 36 20"
			className="shrink-0"
			style={style}
		>
			<path
				d="M1 10H30"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeDasharray={dash}
			/>
			{appearance.arrowhead !== "none" && (
				<path
					d="m25 5 7 5-7 5"
					fill={appearance.arrowhead === "filled" ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			)}
		</svg>
	);
}

/**
 * Distinguish standing borders from a separate selection ring.
 * @param props Color, label and whether this is the outer selection treatment.
 * @param props.color The fixed standing color.
 * @param props.children The meaning of the sample.
 * @param props.outer Whether the color sits outside a neutral border.
 * @returns The labeled sample.
 */
function StandingSample(props: {
	readonly color: string;
	readonly children: ReactNode;
	readonly outer?: boolean;
}): JSX.Element {
	const style = useMemo(
		() => ({
			borderColor: props.outer === true ? "var(--border)" : props.color,
			...(props.outer === true ? { outline: `2px solid ${props.color}`, outlineOffset: 2 } : {}),
		}),
		[props.outer, props.color],
	);

	return (
		<span className="flex items-center gap-2">
			<span aria-hidden="true" className="size-3 rounded-[2px] border-2" style={style} />
			{props.children}
		</span>
	);
}

/**
 * A sample of a type chip’s independently colored border and tint.
 * @param props The type color and theme.
 * @param props.appearance Applied type color and the renderer’s icon.
 * @returns The chip.
 */
function TypeSample(props: { readonly appearance: AppliedAppearance }): JSX.Element {
	const { appearance } = props;
	const markup = useMemo(() => ({ __html: appearance.iconSvg }), [appearance.iconSvg]);
	const style = useMemo(
		() => ({
			borderColor: ink(appearance.typeColor),
			backgroundColor: `color-mix(in srgb, ${ink(appearance.typeColor)} 12%, transparent)`,
		}),
		[appearance.typeColor],
	);
	return (
		<span
			aria-hidden="true"
			className="flex size-6 shrink-0 items-center justify-center rounded-sm border"
			style={style}
			dangerouslySetInnerHTML={markup}
		/>
	);
}

export { SemanticLegend };

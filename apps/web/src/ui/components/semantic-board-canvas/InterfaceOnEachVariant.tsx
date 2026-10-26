// A picked container's interface measures on each variant of its board, side by
// side, for design it twice (TASK-538.05, ADR 0044): the current variant first,
// then each draft and each shelved variant in the order the board states them.
//
// Each count is read off that variant's own content by the shared
// `inspectContainer` and `interfaceMeasures`, the derivation `semantic compare
// --beside` answers with, so the pane and the CLI cannot disagree. Nothing is
// combined into a score and no row is marked better: the variant on screen is
// marked only as the one on screen, and a shelved variant keeps the reason it
// was let go (ADR 0030).

import { useMemo, type JSX } from "react";

import { inspectContainer, interfaceMeasures } from "@archboard/board/container-interface";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import {
	SidebarRegion,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { VariantMark } from "#ui/components/variant-lifecycle/VariantMark.tsx";

/** The five measures of a container's interface. */
type InterfaceMeasures = ReturnType<typeof interfaceMeasures>;

/** One variant, with the container measured on it. */
interface MeasuredVariant {
	readonly variant: SemanticVariant;
	/** Its five measures there, or null where the part holds no parts. */
	readonly measures: InterfaceMeasures | null;
	/** Why it was let go, for a shelved variant; null otherwise. */
	readonly shelved: string | null;
}

/** The measures in the order `semantic compare` states them, with their names. */
const MEASURES: readonly (readonly [keyof InterfaceMeasures, string])[] = [
	["entryPoints", "Entry points"],
	["hiddenParts", "Hidden parts"],
	["callers", "Callers"],
	["outgoing", "Outgoing"],
	["passThrough", "Pass-through"],
];

/**
 * The part measured on every variant a design is chosen among: the current one
 * first, then each draft and each shelved one, in the board's order.
 * @param board The board.
 * @param id The part.
 * @returns One entry for each variant.
 */
function measuredVariants(board: SemanticBoard, id: string): MeasuredVariant[] {
	const chosen = board.variants.filter((variant) => variant.lifecycle !== "historical");
	const ordered = [
		...chosen.filter((variant) => variant.lifecycle === "current"),
		...chosen.filter((variant) => variant.lifecycle !== "current"),
	];
	return ordered.map((variant) => ({
		variant,
		measures: measuresOn(variant, id),
		shelved: shelvingReason(board, variant),
	}));
}

/**
 * One part's five measures on one variant, as `semantic compare --beside` reads them.
 * @param variant The variant.
 * @param id The part.
 * @returns The measures, or null where the part is absent or holds no parts.
 */
function measuresOn(variant: SemanticVariant, id: string): InterfaceMeasures | null {
	const node = variant.content.nodes.find((one) => one.id === id);
	const inspection = node === undefined ? undefined : inspectContainer(variant.content, node);
	return inspection?.holdsParts === true ? interfaceMeasures(inspection) : null;
}

/**
 * Why a shelved variant was let go.
 * @param board The board, which records each shelving.
 * @param variant The variant.
 * @returns The reason, or null for a variant that is not shelved.
 */
function shelvingReason(board: SemanticBoard, variant: SemanticVariant): string | null {
	if (variant.lifecycle !== "shelved") return null;
	return board.shelvings?.find((one) => one.variant === variant.id)?.reason ?? null;
}

/** Inputs for the region. */
interface InterfaceOnEachVariantProps {
	/** The board the part was picked on, every variant whole. */
	readonly board: SemanticBoard;
	/** The id of the variant on screen. */
	readonly showing: string;
	/** The picked part's id. */
	readonly part: string;
}

/**
 * The measures of a picked part on each variant, or nothing when the part holds
 * parts on none of them or the board has one variant to choose.
 * @param props The board, the variant on screen and the part.
 * @returns The region, or nothing.
 */
function InterfaceOnEachVariant(props: InterfaceOnEachVariantProps): JSX.Element | null {
	const { board, part, showing } = props;
	const rows = useMemo(() => measuredVariants(board, part), [board, part]);
	if (rows.length < 2 || rows.every((row) => row.measures === null)) {
		return null;
	}
	return (
		<SidebarRegion slot="semantic-inspector-interface-variants">
			<SidebarSection title="On each variant" slot="semantic-inspector-variant-measures" level={3}>
				<ol className="flex flex-col gap-3">
					{rows.map((row) => (
						<VariantRow key={row.variant.id} row={row} drawn={row.variant.id === showing} />
					))}
				</ol>
			</SidebarSection>
		</SidebarRegion>
	);
}

/** Inputs for one variant's row. */
interface VariantRowProps {
	readonly row: MeasuredVariant;
	/** Whether this is the variant on screen. */
	readonly drawn: boolean;
}

/**
 * One variant: its mark and name, then the five measures, or the words that
 * stand in for them.
 * @param props The variant measured, and whether it is on screen.
 * @returns The row.
 */
function VariantRow(props: VariantRowProps): JSX.Element {
	const { row, drawn } = props;
	const { variant } = row;
	return (
		<li
			data-slot="semantic-inspector-variant-measure"
			data-variant={variant.id}
			data-lifecycle={variant.lifecycle}
			aria-current={drawn ? "true" : undefined}
			className="flex flex-col gap-1"
		>
			<span className="flex min-w-0 items-center gap-2">
				<VariantMark lifecycle={variant.lifecycle} />
				<span className="text-body text-foreground min-w-0 flex-1 truncate font-medium">
					{variant.name}
				</span>
				{drawn && (
					<span className="text-body text-primary-text shrink-0 font-medium">On screen</span>
				)}
			</span>
			<RowBody row={row} />
		</li>
	);
}

/**
 * What a row says under the variant's name: the measures, or that the part holds
 * no parts there, then whether it draws no caller and why the variant was shelved.
 * @param props The variant measured.
 * @param props.row The variant, its measures and its shelving reason.
 * @returns The body.
 */
function RowBody(props: { readonly row: MeasuredVariant }): JSX.Element {
	const { measures, shelved } = props.row;
	return (
		<div className="text-body text-muted-foreground flex flex-col gap-1 pl-5.5">
			{measures === null ? (
				<p data-slot="variant-holds-no-parts">Holds no parts here.</p>
			) : (
				<Counts measures={measures} />
			)}
			{measures?.callers === 0 && <p data-slot="variant-draws-no-caller">Draws no caller.</p>}
			{shelved !== null && <p data-slot="variant-shelved">Shelved: {shelved}</p>}
		</div>
	);
}

/**
 * The five measures, each its name and its count, in the same places on every row.
 * @param props The measures.
 * @param props.measures The five counts.
 * @returns The list.
 */
function Counts(props: { readonly measures: InterfaceMeasures }): JSX.Element {
	return (
		<dl className="grid grid-cols-[1fr_auto_1fr_auto] gap-x-2 gap-y-0.5">
			{MEASURES.map(([key, name]) => (
				<div key={key} data-measure={key} className="contents">
					<dt>{name}</dt>
					<dd className="text-technical text-foreground font-mono">{props.measures[key]}</dd>
				</div>
			))}
		</dl>
	);
}

export { InterfaceOnEachVariant };

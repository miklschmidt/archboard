// A changed module's interface in the two states of a comparison, as the site's comparison sets
// them: one card for each state, the base first. A card names the module in display capitals and
// the state with its chip, sets the counts in wells, and lists the state's entry points as rows
// and the parts that are hidden here but entry points on the other side as outlined rows. Under
// them stand the callers that only this state has. The card of the state read wears the changed
// ring. Only a module whose interface changed has the cards (ADR 0044).

import type { JSX } from "react";

import type { Model } from "@archboard/model/content";
import { Badge, cn } from "@archboard/ui-kit/components";
import {
	interfaceSides,
	type InterfaceSide,
} from "#ui/architecture-drawing/model-reader/rules/interface-changes.ts";
import { LIFECYCLE_WORD } from "#ui/variant-lifecycle/rules/lifecycle-words.ts";

/** The counts a card sets in wells, in the order of `model compare`. */
const COUNTS = [
	["entryPoints", "Entries"],
	["hiddenParts", "Hidden"],
	["callers", "Callers"],
] as const;

/** The edge of a card, and of the card of the state read, which wears the changed ring. */
const CARD_EDGE = "shadow-[var(--elevation-raised),inset_0_0_0_1px_var(--border)]";
const READ_EDGE =
	"shadow-[var(--elevation-raised),inset_0_0_0_1px_color-mix(in_oklch,var(--standing-changed)_45%,transparent)]";

/** The edge of a hidden part's row, and of one on the card of the state read. */
const HIDDEN_EDGE = "shadow-[inset_0_0_0_1px_var(--border)]";
const READ_HIDDEN_EDGE =
	"shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--standing-changed)_50%,transparent)]";

/**
 * The counts of one side, each in a well.
 * @param props The side's counts.
 * @param props.measures Its counts, or nothing where the module holds no parts there.
 * @returns The counts, or a line that says the module holds no parts.
 */
function SideCounts(props: { readonly measures: InterfaceSide["measures"] }): JSX.Element {
	const { measures } = props;
	if (measures === undefined)
		return <p className="text-body text-muted-foreground">Holds no parts in this state.</p>;
	return (
		<dl className="grid grid-cols-3 gap-1">
			{COUNTS.map(([key, label]) => (
				<div
					key={key}
					data-measure={key}
					className="bg-tray-sink shadow-well rounded-control flex min-w-0 flex-col gap-0.5 px-2.5 py-2"
				>
					<dt className="text-body text-muted-foreground truncate">{label}</dt>
					<dd className="text-foreground font-mono text-[18px] leading-6">{measures[key]}</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * The parts of one side: its entry points as rows, then the parts hidden here and entry points on
 * the other side as outlined rows.
 * @param props The side.
 * @param props.side What the state says of the module.
 * @returns The list, or nothing when the side names no part.
 */
function SideParts(props: { readonly side: InterfaceSide }): JSX.Element | null {
	const { entries, hidden, read } = props.side;
	if (entries.length + hidden.length === 0) return null;
	return (
		<ul className="text-body flex flex-col gap-0.5">
			{entries.map((name) => (
				<li
					key={`entry:${name}`}
					data-part-role="entry"
					className="bg-background text-foreground rounded-control flex items-center gap-2 px-2.5 py-1.5"
				>
					<span aria-hidden="true" className="bg-foreground/60 rounded-chip size-2 shrink-0" />
					<span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
				</li>
			))}
			{hidden.map((name) => (
				<li
					key={`hidden:${name}`}
					data-part-role="hidden"
					title="Hidden: nothing outside the module reaches it in this state"
					className={cn(
						"text-muted-foreground rounded-control flex items-center gap-2 px-2.5 py-1.5",
						read ? READ_HIDDEN_EDGE : HIDDEN_EDGE,
					)}
				>
					<span
						aria-hidden="true"
						className="rounded-chip size-2 shrink-0 shadow-[inset_0_0_0_1.5px_var(--muted-foreground)]"
					/>
					<span className="min-w-0 [overflow-wrap:anywhere]">
						{name}
						<span className="sr-only"> (hidden)</span>
					</span>
				</li>
			))}
		</ul>
	);
}

/**
 * The word for a side's state on its chip.
 * @param side The side.
 * @returns Where the state stands, or what the reading is when the model has no states.
 */
function wordOf(side: InterfaceSide): string {
	return side.state === null ? "This reading" : LIFECYCLE_WORD[side.state.lifecycle];
}

/**
 * The head of a card: the module in display capitals with the state's chip, and the state's name.
 * @param props The side and the module's name.
 * @param props.side What the state says of the module.
 * @param props.module The module's name.
 * @returns The head.
 */
function SideHead(props: { readonly side: InterfaceSide; readonly module: string }): JSX.Element {
	const { side } = props;
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2">
				<p className="title-name min-w-0 truncate">{props.module}</p>
				<Badge variant={side.read ? "changed" : "outline"} size="label">
					{wordOf(side)}
				</Badge>
			</div>
			{side.state !== null && (
				<p className="text-body text-muted-foreground truncate">{side.state.name}</p>
			)}
		</div>
	);
}

/**
 * The callers that only one side has.
 * @param props The callers.
 * @param props.callers Their names.
 * @returns The line, or nothing when the two sides share every caller.
 */
function SideCallers(props: { readonly callers: readonly string[] }): JSX.Element | null {
	if (props.callers.length === 0) return null;
	return (
		<p className="text-body text-body-foreground">
			<span className="text-muted-foreground">Callers only here </span>
			{props.callers.join(", ")}
		</p>
	);
}

/**
 * One state's card.
 * @param props The side and the module's name.
 * @param props.side What the state says of the module.
 * @param props.module The module's name.
 * @returns The card.
 */
function SideCard(props: { readonly side: InterfaceSide; readonly module: string }): JSX.Element {
	const { side, module } = props;
	return (
		<section
			data-slot="model-interface-side"
			data-read={side.read}
			aria-label={`${module} in ${side.state?.name ?? wordOf(side)}`}
			className={cn(
				"bg-face rounded-panel flex min-w-0 flex-col gap-3 p-4",
				side.read ? READ_EDGE : CARD_EDGE,
			)}
		>
			<SideHead side={side} module={module} />
			<SideCounts measures={side.measures} />
			<SideParts side={side} />
			<SideCallers callers={side.callers} />
		</section>
	);
}

/**
 * The cards of a changed module's interface, the base first.
 * @param props The reading's model and the module.
 * @param props.model The model, with the comparison of the reading.
 * @param props.module The module.
 * @param props.module.id The module's identity in the comparison.
 * @param props.module.name The module's name, for the head of each card.
 * @returns The cards, or nothing when the reading compares nothing or the interface did not change.
 */
function ModelInterfaceCompare(props: {
	readonly model: Pick<Model, "comparison">;
	readonly module: { readonly id: string; readonly name: string };
}): JSX.Element | null {
	const { comparison } = props.model;
	const sides = comparison === undefined ? null : interfaceSides(comparison, props.module.id);
	if (sides === null) return null;
	return (
		<div data-slot="model-interface-compare" className="grid grid-cols-2 gap-3">
			{sides.map((side) => (
				<SideCard key={String(side.read)} side={side} module={props.module.name} />
			))}
		</div>
	);
}

export { ModelInterfaceCompare };

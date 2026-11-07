import { useMemo, type CSSProperties, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, cn } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/model/content";
import { modelHistoryQuery } from "#ui/architecture-drawing/model-reader/access/clients/history.ts";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import type { ModelSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";
import { useModelPick } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-pick.ts";
import { usePeekRow } from "#ui/architecture-drawing/model-reader/reading/hooks/use-peek-row.ts";
import {
	partLocality,
	type Partner,
} from "#ui/architecture-drawing/canvas/picture/rules/part-locality.ts";

/** Inputs for the modules that change with one. */
interface ModelChangesWithProps {
	readonly vault: string;
	readonly model: Parameters<typeof modelHistoryQuery>[1] & Pick<Model, "migrationPreview">;
	readonly module: Pick<Model["modules"][number], "id" | "binding">;
	/** Select the module of a row. */
	readonly onSelect: ModelSelection["select"];
}

/**
 * The partner that shares the most commits first. The sort is stable, so a tie keeps the order of
 * the answer, which goes by how much of their changes the two share.
 * @param one A partner.
 * @param other Another.
 * @returns Their order.
 */
function byShared(one: Partner, other: Partner): number {
	return other.shared - one.shared;
}

/**
 * The modules whose code changes in the same commits as a module's, strongest first, joined to it
 * or not: the partners behind its counts in Measures, which a row there does not show. It reads
 * the history that Measures and About read, so it asks for nothing that they hold. It stands where
 * there is code history to read and a partner to name, and nowhere else (ADR 0045).
 * @param props The module and what a row does.
 * @returns The section, or nothing.
 */
function ModelChangesWith(props: ModelChangesWithProps): JSX.Element | null {
	const { vault, model, module, onSelect } = props;
	const query = useQuery({
		...modelHistoryQuery(vault, model),
		enabled: model.migrationPreview === undefined && module.binding !== undefined,
	});
	const { data } = query;
	const partners = useMemo(() => {
		const reading = data === undefined ? undefined : partLocality(data, module.id);
		return reading?.kind === "read" ? reading.partners.toSorted(byShared) : [];
	}, [data, module.id]);
	if (partners.length === 0) return null;
	return (
		<ModelPanel.Section
			title="Changes with"
			count={partners.length}
			slot="model-panel-changes-with"
		>
			<ModelPanel.Rows items={partners}>
				{(partner) => <PartnerRow key={partner.subject.id} partner={partner} onSelect={onSelect} />}
			</ModelPanel.Rows>
		</ModelPanel.Section>
	);
}

/**
 * The meter along the foot of a partner's row: as long as the degree, in gold for a pair that a
 * relationship joins and in the changed orange for one that nothing joins, as on the site.
 * @param props The partner.
 * @param props.partner How much the two change together, and whether they are joined.
 * @returns The meter.
 */
function DegreeMeter(props: { readonly partner: Partner }): JSX.Element {
	const { degree, unjoined } = props.partner;
	const width = useMemo<CSSProperties>(() => ({ width: `${degree}%` }), [degree]);
	return (
		<span
			aria-hidden="true"
			data-slot="model-partner-meter"
			style={width}
			className={cn(
				"absolute bottom-0 left-0 h-0.5 bg-linear-to-r from-transparent opacity-80",
				unjoined ? "to-standing-changed" : "to-primary-mark",
			)}
		/>
	);
}

/**
 * What a partner's row says under its name: a line that joins it to the module, or a dashed orange
 * line and Unjoined when no relationship does, then the commits they share and how much of their
 * changes that is.
 * @param props The partner.
 * @param props.partner The partner.
 * @returns The line.
 */
function PartnerFacts(props: { readonly partner: Partner }): JSX.Element {
	const { shared, degree, unjoined } = props.partner;
	return (
		<span className="flex items-center gap-2">
			<span
				aria-hidden="true"
				className={cn(
					"w-3.5 shrink-0 border-t-2",
					unjoined ? "border-standing-changed border-dashed" : "border-muted-foreground/60",
				)}
			/>
			{unjoined && (
				<Badge variant="changed-tint" size="label" title="No relationship joins these modules">
					Unjoined
				</Badge>
			)}
			<span className="text-technical font-mono">{shared} shared</span>
			<span className="text-technical text-foreground ml-auto font-mono">{degree}%</span>
		</span>
	);
}

/**
 * One partner: its name, then what the two share, with the meter of their degree along its foot. It
 * selects the partner, and lights it on the picture while pointed at.
 * @param props The partner and what the row does.
 * @param props.partner The partner.
 * @param props.onSelect Select the partner.
 * @returns A row of the panel.
 */
function PartnerRow(props: {
	readonly partner: Partner;
	readonly onSelect: ModelSelection["select"];
}): JSX.Element {
	const { partner, onSelect } = props;
	const { id, name } = partner.subject;
	const pick = useModelPick(id, onSelect);
	const peek = usePeekRow(id);
	const { shared, unjoined } = partner;
	const detail = useMemo(() => <PartnerFacts partner={partner} />, [partner]);
	const meter = useMemo(() => <DegreeMeter partner={partner} />, [partner]);
	return (
		<ModelPanel.Row
			data-part={id}
			data-shared={shared}
			data-unjoined={unjoined}
			{...pick}
			{...peek}
			name={name}
			stacked
			detail={detail}
			foot={meter}
		/>
	);
}

export { ModelChangesWith };

import { useMemo, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import { modelHistoryQuery } from "#ui/clients/architecture-model/history.ts";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import { usePeekRow } from "#ui/hooks/architecture-model/use-peek-row.ts";
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
 * One partner: its name, the commits that it shares with the module, and a plain mark when no
 * relationship joins the two. It selects the partner, and lights it on the picture while pointed at.
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
	const detail = useMemo(
		() => (
			<>
				{shared} commits together
				{unjoined && <span className="text-foreground"> · no relationship</span>}
			</>
		),
		[shared, unjoined],
	);
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
		/>
	);
}

export { ModelChangesWith };

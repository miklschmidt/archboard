import { useCallback, useMemo, useState, type JSX } from "react";
import type { ModelCodeReading } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import { WarningCount } from "#ui/components/semantic-board-canvas/CodeWarnings.tsx";
import { CodeBlock } from "#ui/components/semantic-board-canvas/SemanticInspectorCode.tsx";

/**
 * Keep the existing warning control available for canonical readings.
 * @param props The exact checked reading and temporary selection action.
 * @param props.reading The matching pass, or absence after an architecture change.
 * @param props.onSelect Pick the finding's subject without changing architecture.
 * @returns A count that cycles through the matching pass's warnings.
 */
function ModelCodeWarnings(props: {
	reading: ModelCodeReading | null;
	onSelect: (id: string | null) => void;
}): JSX.Element | null {
	if (props.reading === null) return null;
	return (
		<WarningSelection
			key={`${props.reading.revision.digest}:${props.reading.checkedAt}`}
			reading={props.reading}
			onSelect={props.onSelect}
		/>
	);
}

/**
 * Each completed pass starts its own warning cycle.
 * @param props The exact pass and the module selection action.
 * @param props.reading The matching findings.
 * @param props.onSelect Select a warned subject, or clear selection for a model finding.
 * @returns The existing accessible warning count.
 */
function WarningSelection(props: {
	reading: ModelCodeReading;
	onSelect: (id: string | null) => void;
}): JSX.Element {
	const warnings = props.reading.findings.filter((finding) => finding.severity === "warning");
	const [position, setPosition] = useState(-1);
	const { onSelect } = props;
	const next = useCallback(() => {
		const index = (position + 1) % warnings.length;
		setPosition(index);
		onSelect(warnings[index]?.subject?.id ?? null);
	}, [position, warnings, onSelect]);
	return (
		<WarningCount
			count={warnings.length}
			message={warnings[position]?.message}
			position={position}
			onNext={next}
		/>
	);
}

/**
 * Explain selected identities with the existing source evidence panel.
 * @param props The matching pass and inspected subjects.
 * @param props.reading The exact checked architecture, or absence.
 * @param props.selected Temporary selected identities.
 * @param props.scope The open module when nothing is selected.
 * @returns Findings for the selected subjects, scope, or model itself.
 */
function ModelCodeDetails(props: {
	reading: ModelCodeReading | null;
	selected: ReadonlySet<string>;
	scope: string | null;
}): JSX.Element | null {
	const { reading, selected, scope } = props;
	const code = useMemo(() => {
		if (reading === null) return null;
		const ids = selected.size > 0 ? selected : new Set(scope === null ? [] : [scope]);
		const findings = reading.findings.filter((finding) =>
			finding.subject === undefined ? ids.size === 0 : ids.has(finding.subject.id),
		);
		return findings.length === 0 ? null : { findings, checkedAt: reading.checkedAt };
	}, [reading, selected, scope]);
	return <CodeBlock code={code} />;
}

export { ModelCodeWarnings, ModelCodeDetails };

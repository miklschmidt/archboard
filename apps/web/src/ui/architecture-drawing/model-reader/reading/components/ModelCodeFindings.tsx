import { RiLoader4Line } from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import { CodeFindingsView } from "#ui/architecture-drawing/model-reader/reading/components/CodeFindingsView.tsx";
import type { CodeCheckProgress } from "#ui/architecture-drawing/model-reader/reading/hooks/use-code-check.ts";
import type { ModelCodeReading } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import type { FindingEnds } from "#ui/architecture-drawing/model-reader/reading/rules/finding-route.ts";
import { WarningCount } from "#ui/architecture-drawing/canvas/presentation/components/CodeWarnings.tsx";
import {
	CheckedAt,
	CodeBlock,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";

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

/** Inputs for the findings of the reading on screen. */
interface ModelCodeEvidenceProps {
	readonly vault: string;
	/** The pass that read the reading on screen, or null when none did. */
	readonly reading: ModelCodeReading | null;
	/** How the pass this view started stands, while no remembered pass read the reading. */
	readonly check: CodeCheckProgress;
	readonly ends: FindingEnds;
	/** Select a finding's subject on the picture, or let go of the selection for a model finding. */
	readonly onShow: (id: string | null) => void;
}

/**
 * Where the map and the code disagree: the findings of the pass that read the reading on screen,
 * warnings first, each beside the source line it rests on (ADR 0046). While no remembered pass
 * read the reading, the view says how the pass it started stands.
 * @param props The pass, the pass this view started and what choosing a finding selects.
 * @returns The findings, or what stands in their place.
 */
function ModelCodeEvidence(props: ModelCodeEvidenceProps): JSX.Element {
	const { reading, check } = props;
	if (reading === null) return <CheckStanding check={check} />;
	if (reading.findings.length === 0)
		return (
			<Quiet slot="code-evidence-clear">
				<p>The last code check found nothing here.</p>
				<CheckedAt checkedAt={reading.checkedAt} />
			</Quiet>
		);
	return (
		<CodeFindingsView
			key={`${reading.revision.digest}:${reading.checkedAt}`}
			vault={props.vault}
			reading={reading}
			ends={props.ends}
			onShow={props.onShow}
		/>
	);
}

/**
 * How the pass over the reading on screen stands, in its place.
 * @param props The pass.
 * @param props.check How it stands.
 * @returns The words, with a key that tries again where the pass did not read the reading.
 */
function CheckStanding(props: { readonly check: CodeCheckProgress }): JSX.Element {
	const { check } = props;
	if (check.status === "checking")
		return (
			<Quiet slot="code-evidence-checking">
				<output aria-live="polite" className="flex items-center gap-2">
					<RiLoader4Line aria-hidden="true" className="size-4 shrink-0 animate-spin" />
					Checking this reading against its code…
				</output>
			</Quiet>
		);
	if (check.status === "unavailable")
		return (
			<Quiet slot="code-evidence-none">
				<p>The code check reads the vault, and a migration preview is not in it yet.</p>
			</Quiet>
		);
	return (
		<Quiet slot="code-evidence-failed">
			<p role="alert">
				{check.status === "failed"
					? `The code check failed: ${check.error}`
					: "The code check ran, but it did not read this version of the reading."}
			</p>
			<Button
				variant="outline"
				size="sm"
				data-slot="code-evidence-retry"
				className="mt-2 self-start"
				onClick={check.retry}
			>
				Try again
			</Button>
		</Quiet>
	);
}

/**
 * The words that stand where no finding does.
 * @param props What they say.
 * @param props.slot What names them.
 * @param props.children The words.
 * @returns The words, on the floor of the panel.
 */
function Quiet(props: { readonly slot: string; readonly children: ReactNode }): JSX.Element {
	return (
		<div
			data-slot={props.slot}
			className="text-body text-muted-foreground bg-tray-sink shadow-well rounded-panel flex flex-col gap-1 p-4 [&_code]:font-mono"
		>
			{props.children}
		</div>
	);
}

export { ModelCodeDetails, ModelCodeEvidence, ModelCodeWarnings };

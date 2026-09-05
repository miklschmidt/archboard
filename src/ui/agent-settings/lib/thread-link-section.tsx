// The explicit thread link: what the pane is bound to, the candidates it
// could bind instead, and the link and unlink actions.

import { useCallback, useId, useState } from "react";

import type {
	BrowserThreadCandidate,
	BrowserThreadCandidates,
	BrowserThreadLink,
} from "@/shared/codex-browser-model";
import type { AgentSettingsBusy } from "@/ui/agent-settings/lib/contracts";
import {
	describeCandidate,
	describeThreadLink,
	threadLinkFacts,
} from "@/ui/agent-settings/lib/presentation";
import { SectionHeading, StateBadge } from "@/ui/agent-settings/lib/section-parts";
import { BusyText, DialogErrorAlert, Facts, Technical, type DialogError } from "@/ui/board-dialogs";
import { Button } from "@/ui/components/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/ui/components/field";
import { RadioGroup, RadioGroupItem } from "@/ui/components/radio-group";

/** Inputs for one candidate. */
interface CandidateOptionProps {
	candidate: BrowserThreadCandidate;
	disabled: boolean;
}

/**
 * One candidate thread as a radio option, with the classifier's verdict.
 * @param props The candidate.
 * @returns A horizontal field.
 */
function CandidateOption(props: CandidateOptionProps): React.JSX.Element {
	const id = useId();
	const { candidate } = props;
	return (
		<Field orientation="horizontal">
			<RadioGroupItem id={id} value={candidate.selectionId} disabled={props.disabled} />
			<FieldContent>
				<FieldLabel htmlFor={id} className="items-center gap-2">
					<Technical>{candidate.threadId}</Technical>
					<StateBadge summary={describeCandidate(candidate)} />
				</FieldLabel>
			</FieldContent>
		</Field>
	);
}

/** Inputs for the candidate list. */
interface CandidateListProps {
	candidates: BrowserThreadCandidates;
	selectionId: string | null;
	disabled: boolean;
	onSelect: (selectionId: string | null) => void;
}

/**
 * The listed candidates, or why there are none.
 * @param props The candidates, the chosen one and the change handler.
 * @returns A radio group, or one line.
 */
function CandidateList(props: CandidateListProps): React.JSX.Element {
	const { candidates, onSelect } = props;
	const handleChange = useCallback((value: string) => onSelect(value), [onSelect]);
	if (candidates.state === "unavailable") {
		return <FieldDescription>Candidates are unavailable: {candidates.reason}</FieldDescription>;
	}
	if (candidates.records.length === 0) {
		return <FieldDescription>No thread is listed to link yet.</FieldDescription>;
	}
	return (
		<FieldSet>
			<FieldLegend variant="label">Link a thread</FieldLegend>
			<RadioGroup value={props.selectionId} onValueChange={handleChange} disabled={props.disabled}>
				{candidates.records.map((candidate) => (
					<CandidateOption
						key={candidate.selectionId}
						candidate={candidate}
						disabled={props.disabled}
					/>
				))}
			</RadioGroup>
			{candidates.truncated && (
				<FieldDescription>
					The list was cut short; more threads exist than are shown.
				</FieldDescription>
			)}
		</FieldSet>
	);
}

/** Inputs for the thread link section. */
interface ThreadLinkSectionProps {
	threadLink: BrowserThreadLink;
	threadCandidates: BrowserThreadCandidates;
	busy: AgentSettingsBusy;
	error: DialogError | null;
	onLinkThread: (selectionId: string) => void;
	onUnlinkThread: () => void;
}

/**
 * The thread link section.
 * @param props The link and candidate records, the state and the callbacks.
 * @returns The section.
 */
function ThreadLinkSection(props: ThreadLinkSectionProps): React.JSX.Element {
	const { threadLink, onLinkThread } = props;
	const [selectionId, setSelectionId] = useState<string | null>(null);
	const anyBusy = props.busy.link || props.busy.unlink;
	const handleLink = useCallback(() => {
		if (selectionId !== null) {
			onLinkThread(selectionId);
		}
	}, [onLinkThread, selectionId]);
	return (
		<section className="grid gap-3">
			<SectionHeading title="Thread link">
				<StateBadge summary={describeThreadLink(threadLink)} />
			</SectionHeading>
			<Facts rows={threadLinkFacts(threadLink)} />
			<CandidateList
				candidates={props.threadCandidates}
				selectionId={selectionId}
				disabled={anyBusy}
				onSelect={setSelectionId}
			/>
			<div className="flex gap-2">
				<Button size="sm" disabled={anyBusy || selectionId === null} onClick={handleLink}>
					Link thread
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={anyBusy || threadLink.state === "unbound"}
					onClick={props.onUnlinkThread}
				>
					Unlink
				</Button>
			</div>
			<DialogErrorAlert error={props.error} />
			<BusyText busy={props.busy.link} text="Linking the thread…" />
			<BusyText busy={props.busy.unlink} text="Unlinking the thread…" />
		</section>
	);
}

export { ThreadLinkSection, type ThreadLinkSectionProps };

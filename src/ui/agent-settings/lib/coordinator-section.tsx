// The coordinator's own readiness and authority, and the published session
// settings per owner. Both are read-only: the model carries no edit.

import type { BrowserCoordinator, BrowserSettings } from "@/shared/codex-browser-model";
import {
	coordinatorFacts,
	describeCoordinator,
	settingsFacts,
} from "@/ui/agent-settings/lib/presentation";
import { SectionHeading, StateBadge } from "@/ui/agent-settings/lib/section-parts";
import { DialogErrorAlert, Facts, type DialogError } from "@/ui/board-dialogs";

/** Inputs for the coordinator section. */
interface CoordinatorSectionProps {
	coordinator: BrowserCoordinator;
	error: DialogError | null;
}

/**
 * The coordinator section: voice's own session, separate from the pane's
 * workhorse thread.
 * @param props The coordinator record and the host's error.
 * @returns The section.
 */
function CoordinatorSection(props: CoordinatorSectionProps): React.JSX.Element {
	return (
		<section className="grid gap-3">
			<SectionHeading title="Coordinator">
				<StateBadge summary={describeCoordinator(props.coordinator)} />
			</SectionHeading>
			<Facts rows={coordinatorFacts(props.coordinator)} />
			<DialogErrorAlert error={props.error} />
		</section>
	);
}

const OWNER_TITLES: Readonly<Record<BrowserSettings["owner"], string>> = {
	workhorse: "Workhorse settings",
	coordinator: "Coordinator settings",
};

/** Inputs for one owner's settings. */
interface OwnerSettingsProps {
	settings: BrowserSettings;
}

/**
 * One owner's published settings.
 * @param props The settings record.
 * @returns A heading and facts.
 */
function OwnerSettings(props: OwnerSettingsProps): React.JSX.Element {
	return (
		<section className="grid gap-3">
			<SectionHeading title={OWNER_TITLES[props.settings.owner]} />
			<Facts rows={settingsFacts(props.settings)} />
		</section>
	);
}

/** Inputs for the settings sections. */
interface SessionSettingsProps {
	settings: readonly BrowserSettings[];
}

/**
 * Every owner's published settings, in the order published.
 * @param props The settings records.
 * @returns One section per owner, or nothing when none is published.
 */
function SessionSettings(props: SessionSettingsProps): React.JSX.Element | null {
	if (props.settings.length === 0) {
		return null;
	}
	return (
		<>
			{props.settings.map((settings) => (
				<OwnerSettings key={settings.owner} settings={settings} />
			))}
		</>
	);
}

export { CoordinatorSection, SessionSettings };

import { useCallback, useMemo, useState, type JSX } from "react";
import { Button, Dialog, Separator, cn, type DialogError } from "@archboard/ui-kit/components";
import type {
	CodexSettingsReply,
	CodexSettingsSaveRequest,
} from "#shared/codex-settings/schemas/codex-settings.ts";
import { CodexAuthSection } from "#ui/codex-settings/components/CodexAuthSection.tsx";
import { RoleModelFields } from "#ui/codex-settings/components/RoleModelFields.tsx";
import { VoiceLanguageField } from "#ui/codex-settings/components/VoiceLanguageField.tsx";
import {
	useCodexSettings,
	type CodexSettingsBusy,
} from "#ui/codex-settings/hooks/use-codex-settings.ts";
import {
	isCodexModelDraftValid,
	resolveCodexModelDraft,
	type CodexModelDraft,
	type RoleModelDraft,
} from "#ui/codex-settings/rules/model-selection.ts";

interface CodexSettingsProps {
	readonly onSuccess: (message: string) => void;
	readonly onClose: () => void;
}

interface CodexModelFormProps {
	readonly settings: CodexSettingsReply;
	readonly busy: CodexSettingsBusy;
	readonly anyBusy: boolean;
	readonly error: DialogError | null;
	readonly onSave: (payload: CodexSettingsSaveRequest) => void;
	readonly onReset: () => void;
}

/**
 * Tell whether any saved setting differs from the defaults, so Reset has something to restore.
 * @param selection Saved settings.
 * @returns True when a model or the voice language is set.
 */
function hasOverrides(selection: CodexSettingsReply["selection"]): boolean {
	return (
		selection.orchestrator !== null ||
		selection.workhorse !== null ||
		selection.voiceLanguage !== null
	);
}

/**
 * Compute form action availability flags from the current settings reply and draft.
 * @param settings Current settings reply.
 * @param draft Current editable draft.
 * @param anyBusy Whether any request is in flight.
 * @returns Derived authenticated, disabled, save, and reset flags.
 */
function formFlags(settings: CodexSettingsReply, draft: CodexModelDraft, anyBusy: boolean) {
	const isAuthenticated = settings.auth.state === "authenticated";
	const controlsDisabled = !isAuthenticated || anyBusy;
	const canSave = !controlsDisabled && isCodexModelDraftValid(draft, settings.models);
	const canReset =
		!controlsDisabled && settings.models.length > 0 && hasOverrides(settings.selection);
	return { isAuthenticated, controlsDisabled, canSave, canReset };
}

/**
 * Editable form for orchestrator and workhorse model selections and the voice language, keyed by
 * saved selection and auth state.
 * Disabled and visually grayed out whenever Codex is not authenticated.
 * @param props Current reply, busy flags, error, and save/reset callbacks.
 * @returns The form fields and sticky dialog footer.
 */
function CodexModelForm(props: CodexModelFormProps): JSX.Element {
	const { settings, busy, anyBusy, error, onSave, onReset } = props;
	const [draft, setDraft] = useState<CodexModelDraft>(() => resolveCodexModelDraft(settings));
	const { isAuthenticated, controlsDisabled, canSave, canReset } = formFlags(
		settings,
		draft,
		anyBusy,
	);

	const handleOrchestratorChange = useCallback((next: RoleModelDraft) => {
		setDraft((current) => ({ ...current, orchestrator: next }));
	}, []);

	const handleWorkhorseChange = useCallback((next: RoleModelDraft) => {
		setDraft((current) => ({ ...current, workhorse: next }));
	}, []);

	const handleVoiceLanguageChange = useCallback((voiceLanguage: string | null) => {
		setDraft((current) => ({ ...current, voiceLanguage }));
	}, []);

	const handleSave = useCallback(() => {
		if (canSave) {
			onSave({
				orchestrator: draft.orchestrator,
				workhorse: draft.workhorse,
				voiceLanguage: draft.voiceLanguage,
			});
		}
	}, [canSave, draft, onSave]);

	return (
		<div className="contents">
			<div
				data-slot="codex-models-section"
				aria-disabled={!isAuthenticated}
				className={cn("flex flex-col gap-5", !isAuthenticated && "pointer-events-none select-none")}
			>
				{!isAuthenticated && (
					<p className="text-body text-muted-foreground">
						Sign in to Codex above to choose models, reasoning levels, service tiers, and the voice
						language.
					</p>
				)}
				<RoleModelFields
					agentRole="orchestrator"
					title="Orchestrator"
					description="Coordinates conversations, voice sessions, and delegations across repositories."
					draft={draft.orchestrator}
					models={settings.models}
					disabled={controlsDisabled}
					onChange={handleOrchestratorChange}
				/>
				<Separator />
				<RoleModelFields
					agentRole="workhorse"
					title="Workhorse"
					description="Executes repository work, answers questions, and updates architecture models."
					draft={draft.workhorse}
					models={settings.models}
					disabled={controlsDisabled}
					onChange={handleWorkhorseChange}
				/>
				<Separator />
				<VoiceLanguageField
					language={draft.voiceLanguage}
					saved={settings.selection.voiceLanguage}
					disabled={controlsDisabled}
					onChange={handleVoiceLanguageChange}
				/>
			</div>

			<Dialog.Error error={error} />
			<Dialog.Busy busy={busy.login} text="Starting Codex sign-in…" />
			<Dialog.Busy busy={busy.cancel} text="Cancelling sign-in…" />
			<Dialog.Busy busy={busy.logout} text="Signing out of Codex…" />
			<Dialog.Busy busy={busy.save} text="Saving Codex settings…" />
			<Dialog.Busy busy={busy.reset} text="Restoring default Codex settings…" />

			<Dialog.Footer className="bg-card sticky -bottom-5">
				<Button variant="ghost" size="sm" disabled={!canReset} onClick={onReset}>
					Reset
				</Button>
				<Dialog.Cancel disabled={anyBusy}>Close</Dialog.Cancel>
				<Button size="sm" disabled={!canSave} onClick={handleSave}>
					Save
				</Button>
			</Dialog.Footer>
		</div>
	);
}

/**
 * Placeholder shown while initial Codex settings are loading or failed to load.
 * @param props Current load error and retry handler.
 * @param props.error Initial fetch error, or null while loading.
 * @param props.onRetry Try loading Codex settings again.
 * @returns Loading state and footer.
 */
function CodexSettingsPending(props: {
	readonly error: DialogError | null;
	readonly onRetry: () => void;
}): JSX.Element {
	return (
		<>
			{props.error !== null ? (
				<Dialog.Error error={props.error} />
			) : (
				<p aria-live="polite" className="text-muted-foreground text-body">
					Reading Codex settings…
				</p>
			)}
			<Dialog.Footer className="bg-card sticky -bottom-5">
				<Dialog.Cancel>Close</Dialog.Cancel>
				{props.error !== null && (
					<Button size="sm" onClick={props.onRetry}>
						Retry
					</Button>
				)}
			</Dialog.Footer>
		</>
	);
}

/**
 * Codex settings panel: live authentication state, sign-in/out controls, and orchestrator/workhorse
 * model, reasoning level, and service tier configuration populated strictly from the running Codex app-server.
 * @param props Shell notice callback and dialog close callback.
 * @returns The Codex settings panel.
 */
function CodexSettings(props: CodexSettingsProps): JSX.Element {
	const {
		settings,
		busy,
		anyBusy,
		error,
		refresh,
		signInChatgpt,
		signInApiKey,
		cancelLogin,
		logout,
		save,
		reset,
	} = useCodexSettings({ onSuccess: props.onSuccess });
	const modelErrorMessage = settings?.modelError ?? null;
	const modelError = useMemo(
		() =>
			modelErrorMessage === null
				? null
				: { title: "Could not load Codex models", message: modelErrorMessage },
		[modelErrorMessage],
	);

	const handleRefresh = useCallback(() => {
		void refresh();
	}, [refresh]);
	const handleSignInChatgpt = useCallback(() => {
		void signInChatgpt();
	}, [signInChatgpt]);
	const handleCancelLogin = useCallback(() => {
		void cancelLogin();
	}, [cancelLogin]);
	const handleLogout = useCallback(() => {
		void logout();
	}, [logout]);
	const handleSave = useCallback(
		(payload: CodexSettingsSaveRequest) => {
			void save(payload);
		},
		[save],
	);
	const handleReset = useCallback(() => {
		void reset();
	}, [reset]);

	return (
		<div data-slot="codex-settings" className="flex flex-col gap-4">
			<p className="text-body text-muted-foreground">
				Codex sign-in, the models used for orchestrator and workhorse threads, and the language the
				voice speaks on this machine.
			</p>
			{settings === null ? (
				<CodexSettingsPending error={error} onRetry={handleRefresh} />
			) : (
				<>
					<CodexAuthSection
						auth={settings.auth}
						busy={anyBusy}
						onSignInChatgpt={handleSignInChatgpt}
						onSignInApiKey={signInApiKey}
						onCancelLogin={handleCancelLogin}
						onLogout={handleLogout}
						onRefresh={handleRefresh}
					/>
					{modelError !== null && (
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Dialog.Error error={modelError} />
							<Button variant="outline" size="sm" disabled={anyBusy} onClick={handleRefresh}>
								Retry loading models
							</Button>
						</div>
					)}
					<CodexModelForm
						key={`${settings.auth.state}:${JSON.stringify(settings.selection)}:${settings.models.map((m) => m.id).join(",")}`}
						settings={settings}
						busy={busy}
						anyBusy={anyBusy}
						error={error}
						onSave={handleSave}
						onReset={handleReset}
					/>
				</>
			)}
		</div>
	);
}

export { CodexSettings };

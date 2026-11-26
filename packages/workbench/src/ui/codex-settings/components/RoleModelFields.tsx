import { useCallback, useId, type JSX } from "react";
import { Field, Select, cn } from "@archboard/ui-kit/components";
import type { CodexModelOption } from "#shared/codex-settings/schemas/codex-settings.ts";
import {
	DEFAULT_TIER_VALUE,
	formatEffortLabel,
	reconcileRoleForModelChange,
	serviceTierChoicesForModel,
	type RoleModelDraft,
	type ServiceTierChoice,
} from "#ui/codex-settings/rules/model-selection.ts";

const NO_EFFORTS: CodexModelOption["supportedReasoningEfforts"] = [];

interface RoleModelFieldsProps {
	readonly agentRole: "orchestrator" | "workhorse";
	readonly title: string;
	readonly description: string;
	readonly draft: RoleModelDraft;
	readonly models: readonly CodexModelOption[];
	readonly disabled: boolean;
	readonly onChange: (next: RoleModelDraft) => void;
}

/**
 * Display text for the closed model select trigger.
 * @param selectedModel Matched model entry, if any.
 * @param disabled Whether selection is disabled.
 * @returns Closed trigger label.
 */
function modelTriggerLabel(selectedModel: CodexModelOption | undefined, disabled: boolean): string {
	if (selectedModel !== undefined) return selectedModel.displayName;
	return disabled ? "Sign in to load models" : "Select model";
}

/**
 * Display text for the closed reasoning level select trigger.
 * @param effort Current effort value.
 * @param disabled Whether selection is disabled.
 * @returns Closed trigger label.
 */
function effortTriggerLabel(effort: string, disabled: boolean): string {
	if (effort.length > 0) return formatEffortLabel(effort);
	return disabled ? "Unavailable" : "Select level";
}

/**
 * Display text for the closed service tier select trigger.
 * @param tierChoices Advertised tier choices.
 * @param selectedChoice Currently selected tier choice.
 * @param disabled Whether selection is disabled.
 * @returns Closed trigger label.
 */
function tierTriggerLabel(
	tierChoices: readonly ServiceTierChoice[],
	selectedChoice: ServiceTierChoice | undefined,
	disabled: boolean,
): string {
	if (disabled) return "Unavailable";
	if (tierChoices.length === 0) return "No tiers available";
	return selectedChoice?.label ?? "Select tier";
}

/**
 * Service tier selector for one role, populated strictly from the chosen model's advertised tiers.
 * @param props Role key, available choices, current tier, disabled state, and change handler.
 * @param props.agentRole Which role the field belongs to.
 * @param props.tierChoices Advertised service tier options for the selected model.
 * @param props.serviceTier Currently selected tier id or null.
 * @param props.disabled Whether controls are disabled.
 * @param props.onChange Callback with the selected tier id or null.
 * @returns The service tier field.
 */
function ServiceTierField(props: {
	readonly agentRole: "orchestrator" | "workhorse";
	readonly tierChoices: readonly ServiceTierChoice[];
	readonly serviceTier: string | null;
	readonly disabled: boolean;
	readonly onChange: (serviceTier: string | null) => void;
}): JSX.Element {
	const { agentRole, tierChoices, serviceTier, disabled, onChange } = props;
	const id = useId();
	const value =
		tierChoices.length === 0 ? null : serviceTier === null ? DEFAULT_TIER_VALUE : serviceTier;
	const selected = tierChoices.find((choice) => choice.value === value);
	const label = tierTriggerLabel(tierChoices, selected, disabled);

	const handleChange = useCallback(
		(next: string | null) => {
			if (next === null) return;
			onChange(next === DEFAULT_TIER_VALUE ? null : next);
		},
		[onChange],
	);

	return (
		<Field>
			<Field.Label htmlFor={id} className={cn(disabled && "opacity-60")}>
				Service tier
			</Field.Label>
			<Select
				value={value}
				onValueChange={handleChange}
				disabled={disabled || tierChoices.length === 0}
			>
				<Select.Trigger id={id} data-codex-field={`${agentRole}-tier`} className="w-full">
					<Select.Value>{() => label}</Select.Value>
				</Select.Trigger>
				<Select.Content className="min-w-60">
					{tierChoices.map((choice) => (
						<Select.Item
							key={choice.value}
							value={choice.value}
							description={choice.description.length > 0 ? choice.description : undefined}
						>
							{choice.label}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
		</Field>
	);
}

/**
 * Model selector for one role, populated strictly from model/list.
 * @param props Role key, available models, selected model, disabled state, and change handler.
 * @param props.agentRole Which role the field belongs to.
 * @param props.models Available models.
 * @param props.selectedModel Matched model entry.
 * @param props.modelValue Currently selected model id.
 * @param props.disabled Whether controls are disabled.
 * @param props.onChange Model selection change callback.
 * @returns The model select field.
 */
function ModelSelectField(props: {
	readonly agentRole: "orchestrator" | "workhorse";
	readonly models: readonly CodexModelOption[];
	readonly selectedModel: CodexModelOption | undefined;
	readonly modelValue: string;
	readonly disabled: boolean;
	readonly onChange: (value: string | null) => void;
}): JSX.Element {
	const { agentRole, models, selectedModel, modelValue, disabled, onChange } = props;
	const id = useId();
	const label = modelTriggerLabel(selectedModel, disabled);
	return (
		<Field>
			<Field.Label htmlFor={id} className={cn(disabled && "opacity-60")}>
				Model
			</Field.Label>
			<Select
				value={modelValue.length > 0 ? modelValue : null}
				onValueChange={onChange}
				disabled={disabled || models.length === 0}
			>
				<Select.Trigger id={id} data-codex-field={`${agentRole}-model`} className="w-full">
					<Select.Value>{() => label}</Select.Value>
				</Select.Trigger>
				<Select.Content className="min-w-72">
					{models.map((entry) => (
						<Select.Item
							key={entry.id}
							value={entry.model}
							description={entry.description.length > 0 ? entry.description : undefined}
						>
							{entry.displayName}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
		</Field>
	);
}

/**
 * Reasoning level selector for one role, populated strictly from the chosen model's efforts.
 * @param props Role key, supported efforts, selected effort, disabled state, and change handler.
 * @param props.agentRole Which role the field belongs to.
 * @param props.efforts Supported reasoning efforts for the selected model.
 * @param props.effortValue Currently selected effort id.
 * @param props.disabled Whether controls are disabled.
 * @param props.onChange Effort change callback.
 * @returns The reasoning level field.
 */
function EffortSelectField(props: {
	readonly agentRole: "orchestrator" | "workhorse";
	readonly efforts: CodexModelOption["supportedReasoningEfforts"];
	readonly effortValue: string;
	readonly disabled: boolean;
	readonly onChange: (value: string | null) => void;
}): JSX.Element {
	const { agentRole, efforts, effortValue, disabled, onChange } = props;
	const id = useId();
	const label = effortTriggerLabel(effortValue, disabled);
	return (
		<Field>
			<Field.Label htmlFor={id} className={cn(disabled && "opacity-60")}>
				Reasoning level
			</Field.Label>
			<Select
				value={effortValue.length > 0 ? effortValue : null}
				onValueChange={onChange}
				disabled={disabled || efforts.length === 0}
			>
				<Select.Trigger id={id} data-codex-field={`${agentRole}-effort`} className="w-full">
					<Select.Value>{() => label}</Select.Value>
				</Select.Trigger>
				<Select.Content className="min-w-60">
					{efforts.map((entry) => (
						<Select.Item
							key={entry.reasoningEffort}
							value={entry.reasoningEffort}
							description={entry.description.length > 0 ? entry.description : undefined}
						>
							{formatEffortLabel(entry.reasoningEffort)}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
		</Field>
	);
}

/**
 * Model, reasoning level, and service tier selectors for one Codex role (Orchestrator or Workhorse),
 * populated strictly from the models advertised by the authenticated Codex app-server.
 * @param props Role labels, available models, current draft, disabled state, and change handler.
 * @returns The role's fieldset.
 */
function RoleModelFields(props: RoleModelFieldsProps): JSX.Element {
	const { agentRole, title, description, draft, models, disabled, onChange } = props;

	const selectedModel = models.find((entry) => entry.model === draft.model);
	const efforts = selectedModel?.supportedReasoningEfforts ?? NO_EFFORTS;
	const tierChoices = serviceTierChoicesForModel(selectedModel);

	const handleModelChange = useCallback(
		(value: string | null) => {
			if (value === null) return;
			const nextModel = models.find((entry) => entry.model === value);
			if (nextModel !== undefined) onChange(reconcileRoleForModelChange(draft, nextModel));
		},
		[draft, models, onChange],
	);

	const handleEffortChange = useCallback(
		(value: string | null) => {
			if (value !== null) onChange({ ...draft, effort: value });
		},
		[draft, onChange],
	);

	const handleTierChange = useCallback(
		(serviceTier: string | null) => {
			onChange({ ...draft, serviceTier });
		},
		[draft, onChange],
	);

	return (
		<Field.Set data-slot={`codex-role-${agentRole}`} disabled={disabled} className="gap-3">
			<Field.Legend
				variant="label"
				className={cn("mb-0 text-sm font-semibold", disabled && "opacity-60")}
			>
				{title}
			</Field.Legend>
			<p className={cn("text-body text-muted-foreground", disabled && "opacity-60")}>
				{description}
			</p>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
				<ModelSelectField
					agentRole={agentRole}
					models={models}
					selectedModel={selectedModel}
					modelValue={draft.model}
					disabled={disabled}
					onChange={handleModelChange}
				/>
				<EffortSelectField
					agentRole={agentRole}
					efforts={efforts}
					effortValue={draft.effort}
					disabled={disabled}
					onChange={handleEffortChange}
				/>
				<ServiceTierField
					agentRole={agentRole}
					tierChoices={tierChoices}
					serviceTier={draft.serviceTier}
					disabled={disabled}
					onChange={handleTierChange}
				/>
			</div>
		</Field.Set>
	);
}

export { RoleModelFields };

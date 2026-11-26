import { useCallback, useId, type JSX } from "react";
import { Field, Select, cn } from "@archboard/ui-kit/components";
import {
	voiceLanguageChoices,
	voiceLanguageOf,
	voiceLanguageValue,
} from "#ui/codex-settings/rules/voice-language.ts";

interface VoiceLanguageFieldProps {
	/** The draft language tag, or null for Automatic. */
	readonly language: string | null;
	/** The saved language tag, kept among the choices even when it is not offered. */
	readonly saved: string | null;
	readonly disabled: boolean;
	readonly onChange: (language: string | null) => void;
}

/**
 * The language the voice speaks in conversations and live narrations, or Automatic to follow the
 * user.
 * @param props The draft and saved language, disabled state, and change handler.
 * @returns The voice fieldset.
 */
function VoiceLanguageField(props: VoiceLanguageFieldProps): JSX.Element {
	const { language, saved, disabled, onChange } = props;
	const id = useId();
	const choices = voiceLanguageChoices(saved);
	const value = voiceLanguageValue(language);
	const label = choices.find((choice) => choice.value === value)?.label ?? value;

	const handleChange = useCallback(
		(next: string | null) => {
			if (next !== null) onChange(voiceLanguageOf(next));
		},
		[onChange],
	);

	return (
		<Field.Set data-slot="codex-voice" disabled={disabled} className="gap-3">
			<Field.Legend
				variant="label"
				className={cn("mb-0 text-sm font-semibold", disabled && "opacity-60")}
			>
				Voice
			</Field.Legend>
			<p className={cn("text-body text-muted-foreground", disabled && "opacity-60")}>
				The language the voice speaks, from the next voice session. Automatic follows the language
				you speak. Recordings keep their own language.
			</p>
			<Field className="sm:max-w-72">
				<Field.Label htmlFor={id} className={cn(disabled && "opacity-60")}>
					Language
				</Field.Label>
				<Select value={value} onValueChange={handleChange} disabled={disabled}>
					<Select.Trigger id={id} data-codex-field="voice-language" className="w-full">
						<Select.Value>{() => label}</Select.Value>
					</Select.Trigger>
					<Select.Content className="min-w-60">
						{choices.map((choice) => (
							<Select.Item key={choice.value} value={choice.value}>
								{choice.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select>
			</Field>
		</Field.Set>
	);
}

export { VoiceLanguageField };

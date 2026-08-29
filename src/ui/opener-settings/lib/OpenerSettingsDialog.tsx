import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
	OpenerSelectionSchema,
	type CodeTargetNotice,
	type CodeTargetOpenFailure,
	type OpenerCommand,
	type OpenerSelection,
	type OpenerSettingsReply,
} from "../../../shared/code-target";
import {
	fetchOpenerSettings,
	resetOpenerSettings,
	saveOpenerSettings,
	testOpenerSettings,
} from "../../canvas/api";
import { Modal } from "../../shell/Modal";

type Choice = "platform" | "vscode" | "cursor" | "zed" | "custom";
type ArgumentDraft = { id: string; value: string };
type CustomDraft = { executable: string; argv: ArgumentDraft[] };
type Working = "load" | "test" | "save" | "reset" | null;

const PRESETS = ["vscode", "cursor", "zed"] as const;
const LABELS: Record<Choice, string> = {
	platform: "System default",
	vscode: "VS Code",
	cursor: "Cursor",
	zed: "Zed",
	custom: "Custom",
};

function choiceFor(selection: OpenerSelection): Choice {
	return selection.kind === "preset" ? selection.preset : selection.kind;
}

function commandText(command: OpenerCommand | null): string {
	return command ? [command.executable, ...command.argv].join(" ") : "Unavailable";
}

function toNotice(failure: CodeTargetOpenFailure): CodeTargetNotice {
	return { kind: "error", message: failure.error, actions: failure.actions ?? [] };
}

export interface OpenerSettingsDialogProps {
	onCancel: () => void;
	onSuccess: (message: string) => void;
	onFailure: (notice: CodeTargetNotice) => void;
}

export function OpenerSettingsDialog({
	onCancel,
	onSuccess,
	onFailure,
}: OpenerSettingsDialogProps): React.JSX.Element {
	const [settings, setSettings] = useState<OpenerSettingsReply | null>(null);
	const [choice, setChoice] = useState<Choice>("platform");
	const [custom, setCustom] = useState<CustomDraft>({
		executable: "",
		argv: [{ id: crypto.randomUUID(), value: "{path}" }],
	});
	const [repository, setRepository] = useState("");
	const [working, setWorking] = useState<Working>("load");
	const [serverError, setServerError] = useState<string | null>(null);

	const applySettings = useCallback(
		(result: OpenerSettingsReply | CodeTargetOpenFailure): void => {
			if (!result.success) {
				const next = toNotice(result);
				setServerError(next.message);
				setSettings(null);
				onFailure(next);
				setWorking(null);
				return;
			}
			setSettings(result);
			setChoice(choiceFor(result.selection));
			if (result.selection.kind === "custom") {
				setCustom({
					executable: result.selection.executable,
					argv: result.selection.argv.map((value) => ({ id: crypto.randomUUID(), value })),
				});
			}
			const usable = result.repositories.find((entry) => entry.exists && entry.identityMatches);
			setRepository(
				(current) => current || usable?.repository || result.repositories[0]?.repository || "",
			);
			setServerError(null);
			setWorking(null);
		},
		[onFailure],
	);
	const load = useCallback(async (): Promise<void> => {
		applySettings(await fetchOpenerSettings());
	}, [applySettings]);

	useEffect(() => {
		let live = true;
		void fetchOpenerSettings().then((result) => {
			if (live) applySettings(result);
			return result;
		});
		return () => {
			live = false;
		};
	}, [applySettings]);

	const draft: unknown = useMemo(() => {
		if (choice === "platform") return { version: 1, kind: "platform" };
		if (choice === "custom") {
			return {
				version: 1,
				kind: "custom",
				executable: custom.executable,
				argv: custom.argv.map((argument) => argument.value),
			};
		}
		return { version: 1, kind: "preset", preset: choice };
	}, [choice, custom]);
	const parsed = useMemo(() => OpenerSelectionSchema.safeParse(draft), [draft]);
	const validation = parsed.success
		? null
		: (parsed.error.issues[0]?.message ?? "The opener selection is invalid.");
	const selectedCheckout = settings?.repositories.find((entry) => entry.repository === repository);
	const testable = Boolean(selectedCheckout?.exists && selectedCheckout.identityMatches);

	const choose = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setChoice(event.target.value as Choice);
		setServerError(null);
	}, []);
	const updateExecutable = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setCustom((current) => ({ ...current, executable: event.target.value }));
	}, []);
	const updateArgument = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const id = event.currentTarget.dataset.argumentId;
		const value = event.currentTarget.value;
		setCustom((current) => ({
			...current,
			argv: current.argv.map((argument) =>
				argument.id === id ? { ...argument, value } : argument,
			),
		}));
	}, []);
	const addArgument = useCallback(() => {
		setCustom((current) => ({
			...current,
			argv: [...current.argv, { id: crypto.randomUUID(), value: "" }],
		}));
	}, []);
	const removeArgument = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
		const id = event.currentTarget.dataset.argumentId;
		setCustom((current) => ({
			...current,
			argv: current.argv.filter((argument) => argument.id !== id),
		}));
	}, []);
	const chooseRepository = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
		setRepository(event.target.value);
	}, []);

	const fail = useCallback(
		(failure: CodeTargetOpenFailure): void => {
			const next = toNotice(failure);
			setServerError(next.message);
			onFailure(next);
		},
		[onFailure],
	);
	const testDraft = useCallback(async (): Promise<void> => {
		if (!parsed.success || !repository || !testable) return;
		setWorking("test");
		setServerError(null);
		const result = await testOpenerSettings(parsed.data, repository);
		setWorking(null);
		if (!result.success) return fail(result);
		onSuccess(`Test opener launched for ${result.repository}.`);
	}, [fail, onSuccess, parsed, repository, testable]);
	const saveDraft = useCallback(async (): Promise<void> => {
		if (!parsed.success) return;
		setWorking("save");
		setServerError(null);
		const result = await saveOpenerSettings(parsed.data);
		setWorking(null);
		if (!result.success) return fail(result);
		onSuccess("Saved. Every pane and caller uses this opener on the next activation.");
		onCancel();
	}, [fail, onCancel, onSuccess, parsed]);
	const reset = useCallback(async (): Promise<void> => {
		setWorking("reset");
		setServerError(null);
		const result = await resetOpenerSettings();
		if (!result.success) {
			setWorking(null);
			fail(result);
			return;
		}
		onSuccess("Reset to the system default for every pane and caller.");
		await load();
	}, [fail, load, onSuccess]);

	const busy = working !== null;
	const currentLabel = settings ? LABELS[choiceFor(settings.selection)] : "Could not read";
	const availability = settings?.availability;
	return (
		<Modal
			title="Opener settings"
			onCancel={onCancel}
			wide
			footer={
				<>
					<button className="btn btn-quiet opener-reset" onClick={reset} disabled={busy}>
						{working === "reset" ? "Resetting…" : "Reset"}
					</button>
					<button
						className="btn btn-secondary"
						onClick={testDraft}
						disabled={busy || !parsed.success || !testable}
					>
						{working === "test" ? "Testing…" : "Test"}
					</button>
					<button className="btn btn-quiet" data-autofocus onClick={onCancel} disabled={busy}>
						Cancel
					</button>
					<button
						className="btn btn-primary"
						onClick={saveDraft}
						disabled={busy || !parsed.success}
					>
						{working === "save" ? "Saving…" : "Save"}
					</button>
				</>
			}
		>
			{working === "load" && !settings && <p className="hint">Reading opener settings…</p>}
			{serverError && <p className="notice notice-error opener-error">{serverError}</p>}

			<div className="opener-summary" aria-label="Current opener">
				<div>
					<span>Current selection</span>
					<strong>{currentLabel}</strong>
				</div>
				<div>
					<span>Effective command</span>
					<code>{commandText(settings?.effectiveCommand ?? null)}</code>
				</div>
				<span
					className={`opener-availability ${availability?.available ? "available" : "unavailable"}`}
				>
					{availability?.available ? "Available" : (availability?.error ?? "Unavailable")}
				</span>
			</div>

			<fieldset className="opener-choices">
				<legend>Open code with</legend>
				<label className="opener-choice" aria-label="System default opener">
					<input
						type="radio"
						name="opener"
						value="platform"
						checked={choice === "platform"}
						onChange={choose}
					/>
					<span>
						<strong>System default</strong>
						<small>{commandText(settings?.platformDefault ?? null)}</small>
					</span>
				</label>
				{PRESETS.map((preset) => (
					<label className="opener-choice" aria-label={`${LABELS[preset]} opener`} key={preset}>
						<input
							type="radio"
							name="opener"
							value={preset}
							checked={choice === preset}
							onChange={choose}
						/>
						<span>
							<strong>{LABELS[preset]}</strong>
							<small>
								{commandText(
									settings?.presets.find((item) => item.preset === preset)?.command ?? null,
								)}
							</small>
						</span>
					</label>
				))}
				<label className="opener-choice" aria-label="Custom opener">
					<input
						type="radio"
						name="opener"
						value="custom"
						checked={choice === "custom"}
						onChange={choose}
					/>
					<span>
						<strong>Custom</strong>
						<small>Executable and ordered arguments</small>
					</span>
				</label>
			</fieldset>

			{choice === "custom" && (
				<section className="opener-custom" aria-label="Custom opener">
					<label className="field">
						<span>Executable</span>
						<input
							value={custom.executable}
							onChange={updateExecutable}
							placeholder="code or /opt/editor/bin/editor"
						/>
					</label>
					<div className="opener-arguments">
						<div className="opener-section-heading">
							<span>Arguments, in order</span>
							<button type="button" className="btn btn-quiet" onClick={addArgument}>
								Add argument
							</button>
						</div>
						{custom.argv.map((argument, index) => (
							<div className="opener-argument" key={argument.id}>
								<span className="opener-index">{index + 1}</span>
								<input
									aria-label={`Argument ${index + 1}`}
									data-argument-id={argument.id}
									value={argument.value}
									onChange={updateArgument}
								/>
								<button
									type="button"
									className="btn btn-icon"
									aria-label={`Remove argument ${index + 1}`}
									data-argument-id={argument.id}
									onClick={removeArgument}
								>
									×
								</button>
							</div>
						))}
					</div>
				</section>
			)}
			{validation && (
				<p className="opener-validation" role="alert">
					{validation}
				</p>
			)}

			<label className="field opener-checkout">
				<span>Registered checkout for Test</span>
				<select
					value={repository}
					onChange={chooseRepository}
					disabled={!settings?.repositories.length}
				>
					{!settings?.repositories.length && <option value="">No registered checkouts</option>}
					{settings?.repositories.map((entry) => (
						<option key={entry.repository} value={entry.repository}>
							{entry.repository}
							{entry.exists && entry.identityMatches ? "" : " (stale)"}
						</option>
					))}
				</select>
				<small>
					{selectedCheckout
						? `${selectedCheckout.root}${testable ? "" : " — checkout is missing or its identity changed"}`
						: "Register a checkout before testing. Saving does not require one."}
				</small>
			</label>
		</Modal>
	);
}

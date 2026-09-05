import { useCallback, useId, useState, type ChangeEvent, type ReactNode } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import { buildThreadLinkLogin, threadLinkAccountForm } from "./account.js";
import type {
	ThreadLinkAccountDisclosure,
	ThreadLinkAccountFormId,
	ThreadLinkController,
} from "./contract.js";

const STATE_CLASSES = {
	unknown: "text-muted-foreground",
	signed_out: "text-warning",
	login_pending: "text-muted-foreground",
	ready: "text-muted-foreground",
	failed: "text-destructive",
} as const satisfies Record<ThreadLinkAccountDisclosure["state"], string>;

const FIELD_CLASSES =
	"min-h-touch-target w-full rounded-control border border-input bg-surface-raised px-control py-control font-mono text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

export interface AccountSectionProps {
	readonly sectionId: string;
	readonly account: ThreadLinkAccountDisclosure;
	readonly controller: ThreadLinkController;
	readonly initialForm?: ThreadLinkAccountFormId;
}

function isFormId(value: string): value is ThreadLinkAccountFormId {
	return (
		value === "apiKey" ||
		value === "chatgpt" ||
		value === "amazonBedrock" ||
		value === "amazonBedrockAccessKeys"
	);
}

export function AccountSection({
	sectionId,
	account,
	controller,
	initialForm,
}: AccountSectionProps): ReactNode {
	const headingId = useId();
	const groupId = useId();
	const validationId = useId();
	const [formId, setFormId] = useState<ThreadLinkAccountFormId>(initialForm ?? "chatgpt");
	const [values, setValues] = useState<Readonly<Record<string, string>>>({});
	const [validation, setValidation] = useState<string | null>(null);
	const form = threadLinkAccountForm(formId);
	const changeForm = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		const next = event.target.value;
		if (!isFormId(next)) return;
		setFormId(next);
		setValues({});
		setValidation(null);
	}, []);
	const changeField = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		const name = event.target.dataset.threadLinkField;
		const next = event.target.value;
		if (name === undefined) return;
		setValues((current) => ({ ...current, [name]: next }));
	}, []);
	const submit = useCallback(() => {
		const built = buildThreadLinkLogin(formId, values);
		if (!built.ok) {
			setValidation(built.reason);
			return;
		}
		setValidation(null);
		void controller.login(built.login);
	}, [controller, formId, values]);
	const cancel = useCallback(() => {
		if (account.pendingLoginId !== null) void controller.cancelLogin(account.pendingLoginId);
	}, [account.pendingLoginId, controller]);
	const signOut = useCallback(() => {
		void controller.logout();
	}, [controller]);
	const signedIn = account.state === "ready";
	const signingIn = account.state === "login_pending";
	return (
		<details
			open={!signedIn}
			aria-labelledby={headingId}
			className="min-w-0 border-t border-border pt-control"
			data-thread-link-account={account.state}
			id={sectionId}
		>
			<summary className="flex min-h-touch-target cursor-pointer items-center justify-between gap-control outline-none focus-visible:outline-2 focus-visible:outline-ring">
				<h3 className="m-0 text-sm font-medium" id={headingId}>
					Account
				</h3>
				<output
					aria-atomic="true"
					aria-label={`Codex account: ${account.label}`}
					aria-live="polite"
					className={cn("shrink-0 text-sm", STATE_CLASSES[account.state])}
				>
					{account.label}
				</output>
			</summary>
			{account.state === "signed_out" ? null : (
				<p className={cn("m-0 pb-control text-sm", STATE_CLASSES[account.state])}>
					{account.detail}
				</p>
			)}
			{signedIn || signingIn ? null : (
				<fieldset aria-describedby={groupId} className="m-0 border-0 p-0">
					<legend className="sr-only">Sign-in method</legend>
					<div className="grid grid-cols-2 gap-control pb-control">
						{account.forms.map((candidate) => (
							<label
								className={cn(
									"flex min-h-touch-target cursor-pointer items-center gap-control rounded-control border px-control-inline py-control text-sm text-foreground",
									candidate.id === formId
										? "border-primary bg-primary-subtle"
										: "border-border bg-transparent hover:bg-surface-hover",
								)}
								key={candidate.id}
							>
								<input
									checked={candidate.id === formId}
									className="m-0 accent-primary"
									data-thread-link-form-option={candidate.id}
									name={`${groupId}-form`}
									onChange={changeForm}
									type="radio"
									value={candidate.id}
								/>
								<span>{candidate.label}</span>
							</label>
						))}
					</div>
					<p className="m-0 pb-control text-sm text-muted-foreground" id={groupId}>
						{form.description}
					</p>
					<div className="grid gap-control pb-control" data-thread-link-form={formId}>
						{form.fields.map((field) => (
							<label className="min-w-0" key={field.name}>
								<span className="block pb-compact text-sm font-medium">{field.label}</span>
								<input
									autoComplete="off"
									className={FIELD_CLASSES}
									data-thread-link-field={field.name}
									onChange={changeField}
									required={field.required}
									type={field.secret ? "password" : "text"}
									value={values[field.name] ?? ""}
								/>
								{field.description === "" ? null : (
									<span className="mt-compact block text-sm text-muted-foreground">
										{field.description}
									</span>
								)}
							</label>
						))}
					</div>
				</fieldset>
			)}
			{validation === null ? null : (
				<p className="m-0 pb-control text-sm text-destructive" id={validationId} role="alert">
					{validation}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-control pb-control">
				{signedIn || signingIn ? null : (
					<Button
						aria-describedby={validation === null ? undefined : validationId}
						disabled={!account.canLogin}
						onClick={submit}
						tone="primary"
						type="button"
					>
						Sign in
					</Button>
				)}
				{account.pendingLoginId === null ? null : (
					<Button
						disabled={!account.canCancelLogin}
						onClick={cancel}
						tone="secondary"
						type="button"
					>
						Cancel sign-in
					</Button>
				)}
				{signedIn ? (
					<Button disabled={!account.canLogout} onClick={signOut} tone="quiet" type="button">
						Sign out
					</Button>
				) : null}
			</div>
			{signedIn ||
			(signingIn && account.canCancelLogin) ||
			account.blockedReason === null ? null : (
				<p className="m-0 pb-control text-sm text-muted-foreground">{account.blockedReason}</p>
			)}
		</details>
	);
}

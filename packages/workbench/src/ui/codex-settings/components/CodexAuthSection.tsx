import { useCallback, useId, useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import { RiExternalLinkLine, RiKey2Line, RiLogoutBoxRLine, RiRefreshLine } from "@remixicon/react";
import { Button, Input, cn } from "@archboard/ui-kit/components";
import type { CodexAuthState } from "#shared/codex-settings/schemas/codex-settings.ts";
import { HiddenEmail } from "#ui/codex-settings/components/HiddenEmail.tsx";
import { formatAuthenticatedAccount } from "#ui/codex-settings/rules/model-selection.ts";

interface CodexAuthSectionProps {
	readonly auth: CodexAuthState;
	readonly busy: boolean;
	readonly onSignInChatgpt: () => void;
	readonly onSignInApiKey: (apiKey: string) => Promise<boolean>;
	readonly onCancelLogin: () => void;
	readonly onLogout: () => void;
	readonly onRefresh: () => void;
}

const LAMP_BY_STATE: Readonly<Record<CodexAuthState["state"], string>> = {
	authenticated: "bg-status size-2 rounded-full",
	login_pending: "bg-primary size-2 rounded-full motion-safe:animate-pulse",
	signed_out: "ring-muted-foreground/60 size-2 rounded-full ring-[1.5px]",
	starting: "bg-status size-2 rounded-full motion-safe:animate-pulse",
	unavailable: "bg-destructive size-2 rounded-full",
};

const SIGNED_OUT_FALLBACK =
	"Archboard keeps its own Codex sign-in, separate from any Codex CLI you use elsewhere.";

interface AuthSummary {
	readonly label: string;
	readonly email?: string;
	readonly detail: string | null;
}

/**
 * Keep a signed-in email separate from the label so the toggle can hide it.
 * @param auth The authenticated Codex state.
 * @returns Label, email when present, and account details.
 */
function authenticatedSummary(
	auth: Extract<CodexAuthState, { state: "authenticated" }>,
): AuthSummary {
	const formatted = formatAuthenticatedAccount(auth);
	if (auth.account.type === "chatgpt" && auth.account.email !== null) {
		return { label: "Signed in as", email: auth.account.email, detail: formatted.secondary };
	}
	return { label: `Signed in as ${formatted.primary}`, detail: formatted.secondary };
}

/**
 * Summarize the current Codex authentication state.
 * @param auth Current Codex auth state.
 * @returns Title, email when there is one, and optional subtitle.
 */
function authSummary(auth: CodexAuthState): AuthSummary {
	if (auth.state === "authenticated") {
		return authenticatedSummary(auth);
	}
	if (auth.state === "login_pending") {
		return {
			label: "Waiting for sign-in to finish",
			detail: "Complete sign-in in the browser tab that opened, then return here.",
		};
	}
	if (auth.state === "signed_out") {
		return { label: "Not signed in to Codex", detail: auth.reason ?? SIGNED_OUT_FALLBACK };
	}
	if (auth.state === "starting") {
		return { label: "Starting Codex…", detail: auth.reason };
	}
	return { label: "Codex is unavailable", detail: auth.reason };
}

/**
 * Right-aligned primary authentication control for the current auth state.
 * @param props Current auth state, busy flag, and action handlers.
 * @returns Action controls, or null while starting.
 */
function AuthActions(props: Omit<CodexAuthSectionProps, "onSignInApiKey">): JSX.Element | null {
	const { auth, busy, onSignInChatgpt, onCancelLogin, onLogout, onRefresh } = props;
	if (auth.state === "authenticated") {
		return (
			<Button variant="ghost" size="sm" disabled={busy} onClick={onLogout}>
				<RiLogoutBoxRLine aria-hidden="true" className="size-3.5" />
				Sign out
			</Button>
		);
	}
	if (auth.state === "signed_out") {
		return (
			<Button size="sm" disabled={busy} onClick={onSignInChatgpt}>
				Sign in with ChatGPT
			</Button>
		);
	}
	if (auth.state === "login_pending") {
		return (
			<>
				{auth.authUrl !== null && (
					<a
						href={auth.authUrl}
						target="_blank"
						rel="noreferrer"
						className="text-control text-primary-text hover:bg-sidebar-accent rounded-control flex h-8 items-center gap-1 px-2.5 font-medium"
					>
						Open sign-in page
						<RiExternalLinkLine aria-hidden="true" className="size-3.5" />
					</a>
				)}
				<Button variant="outline" size="sm" disabled={busy} onClick={onCancelLogin}>
					Cancel
				</Button>
			</>
		);
	}
	if (auth.state === "unavailable") {
		return (
			<Button variant="outline" size="sm" disabled={busy} onClick={onRefresh}>
				<RiRefreshLine aria-hidden="true" className="size-3.5" />
				Retry
			</Button>
		);
	}
	return null;
}

/**
 * Inline OpenAI API key sign-in form shown while Codex is signed out.
 * @param props Busy flag and submit callback.
 * @param props.busy Whether an auth action is currently in flight.
 * @param props.onSubmit Submits the entered API key.
 * @returns API key form.
 */
function ApiKeySignInForm(props: {
	readonly busy: boolean;
	readonly onSubmit: (apiKey: string) => Promise<boolean>;
}): JSX.Element {
	const { busy, onSubmit } = props;
	const apiKeyId = useId();
	const [apiKey, setApiKey] = useState("");

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value),
		[],
	);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = apiKey.trim();
			if (trimmed === "" || busy) return;
			void onSubmit(trimmed).then((signedIn) => {
				if (signedIn) setApiKey("");
				return undefined;
			});
		},
		[apiKey, busy, onSubmit],
	);

	return (
		<form
			onSubmit={handleSubmit}
			className="border-border/70 flex flex-wrap items-center gap-2 border-t pt-3"
		>
			<label
				htmlFor={apiKeyId}
				className="text-body text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
			>
				<RiKey2Line aria-hidden="true" className="size-3.5" />
				Or use an OpenAI API key
			</label>
			<div className="flex min-w-[220px] flex-1 items-center gap-1.5">
				<Input
					id={apiKeyId}
					type="password"
					autoComplete="off"
					value={apiKey}
					disabled={busy}
					onChange={handleChange}
					placeholder="sk-…"
					className="h-8 flex-1 font-mono"
				/>
				<Button type="submit" variant="outline" size="sm" disabled={busy || apiKey.trim() === ""}>
					Use key
				</Button>
			</div>
		</form>
	);
}

/**
 * Displays the running Codex app-server authentication status and lets the user sign in or out.
 * @param props Current auth state and sign-in/out callbacks.
 * @returns The authentication status plate.
 */
function CodexAuthSection(props: CodexAuthSectionProps): JSX.Element {
	const { auth, busy, onSignInApiKey, ...actionProps } = props;
	const summary = authSummary(auth);

	return (
		<section
			data-slot="codex-auth-section"
			data-auth-state={auth.state}
			aria-label="Codex authentication"
			className="border-border bg-muted/35 flex flex-col gap-3 rounded-lg border p-3.5"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-1 items-start gap-2.5">
					<span aria-hidden="true" className={cn("mt-1.5 shrink-0", LAMP_BY_STATE[auth.state])} />
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="text-control font-medium">
							{summary.label}
							{summary.email !== undefined && (
								<>
									{" "}
									<HiddenEmail email={summary.email} />
								</>
							)}
						</span>
						{summary.detail !== null && (
							<span className="text-body text-muted-foreground">{summary.detail}</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<AuthActions auth={auth} busy={busy} {...actionProps} />
				</div>
			</div>
			{auth.state === "signed_out" && <ApiKeySignInForm busy={busy} onSubmit={onSignInApiKey} />}
		</section>
	);
}

export { CodexAuthSection };

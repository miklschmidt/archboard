import { useCallback, useContext, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import { LanguageServerFixContext } from "#ui/architecture-drawing/model-reader/state/language-server-fix.ts";
import {
	languageName,
	type MissingServers,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-code.ts";

/**
 * Why code counts are missing in checkouts without the server of a language: each language names
 * the server that it needs, and Fix with Codex asks the agent of that checkout to set it up
 * (TASK-646.09).
 * @param props The checkouts that miss a server.
 * @param props.missing Each checkout with its languages.
 * @returns A line for each checkout, or nothing when none misses one.
 */
function ModelMeasureServers(props: { readonly missing: readonly MissingServers[] }): JSX.Element {
	return (
		<>
			{props.missing.map((each) => (
				<MissingServer key={each.repo} missing={each} />
			))}
		</>
	);
}

/**
 * One checkout's languages without a server, and the action that sets them up.
 * @param props The checkout.
 * @param props.missing Its languages.
 * @returns The line.
 */
function MissingServer(props: { readonly missing: MissingServers }): JSX.Element {
	const { repo, languages } = props.missing;
	const setup = useContext(LanguageServerFixContext);
	const needs = new Map(setup?.needs(languages).map(({ language, server }) => [language, server]));
	const fix = useCallback(() => setup?.fix(repo, languages), [setup, repo, languages]);
	return (
		<div
			data-slot="model-measures-server"
			data-repo={repo}
			className="flex items-start justify-between gap-3"
		>
			<ul className="text-body text-muted-foreground min-w-0 [overflow-wrap:anywhere]">
				{languages.map((language) => (
					<li key={language}>
						{`No ${languageName(language)} language server in ${repo}, so its code is not counted.`}
						<ServerNeeded server={needs.get(language)} />
					</li>
				))}
			</ul>
			{setup !== null && (
				<Button variant="outline" size="xs" onClick={fix} className="shrink-0">
					Fix with Codex
				</Button>
			)}
		</div>
	);
}

/**
 * The server a language needs, with its program names set as code.
 * @param props The server, in Markdown, or nothing when no brief names one.
 * @param props.server The server.
 * @returns The words, or nothing.
 */
function ServerNeeded(props: { readonly server: string | undefined }): JSX.Element | null {
	if (props.server === undefined) return null;
	return (
		<>
			{" It needs "}
			{props.server
				.split("`")
				.map((text, index) => ({ text, code: index % 2 === 1 }))
				.filter(({ text }) => text !== "")
				.map(({ text, code }) =>
					code ? (
						<code key={`code ${text}`} className="text-foreground font-mono">
							{text}
						</code>
					) : (
						<span key={`text ${text}`}>{text}</span>
					),
				)}
			.
		</>
	);
}

export { ModelMeasureServers };

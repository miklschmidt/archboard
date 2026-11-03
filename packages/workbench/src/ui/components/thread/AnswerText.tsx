// The agent's answer as markdown, with three rules the registry renderer does
// not keep: a link opens in a new tab, so following one never takes the canvas
// away; a link to a local file opens the file in the person's editor; and an
// image is a link to it rather than a request the answer's author makes on the
// reader's behalf.

import { TextMessagePartProvider, type TextMessagePartProps } from "@assistant-ui/react";
import { useCallback, type ComponentPropsWithoutRef, type JSX, type ReactNode } from "react";

import { MarkdownText } from "#ui/components/thread/markdown-text.tsx";
import { useOpenAnswerFile, type OpenAnswerFile } from "#ui/hooks/thread/use-answer-files.ts";
import { answerFile } from "#ui/rules/thread/answer-file.ts";

/** How a link in an answer looks, whatever it does. */
const LINK =
	"aui-md-a text-primary-text hover:text-primary-text/80 decoration-primary-mark underline underline-offset-2";

/**
 * A link that opens in a new tab, or a local file the link names in the person's editor.
 * @param props The anchor's attributes.
 * @param props.href Where it goes.
 * @param props.children What it says.
 * @returns The link.
 */
function AnswerLink(props: ComponentPropsWithoutRef<"a">): JSX.Element {
	const open = useOpenAnswerFile();
	const file = answerFile(props.href);
	if (file === null || open === null) {
		return (
			<a href={props.href} target="_blank" rel="noreferrer noopener" className={LINK}>
				{props.children}
			</a>
		);
	}
	return (
		<FileLink path={file.path} line={file.line} open={open}>
			{props.children}
		</FileLink>
	);
}

/**
 * A local file an answer links to, which opens in the person's editor. Its whole path and line
 * show on hover, because the words of the link are often only the file's name.
 * @param props The file, its line, the opening and what the link says.
 * @param props.path The file.
 * @param props.line The line, when the link names one.
 * @param props.open Opens the file.
 * @param props.children What the link says.
 * @returns The link.
 */
function FileLink(props: {
	readonly path: string;
	readonly line: number | undefined;
	readonly open: OpenAnswerFile;
	readonly children: ReactNode;
}): JSX.Element {
	const { path, line, open } = props;
	const openFile = useCallback(
		(): void => open(line === undefined ? { path } : { path, line }),
		[open, path, line],
	);
	return (
		<button
			type="button"
			title={line === undefined ? path : `${path}:${line}`}
			onClick={openFile}
			className={`${LINK} cursor-pointer text-left`}
		>
			{props.children}
		</button>
	);
}

/**
 * An image as a link to it: nothing loads until the person follows it.
 * @param props The image's attributes.
 * @param props.src Where the image is.
 * @param props.alt What it shows.
 * @returns The link.
 */
function AnswerImage(props: ComponentPropsWithoutRef<"img">): JSX.Element {
	const src = typeof props.src === "string" ? props.src : undefined;
	return (
		<a href={src} target="_blank" rel="noreferrer noopener" className={LINK}>
			{props.alt === undefined || props.alt === "" ? src : props.alt}
		</a>
	);
}

/** The renderer's components the answer replaces. */
const ANSWER_COMPONENTS = { a: AnswerLink, img: AnswerImage };

/**
 * The agent's answer.
 * @param props The text part.
 * @returns The rendered markdown.
 */
function AnswerText(props: TextMessagePartProps): JSX.Element {
	return <MarkdownText {...props} components={ANSWER_COMPONENTS} />;
}

/**
 * An answer that stands outside a conversation.
 * @param props The answer and whether it is still arriving.
 * @param props.text The markdown.
 * @param props.running Whether it is still arriving.
 * @returns The rendered markdown.
 */
function AgentAnswer(props: { readonly text: string; readonly running: boolean }): JSX.Element {
	return (
		<TextMessagePartProvider text={props.text} isRunning={props.running}>
			<MarkdownText components={ANSWER_COMPONENTS} />
		</TextMessagePartProvider>
	);
}

export { AgentAnswer, AnswerText };

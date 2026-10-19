// The agent's answer as markdown, with two rules the registry renderer does
// not keep: a link opens in a new tab, so following one never takes the canvas
// away, and an image is a link to it rather than a request the answer's author
// makes on the reader's behalf.

import type { TextMessagePartProps } from "@assistant-ui/react";
import type { ComponentPropsWithoutRef, JSX } from "react";

import { MarkdownText } from "#ui/components/thread/markdown-text.tsx";

/**
 * A link that opens in a new tab.
 * @param props The anchor's attributes.
 * @param props.href Where it goes.
 * @param props.children What it says.
 * @returns The link.
 */
function AnswerLink(props: ComponentPropsWithoutRef<"a">): JSX.Element {
	return (
		<a
			href={props.href}
			target="_blank"
			rel="noreferrer noopener"
			className="aui-md-a text-primary-text hover:text-primary-text/80 decoration-primary-mark underline underline-offset-2"
		>
			{props.children}
		</a>
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
		<a
			href={src}
			target="_blank"
			rel="noreferrer noopener"
			className="aui-md-a text-primary-text hover:text-primary-text/80 decoration-primary-mark underline underline-offset-2"
		>
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

export { AnswerText };

// The GitHub REST calls of the pull request action: read a pull request, and keep one comment.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { findStickyComment } from "./marker.ts";
import type { IssueComment } from "./marker.ts";

/** How to reach the API. */
interface ApiAccess {
	/** GITHUB_API_URL. */
	readonly url: string;
	readonly token: string;
	/** `owner/name`. */
	readonly repository: string;
}

/** What a request answered. */
interface ApiAnswer {
	readonly ok: boolean;
	readonly status: number;
	readonly body: unknown;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/**
 * Call the REST API.
 * @param access How to reach it.
 * @param method The HTTP method.
 * @param path The path below the repository, such as `/issues/3/comments`.
 * @param payload The JSON body, if any.
 * @returns The status and the parsed body. A network failure has status 0.
 */
async function call(
	access: ApiAccess,
	method: string,
	path: string,
	payload?: object,
): Promise<ApiAnswer> {
	try {
		const response = await fetch(`${access.url}/repos/${access.repository}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${access.token}`,
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
				...(payload === undefined ? {} : { "content-type": "application/json" }),
			},
			...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
		});
		const text = await response.text();
		return {
			ok: response.ok,
			status: response.status,
			body: text === "" ? undefined : parse(text),
		};
	} catch (error) {
		return { ok: false, status: 0, body: String(error) };
	}
}

/**
 * Parse a response body that should be JSON.
 * @param text The body.
 * @returns The value, or the text when it is no JSON.
 */
function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/** The fields of a pull request that can change after the workflow starts. */
interface PullRequestFacts {
	readonly body: string;
	readonly labels: readonly string[];
	/** The pull request's head commit now, which a later push moves past this run's. */
	readonly headSha?: string | undefined;
}

/**
 * Read the current description and labels of a pull request.
 * @param access How to reach the API.
 * @param number The pull request's number.
 * @returns The facts, or undefined when the API did not answer.
 */
async function readPullRequest(
	access: ApiAccess,
	number: number,
): Promise<PullRequestFacts | undefined> {
	const answer = await call(access, "GET", `/pulls/${String(number)}`);
	if (!answer.ok || typeof answer.body !== "object" || answer.body === null) return undefined;
	return factsOf(answer.body);
}

/**
 * The facts of a pull request that the API returned.
 * @param pull The pull request object.
 * @returns The facts.
 */
function factsOf(pull: object): PullRequestFacts {
	const {
		body,
		labels = [],
		head,
	} = pull as {
		body?: string | null;
		labels?: readonly { name?: string }[];
		head?: { sha?: string };
	};
	return {
		body: body ?? "",
		labels: labels.flatMap((label) => label.name ?? []),
		headSha: head?.sha,
	};
}

/**
 * Why this run must not publish pictures or a comment.
 * @param access How to reach the API.
 * @param number The pull request's number.
 * @param headSha The commit this run reports.
 * @returns A reason, or undefined when this run still reports the current head.
 */
async function publicationProblem(
	access: ApiAccess,
	number: number,
	headSha: string,
): Promise<string | undefined> {
	const now = (await readPullRequest(access, number))?.headSha;
	if (now === undefined) {
		return "The current pull request head could not be read. This run publishes neither pictures nor comment. Run the Action again when GitHub answers.";
	}
	return now === headSha
		? undefined
		: `The pull request moved on to ${now.slice(0, 7)}, so this run of an older head publishes neither pictures nor comment.`;
}

/**
 * Whether a value from the API is a comment.
 * @param value The value.
 * @returns True when it has a numeric id.
 */
function isComment(value: unknown): value is IssueComment {
	return (
		typeof value === "object" && value !== null && "id" in value && typeof value.id === "number"
	);
}

/**
 * List the comments of a pull request, oldest first, from a page on.
 * @param access How to reach the API.
 * @param number The pull request's number.
 * @param page The page to start at, from 1.
 * @returns The comments, or undefined when the API refused.
 */
async function listComments(
	access: ApiAccess,
	number: number,
	page: number,
): Promise<IssueComment[] | undefined> {
	const answer = await call(
		access,
		"GET",
		`/issues/${String(number)}/comments?per_page=${String(PAGE_SIZE)}&page=${String(page)}`,
	);
	if (!answer.ok || !Array.isArray(answer.body)) return undefined;
	const comments: IssueComment[] = answer.body.filter(isComment);
	if (answer.body.length < PAGE_SIZE || page >= MAX_PAGES) return comments;
	const rest = await listComments(access, number, page + 1);
	return rest === undefined ? undefined : [...comments, ...rest];
}

/** What posting the comment came to. */
type PostResult =
	| { readonly posted: "created" | "updated" | "none" }
	| { readonly failure: string };

/**
 * Create the pull request's sticky comment, or update the one this action made before.
 * @param access How to reach the API.
 * @param number The pull request's number.
 * @param body The comment's Markdown, which carries the marker.
 * @param headSha The commit this run reports.
 * @param create False to only update an earlier comment, and create none.
 * @returns What happened. A refusal, such as the read-only token of a fork, says why.
 */
async function upsertComment(
	access: ApiAccess,
	number: number,
	body: string,
	headSha: string,
	create = true,
): Promise<PostResult> {
	const comments = await listComments(access, number, 1);
	if (comments === undefined)
		return { failure: "the token cannot read the pull request's comments" };
	const existing = findStickyComment(comments);
	const problem = await publicationProblem(access, number, headSha);
	if (problem !== undefined) return { failure: problem };
	if (existing === undefined) {
		if (!create) return { posted: "none" };
		const answer = await call(access, "POST", `/issues/${String(number)}/comments`, { body });
		return posted(answer, "created");
	}
	const answer = await call(access, "PATCH", `/issues/comments/${String(existing)}`, { body });
	return posted(answer, "updated");
}

/**
 * What a write of the comment came to.
 * @param answer The API's answer.
 * @param done What a success did.
 * @returns The result.
 */
function posted(answer: ApiAnswer, done: "created" | "updated"): PostResult {
	return answer.ok
		? { posted: done }
		: { failure: `GitHub answered ${String(answer.status)} to the comment` };
}

export { publicationProblem, readPullRequest, upsertComment, type ApiAccess, type PostResult };

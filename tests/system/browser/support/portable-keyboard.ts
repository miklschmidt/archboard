import { DevTools, isJsonRecord, type JsonRecord } from "@/runtime/headless-chromium";

import type { BrowserCommandOptions } from "./agent-browser.ts";

type NativeCommand = (argv: readonly string[], options?: BrowserCommandOptions) => Promise<string>;

const CONTROL_KEYS: Readonly<Record<string, readonly [string, string, number]>> = {
	enter: ["Enter", "Enter", 13],
	return: ["Enter", "Enter", 13],
	tab: ["Tab", "Tab", 9],
	escape: ["Escape", "Escape", 27],
	esc: ["Escape", "Escape", 27],
	backspace: ["Backspace", "Backspace", 8],
	delete: ["Delete", "Delete", 46],
	arrowleft: ["ArrowLeft", "ArrowLeft", 37],
	arrowup: ["ArrowUp", "ArrowUp", 38],
	arrowright: ["ArrowRight", "ArrowRight", 39],
	arrowdown: ["ArrowDown", "ArrowDown", 40],
	home: ["Home", "Home", 36],
	end: ["End", "End", 35],
	pageup: ["PageUp", "PageUp", 33],
	pagedown: ["PageDown", "PageDown", 34],
	space: [" ", "Space", 32],
};
const MODIFIERS: Readonly<Record<string, number>> = {
	alt: 1,
	control: 2,
	ctrl: 2,
	meta: 4,
	cmd: 4,
	shift: 8,
};

/** Portable CDP fields for the key chords used by the browser owners. */
function keyFields(chord: string): JsonRecord {
	const pieces = chord.split("+");
	const key = pieces.pop() ?? "";
	let modifiers = 0;
	for (const piece of pieces) {
		const modifierName = piece.toLowerCase();
		const modifier = Object.hasOwn(MODIFIERS, modifierName) ? MODIFIERS[modifierName] : undefined;
		if (modifier === undefined) throw new Error(`Unknown browser key modifier: ${piece}`);
		modifiers |= modifier;
	}
	const keyName = key.toLowerCase();
	const named = Object.hasOwn(CONTROL_KEYS, keyName) ? CONTROL_KEYS[keyName] : undefined;
	const letter = /^[a-z]$/i.test(key);
	const digit = /^\d$/.test(key);
	if (!named && !letter && !digit) throw new Error(`Unsupported portable browser key: ${key}`);
	const [unmodifiedName, code, windowsVirtualKeyCode] = named ?? [
		key,
		`${letter ? "Key" : "Digit"}${key.toUpperCase()}`,
		key.toUpperCase().charCodeAt(0),
	];
	const name =
		modifiers & 8
			? letter
				? key.toUpperCase()
				: digit
					? ")!@#$%^&*("[Number(key)]!
					: unmodifiedName
			: unmodifiedName;
	const text =
		name === "Enter" ? "\r" : name === "Tab" ? "\t" : name.length === 1 ? name : undefined;
	return {
		key: name,
		code,
		windowsVirtualKeyCode,
		modifiers,
		...(text !== undefined && !(modifiers & 6)
			? { text, unmodifiedText: unmodifiedName.length === 1 ? unmodifiedName : text }
			: {}),
	};
}

/** Keep every step inside the original browser command deadline. */
function remaining(deadline: number, signal?: AbortSignal): number {
	signal?.throwIfAborted();
	const time = deadline - Date.now();
	if (time <= 0) throw new Error("Portable browser key input exceeded its command deadline.");
	return time;
}

/** Connect only to the active page of the browser that agent-browser owns. */
async function activePage(
	command: NativeCommand,
	deadline: number,
	signal?: AbortSignal,
): Promise<DevTools> {
	const endpoint = new URL(
		(await command(["get", "cdp-url"], { timeoutMs: remaining(deadline, signal) })).trim(),
	);
	if (endpoint.protocol !== "ws:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port) {
		throw new Error("Owned browser DevTools endpoint must be an explicit loopback WebSocket.");
	}
	const pageUrl = (
		await command(["get", "url"], { timeoutMs: remaining(deadline, signal) })
	).trim();
	const discoveryDeadline = AbortSignal.timeout(remaining(deadline, signal));
	const response = await fetch(`http://${endpoint.host}/json/list`, {
		signal: signal ? AbortSignal.any([discoveryDeadline, signal]) : discoveryDeadline,
		redirect: "error",
	});
	if (!response.ok) throw new Error(`Owned browser target discovery failed: ${response.status}`);
	const targets: unknown = await response.json();
	if (!Array.isArray(targets)) throw new Error("Owned browser target discovery returned no list.");
	const pages = targets.filter(
		(target: unknown) =>
			isJsonRecord(target) && target["type"] === "page" && target["url"] === pageUrl,
	);
	const page: unknown = pages[0];
	if (
		pages.length !== 1 ||
		!isJsonRecord(page) ||
		typeof page["webSocketDebuggerUrl"] !== "string"
	) {
		throw new Error("Owned browser target discovery did not identify exactly one active page.");
	}
	const pageEndpoint = new URL(page["webSocketDebuggerUrl"]);
	if (pageEndpoint.protocol !== "ws:" || pageEndpoint.host !== endpoint.host) {
		throw new Error("Owned browser page endpoint escapes its browser listener.");
	}
	return await DevTools.connect(pageEndpoint.href, remaining(deadline, signal), signal);
}

/**
 * Send trusted input without the vendor's Windows nativeVirtualKeyCode on macOS.
 * Chromium computes the platform field from the portable Windows and DOM fields.
 */
async function pressPortableKey(
	command: NativeCommand,
	chord: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	const fields = keyFields(chord);
	const page = await activePage(command, deadline, signal);
	const cancel = (): void => page.close();
	signal?.addEventListener("abort", cancel, { once: true });
	try {
		await page.call(
			"Input.dispatchKeyEvent",
			{ type: "keyDown", ...fields },
			remaining(deadline, signal),
		);
		const { text: _text, unmodifiedText: _unmodifiedText, ...release } = fields;
		await page.call(
			"Input.dispatchKeyEvent",
			{ type: "keyUp", ...release },
			remaining(deadline, signal),
		);
		return "";
	} finally {
		signal?.removeEventListener("abort", cancel);
		page.close();
	}
}

export { pressPortableKey };

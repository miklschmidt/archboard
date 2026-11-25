import { describe, expect, test } from "bun:test";
import {
	handleSocketMessage,
	type MessageContext,
	type PaneSettingsRequest,
} from "#ui/panes/pane-session/rules/socket-messages.ts";

/**
 * Create a minimal socket message context for unit testing pane_settings dispatch.
 * @param received Collects dispatched display settings.
 * @returns The message context.
 */
function contextWith(received: PaneSettingsRequest[]): MessageContext {
	return {
		clientId: "c1",
		/**
		 * Report no legacy pane key.
		 * @returns Null.
		 */
		paneKey: () => null,
		/**
		 * Report a fixed test vault path.
		 * @returns The test vault path.
		 */
		vault: () => "/vault",
		/** Ignore model adoption in this settings test. */
		adoptModel: () => {},
		/** Ignore status publishing in this settings test. */
		publishStatus: () => {},
		onLayoutRequest: undefined,
		onPresentRequest: undefined,
		onModelRequest: undefined,
		/**
		 * Record incoming display settings for assertion.
		 * @param settings The parsed display settings.
		 */
		onSettingsRequest: (settings) => {
			received.push(settings);
		},
		onAgentActivity: undefined,
		onExplanationsChanged: undefined,
	};
}

describe("pane_settings socket messages", () => {
	test("delivers valid layout, theme, and hoverLight updates in place", () => {
		const received: PaneSettingsRequest[] = [];
		handleSocketMessage(contextWith(received), {
			type: "pane_settings",
			layout: "lanes",
			theme: "dark",
			hoverLight: "off",
		});
		expect(received).toEqual([{ layout: "lanes", theme: "dark", hoverLight: "off" }]);
	});

	test("drops invalid display setting values without invoking the callback", () => {
		const received: PaneSettingsRequest[] = [];
		handleSocketMessage(contextWith(received), {
			type: "pane_settings",
			layout: "not-an-engine",
		});
		expect(received).toEqual([]);
	});
});

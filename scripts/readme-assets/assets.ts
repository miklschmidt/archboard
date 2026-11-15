// Every README asset the kit makes, by the name the manifest gives it.

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { ask } from "./ask.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { banner } from "./banner.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { claim } from "./claim.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { designSmells } from "./design-smells.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { drillDown } from "./drill-down.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { codeEvidence, moduleInterfaces, gitHistory } from "./evidence.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { hero } from "./hero.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { history } from "./history.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { narratedProducer } from "./narrated.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { plan } from "./plan.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import type { Producer } from "./producer.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { diagramProducer } from "./svg.ts";

/** The producers, by asset name. */
/** The programs and external systems of this repository, which the README draws as cards, and its packages as doors. */
const SYSTEMS = [
	"vKEsyHFk/vKEsyHFk#TBnOCNx2",
	"vKEsyHFk/vKEsyHFk#cPOdAA3f",
	"vKEsyHFk/vKEsyHFk#8XKRkSHl",
	"vKEsyHFk/vKEsyHFk#6nZjwK9W",
	"vKEsyHFk/IbGtfJE2#9TIT63Qz",
	"vKEsyHFk/vKEsyHFk#xr1MHYE7",
	"vKEsyHFk/IbGtfJE2#1snXnK3G",
	"vKEsyHFk/0T9enjhi#ffFYC0XR",
	"vKEsyHFk/IbGtfJE2#I1uPm6KX",
	"vKEsyHFk/IbGtfJE2#IOCRa8GO",
	"vKEsyHFk/vKEsyHFk#nugpFSIX",
	"vKEsyHFk/vKEsyHFk#t7W7wJHv",
	"vKEsyHFk/OjRLKb74#RvOyWmEb",
	"vKEsyHFk/XppR9owz#kdK2HT99",
	"vKEsyHFk/vKEsyHFk#xssnUgIk",
];

const PRODUCERS: Readonly<Record<string, Producer>> = {
	banner,
	hero,
	explainer: narratedProducer({
		name: "explainer",
		vault: ".archboard/vault",
		walkthrough: "What Archboard does",
	}),
	plan,
	"code-evidence": codeEvidence,
	"module-interfaces": moduleInterfaces,
	"git-history": gitHistory,
	"design-smells": designSmells,
	history,
	"pr-walkthrough": narratedProducer({
		name: "pr-walkthrough",
		vault: "examples/web-shop",
		// The portable example archive retains this exact reading of the Queued fulfilment draft,
		// saved when its walkthrough's narratives became statements about the system; it holds that
		// walkthrough and has the revision of the tracked example. The earlier readings keep older
		// narratives: 10ebe024 the first proven ones, and 2e715ac9 the original ones. The first
		// draft's checkpoint, f4ae77d8, is the shelved "Queued fulfilment, first draft".
		checkpoint: "452d05c65e16f5e7b0d9a0fbbc81ac3a603447c6",
		walkthrough: "Why checkout stops waiting",
		thumbnail: { file: "docs/readme/idx-voice.webp", step: 1 },
	}),
	sequence: diagramProducer({
		name: "sequence",
		vault: "examples/web-shop",
		reading: { flow: "Place an order", grammar: "sequence" },
		thumbnail: { file: "docs/readme/idx-sequence.webp", theme: "light", width: 1120 },
	}),
	newcomer: narratedProducer({
		name: "newcomer",
		vault: "examples/web-shop",
		walkthrough: "How stock is reserved",
		thumbnail: { file: "docs/readme/idx-newcomer.webp", step: 4 },
	}),
	"drill-down": drillDown,
	ask,
	claim,
	"web-shop": diagramProducer({
		name: "web-shop",
		vault: "examples/web-shop",
		reading: { grammar: "architecture" },
		thumbnail: { file: "docs/readme/idx-docs.webp", theme: "dark", width: 1600 },
	}),
	architecture: diagramProducer({
		name: "architecture",
		vault: ".archboard/vault",
		reading: { grammar: "architecture", focus: SYSTEMS },
	}),
};

export { PRODUCERS };

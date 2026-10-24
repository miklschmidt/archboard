// Every README asset the kit makes, by the name the manifest gives it.

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { ask } from "./ask.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { banner } from "./banner.ts";
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
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { takeBack } from "./take-back.ts";

/** The producers, by asset name. */
const PRODUCERS: Readonly<Record<string, Producer>> = {
	banner,
	hero,
	explainer: narratedProducer({
		name: "explainer",
		vault: ".archboard/vault",
		board: "Archboard",
		walkthrough: "Read this board",
	}),
	plan,
	"code-evidence": codeEvidence,
	"module-interfaces": moduleInterfaces,
	"git-history": gitHistory,
	history,
	"pr-walkthrough": narratedProducer({
		name: "pr-walkthrough",
		vault: "examples/web-shop",
		board: "Web shop",
		variant: "Queued fulfilment",
		walkthrough: "Why checkout stops waiting",
		thumbnail: { file: "docs/readme/idx-voice.webp", step: 1 },
	}),
	sequence: diagramProducer({
		name: "sequence",
		vault: "examples/web-shop",
		board: "Web shop",
		view: "Place an order",
		thumbnail: { file: "docs/readme/idx-sequence.webp", theme: "light", width: 1120 },
	}),
	newcomer: narratedProducer({
		name: "newcomer",
		vault: "examples/web-shop",
		board: "Inventory service",
		walkthrough: "How stock is reserved",
		thumbnail: { file: "docs/readme/idx-newcomer.webp", step: 4 },
	}),
	"drill-down": drillDown,
	ask,
	"take-back": takeBack,
	"web-shop": diagramProducer({
		name: "web-shop",
		vault: "examples/web-shop",
		board: "Web shop",
		view: "Everything",
		thumbnail: { file: "docs/readme/idx-docs.webp", theme: "dark", width: 1600 },
	}),
	architecture: diagramProducer({
		name: "architecture",
		vault: ".archboard/vault",
		board: "Archboard",
	}),
};

export { PRODUCERS };

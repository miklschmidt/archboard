import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "#tests/runtime/operations/model-edit/fixture.ts";
function behaviorFixture() {
	const context = fixture();
	writeFileSync(
		join(context.vault, "unrelated-name.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Behavior",
			name: "Behavior",
			flows: [
				{
					id: "Shop#Checkout",
					name: "Checkout",
					participants: ["Shop#Gateway", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Send",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
							repeat: 3,
							note: "Keep me",
						},
						{
							id: "Shop#Decide",
							kind: "decision",
							question: "Ready?",
							alternatives: [
								{
									label: "yes",
									steps: [
										{
											id: "Shop#Repeat",
											kind: "loop",
											condition: "More",
											steps: [
												{
													id: "Shop#Result",
													from: "Shop#Worker",
													to: "Shop#Gateway",
													kind: "return",
													label: "Result",
												},
											],
										},
									],
								},
								{ label: "no", steps: [] },
							],
						},
					],
				},
				{
					id: "Shop#Other",
					name: "Other",
					participants: ["Shop#Worker", "Shop#Gateway"],
					steps: [
						{
							id: "Shop#Notify",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "async",
							label: "Notify",
						},
					],
				},
			],
		}),
	);
	return context;
}
const allBehaviorSubjects = [
	"Shop",
	"Shop#Gateway",
	"Shop#Worker",
	"Shop#Checkout",
	"Shop#Other",
	"Shop#Send",
	"Shop#Decide",
	"Shop#Repeat",
	"Shop#Result",
	"Shop#Notify",
];

export { behaviorFixture, allBehaviorSubjects };

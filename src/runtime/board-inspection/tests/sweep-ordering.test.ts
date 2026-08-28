import { describe, expect, test } from "bun:test";
import { diagnoseSweepCompatibility } from "../diagnostics.js";
import { inspectBoard } from "../index.js";
import { connector } from "./fixtures/elements.js";
import { controls, interval } from "./fixtures/sweep-cases.js";

describe("sweep ordering", () => {
	test("orders controls, orientations, and same-set pairs exactly", () => {
		const control = diagnoseSweepCompatibility({
			left: [
				interval("event\0control", 1, 2, "event\0control", {
					excludedPartitions: ["active,a", "active\\b"],
				}),
			],
			right: [
				interval("blocked-comma", 0, 3, "active,a"),
				interval("blocked-slash", 0, 3, "active\\b"),
				interval("blocked-reciprocal", 0, 3, "active\u001fcontrol", {
					excludedPartitions: ["event\0control"],
				}),
				interval("eligible-control", 0, 3, "eligible\ud800"),
			],
			sameSet: false,
		});
		const reverse = diagnoseSweepCompatibility({
			left: [
				interval("active-reciprocal", 0, 3, "active", {
					excludedPartitions: ["event"],
				}),
				interval("active-eligible", 0, 3, "eligible"),
			],
			right: [interval("event", 1, 2, "event")],
			sameSet: false,
		});
		const sameSet = diagnoseSweepCompatibility({
			left: [
				interval("same-a", 0, 4, "same", { excludedPartitions: ["same"] }),
				interval("same-b", 1, 3, "same", { excludedPartitions: ["same"] }),
				interval("other", 2, 5, "other", { excludedPartitions: ["other"] }),
			],
			right: [],
			sameSet: true,
		});
		expect(control.pairs).toEqual([["event\0control", "eligible-control"]]);
		expect(reverse.pairs).toEqual([["active-eligible", "event"]]);
		expect(sameSet.pairs).toEqual([
			["other", "same-a"],
			["other", "same-b"],
		]);
	});

	test("matches the one-sided brute-force overlap oracle", () => {
		let seed = 0x119;
		const random = () => (seed = (seed * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32;
		for (let sample = 0; sample < 8; sample += 1) {
			const intervals = Array.from({ length: 24 }, (_, index) => {
				const x = Math.floor(random() * 200) - 100;
				const delta = Math.floor(random() * 40) + 1;
				return {
					id: `oracle-${sample}-${index}`,
					x,
					min: x,
					max: x + delta,
					delta,
				};
			});
			const report = inspectBoard(
				intervals.map((item, index) =>
					connector({
						id: item.id,
						x: item.x,
						y: index * 100,
						width: item.delta,
						height: 1,
						points: [
							[0, 0],
							[item.delta, 1],
						],
					}),
				),
			);
			let expected = 0;
			for (let left = 0; left < intervals.length; left += 1)
				for (let right = left + 1; right < intervals.length; right += 1)
					if (
						intervals[left]!.min <= intervals[right]!.max &&
						intervals[right]!.min <= intervals[left]!.max
					)
						expected += 1;
			expect(report.broadPhaseComparisons).toBe(expected);
		}
	});

	test("matches the two-sided brute-force oracle and stable exact order", () => {
		let seed = 0x5119;
		const random = () => (seed = (seed * 1_103_515_245 + 12_345) >>> 0) / 2 ** 32;
		for (let sample = 0; sample < 8; sample += 1) {
			const makeSide = (side: "left" | "right") =>
				Array.from({ length: 18 }, (_unused, index) => {
					const min = Math.floor(random() * 30);
					return interval(
						`${side}-${sample}-${index}`,
						min,
						min + 1 + Math.floor(random() * 8),
						`${side}-partition-${index % 7}`,
						{
							excludedPartitions: Array.from({ length: 7 }, (_entry, candidate) => candidate)
								.filter(() => random() < 0.18)
								.map((candidate) => `${side === "left" ? "right" : "left"}-partition-${candidate}`),
						},
					);
				});
			const left = makeSide("left");
			const right = makeSide("right");
			const actual = diagnoseSweepCompatibility({
				left,
				right,
				sameSet: false,
			}).pairs;
			const expected = left.flatMap((a) =>
				right.flatMap((b) =>
					a.min <= b.max &&
					b.min <= a.max &&
					!a.excludedPartitions?.includes(b.partition) &&
					!b.excludedPartitions?.includes(a.partition)
						? [[a.id, b.id] as [string, string]]
						: [],
				),
			);
			expect(new Set(actual.map((pair) => JSON.stringify(pair)))).toEqual(
				new Set(expected.map((pair) => JSON.stringify(pair))),
			);
			expect(actual).toEqual(
				diagnoseSweepCompatibility({
					left: left.toReversed(),
					right: right.toReversed(),
					sameSet: false,
				}).pairs,
			);
		}
	});

	test("expires and reinserts exact profiles with exact retained-state outputs", () => {
		const retainedInput = {
			left: [
				interval("retained-event", 1, 3, "retained-event", {
					excludedPartitions: ["absent"],
				}),
			],
			right: Array.from({ length: 3 }, (_, index) =>
				interval(`retained-active-${index}`, 0, 3, `retained-partition-${index}`),
			),
			sameSet: false,
		};
		const complete = diagnoseSweepCompatibility(retainedInput);
		const early = diagnoseSweepCompatibility({
			...retainedInput,
			stopAfterPairs: 1,
		});
		expect({
			pairs: complete.pairs,
			peakActiveBuckets: complete.work.peakActiveBuckets,
			peakActiveProfiles: complete.work.peakActiveProfiles,
		}).toEqual({
			pairs: [
				["retained-event", "retained-active-0"],
				["retained-event", "retained-active-1"],
				["retained-event", "retained-active-2"],
			],
			peakActiveBuckets: 4,
			peakActiveProfiles: 4,
		});
		expect({
			pairs: early.pairs,
			peakActiveBuckets: early.work.peakActiveBuckets,
			peakActiveProfiles: early.work.peakActiveProfiles,
		}).toEqual({
			pairs: [["retained-event", "retained-active-0"]],
			peakActiveBuckets: 3,
			peakActiveProfiles: 3,
		});

		const reinsertion = diagnoseSweepCompatibility({
			left: [
				interval("first-excluded", 0, 1, "reinsertion-left", {
					excludedPartitions: ["reinsertion-right"],
				}),
				interval("second-excluded", 4, 6, "reinsertion-left", {
					excludedPartitions: ["reinsertion-right"],
				}),
			],
			right: [
				interval("between", 2, 3, "reinsertion-right"),
				interval("overlap-after-reinsert", 5, 7, "eligible-after-expiry"),
			],
			sameSet: false,
		});
		expect({
			pairs: reinsertion.pairs,
			expiryPops: reinsertion.work.expiryPops,
		}).toEqual({
			pairs: [["second-excluded", "overlap-after-reinsert"]],
			expiryPops: 2,
		});
	});

	test("keeps control identities independent of input order", () => {
		const items = controls().map((id) => interval(id, 0, 10));
		expect(
			diagnoseSweepCompatibility({
				left: items.toReversed(),
				right: [],
				sameSet: true,
			}).pairs,
		).toEqual(diagnoseSweepCompatibility({ left: items, right: [], sameSet: true }).pairs);
	});
});

# Measurements of a Blocks solve in parts

Measured on 2026-11-10 for [ADR 0078](../adr/0078-a-blocks-solve-is-laid-out-in-parts-across-the-layout-workers.md) and TASK-559.09.
These numbers age with the layout code. Measure again before you rely on them.

## Sample

The sample is the 105 readings of this repository's model.
Each reading was asked alone, after the one before it answered.
The pool ran real Bun workers with the WebAssembly core of the change, on 24 cores.
Processor time is the sum over the sample.

## Before the change

One Blocks picture took 405 ms of WebAssembly on average, and 1.7 s at most.
One worker did all the work of a picture while the other workers waited.

## Wait for one picture

| workers             | mean   | median | p90     | max     | processor time |
| ------------------- | ------ | ------ | ------- | ------- | -------------- |
| 1, one solve        | 404 ms | 252 ms | 1028 ms | 1694 ms | 42.6 s         |
| 2                   | 253 ms | 144 ms | 657 ms  | 1112 ms | 51.2 s         |
| 4                   | 154 ms | 96 ms  | 361 ms  | 1050 ms | 53.6 s         |
| 6                   | 127 ms | 72 ms  | 291 ms  | 986 ms  | 54.6 s         |
| 6, each solve whole | 402 ms | 251 ms | 1022 ms | 1688 ms | 42.5 s         |

All 105 answer hashes were the same for each number of workers.
The parts cost 20 to 28 percent more processor time than one solve.

The pull request's head after the strip fix was measured again. Six workers gave a mean of 120 ms, a median of 68 ms, a p90 of 277 ms and a max of 955 ms. One solve took a mean of 377 ms and a max of 2441 ms. The answers were the same 105 hashes.

## All readings at once

When all 105 readings were asked at once from six workers, the pool laid the first one out in parts and solved the others whole.
It answered them all in 8.1 to 8.7 s. With every solve whole, it answered them in 8.0 to 8.5 s.
When the pool laid every solve out in parts, they took 9.5 s and 55.5 s of processor time, against 45.2 s.

## Other measures

- The crowded reading of this repository searches on in one part for about 0.9 s.
- A worker that solved only parts held 9 to 11 MB of WebAssembly memory. A worker that solved a whole graph held 14 to 20 MB.
- The choice on the thread of the pool took at most 4 ms for one picture natively.

## Rejected variant

The search part also routed its placement's drawings at the first room.
This saved about 2 s of processor time on the sample, but each search answered later.
With six workers, the mean wait was 140 ms against 127 ms.

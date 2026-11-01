//! The painter (ADR 0071): a scene and its presentation go in, and one frame
//! comes out. It holds no renderer of its own. `archboard-painter-wasm` gives
//! it Vello on WebGPU, and `cpu` gives it Vello on the CPU.

pub mod canvas;
pub mod cpu;
mod definitions;
pub mod draw;
pub mod outlines;
pub mod palette;
mod path;
mod pick;
pub mod presentation;
pub mod stage;
pub mod timing;
mod traffic;

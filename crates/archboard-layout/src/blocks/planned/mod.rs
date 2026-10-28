//! Private planning input, kept separate from the unchanged Track path.

mod model;
mod topology;

/// Normalize Blocks input while the legacy result remains authoritative.
pub(super) fn observe(graph: &crate::graph::Node) -> Result<(), String> {
    let model = model::Model::new(graph)?;
    debug_assert!(
        model.complete(),
        "a normalized hierarchy retains every endpoint and scope"
    );
    let topology = topology::Topology::new(&model);
    debug_assert!(
        topology.complete(&model),
        "planned routes and fans retain semantic ownership"
    );
    Ok(())
}

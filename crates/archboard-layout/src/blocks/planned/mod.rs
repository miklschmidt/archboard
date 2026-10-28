//! Private measured planning with a temporary dispatcher for unmigrated graph classes.

mod channel;
mod geometry;
mod lanes;
mod model;
mod portals;
mod shape;
mod topology;

/// Emit only classes whose measured channels are complete. Everything else keeps legacy placement.
pub(super) fn lay_out(
    graph: &crate::graph::Node,
) -> Result<Option<crate::blocks::assembly::Placed>, String> {
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
    if !channel::eligible(&model, &topology) {
        return Ok(None);
    }
    Ok(shape::plan(&model, &topology).map(|shape| shape.drawing))
}

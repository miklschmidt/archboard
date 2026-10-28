//! Blocks owns one measured plan from source cells through final route emission.

mod cells;
mod channel;
mod conservative;
mod fallback;
mod geometry;
mod guard;
mod hierarchy;
mod junctions;
mod lanes;
mod model;
mod order;
mod points;
mod portals;
mod ports;
mod runs;
mod score;
mod shape;
mod topology;

/// Emit one complete plan or report the graph that could not reserve clear channels.
pub(super) fn lay_out(
    graph: &crate::graph::Node,
) -> Result<crate::blocks::assembly::Placed, String> {
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
    selected(&model, &topology).ok_or_else(|| {
        format!(
            "Blocks could not reserve clear channels for {}. Report this layout failure.",
            graph.id
        )
    })
}

fn selected(
    model: &model::Model<'_>,
    topology: &topology::Topology,
) -> Option<crate::blocks::assembly::Placed> {
    // Larger diagrams reserve boundary channels directly. Repeated failed local
    // candidates otherwise spend the whole budget before the same construction.
    let shape = if model.edges.len() > 24 {
        None
    } else {
        let (shape, counts) = shape::plan(model, topology);
        debug_assert!(counts.within_limits(model.scopes.len(), model.edges.len()));
        shape
    };
    let shape = shape
        .filter(|shape| guard::complete(model, topology, shape))
        .or_else(|| conservative::plan(model, topology));
    shape
        .filter(|shape| guard::complete(model, topology, shape))
        .and_then(|shape| {
            runs::freeze(model, &shape.drawing).map(|frozen| frozen.emit(model, shape.drawing))
        })
}

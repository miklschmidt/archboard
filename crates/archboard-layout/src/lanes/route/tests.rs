use super::*;
use crate::{constants::BEND_RADIUS, lanes::scene::Band};

#[test]
fn the_inner_strand_of_a_fallback_detour_keeps_both_bends() {
    let band = Band {
        top: 0.0,
        bottom: 0.0,
        new_top: 0.0,
        first_track: 0.0,
    };
    let mut scene = Placement {
        bands: vec![band; 2],
        ..Placement::default()
    };
    let mut router = Router::new(&mut scene);
    let top = router.add(Station::new(Kind::Lane, 0, None, 0.0));
    let bottom = router.add(Station::new(Kind::Lane, 1, None, 8.0));
    let id = router.add_net(Net {
        edge: "ribbon".into(),
        order: 0.0,
        channel: 0,
        kind: "http;sync;async".into(),
        top,
        bottom,
        top_x: 0.0,
        bottom_x: 8.0,
        track: 0,
        trunk: None,
        wall: None,
    });
    router.space_bands(&[id], &Set::default(), 0.0, None);
    let points = router.points_of(&[id], 0.0);
    let inner_run = points[3].y - points[2].y - 2.0 * crate::constants::STRAND;
    assert!(
        inner_run >= 2.0 * BEND_RADIUS + crate::constants::STRAND,
        "{points:?}"
    );
    assert!(points[5].y > points[4].y);
}

#[test]
fn a_lanes_jog_closes_inside_the_block() {
    use crate::graph::Edge;
    use crate::placed::{PlacedBlock, PlacedNode};

    let card = |id: &str, y, width| PlacedNode {
        id: id.to_owned(),
        x: 0.0,
        y,
        width,
        height: 60.0,
    };
    let edge = PlacedEdge {
        id: "line".to_owned(),
        source: "wide".to_owned(),
        target: "narrow".to_owned(),
        label: None,
        polyline: Vec::new(),
        edge: Rc::new(Edge {
            id: "line".to_owned(),
            sources: vec!["wide".to_owned()],
            targets: vec!["narrow".to_owned()],
            labels: None,
            layout_options: None,
        }),
    };
    let mut scene = Placement::new(&PlacedBlock {
        nodes: vec![card("wide", 0.0, 80.0), card("narrow", 100.0, 40.0)],
        edges: Vec::new(),
        header: None,
    });
    let lines = [SceneLine {
        id: edge.id.clone(),
        order: 0.0,
        kind: "sync".into(),
        placed: &edge,
        wall: None,
        enters: None,
        leaves: None,
    }];
    let drawing = route_once(
        &mut scene,
        &lines,
        (0.0, 0.0),
        None,
        (false, true),
        &Choice::default(),
    )
    .expect("a Lanes drawing");
    assert!(scene.item(scene.cards["wide"]).bx.x >= 0.0);
    let points = &drawing.routes["line"];
    assert!(points.iter().all(|point| point.x == points[0].x));
}

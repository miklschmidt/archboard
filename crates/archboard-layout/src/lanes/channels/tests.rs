use super::*;
use crate::lanes::chains::Station;
use crate::lanes::scene::Placement;

#[test]
fn only_two_lines_that_read_as_one_keep_a_hand_off_apart() {
    let mut scene = Placement::default();
    let mut track = Router::new(&mut scene);
    // One line comes down at 0 and turns right; the next turns down at 5, within a lane of
    // it; the third crosses both and reads as neither.
    let nets: Vec<NetId> = [(0.0, 100.0), (200.0, 5.0), (50.0, 150.0)]
        .into_iter()
        .enumerate()
        .map(|(at, (top_x, bottom_x))| {
            let top = track.add(Station::new(Kind::Lane, 0, None, top_x));
            let bottom = track.add(Station::new(Kind::Lane, 1, None, bottom_x));
            track.nets.push(Net {
                edge: format!("e{at}").into(),
                order: 0.0,
                channel: 0,
                kind: "call".into(),
                top,
                bottom,
                top_x,
                bottom_x,
                track: 0,
                trunk: None,
                wall: None,
            });
            NetId(at)
        })
        .collect();
    assert!(track.collinear(nets[0], nets[1]));
    track.assign_tracks(&nets);
    let at = |net: usize| track.net(nets[net]).track;
    assert!(at(0).abs_diff(at(1)) >= HAND_OFF);
    assert_eq!(at(2).abs_diff(at(0)).min(at(2).abs_diff(at(1))), 1);
}

/// Two lines crossing one channel side by side: a lone line and a cable of `strands`.
/// Answers how many lanes apart their tracks stand, and how many lanes the channel takes.
fn beside_a_cable(strands: usize) -> (usize, usize) {
    let mut scene = Placement::default();
    let mut track = Router::new(&mut scene);
    let cable = vec!["call|"; strands].join(";");
    let nets: Vec<NetId> = [("call", 0.0, 100.0), (cable.as_str(), 40.0, 140.0)]
        .into_iter()
        .enumerate()
        .map(|(at, (kind, top_x, bottom_x))| {
            let top = track.add(Station::new(Kind::Lane, 0, None, top_x));
            let bottom = track.add(Station::new(Kind::Lane, 1, None, bottom_x));
            track.nets.push(Net {
                edge: format!("e{at}").into(),
                order: 0.0,
                channel: 0,
                kind: kind.into(),
                top,
                bottom,
                top_x,
                bottom_x,
                track: 0,
                trunk: None,
                wall: None,
            });
            NetId(at)
        })
        .collect();
    let taken = track.assign_tracks(&nets);
    let apart = track.net(nets[0]).track.abs_diff(track.net(nets[1]).track);
    (apart, taken)
}

#[test]
fn a_cable_keeps_a_lane_each_side_for_each_lane_of_its_half_width() {
    assert_eq!(beside_a_cable(1), (1, 2));
    // Three strands half a lane apart reach half a lane each side: a lane more each side.
    assert_eq!(beside_a_cable(3), (2, 4));
}

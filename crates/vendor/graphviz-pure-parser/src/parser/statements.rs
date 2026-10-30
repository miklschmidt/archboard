//! archboard: not in graphviz-pure. A graph made statement by statement, as the parser
//! makes it of the DOT text of those statements, without writing or reading the text.
//!
//! Each method runs the parser's own actions for one statement, in the order the parser
//! runs them on its tokens. Names and values are taken as the parser would read them from
//! quoted strings in decoded form: the caller writes through here only what a quoted DOT
//! string carries unchanged (no backslash, NUL or line break, and no character
//! [`graphviz_pure_core::charset`] stands for a raw byte with), and writes the rest as DOT.

use graphviz_pure_core::{AttrMap, Graph, GraphKind};

use super::{Atom, DictKind, EdgeItem, GlobalAttrs, Lexer, Parser};

/// The kind of an attribute statement: `graph [...]`, `node [...]` or `edge [...]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttrKind {
    Graph,
    Node,
    Edge,
}

/// A graph read statement by statement.
pub struct Statements {
    parser: Parser<'static>,
}

impl Statements {
    /// `digraph {` (`directed`) or `graph {`, without a name, not strict.
    pub fn new(directed: bool) -> Self {
        let kind = if directed {
            GraphKind::Directed
        } else {
            GraphKind::Undirected
        };
        let mut parser = Parser::new(Lexer::new(""), &GlobalAttrs::default());
        parser.start_graph(None, kind, false);
        Statements { parser }
    }

    /// `graph [k=v, ...];`, `node [...]` or `edge [...]`.
    pub fn attributes(&mut self, kind: AttrKind, items: &[(&str, &str)]) {
        let p = &mut self.parser;
        p.attr_order.clear();
        p.attr_items.clear();
        p.html_keys.clear();
        for &(key, value) in items {
            p.attr_items.push((key.to_owned(), value.to_owned(), false));
        }
        p.apply_attr_items(match kind {
            AttrKind::Graph => DictKind::Graph,
            AttrKind::Node => DictKind::Node,
            AttrKind::Edge => DictKind::Edge,
        });
    }

    /// `optattr` of a node or edge statement: its list, the first place of each key.
    fn list(&mut self, items: &[(&str, &str)]) -> AttrMap {
        let p = &mut self.parser;
        p.attr_order.clear();
        p.html_keys.clear();
        let mut attrs = AttrMap::new();
        for &(key, value) in items {
            if !attrs.contains_key(key) {
                p.attr_order.push(key.to_owned());
            }
            attrs.set(key, value.to_owned(), false);
        }
        attrs
    }

    /// `"name" [k=v, ...];`
    pub fn node(&mut self, name: &str, items: &[(&str, &str)]) {
        let node = self.parser.ensure_scoped_node(name, false);
        let attrs = self.list(items);
        self.parser
            .endnode(&EdgeItem::Nodes(vec![(node, None)]), &attrs);
    }

    /// `"tail" -> "head" [k=v, ...];` (`--` in an undirected graph).
    pub fn edge(&mut self, tail: &str, head: &str, items: &[(&str, &str)]) {
        let tail = self.parser.ensure_scoped_node(tail, false);
        let head = self.parser.ensure_scoped_node(head, false);
        let attrs = self.list(items);
        self.parser.endedge(
            &[
                EdgeItem::Nodes(vec![(tail, None)]),
                EdgeItem::Nodes(vec![(head, None)]),
            ],
            &attrs,
        );
    }

    /// `subgraph "name" {` or `subgraph {`.
    pub fn open_subgraph(&mut self, name: Option<&str>) {
        let name = name.map(|text| Atom {
            text: text.to_owned(),
            html: false,
        });
        let subgraph = self.parser.open_subgraph(name);
        self.parser.scope_stack.push(subgraph);
    }

    /// The subgraph's `}`, which ends a statement of the subgraph alone.
    pub fn close_subgraph(&mut self) {
        let subgraph = self.parser.closesubg();
        let attrs = self.list(&[]);
        self.parser.endnode(&EdgeItem::Subgraph(subgraph), &attrs);
    }

    /// `k=v;`
    pub fn graph_attribute(&mut self, key: &str, value: &str) {
        let atom = |text: &str| Atom {
            text: text.to_owned(),
            html: false,
        };
        self.parser.graph_attr_assignment(atom(key), atom(value));
    }

    /// The root's `}`: the graph read.
    pub fn finish(mut self) -> Graph {
        self.parser.finish_root();
        self.parser.graph
    }
}

func ok() -> Int { 1 }
let selected = Core::Ledger(name: "selector")
func alsoOk() -> Int { ok() }

// `unsafe` (Swift 6.2) does not parse, and the grammar reads `last` as a call
// inside `count`.
extension Table {
    func count() -> Int {
        var c = 0
        for i in unsafe 0 ..< words.count {
            unsafe c += words[i].count
        }
        return c
    }

    func first(from start: Int) -> Int {
        start
    }

    func last(from start: Int) -> Int {
        start
    }
}

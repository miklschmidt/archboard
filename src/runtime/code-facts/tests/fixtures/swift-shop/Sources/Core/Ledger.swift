public struct Ledger {
    private var entries: [Money] = []
    public let name: String

    public init(name: String) {
        self.name = name
    }

    public func post(_ amount: Money) -> Int {
        return Ledger.audit(amount)
    }

    static func make() -> Ledger {
        Ledger(name: "main")
    }

    public enum Kind {
        case debit, credit
    }

    fileprivate struct Draft {
        func write() {}
    }
}

public extension Ledger {
    static func refund(_ cents: Int) -> Money {
        Money(cents: cents)
    }
}

extension Ledger {
    static func audit(_ amount: Money) -> Int {
        amount.cents
    }
}

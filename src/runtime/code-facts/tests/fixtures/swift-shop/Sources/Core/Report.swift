func report() -> Int {
    helper()
    hidden()
    _ = [Money(cents: 1)].map(String.init)
    return Ledger.make().post(Money(cents: 1))
}

func report() -> Int {
    helper()
    hidden()
    _ = [Money(cents: 1)].map(String.init)
    _ = !isOpen
    return Ledger.make().post(Money(cents: 1))
}

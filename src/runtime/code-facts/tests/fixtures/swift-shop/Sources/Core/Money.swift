public struct Money {
    public let cents: Int
}

extension String {
    init(money: Money) {
        self = "\(money.cents)"
    }
}

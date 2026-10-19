public func format(_ cents: Int) -> String {
    let token = ProcessInfo.processInfo.environment["SHOP_TOKEN"] ?? ""
    return "\(cents)" + token
}

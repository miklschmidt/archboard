open class Base {
    open func run() {}
    func step() {}
}

package func packaged() {}
internal func helper() {}
fileprivate func hidden() {}
private let secret = 1
func implicit() {}

private class Closed {
    public func opened() {}
}

public protocol Store {
    func read() -> Int
}

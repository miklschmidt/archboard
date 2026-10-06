open class Base {
    open func run() {}
    func step() {}
}

package func packaged() {}
internal func helper() {}
fileprivate func hidden() {}
private let secret = 1
func implicit() {}
let isOpen = true

private class Closed {
    public func opened() {}
}

public protocol Store {
    init(shelf: Int)
    func read() -> Int
}

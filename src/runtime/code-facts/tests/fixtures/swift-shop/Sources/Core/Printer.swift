// Names of the module that a member, a parameter or a value stands for here.
struct Printer {
    func helper() {}

    func run(isOpen: Bool) -> Bool {
        self.helper()
        helper()
        return !isOpen
    }
}

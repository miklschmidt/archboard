// The grammar does not read this condition: it closes the type at `{` and
// reads its members at file level, with no error until the last `}`.
struct Platform {
#if _pointerBitWidth(_64)
    static var width: Int { 64 }
#endif
    func describe() -> String { "" }
}

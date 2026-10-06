import Foundation
import Core
import Util

// helper is internal to Core, and hidden is file-private there.
let ledger = Ledger(name: "shop")
let refund: Money = Ledger.refund(5)
let qualified = Core.Ledger.Kind.debit
print(ledger.post(refund), helper(), hidden(), alsoOk())

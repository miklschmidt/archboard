#import "Ledger.h"

class Bridge {
  public:
    void post(Ledger *ledger) { [ledger close]; }
};

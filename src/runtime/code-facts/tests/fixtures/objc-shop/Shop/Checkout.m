#import "Ledger+Report.h"
#include "Money.h"

void checkout_pay(Ledger *ledger, User *user) {
    [ledger post:money_round(5) by:user];
    NSLog(@"%lu", (unsigned long)[[ledger report] length]);
    SEL closing = @selector(close);
    (void)closing;
}

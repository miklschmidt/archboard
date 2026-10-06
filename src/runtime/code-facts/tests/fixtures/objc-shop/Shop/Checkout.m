#import "Ledger+Report.h"
#include "Money.h"

void checkout_pay(Ledger *ledger, User *user) {
    [ledger post:money_round(5) by:user];
    NSLog(@"%lu", (unsigned long)[[ledger report] length]);
    SEL closing = @selector(close);
    (void)closing;
}

void checkout_notify(Ledger *ledger, NSArray *users) {
    for (User *ledger in users) {
        [ledger notify];
    }
}

@implementation Checkout {
    long _count;
}
- (void)tally {
    _count += 1;
}
@end

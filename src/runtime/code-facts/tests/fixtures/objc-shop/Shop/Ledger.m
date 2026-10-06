#import "Ledger.h"
#import "Money.h"

static long rounded(long amount) { return money_round(amount); }

long ledger_fee(long amount) { return amount / 100; }

@interface Ledger ()
@property (nonatomic) long total;
- (void)remember:(long)amount;
@end

@implementation Ledger

+ (instancetype)ledgerNamed:(NSString *)name {
    Ledger *ledger = [[Ledger alloc] init];
    return ledger;
}

- (void)post:(long)amount by:(User *)user {
    [self remember:rounded(amount)];
    [user notify];
}

- (BOOL)close {
    return YES;
}

- (void)remember:(long)amount {
    self.total += amount;
}

- (BOOL)audit:(long)amount {
    return amount > 0;
}

@end

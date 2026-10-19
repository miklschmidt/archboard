#import "Ledger+Report.h"

@implementation Ledger (Report)

- (NSString *)report {
    return [NSString stringWithFormat:@"%ld", ledger_fee(self.total)];
}

@end

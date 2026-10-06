#import "ShopMacros.h"
#import "Auditing.h"

NS_ASSUME_NONNULL_BEGIN

@class User;

long ledger_fee(long amount);

typedef NS_ENUM(NSInteger, LedgerKind) {
    LedgerKindCash = 0,
    LedgerKindCard,
};

@interface Ledger : NSObject <Auditing>
@property (nonatomic, readonly) long total;
+ (instancetype)ledgerNamed:(NSString *)name;
- (void)post:(long)amount by:(User *)user SHOP_API_AVAILABLE(ios(13.0));
- (BOOL)close;
@end

NS_ASSUME_NONNULL_END

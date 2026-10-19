@import Foundation;

SHOP_AUDIT_BEGIN(nullability, sendability)

@protocol Auditing <NSObject>
- (BOOL)audit:(long)amount;
@end

SHOP_AUDIT_END(nullability, sendability)

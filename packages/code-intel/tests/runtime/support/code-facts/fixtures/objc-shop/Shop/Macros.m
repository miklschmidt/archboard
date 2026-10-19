#if DEBUG
#define LOG(...) NSLog(__VA_ARGS__)
#else
#define LOG(...)
#endif
#define HIDDEN(...)

// API_AVAILABLE( in a comment
@interface Macros : NSObject
- (void)a API_AVAILABLE(ios(13.0),
    macos(10.15));
- (void)b NS_SWIFT_NAME(b()) MY_API_UNAVAILABLE(tvos) HIDDEN(x);
@end

typedef NS_OPTIONS(NSUInteger, Mode /* the mode */) {
    ModeA = 1,
};

@implementation Macros
- (void)a { LOG(@"API_AVAILABLE(", [Macros shown]); }
- (void)b { HIDDEN([Macros hidden]); }
@end

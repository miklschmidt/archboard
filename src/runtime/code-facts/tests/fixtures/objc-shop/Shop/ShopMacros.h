#ifndef SHOP_MACROS_H
#define SHOP_MACROS_H

#if defined(__IPHONE_13_0)
#define SHOP_API_AVAILABLE(...) API_AVAILABLE(__VA_ARGS__)
#else
#define SHOP_API_AVAILABLE(...)
#endif

#endif

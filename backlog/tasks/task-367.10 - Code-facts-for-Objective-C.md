---
id: TASK-367.10
title: Code facts for Objective-C
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 17:26'
labels:
  - code-check
dependencies:
  - TASK-367.09
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 618000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective-C shares the include model of C, and adds classes, protocols and message sends. A class extension in an `.m` file is how Objective-C hides part of an interface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `#import`, `@import` and `#include` resolve as in C
- [ ] #2 `@interface`, `@implementation` and `@protocol` are definitions, and message sends are references by selector
- [ ] #3 Declarations in a class extension inside an `.m` file are internal, and declarations in a public header are exported
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to Objective-C files, including files that mix C
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. objc-macros.ts: before the parse, blank the attribute macros of Apple's SDK (own list, no SDK header read) with spaces of the same length, newlines kept; rewrite NS_ENUM/NS_OPTIONS-style type macros to the enum they expand to, same length; skip comments, strings and preprocessor lines. A macro joins the list when the same file #defines it as a listed one or as nothing, or when its name ends with _<listed> (AF_API_AVAILABLE).
2. objc.scm + objc-adapter.ts + objc-definitions.ts: the C side through cFacts (c-adapter exports a captures entry, and method parameters are declared names), plus @interface/@implementation/@protocol/categories/class extensions as definitions qualified with :: as the C family qualifies (Ledger::post:by:), message sends as references by selector, qualified by the receiver's class where the syntax shows it (a class name, self, [X alloc]/[X new], a parameter or local declared X *), else .post:by:. @import M.Sub is read as the include <M/Sub.h> (umbrella header convention). Header role vs source role decide exposure: class extensions and anything in a .m are internal; a header's class interface, category and protocol are exposed; @interface methods are declarations whose code is the pair's @implementation.
3. adapters.ts: objc entry (.m), the .h read as Objective-C when its text holds @interface/@protocol/@class/@end/#import/@import, else C++; facts.ts AdapterName objc; c-pairs.ts .m a source (.mm stays text); module-exposure: the C rule covers Objective-C through c-pairs.
4. Owners: code-facts/tests/objc-facts.test.ts over fixtures/objc-shop; code-check/tests/objc-check.test.ts (anchor, binding, undrawn, backwards, mixed C).
5. Measure AFNetworking and SDWebImage (unparsed lines before/after blanking, a temporary vault with bound parts); update design-checks.md and authoring.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: src/runtime/code-facts gains objc.scm, objc-adapter.ts (readObjectiveC for .m, readingHeaders for .h), objc-definitions.ts, objc-sends.ts and objc-macros.ts. adapters.ts has one entry objc (.m) and reads .h through readingHeaders(CPP); facts.ts AdapterName gains objc; c-pairs.ts makes .m a source file; c-adapter.ts exports cFactsOf (the C facts from captures, so the Objective-C adapter reads the C of its files with one query run) and declares an Objective-C method_parameter name; module-exposure.ts comments only (the C rule covers Objective-C through c-pairs). Owners: code-facts/tests/objc-facts.test.ts over fixtures/objc-shop, code-check/tests/objc-check.test.ts.

Decisions the ADR left open:
1. How a .h is assigned: by its text. A .h in which a line starts with @interface, @protocol, @class, @end, @import or #import is read with the Objective-C grammar as a header; any other .h is read as C++ (TASK-367.09). Not by its pair: ParsedFacts depend on bytes alone (the cache keys them by hash and parse function), so a fact from another file cannot choose the reader. The entry that lists .h is cpp, so SyntaxFacts.adapter says cpp for an Objective-C header; both share createCResolver, and nothing in the check keys on the C family's adapter name. AFNetworking: 30 of 31 headers read as Objective-C (the other holds only macros); SDWebImage 158 of 159.
2. The macro list (objc-macros.ts): the SDK's attribute macros, split by whether they take arguments: availability (API_AVAILABLE/UNAVAILABLE/DEPRECATED(_WITH_REPLACEMENT), *_BEGIN/_END, SPI_*, NS_AVAILABLE*, NS_DEPRECATED*, NS_CLASS_*, NS_ENUM_AVAILABLE*/DEPRECATED*, NS_EXTENSION_UNAVAILABLE*, NS_UNAVAILABLE, UNAVAILABLE_ATTRIBUTE, DEPRECATED_ATTRIBUTE, DEPRECATED_MSG_ATTRIBUTE, __API_*, __IOS_/__OSX_/__TVOS_/__WATCHOS_*), header regions (NS_ASSUME_NONNULL_BEGIN/END, CF_ASSUME_NONNULL_*, NS_HEADER_AUDIT_*, CF_IMPLICIT_BRIDGING_*), Swift (NS_SWIFT_NAME, NS_SWIFT_UNAVAILABLE, NS_SWIFT_UI_ACTOR, NS_SWIFT_NONISOLATED, NS_SWIFT_SENDABLE/NONSENDABLE, NS_SWIFT_ASYNC*, NS_REFINED_FOR_SWIFT*, CF_SWIFT_NAME, CF_REFINED_FOR_SWIFT, NS_STRING_ENUM, NS_EXTENSIBLE_STRING_ENUM, NS_TYPED_ENUM, NS_TYPED_EXTENSIBLE_ENUM), initializers/ownership (NS_DESIGNATED_INITIALIZER, NS_REQUIRES_SUPER, NS_REQUIRES_NIL_TERMINATION, NS_FORMAT_FUNCTION/ARGUMENT, CF_FORMAT_*, NS/CF_RETURNS_*, NS/CF_RELEASES_ARGUMENT, CF_CONSUMED, NS_VALID_UNTIL_END_OF_SCOPE, NS_NOESCAPE, NS_ROOT_CLASS, OBJC_ROOT_CLASS, OBJC_SUBCLASSING_RESTRICTED, NS_DIRECT*, OBJC_DIRECT*, NS_AUTOMATED_REFCOUNT_*), Interface Builder (IB_DESIGNABLE, IBInspectable, IBOutlet, IBOutletCollection, UI_APPEARANCE_SELECTOR) and Core Graphics nullability (cg_nullable, cg_nonnull). Storage macros the grammar reads as storage (FOUNDATION_EXPORT, NS_INLINE, UIKIT_EXTERN) are not blanked, so their linkage stays. Blanks are spaces of the same UTF-16 length with every line break kept; comments, strings and preprocessor lines are never touched.
3. Joining the list: a macro the same file defines only as a listed macro or as nothing joins (a macro one #if branch defines as code, such as a log macro, stays); a macro whose name ends with _<listed> joins (AF_API_AVAILABLE). ADR 0046's join of a macro another checkout header defines is not built: ParsedFacts depend on the file's bytes alone, and the reader (outside this task) gives the parse only the text. The suffix rule covers AFNetworking's two wrappers in AFCompatibilityMacros.h.
4. NS_ENUM, NS_OPTIONS, NS_CLOSED_ENUM, NS_ERROR_ENUM, CF_ENUM, CF_OPTIONS, CF_CLOSED_ENUM are written as the enum they expand to, `enum Kind`, with the name in its column and a typedef just before it blanked (typedef enum Kind {...}; with no declarator parses with a missing node). Without it every NS_ENUM header failed from that line on.
5. Names: Objective-C definitions qualify with :: as the C family does: Ledger::post:by:, Ledger::balance, a category Ledger(Audit) whose members are Ledger::..., a protocol P and P::sel. lookup compares :: as ., so a binding spells Ledger.post:by: or post:by:. A class-qualified send is spelled Ledger::post:by: so the include search finds it as it finds a C++ qualified name (no Objective-C resolver; .m and .h share createCResolver).
6. Visibility words: @interface / @implementation / @protocol for a class, category or protocol; public for a member a class interface, category or protocol declares, private for one a class extension declares; an @implementation method takes the word a same-file declaration gives, else public; ivars public/protected/private/package by @public etc. (protected by default in an interface, private in an implementation). Exposure: a header exposes everything but a class extension; nothing Objective-C in an .m is exposed; C keeps C's rules. A class extension in a header (Foo+Private.h) is internal too.
7. Declarations: an @interface (class or category) and its methods are declaration: true; their code is the @implementation in the same file or the header's pair (codeSiteOf). A property is no declaration (the compiler writes its accessors); a protocol and its methods are none (any class holds their code).
8. Sends (objc-sends.ts): the selector is each method part with : where an argument follows. Qualified by the class where the syntax shows it: a capitalised name no enclosing function declares, self (the enclosing @implementation's class), [X alloc]/[X new]/[X allocWithZone:] as receiver, a parameter or local declared X * (method, function and block parameters, block statements before the send). super, id, instancetype, properties, ivars and call results give .sel, as C# and Swift spell a member of a value not named. @selector(post:by:) is .post:by:. Adopted protocols in a protocol's <...> are type-only (import) uses; a superclass is a call use, as a C++ base class.
9. @import Name; is read as #import <Name/Name.h> (the umbrella header of a framework module, which Clang maps the other way), @import Name.Part; as <Name/Part.h>; SDK modules resolve to nothing.
10. .mm stays text (ADR) and is not a source in c-pairs, so it pairs with no header and the check lists it under text-only.

Real projects (shallow clones in session scratch, Bun 1.4.2): AFNetworking d9f589c (80 .m/.h, 15,549 lines) lines in ERROR nodes 2,562 -> 3, adapter lines not parsed 416 -> 6, definitions 1,266 -> 1,462, cold 307 ms warm 7 ms; AFURLSessionManager.m 1,170 -> 1. SDWebImage c3ad5e1 (263 files, 41,444 lines) ERROR lines 1,871 -> 622, not parsed 486 -> 29, definitions 3,553 -> 4,145, cold 546 ms warm 49 ms. Left: #if/#else method headers with one body (SDAnimatedImageView.m, 20 lines), else-if under #if (UIView+WebCache.m), __has_warning in a condition. Temporary vault (10 parts + 6 relationships on AFNetworking, 7 + 5 on SDWebImage): 471-532 ms cold, 148-173 ms warm; planted BINDING_SYMBOL_MISSING and ANCHOR_SYMBOL_MISSING; RELATIONSHIP_BACKWARDS (session manager -> AFSecurityPolicy, SD manager -> SDImageCache); RELATIONSHIP_UNDRAWN resolved through #import (AFURLSessionManager superclass, AFJSONResponseSerializer, AFNetworkReachabilityManager, AFSSLPinningModeNone from an NS_ENUM, SDImageCache); anchors citing real sends hold. One RELATIONSHIP_UNSUPPORTED (information): UIImageView+WebCache sends to self a method UIView+WebCache defines: inheritance is clangd's (TASK-367.15).

For TASK-367.15 (clangd): candidates left are sends spelled .sel (super, id, properties, ivars, call results), sends qualified by a subclass whose method a superclass or a category of a superclass defines, and declaration-only sites; clangd resolves them with the -x objective-c flags of compile_commands.json. The text reading of a .mm finds a selector symbol only by its last name post:by:, which never stands in source as one word.

Commits: cf2a87099 feat(code-facts): read Objective-C files; 2a5b633fc docs(code-check): record how the check reads Objective-C. Gate, one lane at a time in the shared tree: lint 1 and fmt:check 1, only on terraform-modules.ts and module-reading.ts (TASK-368.11's uncommitted edits); type-check 1, only terraform-modules.ts unused 'names'; build:frontend 0; test:modules 4,260 pass, 3 fail, all in terraform-modules.test.ts (same owner); test:system 195/0; test:repository 21/0; test:serial-browser exit 0. HEAD plus my patch alone (exported snapshot): tsc 0, lint and oxfmt clean on the changed files, objc/c facts and check owners and module-exposure pass (28/0). No board change: the Code facts description names no language list.
<!-- SECTION:NOTES:END -->

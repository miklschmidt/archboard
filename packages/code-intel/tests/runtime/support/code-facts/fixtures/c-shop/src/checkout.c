#include "shop/ledger.h"
#include "src/money.h"
#include <stdio.h>

/* ledger_in_comment(); */
static const char *label = "ledger_in_string";

int checkout_pay(struct Ledger *ledger, money_t amount) {
	int count = 0;
	LedgerStats stats;
	const char *token = getenv("SHOP_TOKEN");
	count += ledger_post(ledger, amount);
	stats.count = count;
	if (count > LEDGER_MAX) printf("%s %s\n", label, token);
	return stats.count;
}

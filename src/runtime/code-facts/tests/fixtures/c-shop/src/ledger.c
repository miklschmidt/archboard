#include "shop/ledger.h"
#include <stdlib.h>

static int audit(struct Ledger *ledger);

struct Ledger {
	money_t total;
};

int ledger_open_count = 0;

int ledger_post(struct Ledger *ledger, money_t amount) {
	ledger->total += money_round(amount);
	return audit(ledger);
}

static int audit(struct Ledger *ledger) {
	return ledger->total > 0;
}

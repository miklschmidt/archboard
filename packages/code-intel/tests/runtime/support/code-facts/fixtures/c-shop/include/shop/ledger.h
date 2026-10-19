#ifndef SHOP_LEDGER_H
#define SHOP_LEDGER_H

#include "money.h"

#define LEDGER_MAX 100

struct Ledger;

typedef struct {
	int total;
	int count;
} LedgerStats;

int ledger_post(struct Ledger *ledger, money_t amount);
extern int ledger_open_count;

#endif

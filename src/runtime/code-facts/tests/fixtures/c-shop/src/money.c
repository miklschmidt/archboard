#include "money.h"

static money_t cents(money_t amount) {
	return amount % 100;
}

money_t money_round(money_t amount) {
	return amount - cents(amount);
}

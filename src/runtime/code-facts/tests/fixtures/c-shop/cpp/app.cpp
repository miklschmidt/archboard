#include "store.hpp"

struct Special : shop::Item {};

int run_app() {
	shop::Store store(1);
	shop::Store *other = shop::Store::open();
	shop::Item item;
	store.save(item.id);
	return 0;
}

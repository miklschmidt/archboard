#include "store.hpp"

namespace shop {
namespace {

int hidden(int item) {
	return item * 2;
}

}  // namespace

Store::Store(int size) : size_(size) {}

Store::~Store() {}

void Store::save(int item) {
	size_ += hidden(item);
}

Store *Store::open() {
	return new Store(4);
}

}  // namespace shop

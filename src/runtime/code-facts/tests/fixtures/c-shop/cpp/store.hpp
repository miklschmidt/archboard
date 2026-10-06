#pragma once

namespace shop {

class Store {
public:
	explicit Store(int size);
	void save(int item);
	static Store *open();

private:
	int size_;
};

struct Item {
	int id;
};

enum class Kind { Book, Game };

using StoreId = int;

}  // namespace shop

package main

import (
	books "example.com/ledger"
	"example.com/ledger/money"
)

func checkout(book *books.Ledger) money.Money {
	return book.Balance()
}

package main

import (
	"fmt"
	"os"

	books "example.com/ledger"
	"example.com/ledger/money"
	"example.com/shop/internal/fmtx"
)

func main() {
	book := books.New(os.Getenv("SHOP_NAME"))
	book.Post(money.Parse(os.Args[1]))
	fmt.Println(format.Cents(checkout(book)))
}

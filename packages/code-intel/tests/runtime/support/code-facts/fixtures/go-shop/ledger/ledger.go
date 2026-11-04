// Package ledger keeps the books of the shop.
package ledger

import "example.com/ledger/money"

// Ledger holds the entries of one book.
type Ledger struct {
	Name  string
	total money.Money
}

// New opens a book.
func New(name string) *Ledger {
	return &Ledger{Name: name}
}

// Post adds an amount to the book.
func (l *Ledger) Post(amount money.Money) {
	l.total = money.Add(l.total, amount)
	audit(l)
}

// Balance is what the book holds.
func (l *Ledger) Balance() money.Money {
	return l.total
}

// Close is a method of a type no other package can name.
func (h *hidden) Close() {}

type hidden struct{}

// Archive is exported, and no other package calls it.
func Archive(l *Ledger) {}

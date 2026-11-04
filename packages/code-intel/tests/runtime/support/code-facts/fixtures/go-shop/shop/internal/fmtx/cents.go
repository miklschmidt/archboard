// Package format writes amounts.
package format

import (
	"fmt"

	"example.com/ledger/money"
)

// Cents writes an amount.
func Cents(amount money.Money) string {
	return fmt.Sprintf("%d", amount)
}

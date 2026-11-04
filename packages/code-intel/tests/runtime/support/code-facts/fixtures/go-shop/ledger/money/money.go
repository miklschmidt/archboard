// Package money counts cents.
package money

import "strconv"

// Money is an amount in cents.
type Money int64

// Zero is no money.
const Zero Money = 0

// Add sums two amounts.
func Add(a, b Money) Money {
	return a + b
}

// Parse reads an amount.
func Parse(text string) Money {
	cents, _ := strconv.ParseInt(text, 10, 64)
	return Money(cents)
}

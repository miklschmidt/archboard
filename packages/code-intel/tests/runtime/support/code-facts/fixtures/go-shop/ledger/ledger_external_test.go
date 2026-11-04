package ledger_test

import (
	"testing"

	"example.com/ledger"
)

func TestNew(t *testing.T) {
	if ledger.New("x").Name != "x" {
		t.Fail()
	}
}

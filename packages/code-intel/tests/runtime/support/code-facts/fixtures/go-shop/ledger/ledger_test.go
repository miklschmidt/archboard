package ledger

import "testing"

func TestPost(t *testing.T) {
	l := New("test")
	l.Post(1)
	audit(l)
}

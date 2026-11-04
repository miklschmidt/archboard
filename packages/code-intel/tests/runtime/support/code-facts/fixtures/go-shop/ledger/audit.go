package ledger

import "fmt"

func audit(l *Ledger) {
	fmt.Println(l.Name, platform())
}

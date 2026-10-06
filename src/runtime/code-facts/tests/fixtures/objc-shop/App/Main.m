@import Shop;

int main(void) {
    Ledger *ledger = [Ledger ledgerNamed:@"main"];
    return [ledger close] ? 0 : 1;
}

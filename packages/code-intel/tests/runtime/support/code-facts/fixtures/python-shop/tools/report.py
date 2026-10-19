import ledger
from helpers import fmt


def report():
    return fmt(ledger.Ledger())

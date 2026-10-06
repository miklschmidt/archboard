import os
from typing import TYPE_CHECKING

from .money import round_amount

if TYPE_CHECKING:
    from .accounts import Account

__all__ = ["Ledger"]

QUEUE = os.environ.get("LEDGER_QUEUE")


class Ledger:
    rate: float = 1.0

    def __init__(self) -> None:
        self.entries = []

    def post(self, account: "Account", amount: float) -> float:
        # postInComment
        """postInDocstring"""
        return round_amount(amount * self.rate)

    def _audit(self) -> None:
        pass

    def __seal(self) -> None:
        pass


def helper():
    local = 1
    return local


class _Hidden:
    def visible(self):
        pass

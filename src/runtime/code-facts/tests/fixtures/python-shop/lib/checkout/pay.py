import importlib
import os

import ledger
import ledger.money as m
from ledger import Ledger, money

from . import steps
from .steps import first

paid = signal("paid")


def pay():
    Ledger().post(None, 1)
    money.round_amount(2)
    m.round_amount(3)
    ledger.Ledger
    steps.first()
    first()
    if "SHOP_DEBUG" in os.environ:
        os.getenv("SHOP_TOKEN")
    importlib.import_module("ledger.accounts")
    message = "postInString"
    return message


def refund(money):
    return money

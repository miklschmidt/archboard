_CENTS = 100


def round_amount(amount):
    return round(amount * _CENTS) / _CENTS

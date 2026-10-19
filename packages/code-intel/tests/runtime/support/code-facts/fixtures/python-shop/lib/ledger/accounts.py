from typing import Annotated, Literal

__all__ = [name for name in dir() if not name.startswith("_")]


class Account:
    kind: Annotated[Literal["cash", "card"], "how the owner pays"] = "cash"


for _code in ("EUR",):
    CURRENCY = _code

from typing import Protocol

class TasteProvider(Protocol):
    async def rank_places(self, *, cuisines: list[str], ambience: list[str], city: str) -> dict[str, int]: ...

class FixtureTasteProvider:
    async def rank_places(self, *, cuisines: list[str], ambience: list[str], city: str):
        from .catalog import CATALOG
        return {m["candidateId"]: m["fixtureTasteOrder"] for m in CATALOG}

class LiveQlooProvider:
    async def rank_places(self, *, cuisines: list[str], ambience: list[str], city: str):
        # Only whitelisted taste/location data can enter this boundary.
        # Implement entity/tag resolution, real /v2/insights, stable entity joins,
        # timeout/retry and normalized provenance after account verification.
        raise NotImplementedError("Live Qloo adapter requires account API verification and a real menu/entity mapping")

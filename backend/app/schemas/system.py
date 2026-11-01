from datetime import datetime
from typing import Literal

from app.schemas.common import APIModel
from app.schemas.health import ComponentHealth


class SystemHealthResponse(APIModel):
    success: Literal[True] = True
    status: Literal["operational", "degraded", "unavailable"]
    service: str
    version: str
    environment: str
    timestamp: datetime
    next_phase: str
    components: list[ComponentHealth]

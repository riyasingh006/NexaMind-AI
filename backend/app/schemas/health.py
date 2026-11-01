from datetime import datetime
from typing import Literal

from app.schemas.common import APIModel, IntegrationStatus


class ComponentHealth(APIModel):
    name: str
    status: IntegrationStatus
    detail: str
    latency_ms: float | None = None


class HealthResponse(APIModel):
    success: Literal[True] = True
    status: Literal["ok", "degraded", "unavailable"]
    service: str
    version: str
    environment: str
    timestamp: datetime
    uptime_seconds: float
    components: list[ComponentHealth]


class LivenessResponse(APIModel):
    success: Literal[True] = True
    status: Literal["alive"] = "alive"
    service: str
    version: str
    timestamp: datetime


class ReadinessResponse(APIModel):
    success: Literal[True] = True
    status: Literal["ready", "not_ready"]
    service: str
    version: str
    timestamp: datetime
    components: list[ComponentHealth]

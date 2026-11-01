from dataclasses import dataclass
from threading import RLock


@dataclass(frozen=True)
class GenerationHealth:
    status: str = "AWAITING_INTEGRATION"
    model: str | None = None
    error_code: str | None = None


_lock = RLock()
_health = GenerationHealth()


def get_generation_health() -> GenerationHealth:
    with _lock:
        return _health


def record_generation_success(model: str) -> None:
    global _health
    with _lock:
        _health = GenerationHealth(status="OPERATIONAL", model=model)


def record_generation_failure(model: str, error_code: str) -> None:
    global _health
    with _lock:
        _health = GenerationHealth(
            status="DEGRADED",
            model=model,
            error_code=error_code,
        )


def reset_generation_health() -> None:
    global _health
    with _lock:
        _health = GenerationHealth()

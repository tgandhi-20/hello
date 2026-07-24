"""Convert a volume + AHT forecast into required staffing via Erlang C.

Forecasting volume is only half the job a workforce planner cares about. The
deliverable is *how many agents to roster in each interval*. The industry
standard for that translation is the **Erlang C** queueing model, which - given
the offered load (calls x AHT) and a service-level target (e.g. "80% of calls
answered within 20 seconds") - returns the minimum number of agents needed.

We implement Erlang B via its numerically stable recurrence, derive Erlang C
(probability of waiting) from it, and search upward for the smallest agent count
meeting the target. We also report occupancy and average speed of answer (ASA),
and apply a shrinkage factor to convert "agents on the phone" into "agents to
schedule" (accounting for breaks, training, absence, etc.).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .data import TIMESTAMP


def erlang_b(agents: int, traffic: float) -> float:
    """Erlang B blocking probability via the stable recurrence.

    ``traffic`` is the offered load in Erlangs (call-seconds per second).
    """
    inv = 1.0
    for n in range(1, agents + 1):
        inv = 1.0 + inv * n / traffic if traffic > 0 else float("inf")
    return 1.0 / inv if inv != float("inf") else 0.0


def erlang_c_wait_probability(agents: int, traffic: float) -> float:
    """Probability an arriving call has to wait (Erlang C), from Erlang B."""
    if agents <= traffic:
        return 1.0  # unstable queue: everyone waits
    b = erlang_b(agents, traffic)
    rho = traffic / agents
    return b / (1.0 - rho * (1.0 - b))


def service_level(agents: int, traffic: float, aht: float, target_seconds: float) -> float:
    """Fraction of calls answered within ``target_seconds``."""
    if agents <= traffic:
        return 0.0
    pw = erlang_c_wait_probability(agents, traffic)
    return 1.0 - pw * math.exp(-(agents - traffic) * target_seconds / aht)


def average_speed_of_answer(agents: int, traffic: float, aht: float) -> float:
    """Expected wait time in seconds (ASA)."""
    if agents <= traffic:
        return float("inf")
    pw = erlang_c_wait_probability(agents, traffic)
    return pw * aht / (agents - traffic)


@dataclass
class StaffingConfig:
    interval_minutes: int = 30
    target_service_level: float = 0.80   # 80% ...
    target_answer_seconds: float = 20.0  # ... answered within 20s
    max_occupancy: float = 0.85          # cap to avoid agent burnout
    shrinkage: float = 0.30              # 30% of paid time is non-productive
    max_agents: int = 1000


@dataclass
class StaffingResult:
    agents_required: int      # agents needed on the phones
    agents_scheduled: int     # after shrinkage uplift
    service_level: float
    occupancy: float
    asa_seconds: float
    traffic_erlangs: float


def required_agents(
    calls: float,
    aht_seconds: float,
    config: StaffingConfig,
) -> StaffingResult:
    """Smallest agent count meeting the service-level and occupancy targets."""
    interval_seconds = config.interval_minutes * 60
    traffic = calls * aht_seconds / interval_seconds  # offered load in Erlangs

    if calls <= 0 or traffic <= 0:
        return StaffingResult(0, 0, 1.0, 0.0, 0.0, 0.0)

    agents = max(1, int(math.floor(traffic)) + 1)
    while agents < config.max_agents:
        sl = service_level(agents, traffic, aht_seconds, config.target_answer_seconds)
        occ = traffic / agents
        if sl >= config.target_service_level and occ <= config.max_occupancy:
            asa = average_speed_of_answer(agents, traffic, aht_seconds)
            scheduled = math.ceil(agents / (1.0 - config.shrinkage))
            return StaffingResult(agents, scheduled, sl, occ, asa, traffic)
        agents += 1

    # Fallback (should not happen within max_agents).
    asa = average_speed_of_answer(agents, traffic, aht_seconds)
    return StaffingResult(
        agents, math.ceil(agents / (1.0 - config.shrinkage)),
        service_level(agents, traffic, aht_seconds, config.target_answer_seconds),
        traffic / agents, asa, traffic,
    )


def staffing_plan(
    forecast: pd.DataFrame,
    config: StaffingConfig,
    volume_col: str = "forecast",
    aht_col: str = "aht",
) -> pd.DataFrame:
    """Build an interval-level staffing plan from a volume+AHT forecast.

    ``forecast`` must contain a ``timestamp`` column, a volume column and an
    AHT column (seconds). Returns the input augmented with staffing outputs.
    """
    rows = []
    for _, r in forecast.iterrows():
        res = required_agents(float(r[volume_col]), float(r[aht_col]), config)
        rows.append({
            "agents_required": res.agents_required,
            "agents_scheduled": res.agents_scheduled,
            "service_level": round(res.service_level, 4),
            "occupancy": round(res.occupancy, 4),
            "asa_seconds": round(res.asa_seconds, 1),
            "traffic_erlangs": round(res.traffic_erlangs, 2),
        })
    out = forecast.reset_index(drop=True).copy()
    return pd.concat([out, pd.DataFrame(rows)], axis=1)

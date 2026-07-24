"""Data loading and realistic synthetic data generation for call-volume forecasting.

Contact-centre arrival data has a well-known structure that every workforce
planner relies on:

* **Intraday seasonality** - a morning ramp, a midday peak, a lunch dip and an
  evening decay. This is the strongest signal in the series.
* **Intra-week seasonality** - Mondays are usually the busiest, weekends much
  quieter (or closed).
* **Yearly seasonality / trend** - slow growth of the customer base plus
  seasonal swings (e.g. tax season, holiday shopping).
* **Special days** - public holidays and marketing events distort volume.
* **Overdispersed noise** - arrivals are counts; their variance grows with the
  mean (closer to Poisson/negative-binomial than Gaussian).

The generator below reproduces all of these so the rest of the pipeline can be
exercised end-to-end without proprietary data. Real deployments simply replace
:func:`load_call_data` with a warehouse query returning the same schema.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable

import numpy as np
import pandas as pd

# Columns every downstream module expects.
TIMESTAMP = "timestamp"
VOLUME = "call_volume"
AHT = "aht"  # average handle time, seconds


# A small, dependency-free set of fixed-date holidays. Real deployments should
# swap in `holidays` / an internal calendar; the modelling code only needs a
# set of `datetime.date` objects.
def default_holidays(years: Iterable[int]) -> set[date]:
    """Return a set of common fixed-date public holidays for the given years."""
    fixed = [(1, 1), (7, 4), (11, 11), (12, 24), (12, 25), (12, 31)]
    out: set[date] = set()
    for y in years:
        for m, d in fixed:
            out.add(date(y, m, d))
        # Thanksgiving: 4th Thursday of November.
        nov1 = date(y, 11, 1)
        first_thu = 1 + (3 - nov1.weekday()) % 7
        out.add(date(y, 11, first_thu + 21))
    return out


@dataclass
class SyntheticConfig:
    """Parameters controlling the synthetic contact-centre generator."""

    start: str = "2023-01-02"          # a Monday
    days: int = 730                     # two years of history
    interval_minutes: int = 30         # half-hourly reporting granularity
    open_hour: int = 7                 # centre opens
    close_hour: int = 21               # centre closes
    base_daily_calls: float = 4200.0   # calls on an average weekday
    yearly_growth: float = 0.08        # 8% organic growth per year
    weekend_factor: float = 0.35       # weekend volume vs weekday
    holiday_factor: float = 0.25       # holiday volume vs normal
    noise_dispersion: float = 0.06     # multiplicative noise (relative sd)
    base_aht: float = 300.0            # seconds
    aht_weekly_swing: float = 0.10     # AHT is higher on busy days
    seed: int = 7
    weekday_profile: dict[int, float] = field(
        default_factory=lambda: {
            0: 1.18,  # Monday - busiest
            1: 1.06,
            2: 1.00,
            3: 0.98,
            4: 0.95,
            5: 0.45,  # Saturday
            6: 0.30,  # Sunday
        }
    )


def _intraday_shape(n_intervals: int) -> np.ndarray:
    """A realistic double-humped within-day arrival curve, summing to 1.0."""
    x = np.linspace(0.0, 1.0, n_intervals)
    # Morning peak ~10:30, afternoon peak ~14:30, lunch dip between.
    morning = np.exp(-0.5 * ((x - 0.28) / 0.11) ** 2)
    afternoon = 0.85 * np.exp(-0.5 * ((x - 0.62) / 0.14) ** 2)
    tail = 0.15 * np.exp(-0.5 * ((x - 0.9) / 0.08) ** 2)
    shape = morning + afternoon + tail + 0.02
    return shape / shape.sum()


def generate_synthetic(config: SyntheticConfig | None = None) -> pd.DataFrame:
    """Generate a realistic half-hourly call-volume + AHT history.

    Returns a tidy frame with columns ``timestamp``, ``call_volume`` and
    ``aht``. Volume is an integer count; AHT is in seconds.
    """
    cfg = config or SyntheticConfig()
    rng = np.random.default_rng(cfg.seed)

    per_day = int((cfg.close_hour - cfg.open_hour) * 60 / cfg.interval_minutes)
    shape = _intraday_shape(per_day)

    start = pd.Timestamp(cfg.start)
    hol = default_holidays(range(start.year, start.year + cfg.days // 365 + 2))

    rows = []
    for day_idx in range(cfg.days):
        day = start + pd.Timedelta(days=day_idx)
        dow = day.weekday()

        # Long-run growth compounded daily.
        growth = (1 + cfg.yearly_growth) ** (day_idx / 365.0)
        day_factor = cfg.weekday_profile[dow] * growth

        if day.date() in hol:
            day_factor *= cfg.holiday_factor
        elif dow >= 5:
            # weekend already lower via profile; keep as is
            day_factor *= 1.0

        # Mild yearly seasonality (busier in Q1 and Q4).
        yday = day.dayofyear
        day_factor *= 1.0 + 0.12 * np.cos(2 * np.pi * (yday - 15) / 365.25)

        expected_day = cfg.base_daily_calls * day_factor
        interval_expected = expected_day * shape

        # AHT: higher on busy days, mild intraday drift, small noise.
        busy_ratio = day_factor / 1.0
        aht_day = cfg.base_aht * (1 + cfg.aht_weekly_swing * (busy_ratio - 1))

        for k in range(per_day):
            ts = day + pd.Timedelta(
                minutes=cfg.open_hour * 60 + k * cfg.interval_minutes
            )
            mean = max(interval_expected[k], 0.1)
            # Overdispersed counts: gamma-mixed Poisson (negative binomial-ish).
            noise = rng.gamma(
                shape=1.0 / cfg.noise_dispersion,
                scale=cfg.noise_dispersion,
            )
            volume = rng.poisson(mean * noise)

            aht = aht_day * (1 + 0.05 * np.sin(2 * np.pi * k / per_day))
            aht *= 1 + rng.normal(0, 0.03)
            rows.append((ts, int(volume), float(max(aht, 30.0))))

    df = pd.DataFrame(rows, columns=[TIMESTAMP, VOLUME, AHT])
    return df


def load_call_data(path: str) -> pd.DataFrame:
    """Load call data from CSV.

    Expected columns: ``timestamp`` (parseable datetime), ``call_volume``
    (numeric) and optionally ``aht`` (seconds). Any extra columns are kept.
    """
    df = pd.read_csv(path)
    if TIMESTAMP not in df.columns:
        raise ValueError(f"CSV must contain a '{TIMESTAMP}' column")
    df[TIMESTAMP] = pd.to_datetime(df[TIMESTAMP])
    if VOLUME not in df.columns:
        raise ValueError(f"CSV must contain a '{VOLUME}' column")
    df = df.sort_values(TIMESTAMP).reset_index(drop=True)
    return df


def infer_interval_minutes(df: pd.DataFrame) -> int:
    """Infer the reporting interval (minutes) from the timestamp spacing."""
    diffs = df[TIMESTAMP].diff().dropna()
    if diffs.empty:
        raise ValueError("Need at least two timestamps to infer interval")
    return int(diffs.mode().iloc[0].total_seconds() // 60)

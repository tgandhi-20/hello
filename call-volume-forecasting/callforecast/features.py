"""Feature engineering for harmonic / regression-based volume forecasting.

The regression models in this project are *dynamic harmonic regressions*: the
seasonal pattern is represented with Fourier terms (smooth sine/cosine pairs)
rather than one dummy per interval. This is the approach popularised by
Hyndman (``forecast``/``fable``) and Facebook Prophet, and it is what most
modern workforce-planning stacks use because:

* it captures multiple overlapping seasonalities (daily, weekly, yearly)
  with far fewer parameters than dummies, which keeps variance low;
* it degrades gracefully to unseen future timestamps; and
* it combines cleanly with calendar flags (holidays) and autoregressive lags.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd

from .data import TIMESTAMP, VOLUME


@dataclass
class FeatureConfig:
    interval_minutes: int = 30
    daily_harmonics: int = 5        # within-day pattern richness
    weekly_harmonics: int = 3       # day-of-week pattern
    yearly_harmonics: int = 3       # seasonal / annual pattern
    lags: tuple[int, ...] = ()      # autoregressive lags (in intervals)
    rolling_windows: tuple[int, ...] = ()  # rolling-mean windows (intervals)
    holidays: set[date] = field(default_factory=set)


def _fourier(values: np.ndarray, period: float, order: int, prefix: str) -> pd.DataFrame:
    """Return sine/cosine Fourier terms for a seasonal cycle."""
    out = {}
    for k in range(1, order + 1):
        angle = 2 * np.pi * k * values / period
        out[f"{prefix}_sin{k}"] = np.sin(angle)
        out[f"{prefix}_cos{k}"] = np.cos(angle)
    return pd.DataFrame(out)


def build_features(
    df: pd.DataFrame,
    config: FeatureConfig,
    target: str = VOLUME,
) -> tuple[pd.DataFrame, pd.Series]:
    """Turn a timestamped series into a numeric design matrix ``X`` and target.

    Deterministic (calendar/Fourier) features are always available for future
    timestamps. Lag/rolling features are only defined where history exists;
    rows with missing lags are dropped from training but the transformer is
    reusable for recursive multi-step forecasting.
    """
    ts = df[TIMESTAMP]
    idx = df.index

    intervals_per_day = int(24 * 60 / config.interval_minutes)

    # Position of the interval within the day and within the week.
    minutes_of_day = ts.dt.hour * 60 + ts.dt.minute
    interval_of_day = minutes_of_day / config.interval_minutes
    dow = ts.dt.weekday
    interval_of_week = dow * intervals_per_day + interval_of_day
    day_of_year = ts.dt.dayofyear

    parts = [
        _fourier(interval_of_day.to_numpy(), intervals_per_day,
                 config.daily_harmonics, "d"),
        _fourier(interval_of_week.to_numpy(), 7 * intervals_per_day,
                 config.weekly_harmonics, "w"),
        _fourier(day_of_year.to_numpy(), 365.25,
                 config.yearly_harmonics, "y"),
    ]

    cal = pd.DataFrame(index=range(len(df)))
    cal["is_weekend"] = (dow >= 5).to_numpy().astype(float)
    # Linear trend in days from the first timestamp keeps growth learnable.
    cal["trend"] = ((ts - ts.iloc[0]).dt.total_seconds() / 86400.0).to_numpy()
    if config.holidays:
        hol = ts.dt.date.map(lambda d: 1.0 if d in config.holidays else 0.0)
        cal["is_holiday"] = hol.to_numpy()
        # Day before/after a holiday often behaves differently.
        cal["near_holiday"] = (
            ts.dt.date.map(lambda d: 1.0 if _near(d, config.holidays) else 0.0)
        ).to_numpy()

    X = pd.concat([p.reset_index(drop=True) for p in parts]
                  + [cal.reset_index(drop=True)], axis=1)
    X.index = idx

    # Autoregressive features (optional).
    if target in df.columns:
        y = df[target].astype(float)
        for lag in config.lags:
            X[f"lag_{lag}"] = y.shift(lag).to_numpy()
        for win in config.rolling_windows:
            X[f"roll_{win}"] = y.shift(1).rolling(win, min_periods=1).mean().to_numpy()
        return X, y

    return X, pd.Series(np.nan, index=idx)


def _near(d: date, holidays: set[date], window: int = 1) -> bool:
    for delta in range(1, window + 1):
        if (d.toordinal() + delta) in {h.toordinal() for h in holidays}:
            return True
        if (d.toordinal() - delta) in {h.toordinal() for h in holidays}:
            return True
    return False

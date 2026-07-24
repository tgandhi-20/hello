"""ForecastEngine - the end-to-end orchestrator.

Ties the pieces together into the workflow a workforce-planning team actually
runs on a schedule:

    engine = ForecastEngine(interval_minutes=30, holidays=...)
    engine.fit(history)                 # tournament -> champion, sets baseline
    plan = engine.forecast_staffing(48) # volume forecast -> Erlang C plan
    engine.ingest_actuals(new_actuals)  # close the loop
    engine.maybe_improve(history)       # self-improve when accuracy drifts

The engine holds the champion model, an AHT forecaster, the accuracy monitor,
and the staffing calculator so callers get a single, coherent interface.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .data import TIMESTAMP, VOLUME, AHT, infer_interval_minutes
from .models import BaseModel, default_model_zoo
from .monitor import ForecastMonitor, MonitorConfig
from .selection import SelectionResult, select_best_model
from .staffing import StaffingConfig, staffing_plan


def _future_timestamps(history: pd.DataFrame, horizon: int,
                       interval_minutes: int) -> pd.DatetimeIndex:
    """Continue the *business calendar* observed in history.

    Contact centres are open only part of the day (and may close on some days),
    so a naive fixed-frequency grid would emit timestamps for hours that never
    occur in the data. We instead learn the set of valid ``(weekday, time-of-
    day)`` slots and roll forward, keeping only slots that actually occur.
    """
    ts = history[TIMESTAMP]
    valid = set(zip(ts.dt.weekday.to_numpy(),
                    (ts.dt.hour * 60 + ts.dt.minute).to_numpy()))
    step = pd.Timedelta(minutes=interval_minutes)
    cur = ts.max() + step
    out: list[pd.Timestamp] = []
    max_iter = horizon * int(24 * 60 / interval_minutes) * 8 + 1000
    it = 0
    while len(out) < horizon and it < max_iter:
        if (cur.weekday(), cur.hour * 60 + cur.minute) in valid:
            out.append(cur)
        cur += step
        it += 1
    return pd.DatetimeIndex(out)


class SeasonalAHTForecaster:
    """Forecast AHT by its average weekly (weekday x interval) profile.

    AHT moves far less than volume, so a robust seasonal profile with a light
    recency weighting is both accurate and stable - over-modelling it just adds
    variance.
    """

    def __init__(self, interval_minutes: int = 30, recent_days: int = 56):
        self.interval_minutes = interval_minutes
        self.recent_days = recent_days

    def fit(self, df: pd.DataFrame) -> "SeasonalAHTForecaster":
        d = df.copy()
        cutoff = d[TIMESTAMP].max() - pd.Timedelta(days=self.recent_days)
        d = d[d[TIMESTAMP] >= cutoff]
        d["dow"] = d[TIMESTAMP].dt.weekday
        d["tod"] = d[TIMESTAMP].dt.hour * 60 + d[TIMESTAMP].dt.minute
        self._profile = d.groupby(["dow", "tod"])[AHT].mean()
        self._global = float(d[AHT].mean())
        return self

    def predict(self, timestamps: pd.DatetimeIndex) -> np.ndarray:
        out = []
        for ts in timestamps:
            key = (ts.weekday(), ts.hour * 60 + ts.minute)
            out.append(float(self._profile.get(key, self._global)))
        return np.asarray(out, float)


@dataclass
class ForecastEngine:
    interval_minutes: int | None = None
    holidays: set = field(default_factory=set)
    horizon: int = 48
    n_folds: int = 6
    staffing_config: StaffingConfig | None = None
    monitor_config: MonitorConfig | None = None
    monitor_state_path: str | None = None

    def __post_init__(self):
        self.champion: BaseModel | None = None
        self.selection: SelectionResult | None = None
        self.aht_model: SeasonalAHTForecaster | None = None
        self.monitor = ForecastMonitor(
            self.monitor_config or MonitorConfig(),
            self.monitor_state_path,
        )
        self._history: pd.DataFrame | None = None

    # ---- training / selection ---------------------------------------------
    def fit(self, history: pd.DataFrame,
            candidates: list[BaseModel] | None = None) -> SelectionResult:
        history = history.sort_values(TIMESTAMP).reset_index(drop=True)
        if self.interval_minutes is None:
            self.interval_minutes = infer_interval_minutes(history)
        if self.staffing_config is None:
            self.staffing_config = StaffingConfig(interval_minutes=self.interval_minutes)

        candidates = candidates or default_model_zoo(self.interval_minutes, self.holidays)
        self.selection = select_best_model(
            candidates, history, horizon=self.horizon, n_folds=self.n_folds,
        )
        self.champion = self.selection.champion
        self.champion.fit(history)

        self.aht_model = SeasonalAHTForecaster(self.interval_minutes).fit(history)
        self._history = history

        champ_score = self.selection.results[self.selection.champion_name].metrics["wape"]
        self.monitor.set_baseline(champ_score, self.selection.champion_name)
        self.monitor.save()
        return self.selection

    # ---- forecasting -------------------------------------------------------
    def forecast_volume(self, horizon: int | None = None) -> pd.DataFrame:
        if self.champion is None:
            raise RuntimeError("Call fit() before forecasting")
        horizon = horizon or self.horizon
        future = _future_timestamps(self._history, horizon, self.interval_minutes)
        vol = self.champion.predict(future)
        aht = self.aht_model.predict(future)
        return pd.DataFrame({TIMESTAMP: future, "forecast": vol, "aht": aht})

    def forecast_staffing(self, horizon: int | None = None,
                          log: bool = True) -> pd.DataFrame:
        fc = self.forecast_volume(horizon)
        plan = staffing_plan(fc, self.staffing_config)
        if log:
            self.monitor.log_forecast(fc, champion_name=self.selection.champion_name)
            self.monitor.save()
        return plan

    # ---- self-improvement loop --------------------------------------------
    def ingest_actuals(self, actuals: pd.DataFrame) -> dict:
        """Feed realised actuals back in; returns current rolling accuracy."""
        acc = self.monitor.reconcile(actuals)
        self.monitor.save()
        return acc

    def maybe_improve(self, full_history: pd.DataFrame,
                      force: bool = False) -> dict:
        """Retrain + re-select if accuracy has drifted (or if ``force``)."""
        should, reason = self.monitor.should_retrain()
        if not (should or force):
            return {"retrained": False, "reason": reason}

        prev = self.selection.champion_name if self.selection else None
        self.fit(full_history)
        return {
            "retrained": True,
            "reason": reason if should else "forced",
            "previous_champion": prev,
            "new_champion": self.selection.champion_name,
            "leaderboard": self.selection.leaderboard,
        }

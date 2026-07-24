"""Self-improvement: reconcile forecasts against actuals and detect drift.

A forecasting system "self-improves" by closing the loop:

1. **Log** every forecast it issues (timestamp, horizon, value).
2. **Reconcile** logged forecasts against actuals as they land, computing the
   realised error per interval.
3. **Monitor** the rolling error and bias. When accuracy degrades past a
   threshold - or on a fixed cadence - it **flags a retrain**, at which point
   the selection tournament re-runs on the enlarged history and may promote a
   different champion.

State is persisted to a JSON file so the loop survives process restarts, which
is what a scheduled production job needs.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from .backtest import bias as bias_metric
from .backtest import wape


@dataclass
class MonitorConfig:
    """Thresholds governing when the engine retrains itself.

    Detection is **relative by default**. An absolute WAPE threshold is a trap:
    interval-level accuracy is bounded below by the irreducible arrival noise of
    the specific queue (often 0.20+ WAPE at half-hourly granularity), so a fixed
    limit like 0.15 can be permanently unreachable and would fire on every check
    - an alarm that is always on is an alarm nobody reads. Comparing against the
    baseline achieved at training time auto-calibrates to whatever floor the
    data actually has. Set ``retrain_wape_threshold`` explicitly only when you
    know a meaningful absolute limit for your queue.
    """

    retrain_wape_threshold: float | None = None  # optional absolute limit
    bias_threshold: float = 0.05           # flag if |bias| exceeds this
    rolling_window: int = 14 * 48          # ~2 weeks of half-hourly intervals
    degradation_ratio: float = 1.25        # retrain if error > ratio x baseline
    min_new_actuals: int = 48              # need a day of actuals before acting


@dataclass
class MonitorState:
    baseline_wape: float | None = None     # error at last (re)training
    champion_name: str | None = None
    n_reconciled: int = 0
    history: list = field(default_factory=list)  # rolling per-interval error log


class ForecastMonitor:
    """Tracks forecast accuracy over time and decides when to retrain."""

    def __init__(self, config: MonitorConfig | None = None, state_path: str | None = None):
        self.config = config or MonitorConfig()
        self.state_path = state_path
        self.state = self._load_state()
        self._pending: dict[str, dict] = {}  # timestamp iso -> forecast record

    # ---- persistence -------------------------------------------------------
    def _load_state(self) -> MonitorState:
        if self.state_path and os.path.exists(self.state_path):
            with open(self.state_path) as fh:
                raw = json.load(fh)
            return MonitorState(**raw.get("state", {}))
        return MonitorState()

    def save(self) -> None:
        if not self.state_path:
            return
        os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
        with open(self.state_path, "w") as fh:
            json.dump({"state": asdict(self.state)}, fh, indent=2, default=str)

    # ---- the feedback loop -------------------------------------------------
    def log_forecast(self, forecast: pd.DataFrame,
                     value_col: str = "forecast", champion_name: str | None = None) -> None:
        """Record issued forecasts so they can later be scored against actuals."""
        if champion_name:
            self.state.champion_name = champion_name
        for _, r in forecast.iterrows():
            key = pd.Timestamp(r["timestamp"]).isoformat()
            self._pending[key] = {"forecast": float(r[value_col])}

    def reconcile(self, actuals: pd.DataFrame,
                  value_col: str = "call_volume") -> dict:
        """Match actuals to pending forecasts and update rolling error stats."""
        matched = []
        for _, r in actuals.iterrows():
            key = pd.Timestamp(r["timestamp"]).isoformat()
            rec = self._pending.pop(key, None)
            if rec is not None:
                matched.append((key, rec["forecast"], float(r[value_col])))

        for key, f, a in matched:
            self.state.history.append({"timestamp": key, "forecast": f, "actual": a})
        self.state.history = self.state.history[-self.config.rolling_window:]
        self.state.n_reconciled += len(matched)

        return self.current_accuracy()

    def current_accuracy(self) -> dict:
        if not self.state.history:
            return {"wape": float("nan"), "bias": float("nan"), "n": 0}
        a = np.array([h["actual"] for h in self.state.history], float)
        f = np.array([h["forecast"] for h in self.state.history], float)
        return {"wape": wape(a, f), "bias": bias_metric(a, f), "n": len(a)}

    def set_baseline(self, wape_value: float, champion_name: str | None = None) -> None:
        """Record the accuracy achieved at (re)training time."""
        self.state.baseline_wape = float(wape_value)
        if champion_name:
            self.state.champion_name = champion_name

    def should_retrain(self) -> tuple[bool, str]:
        """Decide whether the model should be retrained + reselected."""
        acc = self.current_accuracy()
        n = acc["n"]
        if n < self.config.min_new_actuals:
            return False, f"insufficient reconciled actuals ({n})"

        w = acc["wape"]
        if (self.config.retrain_wape_threshold is not None
                and w > self.config.retrain_wape_threshold):
            return True, (f"rolling WAPE {w:.3f} exceeds absolute threshold "
                          f"{self.config.retrain_wape_threshold:.3f}")

        if self.state.baseline_wape:
            if w > self.config.degradation_ratio * self.state.baseline_wape:
                return True, (f"rolling WAPE {w:.3f} degraded past "
                              f"{self.config.degradation_ratio:.2f}x baseline "
                              f"{self.state.baseline_wape:.3f}")

        if abs(acc["bias"]) > self.config.bias_threshold:
            return True, (f"forecast bias {acc['bias']:+.3f} exceeds "
                          f"+/-{self.config.bias_threshold:.3f}")

        return False, f"healthy (WAPE {w:.3f}, bias {acc['bias']:+.3f})"

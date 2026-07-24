"""Rolling-origin backtesting and forecast-accuracy metrics.

Honest error estimation is the heart of "self-improvement". A model that is
only scored on data it was trained on will always look good and will fail in
production. Instead we use **rolling-origin (walk-forward) evaluation**: repeatedly
train on everything up to time *t*, forecast the next *horizon* intervals,
compare against the withheld actuals, then roll *t* forward. Averaging the error
over many origins gives a low-variance estimate of true out-of-sample accuracy -
exactly the quantity a workforce planner needs to trust the staffing numbers.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .data import TIMESTAMP, VOLUME


def wape(actual: np.ndarray, forecast: np.ndarray) -> float:
    """Weighted Absolute Percentage Error = sum|a-f| / sum|a|.

    The preferred KPI in workforce planning: robust to zero/low-volume
    intervals (unlike MAPE) and directly interpretable as "total error as a
    fraction of total volume".
    """
    a = np.asarray(actual, float)
    f = np.asarray(forecast, float)
    denom = np.abs(a).sum()
    return float(np.abs(a - f).sum() / denom) if denom else float("nan")


def mape(actual: np.ndarray, forecast: np.ndarray, eps: float = 1.0) -> float:
    a = np.asarray(actual, float)
    f = np.asarray(forecast, float)
    mask = a > eps
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((a[mask] - f[mask]) / a[mask])))


def rmse(actual: np.ndarray, forecast: np.ndarray) -> float:
    a = np.asarray(actual, float)
    f = np.asarray(forecast, float)
    return float(np.sqrt(np.mean((a - f) ** 2)))


def bias(actual: np.ndarray, forecast: np.ndarray) -> float:
    """Signed relative bias: >0 means the model over-forecasts (over-staffs)."""
    a = np.asarray(actual, float)
    f = np.asarray(forecast, float)
    denom = a.sum()
    return float((f - a).sum() / denom) if denom else float("nan")


def mase(actual: np.ndarray, forecast: np.ndarray, naive_error: float) -> float:
    """Mean Absolute Scaled Error relative to a seasonal-naive benchmark."""
    a = np.asarray(actual, float)
    f = np.asarray(forecast, float)
    mae = np.mean(np.abs(a - f))
    return float(mae / naive_error) if naive_error else float("nan")


def all_metrics(actual, forecast, naive_error: float | None = None) -> dict:
    m = {
        "wape": wape(actual, forecast),
        "mape": mape(actual, forecast),
        "rmse": rmse(actual, forecast),
        "bias": bias(actual, forecast),
    }
    if naive_error:
        m["mase"] = mase(actual, forecast, naive_error)
    return m


@dataclass
class BacktestResult:
    model_name: str
    metrics: dict            # averaged over folds
    per_fold: list[dict]     # metric dict per fold
    predictions: pd.DataFrame  # timestamp, actual, forecast, fold

    @property
    def score(self) -> float:
        """Primary selection score - lower is better (WAPE + std penalty)."""
        wapes = [f["wape"] for f in self.per_fold if not np.isnan(f["wape"])]
        if not wapes:
            return float("inf")
        # Penalise fold-to-fold instability: we want low error AND low variance.
        return float(np.mean(wapes) + 0.5 * np.std(wapes))


def rolling_origin_backtest(
    model_factory,
    df: pd.DataFrame,
    horizon: int,
    n_folds: int = 6,
    step: int | None = None,
    min_train: int | None = None,
    model_name: str | None = None,
) -> BacktestResult:
    """Walk-forward evaluation of a model over ``n_folds`` origins.

    ``model_factory`` is a zero-arg callable returning a *fresh* model (so each
    fold trains from scratch). ``horizon`` is the number of intervals to forecast
    at each origin. ``step`` spaces the origins (defaults to ``horizon``).
    """
    df = df.sort_values(TIMESTAMP).reset_index(drop=True)
    n = len(df)
    step = step or horizon
    total_test = horizon + (n_folds - 1) * step
    if min_train is None:
        min_train = max(n - total_test, horizon * 3)
    if min_train + horizon > n:
        raise ValueError("Not enough data for the requested backtest window")

    per_fold = []
    frames = []
    naive_errors = []

    for i in range(n_folds):
        train_end = min_train + i * step
        test_end = min(train_end + horizon, n)
        if train_end >= n or train_end >= test_end:
            break
        train = df.iloc[:train_end]
        test = df.iloc[train_end:test_end]

        model = model_factory()
        model.fit(train)
        fc = model.predict(test)
        actual = test[VOLUME].to_numpy(dtype=float)

        # Seasonal-naive error on this fold, for MASE scaling.
        season = 7 * _infer_day(df)
        naive_pred = _seasonal_naive_pred(df, train_end, test_end, season)
        naive_err = np.mean(np.abs(actual - naive_pred))
        naive_errors.append(naive_err)

        per_fold.append(all_metrics(actual, fc, naive_err))
        frames.append(pd.DataFrame({
            TIMESTAMP: test[TIMESTAMP].to_numpy(),
            "actual": actual,
            "forecast": fc,
            "fold": i,
        }))

    avg = {k: float(np.nanmean([f[k] for f in per_fold])) for k in per_fold[0]}
    return BacktestResult(
        model_name=model_name or "model",
        metrics=avg,
        per_fold=per_fold,
        predictions=pd.concat(frames, ignore_index=True),
    )


def _infer_day(df: pd.DataFrame) -> int:
    diffs = df[TIMESTAMP].diff().dropna()
    interval_min = diffs.mode().iloc[0].total_seconds() / 60
    return int(24 * 60 / interval_min)


def _seasonal_naive_pred(df, start, end, season) -> np.ndarray:
    vals = df[VOLUME].to_numpy(dtype=float)
    out = []
    for t in range(start, end):
        ref = t - season
        out.append(vals[ref] if ref >= 0 else vals[:start].mean())
    return np.asarray(out, dtype=float)

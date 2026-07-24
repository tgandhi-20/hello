"""Forecasting models.

No single algorithm is best for every contact centre, so we keep a small
*stable* of complementary candidates and let backtesting pick the champion:

* ``SeasonalNaiveModel`` - "same interval, last week". A deceptively strong
  baseline; any model that cannot beat it is not worth deploying.
* ``RidgeHarmonicModel`` - the core **statistical regression**: L2-regularised
  linear regression on Fourier + calendar + lag features. Regularisation is the
  main tool for *low variance* - it shrinks coefficients so the fit does not
  chase noise.
* ``GradientBoostingModel`` - captures non-linear interactions (e.g. holiday x
  hour-of-day) that a linear model misses.
* ``HoltWintersModel`` - a lightweight multiplicative exponential-smoothing
  model over the weekly seasonal cycle; robust when history is short.
* ``EnsembleModel`` - inverse-error weighted blend of the above. Averaging
  decorrelated forecasts is the single most reliable variance-reduction trick
  in forecasting practice.

Every model implements the same tiny interface:

    model.fit(df)                      -> self
    model.predict(future_timestamps)   -> np.ndarray of expected call volume

``df`` is a frame with ``timestamp`` and ``call_volume``; predict receives a
``DatetimeIndex`` (or frame with a ``timestamp`` column).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from .data import TIMESTAMP, VOLUME
from .features import FeatureConfig, build_features


def _as_frame(timestamps) -> pd.DataFrame:
    if isinstance(timestamps, pd.DataFrame):
        return timestamps[[TIMESTAMP]].copy()
    return pd.DataFrame({TIMESTAMP: pd.to_datetime(pd.Index(timestamps))})


def _rows_per_day(df: pd.DataFrame) -> int:
    """Number of stored intervals in a typical day.

    Autoregressive lags are expressed in *rows*, so for a business-hours-only
    series (e.g. 28 half-hourly open intervals, not 48) the "same interval last
    week" lag is ``7 * rows_per_day``. Using the wall-clock 48 would misalign
    the lag with the seasonal cycle.
    """
    counts = df.groupby(df[TIMESTAMP].dt.normalize()).size()
    return int(counts.mode().iloc[0]) if not counts.empty else 48


def _recursive_predict(future_frame, cfg, history_values, columns, predict_fn):
    """Fast recursive multi-step prediction for autoregressive models.

    Deterministic (Fourier/calendar) features depend only on the timestamp, so
    they are computed once for all future rows. Only the lag/rolling features
    depend on earlier predictions, and those are updated with cheap array
    indexing as each step is produced - avoiding an O(horizon x history)
    rebuild of the whole design matrix.
    """
    det, _ = build_features(future_frame.reset_index(drop=True), cfg)
    det = det.reset_index(drop=True)
    values = [float(v) for v in history_values]
    preds = np.empty(len(det), dtype=float)

    for i in range(len(det)):
        row = det.iloc[i].to_dict()
        for lag in cfg.lags:
            row[f"lag_{lag}"] = values[-lag] if len(values) >= lag else np.nan
        for win in cfg.rolling_windows:
            row[f"roll_{win}"] = float(np.mean(values[-win:])) if values else np.nan
        yhat = predict_fn(row)
        preds[i] = yhat
        values.append(yhat)
    return preds


class BaseModel:
    name = "base"

    def fit(self, df: pd.DataFrame) -> "BaseModel":  # pragma: no cover
        raise NotImplementedError

    def predict(self, timestamps) -> np.ndarray:  # pragma: no cover
        raise NotImplementedError


@dataclass
class SeasonalNaiveModel(BaseModel):
    """Predict each interval with the value from ``season`` intervals earlier.

    Defaults to one week (same weekday + same time), the dominant seasonal
    cycle in contact-centre data.
    """

    interval_minutes: int = 30
    season_days: int = 7
    name: str = "seasonal_naive"

    def fit(self, df: pd.DataFrame) -> "SeasonalNaiveModel":
        self._hist = df.set_index(TIMESTAMP)[VOLUME].astype(float)
        self._season = pd.Timedelta(days=self.season_days)
        self._global_mean = float(self._hist.mean())
        return self

    def predict(self, timestamps) -> np.ndarray:
        f = _as_frame(timestamps)
        out = []
        for ts in f[TIMESTAMP]:
            ref = ts
            val = np.nan
            # Walk back in whole-week steps until we find a known interval.
            for _ in range(8):
                ref = ref - self._season
                if ref in self._hist.index:
                    val = self._hist.loc[ref]
                    break
            out.append(val if not np.isnan(val) else self._global_mean)
        return np.clip(np.asarray(out, dtype=float), 0, None)


@dataclass
class RidgeHarmonicModel(BaseModel):
    """L2-regularised harmonic + calendar + lag regression (the core model)."""

    interval_minutes: int = 30
    alpha: float = 5.0
    daily_harmonics: int = 6
    weekly_harmonics: int = 4
    yearly_harmonics: int = 3
    use_lags: bool = True
    holidays: set = field(default_factory=set)
    name: str = "ridge_harmonic"

    def _config(self) -> FeatureConfig:
        lags = (self._season, self._day) if self.use_lags else ()
        rolls = (self._season,) if self.use_lags else ()
        return FeatureConfig(
            interval_minutes=self.interval_minutes,
            daily_harmonics=self.daily_harmonics,
            weekly_harmonics=self.weekly_harmonics,
            yearly_harmonics=self.yearly_harmonics,
            lags=lags,
            rolling_windows=rolls,
            holidays=self.holidays,
        )

    def fit(self, df: pd.DataFrame) -> "RidgeHarmonicModel":
        self._day = _rows_per_day(df)
        self._season = 7 * self._day
        self._history = df.copy().reset_index(drop=True)
        cfg = self._config()
        X, y = build_features(self._history, cfg)
        # Model log1p(volume): stabilises multiplicative/heteroscedastic counts.
        mask = X.notna().all(axis=1) & y.notna()
        Xz = X[mask]
        yz = np.log1p(y[mask].to_numpy())
        self._columns = list(Xz.columns)
        self._scaler = StandardScaler().fit(Xz.to_numpy())
        self._ridge = Ridge(alpha=self.alpha).fit(
            self._scaler.transform(Xz.to_numpy()), yz
        )
        return self

    def predict(self, timestamps) -> np.ndarray:
        f = _as_frame(timestamps)
        cfg = self._config()
        if not self.use_lags:
            X, _ = build_features(f, cfg)
            return self._predict_matrix(X)

        # With autoregressive lags we forecast recursively, feeding each
        # prediction forward so downstream intervals can use it as a lag.
        def predict_row(row: dict) -> float:
            X = pd.DataFrame([row]).reindex(columns=self._columns)
            X = X.fillna(pd.Series(self._scaler.mean_, index=self._columns))
            z = self._scaler.transform(X.to_numpy())
            return float(np.clip(np.expm1(self._ridge.predict(z))[0], 0, None))

        return _recursive_predict(
            f, cfg, self._history[VOLUME].to_numpy(dtype=float),
            self._columns, predict_row,
        )

    def _predict_matrix(self, X: pd.DataFrame) -> np.ndarray:
        X = X.reindex(columns=self._columns)
        # Backfill any missing lag with column mean seen at fit-scaling time.
        X = X.fillna(pd.Series(self._scaler.mean_, index=self._columns))
        z = self._scaler.transform(X.to_numpy())
        yhat = np.expm1(self._ridge.predict(z))
        return np.clip(yhat, 0, None)


@dataclass
class GradientBoostingModel(BaseModel):
    """Gradient-boosted trees on the same feature set (non-linear capacity)."""

    interval_minutes: int = 30
    daily_harmonics: int = 6
    weekly_harmonics: int = 4
    yearly_harmonics: int = 3
    holidays: set = field(default_factory=set)
    max_depth: int | None = None
    learning_rate: float = 0.06
    max_iter: int = 400
    name: str = "gradient_boosting"

    def _config(self) -> FeatureConfig:
        day = getattr(self, "_day", int(24 * 60 / self.interval_minutes))
        return FeatureConfig(
            interval_minutes=self.interval_minutes,
            daily_harmonics=self.daily_harmonics,
            weekly_harmonics=self.weekly_harmonics,
            yearly_harmonics=self.yearly_harmonics,
            lags=(7 * day, day),
            rolling_windows=(7 * day,),
            holidays=self.holidays,
        )

    def fit(self, df: pd.DataFrame) -> "GradientBoostingModel":
        self._history = df.copy().reset_index(drop=True)
        self._day = _rows_per_day(df)
        cfg = self._config()
        X, y = build_features(self._history, cfg)
        mask = X.notna().all(axis=1) & y.notna()
        self._columns = list(X.columns)
        self._model = HistGradientBoostingRegressor(
            loss="poisson",
            learning_rate=self.learning_rate,
            max_iter=self.max_iter,
            max_depth=self.max_depth,
            l2_regularization=1.0,
            random_state=0,
        ).fit(X[mask].to_numpy(), y[mask].to_numpy())
        return self

    def predict(self, timestamps) -> np.ndarray:
        f = _as_frame(timestamps)
        cfg = self._config()

        def predict_row(row: dict) -> float:
            X = pd.DataFrame([row]).reindex(columns=self._columns).fillna(0.0)
            return float(np.clip(self._model.predict(X.to_numpy())[0], 0, None))

        return _recursive_predict(
            f, cfg, self._history[VOLUME].to_numpy(dtype=float),
            self._columns, predict_row,
        )


@dataclass
class HoltWintersModel(BaseModel):
    """Multiplicative level/trend + weekly seasonal decomposition.

    A compact, dependency-free Holt-Winters-style model designed to be robust to
    business-hours gaps: rather than indexing the seasonal cycle by row position
    (which breaks when the centre is closed overnight/weekends), it decomposes
    volume as ``daily_level(day) x slot_factor(weekday, time-of-day)``.

    * ``daily_level`` is the smoothed, trending mean volume per interval per day
      (exponential smoothing over the daily-mean series -> level + per-day trend).
    * ``slot_factor`` is the average ratio of each interval to its own day mean.

    Robust when only a few weeks of history exist, where regression on yearly
    Fourier terms cannot yet learn anything.
    """

    interval_minutes: int = 30
    alpha: float = 0.20   # level smoothing on the daily-mean series
    beta: float = 0.05    # trend smoothing (per day)
    name: str = "holt_winters"

    def fit(self, df: pd.DataFrame) -> "HoltWintersModel":
        d = df[[TIMESTAMP, VOLUME]].copy()
        d[VOLUME] = d[VOLUME].astype(float)
        d["date"] = d[TIMESTAMP].dt.normalize()
        d["slot"] = list(zip(d[TIMESTAMP].dt.weekday,
                             d[TIMESTAMP].dt.hour * 60 + d[TIMESTAMP].dt.minute))

        daily = d.groupby("date")[VOLUME].mean()
        self._last_day = daily.index[-1]

        # Exponential smoothing (level + trend) over the daily-mean series.
        vals = daily.to_numpy()
        level = float(vals[0])
        trend = float(vals[1] - vals[0]) if len(vals) > 1 else 0.0
        for v in vals[1:]:
            last_level = level
            level = self.alpha * v + (1 - self.alpha) * (level + trend)
            trend = self.beta * (level - last_level) + (1 - self.beta) * trend
        self._level = level
        self._trend = trend

        # Seasonal slot factors: interval volume relative to its day's mean.
        day_mean = d.groupby("date")[VOLUME].transform("mean").replace(0, np.nan)
        d["ratio"] = d[VOLUME] / day_mean
        self._slot_factor = d.groupby("slot")["ratio"].mean().to_dict()
        self._global_factor = float(np.nanmean(list(self._slot_factor.values())) or 1.0)
        return self

    def predict(self, timestamps) -> np.ndarray:
        f = _as_frame(timestamps)
        out = []
        for ts in f[TIMESTAMP]:
            days_ahead = max((ts.normalize() - self._last_day).days, 1)
            level_ahead = self._level + self._trend * days_ahead
            slot = (ts.weekday(), ts.hour * 60 + ts.minute)
            factor = self._slot_factor.get(slot, self._global_factor)
            out.append(max(level_ahead * factor, 0.0))
        return np.asarray(out, dtype=float)


@dataclass
class EnsembleModel(BaseModel):
    """Inverse-error weighted blend of several fitted models.

    Weights are supplied by the selection layer (typically 1/backtest-error,
    normalised). Blending decorrelated forecasts reduces variance without
    increasing bias - the classic "wisdom of models" result.
    """

    members: list = field(default_factory=list)
    weights: np.ndarray | None = None
    name: str = "ensemble"

    def fit(self, df: pd.DataFrame) -> "EnsembleModel":
        for m in self.members:
            m.fit(df)
        if self.weights is None:
            self.weights = np.ones(len(self.members)) / len(self.members)
        return self

    def predict(self, timestamps) -> np.ndarray:
        preds = np.vstack([m.predict(timestamps) for m in self.members])
        w = np.asarray(self.weights, dtype=float)
        w = w / w.sum()
        return np.clip(w @ preds, 0, None)


def default_model_zoo(interval_minutes: int, holidays: set | None = None) -> list[BaseModel]:
    """Return the standard candidate set used by the selection layer."""
    holidays = holidays or set()
    return [
        SeasonalNaiveModel(interval_minutes=interval_minutes),
        HoltWintersModel(interval_minutes=interval_minutes),
        RidgeHarmonicModel(interval_minutes=interval_minutes, holidays=holidays),
        GradientBoostingModel(interval_minutes=interval_minutes, holidays=holidays),
    ]

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

import math
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


def safe_lag_plan(horizon: int, rows_per_day: int) -> tuple[tuple[int, ...], tuple[int, ...], int]:
    """Choose autoregressive features that never depend on our own predictions.

    A model forecasting ``horizon`` steps ahead can only use a lag of ``L`` if
    ``L >= horizon`` - otherwise the feature for the later steps would have to be
    filled with an earlier *prediction*, and errors compound across the horizon
    (the classic weakness of recursive multi-step forecasting).

    We therefore snap the lags up to the smallest whole number of weeks that
    covers the horizon, giving "same interval, N weeks before the forecast
    origin" - always a genuine observation. Returns ``(lags, windows, shift)``.
    """
    season = 7 * rows_per_day
    base = season * max(1, math.ceil(horizon / season))
    return (base, base + season), (season,), base


def _predict_frame(history: pd.DataFrame, future: pd.DataFrame,
                   cfg: FeatureConfig) -> pd.DataFrame:
    """Build the design matrix for future timestamps in one vectorised pass.

    Because every lag in ``cfg`` is at least as long as the horizon, appending
    the future rows with a NaN target still resolves all lag/rolling features
    from observed history - no recursion required.
    """
    combined = pd.concat(
        [history[[TIMESTAMP, VOLUME]],
         pd.DataFrame({TIMESTAMP: future[TIMESTAMP].to_numpy(),
                       VOLUME: np.nan})],
        ignore_index=True,
    )
    X, _ = build_features(combined, cfg)
    return X.iloc[-len(future):]


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
    """L2-regularised harmonic + calendar + lag regression (the core model).

    Two refinements matter a great deal in practice:

    * **Horizon-safe lags** (see :func:`safe_lag_plan`) - the autoregressive
      features are always real observations, so a 196-step forecast is produced
      in a single vectorised pass instead of 196 recursive steps that compound
      their own error.
    * **Smearing bias correction** - the model is fitted on ``log1p(volume)`` to
      stabilise the variance of counts, but back-transforming with ``expm1``
      returns the conditional *median*. For right-skewed arrivals the mean is
      higher, so a naive back-transform systematically under-forecasts - the
      worst direction for staffing. Duan's smearing estimator rescales by the
      empirical mean of ``exp(residual)`` to recover the conditional mean.
    """

    interval_minutes: int = 30
    horizon: int = 48
    alpha: float | None = None          # None -> tuned automatically
    alpha_grid: tuple[float, ...] = (0.3, 1.0, 3.0, 10.0, 30.0, 100.0)
    daily_harmonics: int = 6
    weekly_harmonics: int = 4
    yearly_harmonics: int = 3
    use_lags: bool = True
    smearing: bool = True
    holidays: set = field(default_factory=set)
    name: str = "ridge_harmonic"

    def _config(self) -> FeatureConfig:
        if self.use_lags:
            lags, rolls, shift = safe_lag_plan(self.horizon, self._day)
        else:
            lags, rolls, shift = (), (), 1
        return FeatureConfig(
            interval_minutes=self.interval_minutes,
            daily_harmonics=self.daily_harmonics,
            weekly_harmonics=self.weekly_harmonics,
            yearly_harmonics=self.yearly_harmonics,
            lags=lags,
            rolling_windows=rolls,
            rolling_shift=shift,
            holidays=self.holidays,
        )

    def fit(self, df: pd.DataFrame) -> "RidgeHarmonicModel":
        self._day = _rows_per_day(df)
        self._history = df.copy().reset_index(drop=True)
        cfg = self._config()
        X, y = build_features(self._history, cfg)
        mask = X.notna().all(axis=1) & y.notna()
        Xz = X[mask].to_numpy()
        yz = np.log1p(y[mask].to_numpy())

        self._columns = list(X.columns)
        self._scaler = StandardScaler().fit(Xz)
        Z = self._scaler.transform(Xz)

        alpha = self.alpha if self.alpha is not None else self._tune_alpha(Z, yz)
        self._alpha_used = alpha
        self._ridge = Ridge(alpha=alpha).fit(Z, yz)

        # Duan's smearing factor: E[y+1|x] = exp(eta) * mean(exp(residual)).
        resid = yz - self._ridge.predict(Z)
        self._smear = float(np.clip(np.mean(np.exp(resid)), 1.0, 2.0)) \
            if self.smearing else 1.0
        return self

    def _tune_alpha(self, Z: np.ndarray, yz: np.ndarray) -> float:
        """Pick the ridge penalty on a held-out tail of the training data.

        Uses the final ``horizon`` rows as an internal validation split so the
        choice reflects genuine out-of-sample performance at the horizon we
        actually forecast. Only training data is touched, so backtest folds
        stay honest.
        """
        n = len(yz)
        cut = max(int(n * 0.7), n - self.horizon)
        if cut <= 10 or cut >= n:
            return 10.0
        best, best_err = 10.0, float("inf")
        for a in self.alpha_grid:
            m = Ridge(alpha=a).fit(Z[:cut], yz[:cut])
            pred = np.expm1(m.predict(Z[cut:]))
            act = np.expm1(yz[cut:])
            denom = np.abs(act).sum()
            err = np.abs(act - pred).sum() / denom if denom else np.inf
            if err < best_err:
                best, best_err = a, err
        return best

    def predict(self, timestamps) -> np.ndarray:
        f = _as_frame(timestamps)
        cfg = self._config()
        if not self.use_lags:
            X, _ = build_features(f, cfg)
        else:
            X = _predict_frame(self._history, f, cfg)
        return self._predict_matrix(X)

    def _predict_matrix(self, X: pd.DataFrame) -> np.ndarray:
        X = X.reindex(columns=self._columns)
        # Backfill any missing lag with the column mean seen during fitting.
        X = X.fillna(pd.Series(self._scaler.mean_, index=self._columns))
        z = self._scaler.transform(X.to_numpy())
        yhat = np.exp(self._ridge.predict(z)) * self._smear - 1.0
        return np.clip(yhat, 0, None)


@dataclass
class GradientBoostingModel(BaseModel):
    """Gradient-boosted trees on the same feature set (non-linear capacity)."""

    interval_minutes: int = 30
    horizon: int = 48
    daily_harmonics: int = 6
    weekly_harmonics: int = 4
    yearly_harmonics: int = 3
    holidays: set = field(default_factory=set)
    max_depth: int | None = None
    learning_rate: float = 0.06
    max_iter: int = 400
    early_stopping: bool = True
    name: str = "gradient_boosting"

    def _config(self) -> FeatureConfig:
        day = getattr(self, "_day", int(24 * 60 / self.interval_minutes))
        lags, rolls, shift = safe_lag_plan(self.horizon, day)
        return FeatureConfig(
            interval_minutes=self.interval_minutes,
            daily_harmonics=self.daily_harmonics,
            weekly_harmonics=self.weekly_harmonics,
            yearly_harmonics=self.yearly_harmonics,
            lags=lags,
            rolling_windows=rolls,
            rolling_shift=shift,
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
            # Early stopping on a chronological tail guards against overfitting
            # without a manual iteration budget.
            early_stopping=self.early_stopping,
            validation_fraction=0.15,
            n_iter_no_change=25,
            random_state=0,
        ).fit(X[mask].to_numpy(), y[mask].to_numpy())
        return self

    def predict(self, timestamps) -> np.ndarray:
        f = _as_frame(timestamps)
        X = _predict_frame(self._history, f, self._config())
        X = X.reindex(columns=self._columns).fillna(0.0)
        return np.clip(self._model.predict(X.to_numpy()), 0, None)


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
class QuantileGradientBoostingModel(BaseModel):
    """Gradient boosting with a pinball (quantile) loss.

    Point forecasts answer "how many calls do we expect?". Staffing needs the
    riskier question: "how many calls might we get?". Because arrivals are
    stochastic, rostering to the mean leaves roughly half of all intervals
    under-staffed. Forecasting an upper quantile (e.g. P80) and staffing to that
    converts an unquantified service-level risk into an explicit, priced one.
    """

    interval_minutes: int = 30
    horizon: int = 48
    quantile: float = 0.8
    daily_harmonics: int = 6
    weekly_harmonics: int = 4
    yearly_harmonics: int = 3
    holidays: set = field(default_factory=set)
    learning_rate: float = 0.06
    max_iter: int = 300
    name: str = "quantile_gbm"

    def _config(self) -> FeatureConfig:
        day = getattr(self, "_day", int(24 * 60 / self.interval_minutes))
        lags, rolls, shift = safe_lag_plan(self.horizon, day)
        return FeatureConfig(
            interval_minutes=self.interval_minutes,
            daily_harmonics=self.daily_harmonics,
            weekly_harmonics=self.weekly_harmonics,
            yearly_harmonics=self.yearly_harmonics,
            lags=lags, rolling_windows=rolls, rolling_shift=shift,
            holidays=self.holidays,
        )

    def fit(self, df: pd.DataFrame) -> "QuantileGradientBoostingModel":
        self._history = df.copy().reset_index(drop=True)
        self._day = _rows_per_day(df)
        X, y = build_features(self._history, self._config())
        mask = X.notna().all(axis=1) & y.notna()
        self._columns = list(X.columns)
        self._model = HistGradientBoostingRegressor(
            loss="quantile", quantile=self.quantile,
            learning_rate=self.learning_rate, max_iter=self.max_iter,
            l2_regularization=1.0, early_stopping=True,
            validation_fraction=0.15, n_iter_no_change=25, random_state=0,
        ).fit(X[mask].to_numpy(), y[mask].to_numpy())
        return self

    def predict(self, timestamps) -> np.ndarray:
        f = _as_frame(timestamps)
        X = _predict_frame(self._history, f, self._config())
        X = X.reindex(columns=self._columns).fillna(0.0)
        return np.clip(self._model.predict(X.to_numpy()), 0, None)


@dataclass
class EnsembleModel(BaseModel):
    """Weighted blend of several fitted models (a stacked combination).

    Weights come from the selection layer. When they are *learned* by
    non-negative least squares on out-of-fold predictions they are deliberately
    **not** renormalised to sum to one: letting the total scale float lets the
    stack correct any residual level bias in its members, which matters because
    under-forecasting causes under-staffing.
    """

    members: list = field(default_factory=list)
    weights: np.ndarray | None = None
    intercept: float = 0.0
    normalize: bool = True
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
        if self.normalize:
            w = w / w.sum()
        return np.clip(w @ preds + self.intercept, 0, None)


def default_model_zoo(interval_minutes: int, holidays: set | None = None,
                      horizon: int = 48) -> list[BaseModel]:
    """Return the standard candidate set used by the selection layer."""
    holidays = holidays or set()
    return [
        SeasonalNaiveModel(interval_minutes=interval_minutes),
        HoltWintersModel(interval_minutes=interval_minutes),
        RidgeHarmonicModel(interval_minutes=interval_minutes,
                           holidays=holidays, horizon=horizon),
        GradientBoostingModel(interval_minutes=interval_minutes,
                              holidays=holidays, horizon=horizon),
    ]

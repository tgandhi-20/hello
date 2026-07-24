"""callforecast - self-improving call-volume forecasting for staffing.

A compact, production-shaped toolkit that:

* forecasts contact-centre call volume with a tournament of statistical /
  regression models (harmonic Ridge regression, gradient boosting,
  Holt-Winters, seasonal-naive, and an ensemble);
* selects the best model by rolling-origin backtesting (low error *and* low
  variance);
* translates the volume + AHT forecast into required staffing via Erlang C; and
* closes the loop - reconciling forecasts against actuals and retraining /
  re-selecting when accuracy drifts.

Quick start::

    from callforecast import ForecastEngine
    from callforecast.data import generate_synthetic, default_holidays

    history = generate_synthetic()
    engine = ForecastEngine(interval_minutes=30, horizon=48)
    engine.fit(history)
    plan = engine.forecast_staffing(48)
"""

from .pipeline import ForecastEngine, SeasonalAHTForecaster
from .models import (
    RidgeHarmonicModel, GradientBoostingModel, QuantileGradientBoostingModel,
    SeasonalNaiveModel, HoltWintersModel, EnsembleModel, safe_lag_plan,
)
from .selection import select_best_model, SelectionResult
from .staffing import StaffingConfig, required_agents, staffing_plan
from .monitor import ForecastMonitor, MonitorConfig
from .backtest import rolling_origin_backtest, all_metrics, wape, mape, rmse, bias

__all__ = [
    "ForecastEngine",
    "SeasonalAHTForecaster",
    "RidgeHarmonicModel",
    "GradientBoostingModel",
    "QuantileGradientBoostingModel",
    "SeasonalNaiveModel",
    "HoltWintersModel",
    "EnsembleModel",
    "safe_lag_plan",
    "select_best_model",
    "SelectionResult",
    "StaffingConfig",
    "required_agents",
    "staffing_plan",
    "ForecastMonitor",
    "MonitorConfig",
    "rolling_origin_backtest",
    "all_metrics",
    "wape",
    "mape",
    "rmse",
    "bias",
]

__version__ = "0.1.0"

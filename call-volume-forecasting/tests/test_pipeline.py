"""Tests covering the forecasting, staffing and self-improvement components."""

import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from callforecast.data import (
    generate_synthetic, SyntheticConfig, default_holidays, TIMESTAMP, VOLUME,
)
from callforecast.models import (
    SeasonalNaiveModel, RidgeHarmonicModel, HoltWintersModel,
    GradientBoostingModel, EnsembleModel,
)
from callforecast.backtest import wape, mape, rmse, bias, rolling_origin_backtest
from callforecast.staffing import (
    erlang_b, erlang_c_wait_probability, service_level, required_agents,
    StaffingConfig,
)
from callforecast.selection import select_best_model
from callforecast.monitor import ForecastMonitor, MonitorConfig
from callforecast.pipeline import ForecastEngine


@pytest.fixture(scope="module")
def data():
    return generate_synthetic(SyntheticConfig(days=120, interval_minutes=30))


# ---- metrics -------------------------------------------------------------
def test_metrics_perfect_forecast():
    a = np.array([10.0, 20.0, 30.0])
    assert wape(a, a) == 0.0
    assert rmse(a, a) == 0.0
    assert bias(a, a) == 0.0
    assert mape(a, a) == 0.0


def test_wape_and_bias_signs():
    a = np.array([100.0, 100.0])
    over = np.array([110.0, 110.0])
    assert bias(a, over) > 0          # over-forecast -> positive bias
    assert wape(a, over) == pytest.approx(0.1)


# ---- Erlang staffing -----------------------------------------------------
def test_erlang_b_known_value():
    # Erlang B for A=2 Erlangs, N=2 servers: (A^2/2!)/(1+A+A^2/2!) = 2/5 = 0.4.
    assert erlang_b(2, 2.0) == pytest.approx(0.4, abs=1e-9)
    # A=1 Erlang, N=1 server: 1/(1+1) = 0.5.
    assert erlang_b(1, 1.0) == pytest.approx(0.5, abs=1e-9)


def test_service_level_monotonic_in_agents():
    traffic, aht = 10.0, 300.0
    sls = [service_level(n, traffic, aht, 20.0) for n in range(11, 25)]
    assert all(x <= y + 1e-9 for x, y in zip(sls, sls[1:]))  # non-decreasing


def test_required_agents_meets_target():
    cfg = StaffingConfig(interval_minutes=30, target_service_level=0.8,
                         target_answer_seconds=20, shrinkage=0.3)
    res = required_agents(calls=500, aht_seconds=300, config=cfg)
    assert res.agents_required > res.traffic_erlangs
    assert res.service_level >= 0.8
    assert res.occupancy <= cfg.max_occupancy + 1e-9
    assert res.agents_scheduled >= res.agents_required


def test_zero_calls_needs_no_agents():
    cfg = StaffingConfig()
    res = required_agents(0, 300, cfg)
    assert res.agents_required == 0


# ---- models --------------------------------------------------------------
@pytest.mark.parametrize("model_cls", [
    SeasonalNaiveModel, RidgeHarmonicModel, HoltWintersModel, GradientBoostingModel,
])
def test_model_fit_predict_shapes(data, model_cls):
    train = data.iloc[:-56]
    test = data.iloc[-56:]
    model = model_cls(interval_minutes=30)
    model.fit(train)
    preds = model.predict(test)
    assert preds.shape == (56,)
    assert np.all(preds >= 0)
    assert np.isfinite(preds).all()


def test_ridge_beats_naive(data):
    """The core regression model should beat the naive baseline out-of-sample."""
    horizon = 56
    naive = rolling_origin_backtest(
        lambda: SeasonalNaiveModel(interval_minutes=30), data, horizon, n_folds=4)
    ridge = rolling_origin_backtest(
        lambda: RidgeHarmonicModel(interval_minutes=30), data, horizon, n_folds=4)
    assert ridge.metrics["wape"] <= naive.metrics["wape"]


def test_ensemble_predict(data):
    train = data.iloc[:-56]
    test = data.iloc[-56:]
    ens = EnsembleModel(members=[
        SeasonalNaiveModel(interval_minutes=30),
        RidgeHarmonicModel(interval_minutes=30),
    ])
    ens.fit(train)
    preds = ens.predict(test)
    assert preds.shape == (56,)
    assert np.all(preds >= 0)


# ---- selection -----------------------------------------------------------
def test_selection_returns_champion(data):
    from callforecast.models import default_model_zoo
    res = select_best_model(
        default_model_zoo(30), data, horizon=56, n_folds=3)
    assert res.champion_name in set(res.leaderboard["model"])
    # Leaderboard is sorted best-first.
    scores = res.leaderboard["score"].tolist()
    assert scores == sorted(scores)


# ---- monitor / self-improvement -----------------------------------------
def test_monitor_reconcile_and_retrain_flag(tmp_path):
    mon = ForecastMonitor(
        MonitorConfig(retrain_wape_threshold=0.1, min_new_actuals=4),
        state_path=str(tmp_path / "state.json"),
    )
    ts = pd.date_range("2024-01-01", periods=10, freq="30min")
    forecast = pd.DataFrame({"timestamp": ts, "forecast": np.full(10, 100.0)})
    mon.log_forecast(forecast, champion_name="ridge_harmonic")
    # Actuals are 40% higher -> large error -> should trigger retrain.
    actuals = pd.DataFrame({"timestamp": ts, "call_volume": np.full(10, 140.0)})
    acc = mon.reconcile(actuals)
    assert acc["n"] == 10
    # WAPE = sum|100-140| / sum|140| = 400/1400 = 2/7.
    assert acc["wape"] == pytest.approx(2 / 7, abs=1e-6)
    should, _ = mon.should_retrain()
    assert should is True


def test_absolute_threshold_disabled_by_default(tmp_path):
    """A default absolute limit below the noise floor would alarm forever."""
    mon = ForecastMonitor(MonitorConfig(min_new_actuals=4),
                          state_path=str(tmp_path / "state.json"))
    assert mon.config.retrain_wape_threshold is None
    ts = pd.date_range("2024-01-01", periods=10, freq="30min")
    mon.log_forecast(pd.DataFrame({"timestamp": ts, "forecast": np.full(10, 100.0)}))
    # 22% error: above a naive 0.15 limit, but no baseline to degrade from and
    # bias is what actually matters -> only the bias rule may fire.
    mon.reconcile(pd.DataFrame({"timestamp": ts, "call_volume": np.full(10, 128.0)}))
    mon.set_baseline(0.25)
    should, reason = mon.should_retrain()
    assert should is True and "bias" in reason  # caught by bias, not an absolute cap


def test_retrain_triggers_on_degradation_vs_baseline(tmp_path):
    """Relative detection auto-calibrates to the data's own noise floor."""
    mon = ForecastMonitor(MonitorConfig(min_new_actuals=4, degradation_ratio=1.25),
                          state_path=str(tmp_path / "state.json"))
    ts = pd.date_range("2024-01-01", periods=10, freq="30min")
    mon.log_forecast(pd.DataFrame({"timestamp": ts, "forecast": np.full(10, 100.0)}))
    # Alternating +/-20% keeps bias ~0 but drives WAPE to 0.20.
    act = np.tile([120.0, 80.0], 5)
    mon.reconcile(pd.DataFrame({"timestamp": ts, "call_volume": act}))
    mon.set_baseline(0.05)                      # model used to be much better
    assert mon.should_retrain()[0] is True
    mon.set_baseline(0.30)                      # 0.20 is now well within normal
    assert mon.should_retrain()[0] is False


def test_monitor_healthy_no_retrain(tmp_path):
    mon = ForecastMonitor(
        MonitorConfig(retrain_wape_threshold=0.2, min_new_actuals=4),
        state_path=str(tmp_path / "state.json"),
    )
    ts = pd.date_range("2024-01-01", periods=10, freq="30min")
    forecast = pd.DataFrame({"timestamp": ts, "forecast": np.full(10, 100.0)})
    mon.log_forecast(forecast)
    actuals = pd.DataFrame({"timestamp": ts, "call_volume": np.full(10, 102.0)})
    mon.reconcile(actuals)
    should, _ = mon.should_retrain()
    assert should is False


def test_monitor_state_persists(tmp_path):
    path = str(tmp_path / "state.json")
    mon = ForecastMonitor(MonitorConfig(), state_path=path)
    mon.set_baseline(0.08, "ensemble")
    mon.save()
    reloaded = ForecastMonitor(MonitorConfig(), state_path=path)
    assert reloaded.state.baseline_wape == pytest.approx(0.08)
    assert reloaded.state.champion_name == "ensemble"


# ---- horizon-safe lags & bias correction ---------------------------------
def test_safe_lag_plan_never_shorter_than_horizon():
    """Lags must be >= horizon or they'd depend on the model's own predictions."""
    from callforecast.models import safe_lag_plan
    for horizon in (1, 28, 56, 196, 197, 400):
        lags, windows, shift = safe_lag_plan(horizon, rows_per_day=28)
        assert all(l >= horizon for l in lags)
        assert shift >= horizon
        assert all(w > 0 for w in windows)


def test_ridge_is_not_systematically_biased(data):
    """Log-space fitting must be smearing-corrected or it under-forecasts."""
    horizon = 56
    res = rolling_origin_backtest(
        lambda: RidgeHarmonicModel(interval_minutes=30, horizon=horizon),
        data, horizon, n_folds=4)
    assert abs(res.metrics["bias"]) < 0.05


def test_smearing_raises_the_forecast_level(data):
    """The smearing factor should correct the median back up toward the mean."""
    train, test = data.iloc[:-56], data.iloc[-56:]
    plain = RidgeHarmonicModel(interval_minutes=30, horizon=56,
                               smearing=False).fit(train).predict(test)
    corrected = RidgeHarmonicModel(interval_minutes=30, horizon=56,
                                   smearing=True).fit(train).predict(test)
    assert corrected.sum() >= plain.sum()


def test_quantile_model_sits_above_the_mean(data):
    """A P80 forecast should exceed the point forecast most of the time."""
    from callforecast.models import QuantileGradientBoostingModel
    train, test = data.iloc[:-56], data.iloc[-56:]
    mean_fc = GradientBoostingModel(interval_minutes=30, horizon=56).fit(
        train).predict(test)
    p80 = QuantileGradientBoostingModel(
        interval_minutes=30, horizon=56, quantile=0.8).fit(train).predict(test)
    assert (p80 >= mean_fc).mean() > 0.6


def test_risk_aware_staffing_reduces_understaffing(data, tmp_path):
    """Staffing to a quantile should cover more intervals than staffing to the mean."""
    horizon = 56
    train, holdout = data.iloc[:-horizon], data.iloc[-horizon:]
    actual = holdout[VOLUME].to_numpy()

    def coverage(q):
        eng = ForecastEngine(interval_minutes=30, horizon=horizon, n_folds=3,
                             staffing_quantile=q,
                             monitor_state_path=str(tmp_path / f"s{q}.json"))
        eng.fit(train)
        plan = eng.forecast_staffing(horizon, log=False)
        col = "forecast_upper" if "forecast_upper" in plan.columns else "forecast"
        return float((plan[col].to_numpy() >= actual).mean())

    assert coverage(0.8) >= coverage(None)


# ---- end-to-end engine ---------------------------------------------------
def test_engine_end_to_end(data, tmp_path):
    holidays = default_holidays(range(2023, 2025))
    horizon = 56
    train = data.iloc[:-horizon]
    holdout = data.iloc[-horizon:]

    engine = ForecastEngine(
        interval_minutes=30, holidays=holidays, horizon=horizon, n_folds=3,
        monitor_state_path=str(tmp_path / "state.json"),
    )
    engine.fit(train)
    plan = engine.forecast_staffing(horizon)

    assert len(plan) == horizon
    assert {"forecast", "aht", "agents_required", "agents_scheduled",
            "service_level"}.issubset(plan.columns)
    assert (plan["agents_required"] >= 0).all()
    # Accuracy on the held-out horizon should be reasonable. This fixture uses
    # only 120 days of history (yearly seasonality cannot be learned yet) and
    # scores per-interval, so ~0.3 WAPE is expected; the 2-year demo is far
    # tighter. We simply assert the engine is materially better than a flat mean.
    w = wape(holdout[VOLUME].to_numpy(), plan["forecast"].to_numpy())
    flat = wape(holdout[VOLUME].to_numpy(),
                np.full(horizon, train[VOLUME].mean()))
    assert w < 0.32
    assert w < flat

    # Self-improvement loop runs without error.
    acc = engine.ingest_actuals(holdout)
    assert acc["n"] == horizon
    result = engine.maybe_improve(data, force=True)
    assert result["retrained"] is True

"""End-to-end demonstration of the call-volume forecasting engine.

Run:  python scripts/demo.py

It generates two years of realistic half-hourly data, holds out the final week,
runs the model tournament, forecasts the held-out week, translates the forecast
into an Erlang C staffing plan, and then demonstrates the self-improvement loop
by feeding the actuals back in.
"""

from __future__ import annotations

import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from callforecast import ForecastEngine  # noqa: E402
from callforecast.data import (  # noqa: E402
    TIMESTAMP, VOLUME, generate_synthetic, default_holidays, SyntheticConfig,
)

pd.set_option("display.width", 120)
pd.set_option("display.max_columns", 20)


def main() -> None:
    print("=" * 70)
    print("CALL-VOLUME FORECASTING FOR STAFFING  -  end-to-end demo")
    print("=" * 70)

    # Start from a clean monitor so the demo is reproducible run-to-run.
    state_path = "scratch/monitor_state.json"
    if os.path.exists(state_path):
        os.remove(state_path)

    cfg = SyntheticConfig(days=730, interval_minutes=30)
    data = generate_synthetic(cfg)
    holidays = default_holidays(range(2023, 2026))
    intervals_per_day = 28  # 07:00-21:00 half-hourly
    horizon = 7 * intervals_per_day  # forecast one week

    train = data.iloc[:-horizon]
    holdout = data.iloc[-horizon:]
    print(f"\nHistory: {len(train):,} intervals "
          f"({train[TIMESTAMP].min().date()} -> {train[TIMESTAMP].max().date()})")
    print(f"Holdout: {len(holdout):,} intervals (one week)")

    engine = ForecastEngine(
        interval_minutes=30, holidays=holidays,
        horizon=horizon, n_folds=5,
        staffing_quantile=0.85,   # roster against P85 volume, not the mean
        monitor_state_path=state_path,
    )

    print("\nRunning model tournament (rolling-origin backtest)...")
    selection = engine.fit(train)
    print("\nLeaderboard (lower score = better; score = mean WAPE + 0.5*std):")
    print(selection.leaderboard.to_string(index=False))
    print(f"\n>>> Champion: {selection.champion_name}")

    # Forecast the held-out week and build the staffing plan.
    plan = engine.forecast_staffing(horizon)
    plan = plan.merge(
        holdout[[TIMESTAMP, VOLUME]].rename(columns={VOLUME: "actual"}),
        on=TIMESTAMP, how="left",
    )

    from callforecast.backtest import wape, bias
    w = wape(plan["actual"], plan["forecast"])
    b = bias(plan["actual"], plan["forecast"])
    print(f"\nHeld-out week accuracy (per interval):  WAPE={w:.3f}   bias={b:+.3f}")

    # Daily-total accuracy - the headline KPI most planners quote.
    daily = plan.assign(day=plan[TIMESTAMP].dt.date).groupby("day")[
        ["forecast", "actual"]].sum()
    dw = wape(daily["actual"], daily["forecast"])
    print(f"Held-out week accuracy (per day):       WAPE={dw:.3f}")
    if plan[TIMESTAMP].dt.date.map(lambda d: d in holidays).any():
        print("(note: the held-out week spans public holidays - a deliberately "
              "hard test)")

    print("\nSample of the staffing plan (busiest 8 intervals):")
    cols = [TIMESTAMP, "forecast", "forecast_upper", "actual", "aht",
            "agents_required", "agents_scheduled", "service_level"]
    cols = [c for c in cols if c in plan.columns]
    print(plan.nlargest(8, "forecast")[cols].to_string(index=False))

    total_scheduled = plan["agents_scheduled"].sum()
    print(f"\nTotal agent-intervals to schedule this week: {total_scheduled:,}")

    # ---- risk-aware staffing ---------------------------------------------
    if "forecast_upper" in plan.columns:
        from callforecast.staffing import staffing_plan
        print("\n" + "-" * 70)
        print("RISK-AWARE STAFFING: mean forecast vs P85")
        print("-" * 70)
        act = plan["actual"].to_numpy()
        cov_mean = (plan["forecast"].to_numpy() >= act).mean()
        cov_p85 = (plan["forecast_upper"].to_numpy() >= act).mean()
        mean_plan = staffing_plan(
            plan[[TIMESTAMP, "forecast", "aht"]], engine.staffing_config)
        print(f"Intervals covered staffing to the mean: {cov_mean:6.1%}"
              f"   agent-intervals: {mean_plan['agents_scheduled'].sum():,}")
        print(f"Intervals covered staffing to P85:      {cov_p85:6.1%}"
              f"   agent-intervals: {total_scheduled:,}")
        uplift = total_scheduled / max(mean_plan['agents_scheduled'].sum(), 1) - 1
        print(f"Cost of that protection: {uplift:+.1%} more staffed time.")
        print("Arrival noise is irreducible, so this is the real lever left:\n"
              "buy service-level certainty explicitly instead of coin-flipping it.")

    # ---- self-improvement loop -------------------------------------------
    print("\n" + "-" * 70)
    print("SELF-IMPROVEMENT: feeding the week's actuals back to the monitor")
    print("-" * 70)
    acc = engine.ingest_actuals(holdout)
    print(f"Rolling accuracy after reconciliation: "
          f"WAPE={acc['wape']:.3f}  bias={acc['bias']:+.3f}  n={acc['n']}")
    should, reason = engine.monitor.should_retrain()
    print(f"Retrain decision: {should}  ({reason})")

    print("\nDemo complete.")


if __name__ == "__main__":
    main()

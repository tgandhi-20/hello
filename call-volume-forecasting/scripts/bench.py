"""Fixed-protocol benchmark harness for measuring forecasting improvements.

Runs the full model tournament on a deterministic 2-year synthetic dataset with
a one-week horizon and 6 rolling origins, then reports per-model WAPE, bias and
daily-aggregated WAPE. Results are saved to JSON so successive runs can be
compared directly.

    python scripts/bench.py baseline
    python scripts/bench.py improved
"""

from __future__ import annotations

import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from callforecast.backtest import wape  # noqa: E402
from callforecast.data import (  # noqa: E402
    TIMESTAMP, SyntheticConfig, default_holidays, generate_synthetic,
)
from callforecast.models import default_model_zoo  # noqa: E402
from callforecast.selection import select_best_model  # noqa: E402

HORIZON = 196   # one week of 28 open half-hourly intervals
FOLDS = 6

pd.set_option("display.width", 140)


def daily_wape(pred_df: pd.DataFrame) -> float:
    """WAPE on daily totals - the headline KPI planners quote."""
    d = pred_df.assign(day=pd.to_datetime(pred_df[TIMESTAMP]).dt.date)
    agg = d.groupby("day")[["actual", "forecast"]].sum()
    return wape(agg["actual"].to_numpy(), agg["forecast"].to_numpy())


def oracle_floor(data: pd.DataFrame) -> tuple[float, float]:
    """Error of a perfect forecaster that knows the true arrival rate.

    Arrivals are random, so even the true rate leaves an irreducible gap. This
    is the floor: it tells us how much of the remaining error is *available* to
    win and how much is pure noise.
    """
    interval = wape(data["call_volume"].to_numpy(), data["expected"].to_numpy())
    d = data.assign(day=data[TIMESTAMP].dt.date)
    agg = d.groupby("day")[["call_volume", "expected"]].sum()
    return interval, wape(agg["call_volume"].to_numpy(), agg["expected"].to_numpy())


def main(label: str = "run") -> None:
    data = generate_synthetic(
        SyntheticConfig(days=730, interval_minutes=30, include_expected=True))
    floor_i, floor_d = oracle_floor(data)
    data = data.drop(columns=["expected"])
    hol = default_holidays(range(2023, 2026))

    try:
        zoo = default_model_zoo(30, hol, horizon=HORIZON)
    except TypeError:                     # pre-improvement signature
        zoo = default_model_zoo(30, hol)

    t0 = time.time()
    sel = select_best_model(zoo, data, horizon=HORIZON, n_folds=FOLDS)
    elapsed = time.time() - t0

    rows = []
    for name, res in sel.results.items():
        rows.append({
            "model": name,
            "score": round(res.score, 4),
            "wape": round(res.metrics["wape"], 4),
            "daily_wape": round(daily_wape(res.predictions), 4),
            "bias": round(res.metrics["bias"], 4),
            "rmse": round(res.metrics["rmse"], 2),
            "wape_std": round(float(np.std([f["wape"] for f in res.per_fold])), 4),
        })
    df = pd.DataFrame(rows).sort_values("score").reset_index(drop=True)

    print(f"\n=== BENCHMARK [{label}] ===")
    print(df.to_string(index=False))
    print(f"\nchampion: {sel.champion_name}    tournament time: {elapsed:.1f}s")
    print(f"irreducible noise floor (oracle knows the true rate): "
          f"interval WAPE={floor_i:.4f}   daily WAPE={floor_d:.4f}")
    best = df.iloc[0]
    print(f"headroom remaining vs floor: "
          f"interval {best['wape'] - floor_i:+.4f}   "
          f"daily {best['daily_wape'] - floor_d:+.4f}")

    os.makedirs("scratch", exist_ok=True)
    out = {"label": label, "champion": sel.champion_name,
           "elapsed_s": round(elapsed, 1),
           "floor": {"interval": round(floor_i, 4), "daily": round(floor_d, 4)},
           "results": rows}
    with open(f"scratch/bench_{label}.json", "w") as fh:
        json.dump(out, fh, indent=2)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "run")

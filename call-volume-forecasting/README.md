# callforecast — self-improving call-volume forecasting for staffing

A compact, production-shaped Python toolkit that forecasts contact-centre **call
volume** and **average handle time (AHT)**, translates the forecast into the
**number of agents to staff** each interval, and **keeps improving itself** by
checking its forecasts against actuals and re-selecting the best model when
accuracy drifts.

It is built around the methods that real workforce-planning teams and
forecasting data scientists actually use — not one hand-picked model, but a
*tournament* of complementary models selected by honest out-of-sample
backtesting, followed by an Erlang C staffing calculation.

---

## Why this design (the research behind it)

Contact-centre arrivals have a very specific structure, and decades of
operations-research and forecasting practice converge on a small set of
techniques for it:

| Challenge | Best-practice approach | Where it lives here |
|---|---|---|
| Multiple overlapping seasonality (intraday, intra-week, yearly) | **Fourier / harmonic regression** (Hyndman's `fable`, Facebook Prophet) | `features.py`, `RidgeHarmonicModel` |
| No single model wins everywhere | **Backtest a stable of models and select the champion** | `selection.py` |
| Overfitting → volatile forecasts | **Regularisation** (Ridge L2) + **ensembling** decorrelated models | `models.py` |
| Honest, low-variance error estimates | **Rolling-origin (walk-forward) cross-validation** | `backtest.py` |
| Turning volume into headcount | **Erlang C** queueing model + shrinkage | `staffing.py` |
| Keeping accuracy up over time | **Forecast-vs-actual reconciliation, drift detection, auto-retrain** | `monitor.py`, `pipeline.py` |

The right KPI matters too: we lead with **WAPE** (weighted absolute percentage
error) rather than MAPE, because MAPE explodes on the low-volume intervals that
open and close every business day. WAPE is what most WFM tools report.

> On "no variance": perfectly variance-free forecasting is impossible — real
> arrivals are stochastic (roughly Poisson), so there is an irreducible noise
> floor. What this system *does* is drive error and its **variance across
> validation folds** as low as the data allows, and prove it with backtesting
> rather than asserting it. The selection score explicitly penalises fold-to-fold
> instability (`mean(WAPE) + 0.5·std(WAPE)`).

---

## The model stable

All models share one tiny interface — `fit(df)` then `predict(timestamps)`:

- **`SeasonalNaiveModel`** — "same interval, last week". The benchmark every
  other model must beat.
- **`RidgeHarmonicModel`** — the core **statistical regression**: L2-regularised
  linear regression on Fourier terms (daily + weekly + yearly), calendar flags
  (weekend, holiday, near-holiday), a linear trend, and autoregressive lags.
  Fits on `log1p(volume)` to stabilise count variance.
- **`GradientBoostingModel`** — histogram gradient boosting with a Poisson loss;
  captures non-linear interactions (e.g. holiday × hour-of-day) a linear model
  misses.
- **`HoltWintersModel`** — a dependency-free level/trend + weekly-seasonal
  decomposition; robust when history is short.
- **`EnsembleModel`** — inverse-error weighted blend of the strongest members.

The **selection tournament** backtests all of them on identical rolling-origin
folds, builds an ensemble of the top performers, and promotes whichever has the
best stability-penalised WAPE.

---

## Staffing (Erlang C)

`staffing.py` converts each interval's forecast into a roster:

```
offered load (Erlangs) = forecast_calls × AHT_seconds / interval_seconds
agents_required        = smallest N meeting the service-level AND occupancy targets
agents_scheduled       = agents_required / (1 − shrinkage)
```

It reports service level (e.g. "80 % answered in 20 s"), occupancy, and average
speed of answer (ASA). An occupancy cap prevents the model from rostering agents
at unsustainable utilisation.

---

## The self-improvement loop

```
forecast ──▶ log_forecast() ──▶ (time passes) ──▶ ingest_actuals()
    ▲                                                    │
    │                                                    ▼
 maybe_improve()  ◀── should_retrain()?  ◀──  reconcile & score (rolling WAPE, bias)
```

`ForecastMonitor` persists its state to JSON so the loop survives restarts. It
flags a retrain when rolling WAPE crosses an absolute threshold, degrades past a
multiple of the training-time baseline, or when persistent bias appears.
`ForecastEngine.maybe_improve()` then re-runs the whole tournament on the
enlarged history — so the champion can *change* as conditions change.

---

## Quick start

```bash
pip install -r requirements.txt
python scripts/demo.py        # end-to-end demo on 2 years of synthetic data
```

```python
from callforecast import ForecastEngine
from callforecast.data import generate_synthetic, default_holidays

history = generate_synthetic()                       # or load_call_data("calls.csv")
engine = ForecastEngine(interval_minutes=30, horizon=48,
                        holidays=default_holidays(range(2023, 2026)))

engine.fit(history)                                  # runs the tournament
print(engine.selection.leaderboard)                  # who won, and by how much

plan = engine.forecast_staffing(horizon=48)          # volume + AHT + agents
print(plan[["timestamp", "forecast", "agents_scheduled", "service_level"]])

# later, when the real numbers arrive:
engine.ingest_actuals(actuals_df)
print(engine.maybe_improve(updated_history))         # retrains only if needed
```

### Using your own data

Replace `generate_synthetic()` with `load_call_data("path.csv")`. The CSV needs:

| column | meaning |
|---|---|
| `timestamp` | interval start (any parseable datetime) |
| `call_volume` | calls offered in the interval |
| `aht` | *(optional)* average handle time in seconds |

Business-hours-only data (e.g. open 07:00–21:00) is handled correctly — the
engine learns the observed calendar and only forecasts real open intervals.

---

## Project layout

```
callforecast/
  data.py        realistic synthetic generator + CSV loader + holiday calendar
  features.py    Fourier multi-seasonality + calendar + lag/rolling features
  models.py      the model stable (naive, ridge, GBM, Holt-Winters, ensemble)
  backtest.py    rolling-origin CV + WAPE / MAPE / RMSE / MASE / bias
  selection.py   the tournament: backtest all, ensemble the best, pick champion
  staffing.py    Erlang B/C, service level, occupancy, ASA, shrinkage
  monitor.py     forecast↔actual reconciliation, drift detection, retrain trigger
  pipeline.py    ForecastEngine — the end-to-end orchestrator
scripts/demo.py  runnable end-to-end demonstration
tests/           pytest suite (metrics, Erlang, models, selection, monitor, e2e)
```

Run the tests with `python -m pytest tests/`.

---

## Sample output

```
Leaderboard (lower score = better; score = mean WAPE + 0.5*std):
            model  score   wape   mape    rmse    bias   mase
gradient_boosting 0.2222 0.2164 0.2379 50.68  -0.106  0.341
   ridge_harmonic 0.2348 0.2287 0.2252 53.27  -0.157  0.361
         ensemble 0.2372 0.2297 0.2680 52.20  -0.095  0.361
   seasonal_naive 0.3861 0.3548 0.5141 79.80   0.023  0.550
     holt_winters 0.4503 0.4217 0.7542 85.07   0.051  0.661

>>> Champion: gradient_boosting
Held-out week accuracy (per day): WAPE=0.133   (week spans public holidays)
```

## Limitations & sensible next steps

- Interval-level count forecasts have an irreducible Poisson noise floor; quote
  daily/weekly WAPE for headline accuracy and interval WAPE for rostering risk.
- Row-based lag alignment assumes a roughly consistent daily schedule; Fourier
  features carry the seasonality when the schedule varies.
- Natural extensions: prediction intervals (quantile GBM / conformal), explicit
  event/marketing regressors, hierarchical reconciliation across queues/skills,
  and swapping in `statsmodels` ETS/SARIMA or Prophet as additional candidates —
  the tournament will adopt them automatically if they win.
```

_This is a self-contained project in the `call-volume-forecasting/` subdirectory
and does not affect the rest of the repository._

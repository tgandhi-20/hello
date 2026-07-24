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
| Multi-step forecasts drifting | **Horizon-safe (direct) lags** instead of recursive feedback | `safe_lag_plan` |
| Log-space fitting under-forecasts | **Duan's smearing estimator** to recover the conditional mean | `RidgeHarmonicModel` |
| Combining correlated models | **Stacking via non-negative least squares** on out-of-fold predictions | `selection.py` |
| Overfitting → volatile forecasts | **Regularisation** (auto-tuned Ridge L2) + early stopping | `models.py` |
| Honest, low-variance error estimates | **Rolling-origin (walk-forward) cross-validation** | `backtest.py` |
| Turning volume into headcount | **Erlang C** queueing model + shrinkage | `staffing.py` |
| Arrivals are random → 50/50 staffing | **Quantile (pinball-loss) forecasts** for risk-aware rostering | `QuantileGradientBoostingModel` |
| Keeping accuracy up over time | **Forecast-vs-actual reconciliation, drift detection, auto-retrain** | `monitor.py`, `pipeline.py` |

The right KPI matters too: we lead with **WAPE** (weighted absolute percentage
error) rather than MAPE, because MAPE explodes on the low-volume intervals that
open and close every business day. WAPE is what most WFM tools report.

### On "no variance" — and how close we actually are

Perfectly variance-free forecasting is impossible: arrivals are stochastic
(roughly Poisson), so there is an **irreducible noise floor**. Rather than assert
that, this project *measures* it. The synthetic generator can emit the latent
arrival rate (`include_expected=True`), so `scripts/bench.py` computes the error
an oracle that knew the true rate would still make:

```
champion ensemble        interval WAPE 0.2005    daily WAPE 0.0402
irreducible noise floor  interval WAPE 0.2059    daily WAPE 0.0429
```

**The model is at the noise floor.** Essentially all remaining error is arrival
randomness, not model error, so extra model complexity would buy nothing. The
selection score also explicitly penalises fold-to-fold instability
(`mean(WAPE) + 0.5·std(WAPE)`), and fold-to-fold std is down to ~0.014.

That result reframes the real problem — see *risk-aware staffing* below.

---

## The model stable

All models share one tiny interface — `fit(df)` then `predict(timestamps)`:

- **`SeasonalNaiveModel`** — "same interval, last week". The benchmark every
  other model must beat.
- **`RidgeHarmonicModel`** — the core **statistical regression**: L2-regularised
  linear regression on Fourier terms (daily + weekly + yearly), calendar flags
  (weekend, holiday, near-holiday), a linear trend, and horizon-safe
  autoregressive lags. Fits on `log1p(volume)` to stabilise count variance, with
  the penalty auto-tuned and the back-transform smearing-corrected.
- **`GradientBoostingModel`** — histogram gradient boosting with a Poisson loss
  and early stopping; captures non-linear interactions (e.g. holiday ×
  hour-of-day) a linear model misses.
- **`QuantileGradientBoostingModel`** — pinball-loss boosting used for
  **risk-aware staffing** (see below).
- **`HoltWintersModel`** — a dependency-free level/trend + weekly-seasonal
  decomposition; robust when history is short.
- **`EnsembleModel`** — **stacked** blend whose weights are learned by
  non-negative least squares on out-of-fold predictions.

The **selection tournament** backtests all of them on identical rolling-origin
folds, builds an ensemble of the top performers, and promotes whichever has the
best stability-penalised WAPE.

### Two fixes that mattered most

**Horizon-safe lags.** A model forecasting *H* steps ahead can only use a lag
`L` if `L ≥ H` — otherwise the later steps must be filled with the model's own
earlier *predictions*, and error compounds across the horizon. `safe_lag_plan()`
snaps lags up to whole weeks covering the horizon, so every autoregressive
feature is a genuine observation. This removes recursion entirely (the whole
horizon is now one vectorised pass) and eliminated most of the forecast bias.

**Smearing correction.** Fitting on `log1p(y)` and back-transforming with
`expm1` returns the conditional *median*, not the mean. For right-skewed
arrival counts the mean is higher, so the naive back-transform **systematically
under-forecasts** — the dangerous direction for staffing. Duan's smearing
estimator rescales by the empirical mean of `exp(residual)`, moving Ridge's bias
from −0.158 to +0.011.

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

### Risk-aware staffing (the lever that's actually left)

Once the forecast sits at the noise floor, the remaining question is not
accuracy but **risk**. A perfect *mean* forecast is still exceeded by actual
arrivals about half the time — so rostering to the mean under-staffs ~50 % of
intervals. Setting `staffing_quantile` fits an upper-quantile volume model and
rosters against that instead. From the demo:

| Rostering basis | Intervals covered | Agent-intervals |
|---|---|---|
| Mean forecast | 48.5 % | 7,188 |
| P85 forecast | 83.7 % | 9,357 (+30.2 %) |

The point is not that P85 is always right — it is that this turns an *unpriced,
invisible* service-level risk into an explicit dial a planner can set against
budget.

---

## The self-improvement loop

```
forecast ──▶ log_forecast() ──▶ (time passes) ──▶ ingest_actuals()
    ▲                                                    │
    │                                                    ▼
 maybe_improve()  ◀── should_retrain()?  ◀──  reconcile & score (rolling WAPE, bias)
```

`ForecastMonitor` persists its state to JSON so the loop survives restarts.

Detection is **relative by default**, which matters more than it sounds. An
absolute WAPE limit is a trap: interval accuracy is bounded below by the queue's
own arrival noise (~0.20 here), so a fixed limit like 0.15 is unreachable and
fires on every check — an alarm that is always on is an alarm nobody reads.
Comparing against the baseline recorded at training time auto-calibrates to
whatever floor the data actually has. A retrain is flagged when rolling error
degrades past a multiple of that baseline, or when persistent **bias** appears
(bias is direction-ful — it means systematic over- or under-staffing — so it is
worth catching even when overall error looks fine).
`ForecastEngine.maybe_improve()` then re-runs the whole tournament on the
enlarged history — so the champion can *change* as conditions change.

---

## Quick start

```bash
pip install -r requirements.txt
python scripts/demo.py            # end-to-end demo on 2 years of synthetic data
python scripts/bench.py myrun     # accuracy vs the irreducible noise floor
```

```python
from callforecast import ForecastEngine
from callforecast.data import generate_synthetic, default_holidays

history = generate_synthetic()                       # or load_call_data("calls.csv")
engine = ForecastEngine(interval_minutes=30, horizon=48,
                        holidays=default_holidays(range(2023, 2026)),
                        staffing_quantile=0.85)      # roster for risk, not the mean

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
         ensemble 0.2022 0.1964 0.2277 44.98  -0.003  0.310
   ridge_harmonic 0.2035 0.1977 0.2324 45.10   0.015  0.312
gradient_boosting 0.2159 0.2095 0.2479 47.03  -0.015  0.330
   seasonal_naive 0.3861 0.3548 0.5141 79.80   0.023  0.550
     holt_winters 0.4503 0.4217 0.7542 85.07   0.051  0.661

>>> Champion: ensemble
Held-out week accuracy (per day): WAPE=0.041   (week spans public holidays)
```

### Measured improvement

Same protocol (`scripts/bench.py`): 2 years of data, one-week horizon, 6 rolling
origins.

| Metric (champion) | Before | After | Change |
|---|---|---|---|
| Interval WAPE | 0.2222 | **0.2005** | −9.8 % |
| **Daily WAPE** | 0.1113 | **0.0402** | **−64 %** |
| Forecast bias | −0.1063 | **−0.0048** | −95 % |
| RMSE | 50.96 | **45.22** | −11 % |
| Fold-to-fold WAPE std | 0.0167 | **0.0142** | −15 % |
| Tournament runtime | 32.9 s | **18.8 s** | −43 % |

The ensemble also went from *losing* to its best member to winning — the switch
from inverse-error weights to NNLS stacking.

## Limitations & sensible next steps

- The accuracy work is **done for this data**: the champion is at the measured
  noise floor. On real data, re-run `scripts/bench.py` — if the gap to your own
  floor is large, the modelling has headroom; if not, invest in the risk layer.
- Ensemble weights are fitted on the same out-of-fold predictions the ensemble
  is scored on, so its backtest number carries a small optimistic bias (a few
  parameters over thousands of rows). The champion margin over Ridge (0.2005 vs
  0.2017) is within that uncertainty — treat them as tied.
- Quantile coverage is calibrated on synthetic data (P85 → 83.7 %); on real data
  verify coverage before trusting the dial, and consider conformal prediction
  for distribution-free guarantees.
- Row-based lag alignment assumes a roughly consistent daily schedule; Fourier
  features carry the seasonality when the schedule varies.
- Natural extensions: explicit event/marketing regressors, hierarchical
  reconciliation across queues/skills, and swapping in `statsmodels` ETS/SARIMA
  or Prophet as additional candidates — the tournament will adopt them
  automatically if they win.
```

_This is a self-contained project in the `call-volume-forecasting/` subdirectory
and does not affect the rest of the repository._

# Handoff: `callforecast` — self-improving call-volume forecasting for staffing

This document is a **complete, self-contained context dump** for continuing work
on this project in a fresh conversation. It covers what was built, why each
design decision was made, what was measured, and what is still open.

---

## 1. Status at a glance

| | |
|---|---|
| **Repo** | `tgandhi-20/hello` (GitHub) |
| **Branch** | `claude/call-volume-forecast-model-5zzfsf` (pushed) |
| **Location in repo** | `call-volume-forecasting/` subdirectory |
| **Commits** | `bba3718` (initial build) → `4af621a` (accuracy improvements) |
| **Size** | ~2,150 lines across 11 files |
| **Tests** | 24 passing (`python -m pytest tests/`) |
| **Deps** | `numpy`, `pandas`, `scikit-learn` (scipy comes via sklearn) |

The rest of the `hello` repo is an unrelated static web app ("Fintrack" expense
tracker). This project is entirely self-contained in its subdirectory and
touches nothing else.

### Original request

> Build a statistical regression ML model which uses past call volume data and
> AHT to forecast future volume required for staffing. Think carefully, research
> and build a model which is accurate and self-improves, does its own
> forecasting, checks it against actuals and builds the best model with no
> variance. Deep thinking and planning rather than executing. Research what the
> best companies and workforce planners and data scientists use.

Followed by: *"improve the forecasting model"* — which produced the measured
improvements in §6.

---

## 2. What the system does

1. **Forecasts** contact-centre call volume and AHT at interval granularity
   (default half-hourly).
2. **Selects** the best model by running a *tournament* — every candidate is
   backtested on identical rolling-origin folds and the winner is promoted.
3. **Converts** the volume + AHT forecast into required agents via **Erlang C**
   (service level, occupancy cap, ASA, shrinkage).
4. **Self-improves** — logs every forecast, reconciles against actuals as they
   arrive, monitors rolling error/bias, and retrains + re-selects on drift.

---

## 3. Domain research this is based on

Techniques chosen because they are what workforce-planning teams and forecasting
practitioners actually use:

| Challenge | Approach | Where |
|---|---|---|
| Multiple overlapping seasonality (intraday / intra-week / yearly) | **Fourier (harmonic) regression** — Hyndman's `forecast`/`fable`, Prophet | `features.py` |
| No single model wins everywhere | **Backtest a stable and select a champion** | `selection.py` |
| Multi-step forecasts drifting | **Horizon-safe (direct) lags** instead of recursive feedback | `models.safe_lag_plan` |
| Log-space fitting under-forecasts | **Duan's smearing estimator** | `RidgeHarmonicModel` |
| Combining correlated models | **Stacking via non-negative least squares** on out-of-fold preds | `selection._stack_weights` |
| Honest error estimates | **Rolling-origin / walk-forward CV** | `backtest.py` |
| Volume → headcount | **Erlang C** + shrinkage | `staffing.py` |
| Arrivals are random → 50/50 staffing | **Quantile (pinball loss) forecasts** | `QuantileGradientBoostingModel` |
| Accuracy decays over time | **Reconciliation, drift detection, auto-retrain** | `monitor.py` |

**Metric choice:** WAPE (`Σ|a−f| / Σ|a|`) is the headline, not MAPE. MAPE
explodes on the low-volume intervals that open and close every business day.
WAPE is what most WFM tools report. MASE (vs seasonal-naive) and signed bias are
also tracked — **bias matters independently** because it means systematic over-
or under-staffing.

---

## 4. Architecture

```
call-volume-forecasting/
├── callforecast/
│   ├── data.py        (182)  synthetic generator, CSV loader, holiday calendar
│   ├── features.py    (121)  Fourier multi-seasonality + calendar + lag/rolling
│   ├── models.py      (470)  the model stable
│   ├── backtest.py    (171)  rolling-origin CV + WAPE/MAPE/RMSE/MASE/bias
│   ├── selection.py   (137)  the tournament + NNLS stacking
│   ├── staffing.py    (137)  Erlang B/C, service level, occupancy, ASA, shrinkage
│   ├── monitor.py     (146)  forecast↔actual reconciliation, drift, retrain trigger
│   ├── pipeline.py    (195)  ForecastEngine orchestrator
│   └── __init__.py    (60)   public API
├── scripts/
│   ├── demo.py        (128)  end-to-end demonstration
│   └── bench.py       (106)  fixed-protocol benchmark + noise-floor measurement
├── tests/
│   └── test_pipeline.py (293) 24 tests
├── requirements.txt
├── README.md
└── HANDOFF.md         (this file)
```

### Model interface

Every model implements the same two methods:

```python
model.fit(df)                     # df: columns [timestamp, call_volume, aht]
model.predict(timestamps)         # -> np.ndarray of expected volume
```

### The model stable (`models.py`)

| Model | Role |
|---|---|
| `SeasonalNaiveModel` | "same interval, last week" — the benchmark to beat |
| `RidgeHarmonicModel` | **the core statistical regression** (see below) |
| `GradientBoostingModel` | Poisson-loss histogram GBM, non-linear interactions |
| `QuantileGradientBoostingModel` | pinball loss, for risk-aware staffing |
| `HoltWintersModel` | level/trend + weekly seasonal; robust on short history |
| `EnsembleModel` | stacked blend, NNLS weights |

### Public API

```python
from callforecast import ForecastEngine
from callforecast.data import generate_synthetic, load_call_data, default_holidays

engine = ForecastEngine(
    interval_minutes=30,
    horizon=196,                  # one week of 28 open half-hourly intervals
    holidays=default_holidays(range(2023, 2026)),
    n_folds=6,
    staffing_quantile=0.85,       # roster for risk, not the mean (optional)
    monitor_state_path="scratch/monitor_state.json",
)

engine.fit(history)               # runs the tournament
engine.selection.leaderboard      # DataFrame: who won, and by how much
plan = engine.forecast_staffing(horizon)   # volume + AHT + agents + SL
engine.ingest_actuals(actuals)    # close the loop
engine.maybe_improve(full_history)         # retrains only if drift detected
```

**Input schema** (`load_call_data`): `timestamp` (datetime), `call_volume`
(numeric), `aht` (seconds, optional). Business-hours-only data is handled —
the engine learns the observed calendar and only forecasts real open intervals.

---

## 5. The four non-obvious design decisions

These are the parts most likely to be misunderstood or accidentally reverted.

### 5.1 Horizon-safe lags (removes recursion entirely)

A model forecasting *H* steps ahead can only use a lag `L` if `L ≥ H`.
Otherwise the later steps must be filled with the model's **own earlier
predictions**, and error compounds across the horizon — the classic weakness of
recursive multi-step forecasting.

```python
def safe_lag_plan(horizon, rows_per_day):
    season = 7 * rows_per_day
    base = season * max(1, math.ceil(horizon / season))
    return (base, base + season), (season,), base   # lags, windows, rolling_shift
```

Lags snap up to whole weeks covering the horizon → every autoregressive feature
is a genuine observation. Rolling means are shifted by the same amount. Because
nothing depends on model output, the **entire horizon is predicted in one
vectorised pass** (this is also why runtime dropped 43 %).

> ⚠️ `rows_per_day` is counted from the data (`_rows_per_day`), **not** derived
> from `24*60/interval_minutes` — a business-hours centre stores 28 half-hourly
> rows/day, not 48. Using 48 silently misaligns every lag.

### 5.2 Smearing bias correction

`RidgeHarmonicModel` fits on `log1p(volume)` to stabilise count variance. But
back-transforming with `expm1` returns the conditional **median**, not the mean.
Arrival counts are right-skewed, so this **systematically under-forecasts** —
the dangerous direction for staffing.

Duan's smearing estimator:

```python
resid   = y_log - ridge.predict(Z)
smear   = mean(exp(resid))                    # ≥ 1 by Jensen
forecast = exp(eta) * smear - 1.0             # recovers the conditional mean
```

This alone moved Ridge's bias from **−0.158 → +0.011**.

### 5.3 NNLS stacking (not inverse-error weights)

Inverse-error weighting cannot beat its best member when members are strongly
correlated — and forecasting models always are. Weights are instead learned by
non-negative least squares on the **out-of-fold** predictions the backtest
already produced.

Weights are deliberately **not renormalised to sum to 1**, so the stack can also
absorb residual level bias. Falls back to inverse-error weights if the fit is
degenerate.

> ⚠️ Known caveat: weights are fitted on the same OOF predictions the ensemble
> is then scored on, so the ensemble's backtest number is **slightly
> optimistic**. Its margin over Ridge (0.2005 vs 0.2017) is within that
> uncertainty — **treat them as tied.**

### 5.4 Relative drift detection

The original default `retrain_wape_threshold=0.15` sat **below the achievable
noise floor (~0.20)**, so it would have fired on every single check forever — an
alarm that is always on is an alarm nobody reads.

Detection now defaults to **degradation vs the baseline recorded at training
time**, which auto-calibrates to whatever floor the data actually has.
`retrain_wape_threshold` defaults to `None` and is opt-in. Bias is still checked
independently (`|bias| > 0.05`).

---

## 6. Measured results

Protocol (`scripts/bench.py`): 2 years synthetic half-hourly data, one-week
horizon (196 intervals), 6 rolling origins, fixed seed.

### Champion before → after

| Metric | Before | After | Change |
|---|---|---|---|
| Interval WAPE | 0.2222 | **0.2005** | −10 % |
| **Daily WAPE** | 0.1113 | **0.0402** | **−64 %** |
| Forecast bias | −0.1063 | **−0.0048** | −95 % |
| RMSE | 50.96 | **45.22** | −11 % |
| Fold-to-fold WAPE std | 0.0167 | **0.0142** | −15 % |
| Tournament runtime | 32.9 s | **18.8 s** | −43 % |

### Leaderboard (after)

```
            model  score   wape  daily_wape    bias  rmse  wape_std
         ensemble 0.2076 0.2005      0.0402 -0.0048 45.22    0.0142
   ridge_harmonic 0.2086 0.2017      0.0436  0.0110 45.31    0.0138
gradient_boosting 0.2218 0.2141      0.0476 -0.0168 47.65    0.0155
   seasonal_naive 0.4033 0.3701      0.1454  0.0470 80.88    0.0666
     holt_winters 0.4881 0.4484      0.3999  0.0561 86.43    0.0793
```

Selection score = `mean(WAPE) + 0.5·std(WAPE)` — deliberately penalises
fold-to-fold instability, so it rewards low error **and** low variance.

### ⭐ The key finding: the model is at the irreducible noise floor

The synthetic generator can emit the latent arrival rate
(`SyntheticConfig(include_expected=True)`), so the benchmark computes the error
an **oracle that knew the true rate** would still make:

```
champion ensemble        interval WAPE 0.2005    daily WAPE 0.0402
irreducible noise floor  interval WAPE 0.2059    daily WAPE 0.0429
```

**Essentially all remaining error is Poisson arrival randomness, not model
error.** Further model complexity would buy nothing on this data.

This is the honest answer to the original "no variance" goal: perfectly
variance-free forecasting is impossible; what *is* possible is reaching the
floor and **proving** it. (Champion sitting a hair *below* the floor is sampling
variation — the floor is computed over the full series, the champion over the
6 backtest folds.)

### Risk-aware staffing (what the floor finding motivated)

At the noise floor the remaining lever is **risk, not accuracy**. A perfect
*mean* forecast is still exceeded by actual arrivals ~half the time:

| Rostering basis | Intervals covered | Agent-intervals |
|---|---|---|
| Mean forecast | **48.5 %** (a coin flip) | 7,188 |
| P85 forecast | **83.7 %** | 9,357 (+30.2 %) |

P85 targeted 85 %, achieved 83.7 % — well calibrated. The value is not that P85
is "correct", it is that an invisible, unpriced service-level risk becomes an
explicit dial a planner sets against budget.

---

## 7. How to run

```bash
cd call-volume-forecasting
pip install -r requirements.txt

python scripts/demo.py          # end-to-end demo (~25s)
python scripts/bench.py myrun   # benchmark vs the noise floor (~20s)
python -m pytest tests/ -q      # 24 tests (~19s)
```

`bench.py` writes `scratch/bench_<label>.json` so successive runs can be
compared directly. **Use it to validate any future model change** — that is the
whole point of it existing.

---

## 8. Caveats (please preserve these — they are honest limits, not TODOs)

1. **Ensemble score is slightly optimistic** (see §5.3). Ensemble ≈ Ridge.
2. **Quantile coverage is calibrated on synthetic data.** On real data verify
   coverage before trusting the dial; consider conformal prediction for
   distribution-free guarantees.
3. **All results are on synthetic data.** The generator is realistic
   (double-humped intraday curve, weekday profile, yearly seasonality, holidays,
   overdispersed counts) but it is not a substitute for a real queue. Re-run
   `bench.py` on real data before claiming these numbers.
4. **Row-based lag alignment** assumes a roughly consistent daily schedule.
   Fourier features carry the seasonality when the schedule varies.
5. The **holiday calendar is a minimal fixed-date set** (`default_holidays`).
   Real deployments should swap in the `holidays` package or an internal
   calendar — the modelling code only needs a `set[datetime.date]`.

---

## 9. Open items / suggested next steps

**Open request from the user (not completed):**
- They asked to **move this into its own new GitHub repo**. Blocked: the Claude
  GitHub App lacks `Administration` permission, so `create_repository` returns
  `403 Resource not accessible by integration`. Either (a) the user creates an
  empty repo manually and it gets pushed there, or (b) an admin grants the
  permission. Pushing to an *existing* repo works fine.
- No PR has been opened (the user has not asked for one).

**Sensible technical next steps:**
- Explicit event/marketing regressors (campaigns, outages, billing cycles) —
  likely the biggest real-data win, since these cause the spikes calendars miss.
- Hierarchical reconciliation across queues/skills/sites (`MinT`/`OLS`), so
  queue-level forecasts sum consistently to the site total.
- Conformal prediction intervals for distribution-free coverage guarantees.
- Add `statsmodels` ETS/SARIMA or Prophet as extra tournament candidates — the
  selection layer will adopt them automatically if they win, no plumbing needed.
- Intraday re-forecasting (update the day's remaining intervals from actuals so
  far) — standard practice in mature WFM.
- Shrinkage modelling (forecast absence/shrinkage itself rather than a constant).

---

## 10. Notes for whoever picks this up

- **Don't "fix" the lags back to short ones.** `lag_28` looks tempting and is
  the single biggest accuracy regression available (§5.1).
- **Don't remove the smearing factor** thinking it's a fudge — it is Duan (1983)
  and it is why bias is near zero (§5.2).
- **Don't set an absolute retrain threshold** without first measuring the queue's
  noise floor (§5.4).
- **Measure, don't assert.** Every accuracy claim in this project came from
  `scripts/bench.py` under a fixed protocol. If you change a model, re-run it
  and compare the JSON. Claims without a benchmark run should be treated as
  unverified.

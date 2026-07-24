"""Automatic model selection - "builds the best model" by competition.

Every candidate is backtested with identical rolling-origin folds, then:

1. the champion is the model with the best (lowest) stability-penalised WAPE;
2. an inverse-error weighted **ensemble** of the strong candidates is also
   built and backtested - if it beats the single champion, it wins.

This is exactly how mature forecasting platforms operate: they do not trust a
hand-picked model, they hold a tournament on out-of-sample data and promote the
winner. Re-running this tournament on fresh data is what makes the system
*self-improving*.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .backtest import BacktestResult, rolling_origin_backtest
from .models import BaseModel, EnsembleModel


@dataclass
class SelectionResult:
    champion: BaseModel
    champion_name: str
    leaderboard: pd.DataFrame           # ranked candidates + metrics
    results: dict[str, BacktestResult]  # name -> full backtest result


def _factory(model: BaseModel):
    """Return a callable producing fresh copies of a template model."""
    template = copy.deepcopy(model)
    return lambda: copy.deepcopy(template)


def select_best_model(
    candidates: list[BaseModel],
    df: pd.DataFrame,
    horizon: int,
    n_folds: int = 6,
    build_ensemble: bool = True,
    ensemble_top_k: int = 3,
) -> SelectionResult:
    """Backtest all candidates, optionally form an ensemble, return the winner."""
    results: dict[str, BacktestResult] = {}
    for model in candidates:
        res = rolling_origin_backtest(
            _factory(model), df, horizon=horizon, n_folds=n_folds,
            model_name=model.name,
        )
        results[model.name] = res

    ranked = sorted(results.values(), key=lambda r: r.score)

    if build_ensemble and len(ranked) >= 2:
        top = ranked[:ensemble_top_k]
        # Inverse-error weights: better backtest score -> larger weight.
        scores = np.array([r.score for r in top])
        weights = (1.0 / np.clip(scores, 1e-6, None))
        weights = weights / weights.sum()

        name_to_model = {m.name: m for m in candidates}
        members = [copy.deepcopy(name_to_model[r.model_name]) for r in top]
        ens_template = EnsembleModel(members=members, weights=weights)

        ens_res = rolling_origin_backtest(
            _factory(ens_template), df, horizon=horizon, n_folds=n_folds,
            model_name="ensemble",
        )
        results["ensemble"] = ens_res
        ranked = sorted(results.values(), key=lambda r: r.score)

    champion_res = ranked[0]
    if champion_res.model_name == "ensemble":
        champion = ens_template
    else:
        champion = copy.deepcopy(
            {m.name: m for m in candidates}[champion_res.model_name]
        )

    leaderboard = pd.DataFrame([
        {
            "model": r.model_name,
            "score": round(r.score, 4),
            **{k: round(v, 4) for k, v in r.metrics.items()},
        }
        for r in ranked
    ])

    return SelectionResult(
        champion=champion,
        champion_name=champion_res.model_name,
        leaderboard=leaderboard,
        results=results,
    )

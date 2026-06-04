"""FastAPI backend for the electricity price dashboard."""
import json
import os
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "electricity-price-predictor"))
OUTPUT_DIR = DATA_DIR / "output"
RAW_DIR = DATA_DIR / "data" / "raw"

app = FastAPI(title="Electricity Price Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


MADRID = "Europe/Madrid"


def _read_parquet(name: str) -> Optional[pd.DataFrame]:
    path = RAW_DIR / f"{name}.parquet"
    if not path.exists():
        return None
    df = pd.read_parquet(path)
    # Normalise all indexes to Europe/Madrid so date comparisons are consistent
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC").tz_convert(MADRID)
    elif str(df.index.tz) != MADRID:
        df.index = df.index.tz_convert(MADRID)
    return df


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "data_dir": str(DATA_DIR),
        "output_exists": OUTPUT_DIR.exists(),
        "raw_exists": RAW_DIR.exists(),
    }


@app.get("/api/dates")
def get_dates():
    if not OUTPUT_DIR.exists():
        return {"afrr": [], "ida1": []}
    afrr = sorted([f.stem[5:] for f in OUTPUT_DIR.glob("afrr_????-??-??.json")])
    ida1 = sorted([f.stem[5:] for f in OUTPUT_DIR.glob("ida1_????-??-??.json")])
    return {"afrr": afrr, "ida1": ida1}


def _parse_afrr(date_str: str) -> dict:
    pred_path = OUTPUT_DIR / f"afrr_{date_str}.json"
    if not pred_path.exists():
        raise HTTPException(404, f"No prediction file for {date_str}")

    pred = json.loads(pred_path.read_text())
    target = date.fromisoformat(date_str)

    df_up = _read_parquet("aFRR_UP")
    df_down = _read_parquet("aFRR_DOWN")

    real_up: dict[str, float] = {}
    real_down: dict[str, float] = {}

    if df_up is not None:
        sub = df_up[df_up.index.date == target]
        real_up = {
            ts.isoformat(): round(float(v), 0)
            for ts, v in sub["value"].items()
            if pd.notna(v)
        }
    if df_down is not None:
        sub = df_down[df_down.index.date == target]
        real_down = {
            ts.isoformat(): round(float(v), 0)
            for ts, v in sub["value"].items()
            if pd.notna(v)
        }

    series = []
    for ts_str, vals in pred["data_15min"].items():
        up_pred = vals["up"]
        down_pred = vals["down"]
        up_real = real_up.get(ts_str)
        down_real = real_down.get(ts_str)
        series.append({
            "ts": ts_str,
            "up_pred": up_pred,
            "down_pred": down_pred,
            "up_real": up_real,
            "down_real": down_real,
            "up_error": round(abs(up_pred - up_real)) if up_real is not None else None,
            "down_error": round(abs(down_pred - down_real)) if down_real is not None else None,
        })

    up_err = [p["up_error"] for p in series if p["up_error"] is not None]
    down_err = [p["down_error"] for p in series if p["down_error"] is not None]

    def _stats(errors: list[float]) -> dict | None:
        if not errors:
            return None
        n = len(errors)
        mae = round(sum(errors) / n)
        rmse = round((sum(e**2 for e in errors) / n) ** 0.5)
        max_err = round(max(errors))
        return {"mae": mae, "rmse": rmse, "max_error": max_err}

    ai_report = None
    reports = sorted(OUTPUT_DIR.glob(f"ai_report_afrr_{date_str}_*.txt"), reverse=True)
    if reports:
        try:
            ai_report = reports[0].read_text(errors="replace")[:5000]
        except Exception:
            pass

    return {
        "date": date_str,
        "generated_at": pred.get("generated_at"),
        "series": series,
        "stats_pred": pred.get("stats"),
        "metrics_up": _stats(up_err),
        "metrics_down": _stats(down_err),
        "has_real": bool(real_up),
        "ai_report": ai_report,
    }


@app.get("/api/afrr/{date_str}")
def get_afrr(date_str: str):
    return _parse_afrr(date_str)


def _parse_ida1(date_str: str) -> dict:
    pred_path = OUTPUT_DIR / f"ida1_{date_str}.json"
    if not pred_path.exists():
        raise HTTPException(404, f"No prediction file for {date_str}")

    pred = json.loads(pred_path.read_text())
    target = date.fromisoformat(date_str)

    df = _read_parquet("IDA1")
    real_hourly: dict[str, float] = {}
    if df is not None:
        sub = df[df.index.date == target]
        real_hourly = {
            ts.isoformat(): round(float(v), 2)
            for ts, v in sub["value"].items()
            if pd.notna(v)
        }

    series = []
    for ts_str, pred_val in pred["data_15min"].items():
        ts = pd.Timestamp(ts_str)
        hour_ts = ts.floor("h").isoformat()
        real_val = real_hourly.get(hour_ts)
        series.append({
            "ts": ts_str,
            "pred": pred_val,
            "real": real_val,
            "error": round(abs(pred_val - real_val), 1) if real_val is not None else None,
        })

    errors = [p["error"] for p in series if p["error"] is not None]
    metrics = None
    if errors:
        n = len(errors)
        metrics = {
            "mae": round(sum(errors) / n, 1),
            "rmse": round((sum(e**2 for e in errors) / n) ** 0.5, 1),
            "max_error": round(max(errors), 1),
        }

    ai_report = None
    reports = sorted(OUTPUT_DIR.glob(f"ai_report_ida1_{date_str}_*.txt"), reverse=True)
    if reports:
        try:
            ai_report = reports[0].read_text(errors="replace")[:5000]
        except Exception:
            pass

    return {
        "date": date_str,
        "generated_at": pred.get("generated_at"),
        "series": series,
        "stats_pred": pred.get("stats"),
        "hourly_pred": pred.get("hourly_eur_mwh"),
        "metrics": metrics,
        "has_real": bool(real_hourly),
        "ai_report": ai_report,
    }


@app.get("/api/ida1/{date_str}")
def get_ida1(date_str: str):
    return _parse_ida1(date_str)


@app.get("/api/history/afrr")
def history_afrr():
    results = []
    if not OUTPUT_DIR.exists():
        return results
    for pred_path in sorted(OUTPUT_DIR.glob("afrr_????-??-??.json")):
        date_str = pred_path.stem[5:]
        try:
            d = _parse_afrr(date_str)
            if d["has_real"] and d["metrics_up"]:
                results.append({
                    "date": date_str,
                    "mae_up": d["metrics_up"]["mae"],
                    "mae_down": d["metrics_down"]["mae"] if d["metrics_down"] else None,
                    "rmse_up": d["metrics_up"]["rmse"],
                })
        except Exception:
            pass
    return results


@app.get("/api/history/ida1")
def history_ida1():
    results = []
    if not OUTPUT_DIR.exists():
        return results
    for pred_path in sorted(OUTPUT_DIR.glob("ida1_????-??-??.json")):
        date_str = pred_path.stem[5:]
        try:
            d = _parse_ida1(date_str)
            if d["has_real"] and d["metrics"]:
                results.append({
                    "date": date_str,
                    "mae": d["metrics"]["mae"],
                    "rmse": d["metrics"]["rmse"],
                })
        except Exception:
            pass
    return results


# Serve React SPA — must be last
STATIC = Path(__file__).parent / "static"
if STATIC.exists() and any(STATIC.iterdir()):
    app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")

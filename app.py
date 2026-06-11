"""
FastAPI backend for the electricity price dashboard.

Data source priority:
  1. Supabase (when SUPABASE_URL + SUPABASE_ANON_KEY are set) — used in production on Render
  2. Local JSON + Parquet files (when DATA_DIR is set) — used in local dev / fallback

Env vars:
  SUPABASE_URL      https://xxxx.supabase.co
  SUPABASE_ANON_KEY anon public key (read-only queries are fine with the anon key)
  DATA_DIR          path to electricity-price-predictor/ (default: ../electricity-price-predictor)
"""

import json
import os
from datetime import date
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ── Config ─────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

DATA_DIR = Path(
    os.environ.get("DATA_DIR", Path(__file__).parent.parent / "electricity-price-predictor")
)
OUTPUT_DIR = DATA_DIR / "output"
RAW_DIR = DATA_DIR / "data" / "raw"

MADRID = "Europe/Madrid"

# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Electricity Price Dashboard")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

# ── Supabase helpers ───────────────────────────────────────────────────────────

def _sb_ok() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _sb_headers() -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def _sb_get(table: str, params: dict) -> list[dict]:
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        params=params,
        headers=_sb_headers(),
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


# ── Local file helpers ─────────────────────────────────────────────────────────

def _read_parquet(name: str):
    try:
        import pandas as pd

        path = RAW_DIR / f"{name}.parquet"
        if not path.exists():
            return None
        df = pd.read_parquet(path)
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC").tz_convert(MADRID)
        elif str(df.index.tz) != MADRID:
            df.index = df.index.tz_convert(MADRID)
        return df
    except Exception:
        return None


def _compute_metrics(errors: list[float]) -> Optional[dict]:
    if not errors:
        return None
    n = len(errors)
    return {
        "mae": round(sum(errors) / n, 1),
        "rmse": round((sum(e**2 for e in errors) / n) ** 0.5, 1),
        "max_error": round(max(errors), 1),
    }


# ── /api/health ────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "ok": True,
        "source": "supabase" if _sb_ok() else "local",
        "supabase_configured": _sb_ok(),
        "data_dir": str(DATA_DIR),
    }


# ── /api/dates ─────────────────────────────────────────────────────────────────

@app.get("/api/dates")
def get_dates():
    if _sb_ok():
        rows = _sb_get("price_meta", {"select": "market,target_date", "order": "target_date.asc"})
        afrr = sorted({r["target_date"] for r in rows if r["market"] == "aFRR"})
        ida1 = sorted({r["target_date"] for r in rows if r["market"] == "IDA1"})
        return {"afrr": afrr, "ida1": ida1}

    if not OUTPUT_DIR.exists():
        return {"afrr": [], "ida1": []}
    afrr = sorted([f.stem[5:] for f in OUTPUT_DIR.glob("afrr_????-??-??.json")])
    ida1 = sorted([f.stem[5:] for f in OUTPUT_DIR.glob("ida1_????-??-??.json")])
    return {"afrr": afrr, "ida1": ida1}


# ── aFRR ───────────────────────────────────────────────────────────────────────

def _build_afrr_response(date_str: str, series: list[dict], meta: dict) -> dict:
    has_real = any(p.get("up_real") is not None for p in series)

    enriched = []
    for p in series:
        up_pred = p.get("up_pred")
        down_pred = p.get("down_pred")
        up_real = p.get("up_real")
        down_real = p.get("down_real")
        enriched.append({
            "ts": p["ts"],
            "up_pred": up_pred,
            "down_pred": down_pred,
            "up_real": up_real,
            "down_real": down_real,
            "up_error": round(abs(up_pred - up_real), 1) if up_pred is not None and up_real is not None else None,
            "down_error": round(abs(down_pred - down_real), 1) if down_pred is not None and down_real is not None else None,
        })

    up_err = [p["up_error"] for p in enriched if p["up_error"] is not None]
    down_err = [p["down_error"] for p in enriched if p["down_error"] is not None]

    return {
        "date": date_str,
        "generated_at": meta.get("generated_at"),
        "series": enriched,
        "stats_pred": meta.get("stats_json"),
        "metrics_up": _compute_metrics(up_err),
        "metrics_down": _compute_metrics(down_err),
        "has_real": has_real,
        "ai_report": meta.get("ai_report"),
    }


def _parse_afrr_local(date_str: str) -> dict:
    import pandas as pd

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
        real_up = {ts.isoformat(): round(float(v), 1) for ts, v in sub["value"].items() if pd.notna(v)}
    if df_down is not None:
        sub = df_down[df_down.index.date == target]
        real_down = {ts.isoformat(): round(float(v), 1) for ts, v in sub["value"].items() if pd.notna(v)}

    series = [
        {
            "ts": ts_str,
            "up_pred": vals["up"],
            "down_pred": vals["down"],
            "up_real": real_up.get(ts_str),
            "down_real": real_down.get(ts_str),
        }
        for ts_str, vals in pred["data_15min"].items()
    ]

    ai_report = None
    reports = sorted(OUTPUT_DIR.glob(f"ai_report_afrr_{date_str}_*.txt"), reverse=True)
    if reports:
        try:
            ai_report = reports[0].read_text(errors="replace")[:5000]
        except Exception:
            pass

    meta = {"generated_at": pred.get("generated_at"), "stats_json": pred.get("stats"), "ai_report": ai_report}
    return _build_afrr_response(date_str, series, meta)


@app.get("/api/afrr/{date_str}")
def get_afrr(date_str: str):
    if _sb_ok():
        meta_rows = _sb_get("price_meta", {"market": "eq.aFRR", "target_date": f"eq.{date_str}"})
        if not meta_rows:
            raise HTTPException(404, f"No aFRR data for {date_str}")
        series_rows = _sb_get(
            "price_predictions",
            {"market": "eq.aFRR", "target_date": f"eq.{date_str}", "order": "ts.asc", "limit": "200"},
        )
        return _build_afrr_response(date_str, series_rows, meta_rows[0])

    return _parse_afrr_local(date_str)


# ── IDA1 ───────────────────────────────────────────────────────────────────────

def _build_ida1_response(date_str: str, series: list[dict], meta: dict) -> dict:
    has_real = any(p.get("ida1_real") is not None for p in series)

    enriched = []
    for p in series:
        pred_val = p.get("ida1_pred")
        real_val = p.get("ida1_real")
        enriched.append({
            "ts": p["ts"],
            "pred": pred_val,
            "real": real_val,
            "error": round(abs(pred_val - real_val), 1) if pred_val is not None and real_val is not None else None,
        })

    errors = [p["error"] for p in enriched if p["error"] is not None]

    return {
        "date": date_str,
        "generated_at": meta.get("generated_at"),
        "series": enriched,
        "stats_pred": meta.get("stats_json"),
        "hourly_pred": meta.get("hourly_pred"),
        "metrics": _compute_metrics(errors),
        "has_real": has_real,
        "ai_report": meta.get("ai_report"),
    }


def _parse_ida1_local(date_str: str) -> dict:
    import pandas as pd

    pred_path = OUTPUT_DIR / f"ida1_{date_str}.json"
    if not pred_path.exists():
        raise HTTPException(404, f"No prediction file for {date_str}")

    pred = json.loads(pred_path.read_text())
    target = date.fromisoformat(date_str)

    df = _read_parquet("IDA1")
    real_hourly: dict[str, float] = {}
    if df is not None:
        sub = df[df.index.date == target]
        real_hourly = {ts.isoformat(): round(float(v), 2) for ts, v in sub["value"].items() if pd.notna(v)}

    series = []
    for ts_str, pred_val in pred["data_15min"].items():
        ts = pd.Timestamp(ts_str)
        hour_ts = ts.floor("h").isoformat()
        series.append({"ts": ts_str, "ida1_pred": pred_val, "ida1_real": real_hourly.get(hour_ts)})

    ai_report = None
    reports = sorted(OUTPUT_DIR.glob(f"ai_report_ida1_{date_str}_*.txt"), reverse=True)
    if reports:
        try:
            ai_report = reports[0].read_text(errors="replace")[:5000]
        except Exception:
            pass

    meta = {
        "generated_at": pred.get("generated_at"),
        "stats_json": pred.get("stats"),
        "hourly_pred": pred.get("hourly_eur_mwh"),
        "ai_report": ai_report,
    }
    return _build_ida1_response(date_str, series, meta)


@app.get("/api/ida1/{date_str}")
def get_ida1(date_str: str):
    if _sb_ok():
        meta_rows = _sb_get("price_meta", {"market": "eq.IDA1", "target_date": f"eq.{date_str}"})
        if not meta_rows:
            raise HTTPException(404, f"No IDA1 data for {date_str}")
        series_rows = _sb_get(
            "price_predictions",
            {"market": "eq.IDA1", "target_date": f"eq.{date_str}", "order": "ts.asc", "limit": "200"},
        )
        return _build_ida1_response(date_str, series_rows, meta_rows[0])

    return _parse_ida1_local(date_str)


# ── History ────────────────────────────────────────────────────────────────────

def _history_metrics(market: str, date_str: str, series: list[dict]) -> Optional[dict]:
    if market == "aFRR":
        up_err = [
            round(abs(p["up_pred"] - p["up_real"]), 1)
            for p in series
            if p.get("up_pred") is not None and p.get("up_real") is not None
        ]
        down_err = [
            round(abs(p["down_pred"] - p["down_real"]), 1)
            for p in series
            if p.get("down_pred") is not None and p.get("down_real") is not None
        ]
        if not up_err:
            return None
        n = len(up_err)
        return {
            "date": date_str,
            "mae_up": round(sum(up_err) / n, 1),
            "mae_down": round(sum(down_err) / len(down_err), 1) if down_err else None,
            "rmse_up": round((sum(e**2 for e in up_err) / n) ** 0.5, 1),
        }
    else:
        errors = [
            round(abs(p["ida1_pred"] - p["ida1_real"]), 1)
            for p in series
            if p.get("ida1_pred") is not None and p.get("ida1_real") is not None
        ]
        if not errors:
            return None
        n = len(errors)
        return {
            "date": date_str,
            "mae": round(sum(errors) / n, 1),
            "rmse": round((sum(e**2 for e in errors) / n) ** 0.5, 1),
        }


@app.get("/api/history/afrr")
def history_afrr():
    if _sb_ok():
        # One efficient query: get all aFRR rows with real data
        rows = _sb_get(
            "price_predictions",
            {
                "market": "eq.aFRR",
                "up_real": "not.is.null",
                "select": "target_date,up_pred,down_pred,up_real,down_real",
                "order": "target_date.asc",
                "limit": "5000",
            },
        )
        # Group by date
        from collections import defaultdict
        by_date: dict[str, list] = defaultdict(list)
        for r in rows:
            by_date[r["target_date"]].append(r)

        results = []
        for d, series in sorted(by_date.items()):
            m = _history_metrics("aFRR", d, series)
            if m:
                results.append(m)
        return results

    results = []
    if not OUTPUT_DIR.exists():
        return results
    for pred_path in sorted(OUTPUT_DIR.glob("afrr_????-??-??.json")):
        date_str = pred_path.stem[5:]
        try:
            d = _parse_afrr_local(date_str)
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
    if _sb_ok():
        rows = _sb_get(
            "price_predictions",
            {
                "market": "eq.IDA1",
                "ida1_real": "not.is.null",
                "select": "target_date,ida1_pred,ida1_real",
                "order": "target_date.asc",
                "limit": "5000",
            },
        )
        from collections import defaultdict
        by_date: dict[str, list] = defaultdict(list)
        for r in rows:
            by_date[r["target_date"]].append(r)

        results = []
        for d, series in sorted(by_date.items()):
            m = _history_metrics("IDA1", d, series)
            if m:
                results.append(m)
        return results

    results = []
    if not OUTPUT_DIR.exists():
        return results
    for pred_path in sorted(OUTPUT_DIR.glob("ida1_????-??-??.json")):
        date_str = pred_path.stem[5:]
        try:
            d = _parse_ida1_local(date_str)
            if d["has_real"] and d["metrics"]:
                results.append({"date": date_str, "mae": d["metrics"]["mae"], "rmse": d["metrics"]["rmse"]})
        except Exception:
            pass
    return results


# ── Static React SPA ───────────────────────────────────────────────────────────

STATIC = Path(__file__).parent / "static"
if STATIC.exists() and any(STATIC.iterdir()):
    app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")

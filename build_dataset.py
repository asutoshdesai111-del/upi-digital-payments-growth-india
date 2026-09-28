"""Build the UPI growth dataset (100 monthly records, Apr 2017 - Jul 2025).

Outputs
    data/upi_monthly.csv    monthly volume, value, ticket size, banks live, growth rates, milestones
    data/upi_app_share.csv  approximate share of UPI volume by app (Dec snapshots)
    dashboard/data.js       the same data as a JS global so the dashboard opens by double-click

Provenance (read before quoting any number)
    The monthly volumes are reference figures reconstructed from NPCI's published UPI
    product statistics; they are rounded and not downloaded from NPCI by this script.
    Each fiscal year is then calibrated so that its monthly volumes and values sum to NPCI's
    published annual totals. Monthly value is derived from volume x an interpolated average
    ticket size, then calibrated the same way. Banks-live and app-share figures are approximate.
    Verify against https://www.npci.org.in/what-we-do/upi/product-statistics before
    using the numbers outside this exercise.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
DASH_DIR = ROOT / "dashboard"
DATA_DIR.mkdir(exist_ok=True)
DASH_DIR.mkdir(exist_ok=True)

START_YEAR, START_MONTH = 2017, 4

# Monthly transaction volume in millions, Apr 2017 onwards (100 months -> Jul 2025).
VOLUME_MN = [
    # FY18
    10, 9, 10, 15, 17, 31, 76, 104, 146, 152, 172, 178,
    # FY19
    190, 189, 246, 228, 312, 405, 482, 434, 620, 672, 674, 799,
    # FY20
    781, 733, 754, 822, 918, 955, 1148, 1218, 1308, 1305, 1325, 1247,
    # FY21
    999, 1234, 1336, 1497, 1600, 1800, 2071, 2210, 2234, 2302, 2292, 2731,
    # FY22
    2641, 2539, 2807, 3247, 3552, 3654, 4219, 4186, 4566, 4617, 4528, 5405,
    # FY23
    5584, 5954, 5863, 6289, 6575, 6780, 7306, 7304, 7828, 8038, 7534, 8684,
    # FY24
    8890, 9415, 9335, 9964, 10586, 10555, 11409, 11235, 12020, 12203, 12105, 13440,
    # FY25
    13304, 14036, 13885, 14439, 14963, 15040, 16582, 15483, 16731, 16996, 16110, 18301,
    # FY26 (Apr-Jul 2025)
    17890, 18682, 18395, 19470,
]

# Published full-year totals used to calibrate the monthly series.
FY_TOTAL_VOLUME_MN = {
    "FY18": 915, "FY19": 5353, "FY20": 12519, "FY21": 22330,
    "FY22": 45996, "FY23": 83751, "FY24": 131126, "FY25": 185850,
}
FY_TOTAL_VALUE_CR = {  # Rs crore
    "FY18": 109_000, "FY19": 877_000, "FY20": 2_131_000, "FY21": 4_104_000,
    "FY22": 8_417_000, "FY23": 13_915_000, "FY24": 19_989_000, "FY25": 26_056_000,
}

# (year, month) -> average ticket size in Rs, linearly interpolated between anchors.
TICKET_ANCHORS = {
    (2017, 4): 1300, (2017, 12): 1180, (2018, 3): 1200, (2018, 8): 1600,
    (2019, 3): 1665, (2019, 10): 1664, (2020, 3): 1652, (2020, 4): 1511,
    (2020, 5): 1767, (2020, 10): 1864, (2021, 3): 1845, (2021, 10): 1827,
    (2022, 3): 1776, (2022, 10): 1657, (2023, 3): 1624, (2023, 10): 1504,
    (2024, 3): 1472, (2024, 8): 1377, (2024, 10): 1417, (2025, 3): 1353,
    (2025, 7): 1288,
}

# (year, month) -> banks live on UPI (approximate), linearly interpolated.
BANK_ANCHORS = {
    (2017, 4): 46, (2018, 3): 91, (2019, 3): 141, (2020, 3): 189, (2021, 3): 224,
    (2022, 3): 260, (2023, 3): 381, (2024, 3): 550, (2025, 3): 640, (2025, 7): 675,
}

EVENTS = {
    (2018, 8): "UPI 2.0 launched with overdraft accounts and invoice-in-the-inbox",
    (2019, 10): "Crosses 1 billion transactions in a single month",
    (2020, 3): "Nationwide COVID-19 lockdown begins (25 Mar); volumes dip in April",
    (2021, 10): "Crosses 4 billion transactions in a single month",
    (2022, 6): "RuPay credit cards can be linked to UPI",
    (2022, 9): "UPI Lite launched for small offline-style payments",
    (2023, 2): "UPI-PayNow linkage with Singapore goes live",
    (2023, 12): "Crosses 12 billion transactions in a single month",
    (2024, 1): "RBI curbs on Paytm Payments Bank announced (31 Jan)",
}

# Approximate share of UPI transaction volume (%), December of each year.
APP_SHARE = {
    "Dec 2022": {"PhonePe": 47, "Google Pay": 35, "Paytm": 13, "Others": 5},
    "Dec 2023": {"PhonePe": 47, "Google Pay": 36, "Paytm": 12, "Others": 5},
    "Dec 2024": {"PhonePe": 48, "Google Pay": 37, "Paytm": 7, "Others": 8},
}


def month_of(i):
    y, m0 = divmod(START_YEAR * 12 + START_MONTH - 1 + i, 12)
    return y, m0 + 1


def fiscal_year(y, m):
    return f"FY{(y + 1 if m >= 4 else y) % 100:02d}"


def interpolate(anchors, i):
    pts = sorted(((y * 12 + m - (START_YEAR * 12 + START_MONTH), v) for (y, m), v in anchors.items()))
    if i <= pts[0][0]:
        return pts[0][1]
    for (i0, v0), (i1, v1) in zip(pts, pts[1:]):
        if i0 <= i <= i1:
            return v0 + (v1 - v0) * (i - i0) / (i1 - i0)
    return pts[-1][1]


def calibrate(values, fys, totals, label):
    out = list(values)
    for fy, total in totals.items():
        idx = [k for k, f in enumerate(fys) if f == fy]
        factor = total / sum(values[k] for k in idx)
        flag = "  <-- WARNING: larger than 5%" if abs(factor - 1) > 0.05 else ""
        print(f"  calibration {label:<6} {fy}: x{factor:.3f}{flag}")
        for k in idx:
            out[k] = values[k] * factor
    return out


def pct(cur, prev):
    return None if prev in (None, 0) else round((cur / prev - 1) * 100, 1)


def main():
    n = len(VOLUME_MN)
    assert n == 100, f"expected 100 months, got {n}"
    months = [month_of(i) for i in range(n)]
    fys = [fiscal_year(y, m) for y, m in months]

    volume = calibrate([float(v) for v in VOLUME_MN], fys, FY_TOTAL_VOLUME_MN, "volume")
    raw_value = [volume[i] * interpolate(TICKET_ANCHORS, i) / 10 for i in range(n)]  # Rs crore
    value = calibrate(raw_value, fys, FY_TOTAL_VALUE_CR, "value")

    rows = []
    for i, (y, m) in enumerate(months):
        rows.append({
            "month": f"{y}-{m:02d}-01",
            "fiscal_year": fys[i],
            "volume_mn": round(volume[i], 1),
            "value_cr": round(value[i]),
            "avg_ticket_inr": round(value[i] * 10 / volume[i]),
            "banks_live": round(interpolate(BANK_ANCHORS, i)),
            "volume_yoy_pct": pct(volume[i], volume[i - 12]) if i >= 12 else None,
            "value_yoy_pct": pct(value[i], value[i - 12]) if i >= 12 else None,
            "volume_mom_pct": pct(volume[i], volume[i - 1]) if i >= 1 else None,
            "value_mom_pct": pct(value[i], value[i - 1]) if i >= 1 else None,
            "milestone": EVENTS.get((y, m), ""),
        })

    fields = list(rows[0].keys())
    with open(DATA_DIR / "upi_monthly.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})

    share_rows = [
        {"snapshot": snap, "app": app, "volume_share_pct": share}
        for snap, apps in APP_SHARE.items() for app, share in apps.items()
    ]
    for snap, apps in APP_SHARE.items():
        assert sum(apps.values()) == 100, f"{snap} shares must sum to 100"
    with open(DATA_DIR / "upi_app_share.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["snapshot", "app", "volume_share_pct"])
        w.writeheader()
        w.writerows(share_rows)

    payload = {"monthly": rows, "appShare": share_rows}
    (DASH_DIR / "data.js").write_text(
        "window.UPI_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n", encoding="utf-8"
    )

    print(f"Wrote {len(rows)} monthly rows: {rows[0]['month']} -> {rows[-1]['month']}")
    for fy in FY_TOTAL_VOLUME_MN:
        v = sum(r["volume_mn"] for r in rows if r["fiscal_year"] == fy)
        c = sum(r["value_cr"] for r in rows if r["fiscal_year"] == fy)
        print(f"  {fy}: {v:>10,.0f} mn txns   Rs {c / 1e5:>8,.2f} lakh cr")


if __name__ == "__main__":
    main()

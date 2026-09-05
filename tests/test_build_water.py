"""Unit tests for the logic-heavy parts of the transform.

Run: python -m pytest -q   (from the repo root)

These pin the editorial rules that matter most and are easiest to break
silently: non-detect handling, and the trend-direction rule including the
"not re-sampled" guard that keeps an un-retested entry point from reading
as a decline.
"""

from transforms.build_water import parse_result, trend_direction


def row(date, value, ep=1):
    return {"date": date, "value": value, "source_id": ep}


# --- parse_result: non-detects are null, never 0 ------------------------

def _raw(amount, qualifier):
    return {
        "PwsId": "73701023", "ContamDesc": "PFOA", "ResultAmt": amount,
        "UnitsText": "NG/L", "ResultQualifierCode": qualifier, "LodText": "0.5",
        "LoqText": "1.0", "SampleDate": "2026-05-12T00:00:00",
        "SampleTypeDesc": "Compliance", "EpaSourceId": 400,
        "SampleSourceCode": "Entry Point", "SampleResultSeqNo": 1,
    }


def test_non_detect_is_null_not_zero():
    r = parse_result(_raw("0", "Non-detect"))
    assert r["value"] is None
    assert r["qualifier"] == "Non-detect"


def test_missing_amount_keeps_its_qualifier():
    r = parse_result(_raw(None, "Unexplained"))
    assert r["value"] is None
    assert r["qualifier"] == "Unexplained"


def test_detected_value_parses_and_join_key_is_derived():
    r = parse_result(_raw("6.5", "No problem"))
    assert r["value"] == 6.5
    assert r["pwsid"] == "WI7370102"  # "WI" + first 7 DNR digits


# --- trend_direction ----------------------------------------------------

def test_single_round_has_no_direction():
    assert trend_direction([row("2026-01-01", 2.0)]) is None


def test_rising_needs_both_ratio_and_absolute_change():
    assert trend_direction([row("2026-01-01", 2.0), row("2026-04-01", 3.0)])["direction"] == "rising"
    # 15% up: under the ratio floor
    assert trend_direction([row("2026-01-01", 2.0), row("2026-04-01", 2.3)])["direction"] == "steady"
    # 50% up but only 0.1 ng/L: under the absolute floor
    assert trend_direction([row("2026-01-01", 0.2), row("2026-04-01", 0.3)])["direction"] == "steady"


def test_falling():
    t = trend_direction([row("2026-01-01", 5.0), row("2026-04-01", 3.0)])
    assert t["direction"] == "falling"
    assert (t["prior_value"], t["latest_value"]) == (5.0, 3.0)


def test_consecutive_day_entry_points_merge_into_one_round():
    # Wausau samples EP400 and EP500 a day apart; that is one round, not two.
    rows = [
        row("2026-01-12", 4.7, 400), row("2026-01-13", 4.3, 500),
        row("2026-05-11", 7.0, 500), row("2026-05-12", 6.5, 400),
    ]
    t = trend_direction(rows)
    assert t["direction"] == "rising"
    assert (t["prior_value"], t["latest_value"]) == (4.7, 7.0)
    assert t["prior_date"] == "2026-01-13" and t["latest_date"] == "2026-05-12"


def test_unretested_entry_point_is_not_a_decline():
    # Rib Mountain: EP2 hit 59 in March; only EP1 (non-detect) sampled in May.
    rows = [
        row("2026-03-12", None, 1), row("2026-03-12", 59.0, 2),
        row("2026-05-26", None, 1),
    ]
    t = trend_direction(rows)
    assert t["direction"] == "unresampled"
    assert t["prior_entry_point"] == 2
    assert t["prior_value"] == 59.0


def test_new_entry_point_does_not_fabricate_a_rise():
    # A third entry point sampled for the first time can't count as "rising";
    # only entry points present in both rounds are compared.
    rows = [
        row("2026-01-01", 1.0, 1), row("2026-01-01", 10.0, 2),
        row("2026-04-01", 1.0, 1), row("2026-04-01", 10.0, 2), row("2026-04-01", 50.0, 3),
    ]
    assert trend_direction(rows)["direction"] == "steady"


def test_all_non_detect_is_steady_and_nd_to_detected_is_rising():
    assert trend_direction([row("2026-01-01", None), row("2026-04-01", None)])["direction"] == "steady"
    assert trend_direction([row("2026-01-01", None), row("2026-04-01", 2.0)])["direction"] == "rising"

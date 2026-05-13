#!/usr/bin/env python3
"""Compliance check script for EU VWTA lighting numerical pass/fail.

Called by the LLM via function calling during Stage 2.
Evaluates measured values against regulation limits.

Usage:
    import json
    checks = [{"name": "...", "value": ..., "limit": ..., "operator": "...", "clause": "..."}]
    results = check_compliance(checks)
    print(json.dumps(results))
"""

import json
import sys
from typing import TypedDict


class Check(TypedDict):
    name: str
    value: float
    limit: float
    operator: str  # >=, >, <=, <, range
    clause: str


class CheckResult(TypedDict):
    name: str
    value: float
    limit: float
    comparison: str
    status: str  # pass or fail
    note: str


def check_compliance(checks: list[Check]) -> list[CheckResult]:
    """Evaluate each check against its limit."""
    results: list[CheckResult] = []

    for check in checks:
        name = check["name"]
        value = float(check["value"])
        limit = check.get("limit")
        operator = check.get("operator", "<=")
        clause = check.get("clause", "")

        status = "pass"
        note = ""
        comparison = ""

        if operator == "range" and isinstance(limit, str):
            # Format: "500-1200"
            parts = limit.split("-")
            lo, hi = float(parts[0]), float(parts[1])
            comparison = f"{value} in [{lo}, {hi}]"
            if value < lo or value > hi:
                status = "fail"
                note = f"Value {value} outside range [{lo}, {hi}]"
        else:
            limit_val = float(limit)
            if operator == ">=":
                comparison = f"{value} >= {limit_val}"
                if value < limit_val:
                    status = "fail"
                    note = f"{value} < {limit_val}"
            elif operator == "<=":
                comparison = f"{value} <= {limit_val}"
                if value > limit_val:
                    status = "fail"
                    note = f"{value} > {limit_val}"
            elif operator == ">":
                comparison = f"{value} > {limit_val}"
                if value <= limit_val:
                    status = "fail"
                    note = f"{value} <= {limit_val}"
            elif operator == "<":
                comparison = f"{value} < {limit_val}"
                if value >= limit_val:
                    status = "fail"
                    note = f"{value} >= {limit_val}"

        results.append({
            "name": name,
            "value": value,
            "limit": limit,
            "comparison": comparison,
            "status": status,
            "note": note,
        })

    return results


if __name__ == "__main__":
    input_data = json.loads(sys.stdin.read())
    results = check_compliance(input_data.get("checks", []))
    print(json.dumps({"results": results}))

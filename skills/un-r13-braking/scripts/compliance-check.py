#!/usr/bin/env python3
"""Compliance check script for UN R13 braking numerical pass/fail.

Called by the LLM via function calling.
Evaluates measured braking performance against regulation limits.

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
    operator: str
    clause: str


class CheckResult(TypedDict):
    name: str
    value: float
    limit: float
    comparison: str
    status: str
    note: str


def check_compliance(checks: list[Check]) -> list[CheckResult]:
    results: list[CheckResult] = []
    for check in checks:
        name = check["name"]
        value = float(check["value"])
        limit = check.get("limit")
        operator = check.get("operator", "<=")
        status = "pass"
        note = ""
        comparison = ""
        if operator == "range" and isinstance(limit, str):
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
            "name": name, "value": value, "limit": limit,
            "comparison": comparison, "status": status, "note": note,
        })
    return results


if __name__ == "__main__":
    input_data = json.loads(sys.stdin.read())
    results = check_compliance(input_data.get("checks", []))
    print(json.dumps({"results": results}))

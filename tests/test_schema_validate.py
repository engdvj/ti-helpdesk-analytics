import pandas as pd
import pytest

from ti_analytics.utils.schema_validate import SchemaValidationError, validate_dataframe

VALID_TICKET_ROW = {
    "tickets_id": 1, "entities_id": 9, "itilcategories_id": 5, "date": "2026-07-01",
    "solvedate": "2026-07-01", "status": 5, "is_solved": True, "urgency": 4, "priority": 4,
    "takeintoaccount_delay_stat": 600, "solve_delay_stat": 3600, "collected_at": "2026-07-01T00:00:00Z",
}


def test_valid_ticket_dataframe_passes():
    validate_dataframe(pd.DataFrame([VALID_TICKET_ROW]), "ticket.yaml")


def test_missing_required_column_raises():
    with pytest.raises(SchemaValidationError):
        validate_dataframe(pd.DataFrame([{"tickets_id": 1}]), "ticket.yaml")


def test_null_in_required_column_raises():
    row = dict(VALID_TICKET_ROW)
    row["tickets_id"] = None
    with pytest.raises(SchemaValidationError):
        validate_dataframe(pd.DataFrame([row]), "ticket.yaml")


def test_empty_dataframe_allowed_by_default():
    validate_dataframe(pd.DataFrame(), "ticket.yaml")


def test_empty_dataframe_can_be_disallowed():
    with pytest.raises(SchemaValidationError):
        validate_dataframe(pd.DataFrame(), "ticket.yaml", allow_empty=False)

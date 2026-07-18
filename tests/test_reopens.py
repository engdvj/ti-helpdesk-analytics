from ti_analytics.analytics.reopens import detect_reopened


def test_no_reopen_simple_progression():
    log = [
        {"id_search_option": 12, "new_value": "2", "date_mod": "2026-01-01 10:00:00"},
        {"id_search_option": 12, "new_value": "5", "date_mod": "2026-01-01 11:00:00"},
    ]
    assert detect_reopened(log) is False


def test_reopen_detected_after_solved():
    log = [
        {"id_search_option": 12, "new_value": "2", "date_mod": "2026-01-01 10:00:00"},
        {"id_search_option": 12, "new_value": "5", "date_mod": "2026-01-01 11:00:00"},
        {"id_search_option": 12, "new_value": "2", "date_mod": "2026-01-02 09:00:00"},
    ]
    assert detect_reopened(log) is True


def test_ignores_non_status_fields():
    log = [{"id_search_option": 5, "new_value": "43", "date_mod": "2026-01-01 10:00:00"}]
    assert detect_reopened(log) is False


def test_empty_log_is_not_reopened():
    assert detect_reopened([]) is False


def test_closed_then_reopened_also_counts():
    log = [
        {"id_search_option": 12, "new_value": "6", "date_mod": "2026-01-01 11:00:00"},
        {"id_search_option": 12, "new_value": "3", "date_mod": "2026-01-03 09:00:00"},
    ]
    assert detect_reopened(log) is True

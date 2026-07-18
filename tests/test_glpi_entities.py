from unittest.mock import MagicMock, patch

from ti_analytics.glpi.entities import discover_ti_entities


def _raw_entity(id_, name, completename, parent_entities_id):
    # payload real do GLPI: "id" e a propria entidade, "entities_id" e o pai
    # na arvore - as duas colunas coexistem, e isso quebrou a 1a versao do
    # discover_ti_entities (colisao apos o rename).
    return {"id": id_, "entities_id": parent_entities_id, "name": name, "completename": completename}


@patch("ti_analytics.glpi.entities.get_paginated")
def test_discover_ti_entities_handles_parent_entities_id_collision(mock_get_paginated):
    mock_get_paginated.return_value = [
        _raw_entity(0, "Root entity", "CHVC", 0),
        _raw_entity(9, "TI", "CHVC > HGVC > TI", 2),
        _raw_entity(13, "TI", "CHVC > UPA > TI", 12),
        _raw_entity(10, "MP", "CHVC > HGVC > MP", 2),
    ]
    df = discover_ti_entities(MagicMock(), "token")
    assert set(df["entities_id"]) == {9, 13}
    assert set(df["unidade_pai"]) == {"HGVC", "UPA"}


@patch("ti_analytics.glpi.entities.get_paginated")
def test_discover_ti_entities_empty_when_no_match(mock_get_paginated):
    mock_get_paginated.return_value = [_raw_entity(0, "Root entity", "CHVC", 0)]
    df = discover_ti_entities(MagicMock(), "token")
    assert df.empty

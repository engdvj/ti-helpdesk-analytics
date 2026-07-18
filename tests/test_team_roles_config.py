from ti_analytics.glpi.team_roles_config import set_papel_override


def test_set_papel_override_adds_and_preserves_default_por_profile(tmp_path):
    path = tmp_path / "team_roles.yaml"
    path.write_text(
        "default_por_profile:\n  Supervisor: coordenadora\n  Plantonista: plantonista\n"
        "overrides:\n  22: tatico\n",
        encoding="utf-8",
    )

    config = set_papel_override(43, "tatico", path)

    assert config["overrides"] == {22: "tatico", 43: "tatico"}
    assert config["default_por_profile"] == {"Supervisor": "coordenadora", "Plantonista": "plantonista"}


def test_set_papel_override_none_removes_existing_override(tmp_path):
    path = tmp_path / "team_roles.yaml"
    path.write_text("overrides:\n  22: tatico\n  43: coordenadora\n", encoding="utf-8")

    config = set_papel_override(43, None, path)

    assert config["overrides"] == {22: "tatico"}


def test_set_papel_override_creates_file_when_missing(tmp_path):
    path = tmp_path / "team_roles.yaml"

    config = set_papel_override(50, "coordenadora", path)

    assert config["overrides"] == {50: "coordenadora"}
    assert path.exists()

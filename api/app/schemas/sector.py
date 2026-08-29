from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SectorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_glpi: int
    nome: str
    entities_id: int
    unidade_slug: str
    ativo: bool
    qtd_computadores: int = 0

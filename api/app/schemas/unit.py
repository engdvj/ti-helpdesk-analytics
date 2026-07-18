from pydantic import BaseModel, ConfigDict


class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    nome: str
    entities_id: int
    completename: str
    ativa: bool
    ordem: int

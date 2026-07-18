from pydantic import BaseModel, ConfigDict


class TechnicianOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    users_id: int
    username: str
    nome_completo: str
    glpi_profile: str
    papel: str
    ativo: bool
    unidade_slug: str | None = None
    foto: str | None = None
    foto_fonte: str | None = None
    nome_exibicao: str | None = None

from pydantic import BaseModel, ConfigDict, Field, computed_field


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
    # Mapeia de Technician.password_hash mas nunca serializa o hash em si -
    # so a UI de gestao de usuarios precisa saber se o login ja foi
    # provisionado (ver TechniciansPanel), o hash nao tem uso no frontend.
    password_hash: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def tem_senha(self) -> bool:
        return self.password_hash is not None

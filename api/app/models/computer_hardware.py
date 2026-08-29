"""Snapshot de hardware do computador, vindo do GLPI Agent (docs/requisitos.md
Épico A - "score do PC", pedido em 2026-08-29). 1:1 com `Computer` (upsert por
`computer_id` a cada sincronização, nunca histórico - mesmo raciocínio de
MaintenanceCycleItem.execucao_itens: é o estado *atual* conhecido do
equipamento, não um log). Só existe linha aqui pra PC que já foi casado com
um Computer do GLPI (`Computer.id_glpi_computer` preenchido) - PC 100%
manual nunca tem hardware, e o score fica None (nunca inventa dado)."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.app.db import Base


class ComputerHardware(Base):
    __tablename__ = "computer_hardware"

    computer_id: Mapped[int] = mapped_column(Integer, ForeignKey("computers.id"), primary_key=True)

    ram_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # "Item_DeviceHardDrive" (tipo, via DeviceHardDriveType.name - "SSD"/
    # "HDD") + "Item_Disk" (espaço, soma de todas as partições/discos - pode
    # ter mais de um). Dois recursos GLPI diferentes, ver glpi_probe*.py da
    # investigação em 2026-08-28.
    disco_tipo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    disco_total_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    disco_livre_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)

    so_nome: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # data de instalação do SO reportada pelo GLPI - proxy pra "tempo sem
    # formatar" enquanto a plataforma não tiver o dado "nosso" (uma
    # reinstalação registrada via preventiva, que um dia deve prevalecer
    # sobre este campo - não implementado ainda).
    so_instalado_em: Mapped[date | None] = mapped_column(Date, nullable=True)

    cpu_designacao: Mapped[str | None] = mapped_column(String(160), nullable=True)
    gpu_designacao: Mapped[str | None] = mapped_column(String(160), nullable=True)
    gpu_memoria_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)

    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))

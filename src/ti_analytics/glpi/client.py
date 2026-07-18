"""Cliente HTTP para a API REST do GLPI.

Adaptado de gerar_formulario.py (repo Formularios) mas com tokens vindos de
env (config.GlpiConfig), nunca hardcoded, e com paginacao genarica em vez de
assumir que uma unica pagina cobre tudo - importante porque o volume de
chamados so tende a crescer.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from ti_analytics.config import GlpiConfig
from ti_analytics.utils.logging import get_logger

logger = get_logger(__name__)

PAGE_SIZE = 200


class GlpiError(RuntimeError):
    pass


def _request(
    cfg: GlpiConfig,
    endpoint: str,
    session_token: str | None = None,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[dict | list, dict[str, str]]:
    url = cfg.api_url + endpoint
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req_headers = {"App-Token": cfg.app_token, "Content-Type": "application/json"}
    if session_token:
        req_headers["Session-Token"] = session_token
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, data=data, method=method, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            body = json.loads(raw) if raw else {}
            return body, dict(resp.headers)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise GlpiError(f"HTTP {exc.code} em {endpoint}: {detail}") from exc


def init_session(cfg: GlpiConfig) -> str:
    body, _ = _request(
        cfg, "/initSession", headers={"Authorization": f"user_token {cfg.user_token}"}
    )
    if not isinstance(body, dict) or "session_token" not in body:
        raise GlpiError(f"initSession sem session_token: {body}")
    return body["session_token"]


def kill_session(cfg: GlpiConfig, session_token: str) -> None:
    try:
        _request(cfg, "/killSession", session_token)
    except GlpiError:
        logger.warning("falha ao encerrar sessao GLPI (ignorado)")


def api_request(
    cfg: GlpiConfig,
    endpoint: str,
    session_token: str,
    method: str = "GET",
    payload: dict | None = None,
) -> dict | list:
    body, _ = _request(cfg, endpoint, session_token, method, payload)
    return body


def fetch_binary(cfg: GlpiConfig, endpoint: str, session_token: str) -> bytes | None:
    """GET que devolve bytes crus (nao JSON) - usado so pra foto de usuario
    (/User/{id}/Picture devolve o JPEG direto, nao um envelope JSON). None
    se o usuario nao tiver foto (404) ou qualquer outro erro HTTP."""
    url = cfg.api_url + endpoint
    req = urllib.request.Request(
        url, headers={"App-Token": cfg.app_token, "Session-Token": session_token}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read()
    except urllib.error.HTTPError:
        return None
    except urllib.error.URLError:
        return None


def get_paginated(cfg: GlpiConfig, endpoint: str, session_token: str) -> list[dict]:
    """Busca todas as paginas de um endpoint de listagem, via Content-Range.

    O GLPI devolve `Content-Range: <start>-<end>/<total>` no header. Avanca em
    blocos de PAGE_SIZE ate cobrir <total>. Se o endpoint nao devolver lista
    (ex.: erro), retorna o que tiver ate ali.
    """
    sep = "&" if "?" in endpoint else "?"
    out: list[dict] = []
    start = 0
    while True:
        page_endpoint = f"{endpoint}{sep}range={start}-{start + PAGE_SIZE - 1}"
        body, headers = _request(cfg, page_endpoint, session_token)
        if not isinstance(body, list):
            break
        out.extend(row for row in body if isinstance(row, dict))
        if len(body) < PAGE_SIZE:
            break
        content_range = headers.get("Content-Range", "")
        match = re.match(r"(\d+)-(\d+)/(\d+)", content_range)
        if match:
            total = int(match.group(3))
            if start + PAGE_SIZE >= total:
                break
        start += PAGE_SIZE
    return out


def get_paginated_search(
    cfg: GlpiConfig,
    itemtype: str,
    session_token: str,
    *,
    forcedisplay: list[int] | None = None,
    criteria: list[dict[str, Any]] | None = None,
) -> list[dict]:
    """Usa /search/{itemtype} - necessario quando o forcedisplay/criteria
    importa (ex.: nao usado hoje, mas mantido para extensoes futuras)."""
    params: list[str] = []
    if forcedisplay:
        for i, field_id in enumerate(forcedisplay):
            params.append(f"forcedisplay[{i}]={field_id}")
    if criteria:
        for i, crit in enumerate(criteria):
            for key, value in crit.items():
                params.append(f"criteria[{i}][{key}]={urllib.parse.quote(str(value))}")
    query = "&".join(params)
    endpoint = f"/search/{itemtype}" + (f"?{query}" if query else "")
    return get_paginated(cfg, endpoint, session_token)

"""Heuristica de qualidade da resposta registrada em ITILSolution.

O formulario de solucao desta instancia do GLPI tem 4-5 campos nominais
(Data do atendimento / Tecnico / Problema identificado (as vezes "Problema
informado") / O que foi feito / Observacoes), mas o HTML real varia bastante
de chamado pra chamado - o editor rico do GLPI nao forca uma estrutura unica.
Amostra real (17/07/2026, chamados de Joao Frutuoso vs. amostra original)
mostrou pelo menos 4 formatos distintos pro MESMO campo:

  1. Rotulo e valor no mesmo <strong>:
     <strong>Problema identificado: TEXTO</strong>

  2. Rotulo sozinho num <p>, valor num <p> seguinte:
     <p><strong>Problema identificado:</strong></p>
     <p>TEXTO</p>

  3. Rotulo e valor no mesmo <p>, separados por <br>:
     <p><strong>Problema identificado:</strong><br>TEXTO</p>

  4. Valor em lista:
     <p><strong>O que foi feito:</strong></p>
     <ul><li>Item 1</li><li>Item 2</li></ul>

Por isso o parser NAO ancora no `<strong>...</strong>` (perdia o campo toda
vez que o valor ficava fora dele - bug real, achado quando um tecnico com
respostas evidentemente boas pontuou 0 nos 10 chamados mais recentes).
Em vez disso: converte o HTML pra um stream de texto linear (todo `</p>`,
`</li>` e `<br>` vira quebra de linha) e localiza os rotulos DENTRO desse
texto - a posicao exata da tag deixa de importar, so a ORDEM de leitura.
"""
from __future__ import annotations

import html as html_lib
import re

_TAG_RE = re.compile(r"<[^>]+>")
_BLOCK_BREAK_RE = re.compile(r"</p\s*>|</li\s*>|<br\s*/?>", re.IGNORECASE)
_WS_RE = re.compile(r"[ \t]+")

# "Problema informado" e uma variante mais rara do mesmo campo (o que o
# usuario relatou, antes do diagnostico) - conta junto de "problema
# identificado" pra nao perder credito por causa da variante do formulario.
_LABELS = [
    "problema identificado",
    "problema informado",
    "o que foi feito",
    "observa[çc][õo]es",
]
_LABEL_RE = re.compile(r"(" + "|".join(_LABELS) + r")\s*:", re.IGNORECASE)


def _html_to_lines(raw_html: str) -> str:
    text = _BLOCK_BREAK_RE.sub("\n", raw_html)
    text = _TAG_RE.sub(" ", text)
    text = html_lib.unescape(text)
    text = _WS_RE.sub(" ", text)
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def parse_solution_fields(raw_html: str | None) -> dict[str, str]:
    """Extrai os campos que o tecnico escreve (problema + o-que-foi-feito +
    observacoes), independente de qual dos formatos de HTML acima o GLPI
    gerou pra esse chamado especifico. Campo ausente -> string vazia."""
    if not raw_html:
        return {"problema_identificado": "", "o_que_foi_feito": "", "observacoes": ""}

    text = _html_to_lines(raw_html)
    matches = list(_LABEL_RE.finditer(text))

    raw_fields: dict[str, str] = {}
    for i, m in enumerate(matches):
        label = m.group(1).lower()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        value = text[start:end].strip(" \n")
        if value:
            raw_fields[label] = (raw_fields.get(label, "") + " " + value).strip()

    problema = " ".join(
        v for k, v in raw_fields.items() if k in ("problema identificado", "problema informado") and v
    ).strip()
    return {
        "problema_identificado": problema,
        "o_que_foi_feito": raw_fields.get("o que foi feito", ""),
        "observacoes": next((v for k, v in raw_fields.items() if k.startswith("observa")), ""),
    }


def _field_credit(text: str, words_for_full_credit: int) -> float:
    words = len(text.split())
    if words == 0:
        return 0.0
    return min(words / words_for_full_credit, 1.0)


# Palavras pra "campo cheio" (1.0) - abaixo disso, credito parcial
# proporcional. Poucas de proposito: "CUPS caiu mas voltou" (4 palavras) ja
# e uma frase minima aceitavel, nao deveria zerar.
_WORDS_FOR_FULL_CREDIT = {"problema_identificado": 6, "o_que_foi_feito": 6, "observacoes": 4}

# Problema/o-que-foi-feito pesam 45% cada (sao os campos que o tecnico
# escreve de verdade); observacoes e so bonus de 10% - preenchido ou nao,
# nao pode carregar a nota sozinho (ver caso real: chamado com os dois
# campos obrigatorios vazios e so "Observacoes" preenchido teria nota alta
# se observacoes pesasse igual, o que contraria o pedido original: campo
# obrigatorio em branco = resposta ruim, ponto final).
_WEIGHTS = {"problema_identificado": 0.45, "o_que_foi_feito": 0.45, "observacoes": 0.10}


def solution_quality_score(raw_html: str | None) -> float:
    """0-100. Sem ITILSolution nenhuma -> 0 (nao documentar a solucao e, na
    pratica, o pior caso - nao um "sem dado" neutro)."""
    if not raw_html:
        return 0.0
    fields = parse_solution_fields(raw_html)
    score = sum(
        _WEIGHTS[key] * _field_credit(fields[key], _WORDS_FOR_FULL_CREDIT[key])
        for key in _WEIGHTS
    )
    return round(score * 100, 1)

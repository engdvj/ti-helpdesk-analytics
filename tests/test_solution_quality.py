from ti_analytics.glpi.solution_quality import parse_solution_fields, solution_quality_score

# Amostras reais do GLPI (17/07/2026, chamados de TI) - ver investigacao que
# motivou essa heuristica. Rotulo+valor no mesmo <strong>.
BEM_PREENCHIDO = (
    "<p><strong>Data do atendimento: 17/07/2026 às 17:11<br></strong>"
    "<strong>Técnico: João Pedro</strong></p>"
    "<p><strong>Problema identificado: A impressora de pulseiras zebra estava "
    "sem nenhum cartucho utilizavel.</strong></p>"
    "<p><strong>O que foi feito: Foi deixado na coordenação de obito uma caixa "
    "fechada e um cartucho solto para teste.</strong><br><br></p>"
    "<p><strong>Observações:</strong><br><br></p>"
)

UMA_LINHA_SO = (
    "<p><strong>Data do atendimento: 17/07/2026 às 16:31<br></strong>"
    "<strong>Técnico: Arthur Pereira</strong></p>"
    "<p><strong>Problema identificado: não imprime</strong><br><br></p>"
    "<p><strong>O que foi feito: CUPS caiu mas voltou.</strong><br><br></p>"
    "<p><strong>Observações:</strong><br><br></p>"
)

CAMPOS_OBRIGATORIOS_EM_BRANCO = (
    "<p><strong>Data do atendimento: 17/07/2026 às 11:12<br></strong>"
    "<strong>Técnico: Eduarda Lima</strong></p>"
    "<p><strong>Problema identificado:</strong><br><br></p>"
    "<p><strong>O que foi feito:</strong><br><br></p>"
    "<p><strong>Observações: Realizada a retirada dos cabos e colocado "
    "novamente.</strong><br><br></p>"
)

# Bug real encontrado (18/07/2026): estes 4 sao chamados de Joao Frutuoso com
# respostas evidentemente boas que pontuaram 0 antes da correcao, porque o
# valor fica FORA do <strong> do rotulo - formatos que o parser antigo (que
# so olhava dentro do <strong>) nao capturava.

# Rotulo sozinho num <p>, valor em <p> separado logo em seguida.
VALOR_EM_PARAGRAFO_SEPARADO = (
    "<p><strong>Data do atendimento: 17/07/2026 às 09:52<br></strong>"
    "<strong>Técnico: João Frutuoso</strong></p>"
    '<p class="x"><strong data-start="61" data-end="87">Problema identificado:</strong></p>'
    '<p data-start="89" data-end="352">Ao chegar ao local, foi constatado que o telefone da '
    "rouparia estava totalmente sem sinal (mudo), impossibilitando o recebimento de ligações.</p>"
    '<p data-start="354"><strong data-start="354">O que foi feito:</strong></p>'
    '<p data-start="376">Após a inspeção da emenda, foi realizado o reinício do PABX. Após a '
    "reinicialização, o telefone voltou a funcionar normalmente.</p>"
    '<p data-start="547"><strong data-start="547">Observações:</strong></p>'
    '<p data-start="565">Equipamento testado após o reinício do PABX, com funcionamento normalizado.</p>'
)

# "Problema informado" (variante rara) + valor apos <br> no mesmo <p> +
# "O que foi feito" preenchido como lista <ul><li>.
VALOR_APOS_BR_E_EM_LISTA = (
    '<p class="isSelectedEnd"><strong>Data do atendimento:</strong> 17/07/2026 às 09:12<br>'
    "<strong>Técnico:</strong> João Frutuoso</p>"
    '<p class="isSelectedEnd"><strong>Problema informado:</strong><br>'
    "Scanner do RHC parou de funcionar no computador após a formatação do sistema.</p>"
    '<p class="isSelectedEnd"><strong>Problema identificado:</strong><br>'
    "Após a formatação, os drivers do scanner não estavam instalados.</p>"
    '<p class="isSelectedEnd"><strong>O que foi feito:</strong></p>'
    '<ul data-spread="false">'
    "<li>Instalação dos drivers do scanner.</li>"
    "<li>Instalação e configuração do NAPS2 para realização das digitalizações.</li>"
    "</ul>"
    "<p><strong>Observações:</strong><br>Após a instalação dos drivers e do NAPS2, o scanner "
    "voltou a funcionar normalmente.</p>"
)

# Mesmo padrao de <p> separado, mas com classe isSelectedEnd (variante D).
VALOR_EM_PARAGRAFO_SEPARADO_COM_CLASSE = (
    "<p><strong>Data do atendimento: 16/07/2026 às 15:15<br></strong>"
    "<strong>Técnico: João Frutuoso</strong></p>"
    '<p class="isSelectedEnd"><strong>Problema identificado:</strong></p>'
    '<p class="isSelectedEnd">A impressora não recebia os arquivos enviados para impressão. '
    "Durante a inspeção, foi constatado que o cilindro estava desgastado.</p>"
    '<p class="isSelectedEnd"><strong>O que foi feito:</strong></p>'
    '<p class="isSelectedEnd">Inicialmente, foi realizada a substituição da pastilha verde, '
    "porém o problema persistiu. Em seguida, foi efetuada a troca do cilindro.</p>"
    '<p class="isSelectedEnd"><strong>Observações:</strong></p>'
    "<p>Equipamento testado após a manutenção, apresentando funcionamento normal.</p>"
)

# Rotulo e valor no mesmo <p>, separados por <br> (sem paragrafo extra).
VALOR_APOS_BR_MESMO_P = (
    '<p class="isSelectedEnd"><strong>Data do atendimento:</strong> 16/07/2026 às 10:53<br>'
    "<strong>Técnico:</strong> João Frutuoso</p>"
    '<p class="isSelectedEnd"><strong>Problema identificado:</strong><br>'
    "A impressora apresentava impressão levemente clara na lateral da folha.</p>"
    '<p class="isSelectedEnd"><strong>O que foi feito:</strong><br>'
    "Foi realizada a verificação do cilindro da impressora e executados testes de impressão.</p>"
    "<p><strong>Observações:</strong><br>O cilindro apresenta sinais de desgaste.</p>"
)


def test_parse_extrai_os_tres_campos():
    fields = parse_solution_fields(BEM_PREENCHIDO)
    assert fields["problema_identificado"] == "A impressora de pulseiras zebra estava sem nenhum cartucho utilizavel."
    assert fields["o_que_foi_feito"] == "Foi deixado na coordenação de obito uma caixa fechada e um cartucho solto para teste."
    assert fields["observacoes"] == ""


def test_parse_sem_html_devolve_campos_vazios():
    fields = parse_solution_fields(None)
    assert fields == {"problema_identificado": "", "o_que_foi_feito": "", "observacoes": ""}
    assert parse_solution_fields("") == fields


def test_resposta_bem_preenchida_pontua_alto():
    assert solution_quality_score(BEM_PREENCHIDO) >= 85.0


def test_resposta_de_uma_linha_pontua_medio_baixo():
    score = solution_quality_score(UMA_LINHA_SO)
    assert 20.0 <= score <= 60.0


def test_campos_obrigatorios_em_branco_pontua_baixo_mesmo_com_observacoes():
    # "Observacoes" preenchida nao pode compensar Problema/O-que-foi-feito
    # vazios - e exatamente o caso que motivou o peso de 10% pra esse campo.
    score = solution_quality_score(CAMPOS_OBRIGATORIOS_EM_BRANCO)
    assert score <= 15.0


def test_sem_solucao_nenhuma_pontua_zero():
    assert solution_quality_score(None) == 0.0
    assert solution_quality_score("") == 0.0


def test_valor_em_paragrafo_separado_e_capturado():
    fields = parse_solution_fields(VALOR_EM_PARAGRAFO_SEPARADO)
    assert "telefone da rouparia" in fields["problema_identificado"]
    assert "reinício do PABX" in fields["o_que_foi_feito"]
    assert "normalizado" in fields["observacoes"]
    assert solution_quality_score(VALOR_EM_PARAGRAFO_SEPARADO) >= 85.0


def test_valor_apos_br_e_lista_e_capturado():
    fields = parse_solution_fields(VALOR_APOS_BR_E_EM_LISTA)
    # "Problema informado" conta junto de "Problema identificado"
    assert "Scanner do RHC" in fields["problema_identificado"]
    assert "drivers do scanner não estavam instalados" in fields["problema_identificado"]
    assert "Instalação dos drivers" in fields["o_que_foi_feito"]
    assert solution_quality_score(VALOR_APOS_BR_E_EM_LISTA) >= 85.0


def test_valor_em_paragrafo_separado_com_classe_e_capturado():
    assert solution_quality_score(VALOR_EM_PARAGRAFO_SEPARADO_COM_CLASSE) >= 85.0


def test_valor_apos_br_mesmo_paragrafo_e_capturado():
    assert solution_quality_score(VALOR_APOS_BR_MESMO_P) >= 85.0

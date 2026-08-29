"use client";

import { useState } from "react";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { checklistItems as checklistItemsApi, cycles as cyclesApi, type CycleItem, type CycleResultado } from "@/lib/api";
import { agruparPorSecao, RESULTADO_LABEL } from "@/lib/preventiva-checklists";

const RESULTADOS_QUE_EXIGEM_PENDENCIA: CycleResultado[] = ["corretiva_aberta", "interrompido"];

type Tab = "checklist" | "resultado" | "validacao";
const TABS: { key: Tab; label: string }[] = [
  { key: "checklist", label: "Checklist" },
  { key: "resultado", label: "Resultado" },
  { key: "validacao", label: "Validação" },
];

/** C3 - Checklist 3 do PDF (execução). Itens (e suas seções) vêm do
 * catálogo editável pelo admin. "Corretiva aberta"/"Interrompido" exigem
 * chamado GLPI + pendência com responsável e prazo (regra de ouro:
 * pendência sempre tem dono e data). `existingItem` presente = reabrindo um
 * item já finalizado: técnico só visualiza (`readOnly`), admin edita e
 * salva correção. */
export function ExecutionChecklist({
  cycleId,
  itemId,
  existingItem,
  readOnly = false,
  onClose,
  onDone,
}: {
  cycleId: number;
  itemId: number;
  existingItem?: CycleItem;
  readOnly?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: defs } = useSWR(["checklist-items", "execucao"], () => checklistItemsApi.list("execucao", true));
  const [tab, setTab] = useState<Tab>("checklist");

  const marcasIniciais = Object.fromEntries(
    (existingItem?.execucao_itens ?? []).map((i) => [i.item, i.status as "ok" | "na"]),
  );
  const observacoesIniciais = Object.fromEntries(
    (existingItem?.execucao_itens ?? []).filter((i) => i.observacao).map((i) => [i.item, i.observacao]),
  );
  const observacoesAbertasIniciais = Object.fromEntries(
    Object.keys(observacoesIniciais).map((texto) => [texto, true]),
  );

  const [itens, setItens] = useState<Record<string, "ok" | "na">>(marcasIniciais);
  const [observacoes, setObservacoes] = useState<Record<string, string>>(observacoesIniciais);
  const [observacaoAberta, setObservacaoAberta] = useState<Record<string, boolean>>(observacoesAbertasIniciais);
  const [resultado, setResultado] = useState<CycleResultado | "">(existingItem?.resultado ?? "");
  const [resumo, setResumo] = useState(existingItem?.resumo ?? "");
  const [chamadoGlpi, setChamadoGlpi] = useState(existingItem?.chamado_glpi ?? "");
  const [pendenciaResponsavel, setPendenciaResponsavel] = useState(existingItem?.pendencia_responsavel ?? "");
  const [pendenciaPrazo, setPendenciaPrazo] = useState(existingItem?.pendencia_prazo ?? "");
  const [pontoFocalNome, setPontoFocalNome] = useState(existingItem?.ponto_focal_nome ?? "");
  const [pontoFocalData, setPontoFocalData] = useState(existingItem?.ponto_focal_data ?? "");
  const [saving, setSaving] = useState<"rascunho" | "finalizar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labels = defs?.map((d) => d.texto) ?? [];
  const grupos = agruparPorSecao(defs ?? []);
  const exigePendencia = resultado !== "" && RESULTADOS_QUE_EXIGEM_PENDENCIA.includes(resultado);
  const todosMarcados = labels.length > 0 && labels.every((item) => itens[item]);
  const pendenciaCompleta = !exigePendencia || Boolean(chamadoGlpi.trim() && pendenciaResponsavel.trim() && pendenciaPrazo);
  const podeFinalizar = todosMarcados && resultado !== "" && pendenciaCompleta;
  const marcadosCount = labels.filter((item) => itens[item]).length;

  async function submit(rascunho: boolean) {
    setSaving(rascunho ? "rascunho" : "finalizar");
    setError(null);
    try {
      await cyclesApi.execute(cycleId, itemId, {
        itens,
        observacoes,
        resultado: resultado || null,
        resumo: resumo || null,
        chamado_glpi: chamadoGlpi || null,
        pendencia_responsavel: pendenciaResponsavel || null,
        pendencia_prazo: pendenciaPrazo || null,
        ponto_focal_nome: pontoFocalNome || null,
        ponto_focal_data: pontoFocalData || null,
        // proxima_preventiva é calculada no backend pelo intervalo do ciclo + prioridade
        rascunho,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const titulo = readOnly ? "Checklist de execução (somente leitura)" : existingItem ? "Editar checklist de execução" : "Checklist de execução";

  return (
    <Modal title={titulo} onClose={onClose} maxWidth={720}>
      <div style={{ marginBottom: "0.75rem" }}>
        <Tabs tabs={TABS} active={tab} onChange={(key) => setTab(key as Tab)} />
      </div>
      {tab === "checklist" && labels.length > 0 && (
        <p className="preventiva-exec-progress">{marcadosCount}/{labels.length} marcados</p>
      )}

      {tab === "checklist" && (
        <div className="preventiva-exec-checklist">
          {grupos.map((grupo, indiceGrupo) => (
            <div key={indiceGrupo} className="preventiva-exec-secao">
              {grupo.secao && <h3>{grupo.secao}</h3>}
              <ul>
                {grupo.itens.map((def) => (
                  <li key={def.id} className="preventiva-exec-item">
                    <div className="preventiva-exec-item-main">
                      <span>{def.texto}</span>
                      <div role="radiogroup" aria-label={def.texto} className="preventiva-exec-okna">
                        {(["ok", "na"] as const).map((value) => (
                          <label key={value} className={`preventiva-exec-okna-option is-${value} ${itens[def.texto] === value ? "is-checked" : ""}`}>
                            <input
                              type="radio"
                              name={def.texto}
                              checked={itens[def.texto] === value}
                              disabled={readOnly}
                              onChange={() => setItens((current) => ({ ...current, [def.texto]: value }))}
                            />
                            {value.toUpperCase()}
                          </label>
                        ))}
                      </div>
                    </div>
                    {observacaoAberta[def.texto] ? (
                      <input
                        type="text"
                        placeholder="Observação"
                        autoFocus
                        value={observacoes[def.texto] ?? ""}
                        disabled={readOnly}
                        onChange={(e) => setObservacoes((current) => ({ ...current, [def.texto]: e.target.value }))}
                        className="preventiva-exec-observacao-input"
                      />
                    ) : (
                      !readOnly && (
                        <button
                          type="button"
                          className="preventiva-exec-observacao-toggle"
                          onClick={() => setObservacaoAberta((current) => ({ ...current, [def.texto]: true }))}
                        >
                          + observação
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {labels.length === 0 && (
            <p style={{ color: "var(--apagado)" }}>
              Nenhum item de execução configurado. Um admin precisa cadastrar em Admin → Checklists.
            </p>
          )}
        </div>
      )}

      {tab === "resultado" && (
        <div className="preventiva-form">
          <label>
            Resultado do atendimento
            <select value={resultado} disabled={readOnly} onChange={(e) => setResultado(e.target.value as CycleResultado)}>
              <option value="">Selecione...</option>
              {Object.entries(RESULTADO_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            Resumo do que foi feito
            <textarea value={resumo} disabled={readOnly} onChange={(e) => setResumo(e.target.value)} rows={2} />
          </label>

          {exigePendencia && (
            <>
              <label>
                Chamado GLPI <span style={{ color: "var(--critico)" }}>*</span>
                <input value={chamadoGlpi} disabled={readOnly} onChange={(e) => setChamadoGlpi(e.target.value)} required />
              </label>
              <label>
                Pendência — responsável <span style={{ color: "var(--critico)" }}>*</span>
                <input value={pendenciaResponsavel} disabled={readOnly} onChange={(e) => setPendenciaResponsavel(e.target.value)} required />
              </label>
              <label>
                Pendência — prazo <span style={{ color: "var(--critico)" }}>*</span>
                <input type="date" value={pendenciaPrazo} disabled={readOnly} onChange={(e) => setPendenciaPrazo(e.target.value)} required />
              </label>
            </>
          )}
        </div>
      )}

      {tab === "validacao" && (
        <div className="preventiva-form">
          <label>
            Validação do setor — responsável do setor
            <input value={pontoFocalNome} disabled={readOnly} onChange={(e) => setPontoFocalNome(e.target.value)} />
          </label>
          <label>
            Validação do setor — data
            <input type="date" value={pontoFocalData} disabled={readOnly} onChange={(e) => setPontoFocalData(e.target.value)} />
          </label>
          <label>
            Próxima preventiva
            <input
              type="text"
              readOnly
              value={existingItem?.proxima_preventiva ?? "Calculada ao finalizar, pela prioridade do computador"}
            />
          </label>
        </div>
      )}

      {error && <p className="admin-panel-result is-error">{error}</p>}

      {!readOnly && (
        <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          {!existingItem && (
            <Botao variant="secundario" onClick={() => submit(true)} disabled={saving !== null}>
              {saving === "rascunho" ? "Salvando..." : "Salvar rascunho"}
            </Botao>
          )}
          <Botao variant="primario" onClick={() => submit(false)} disabled={!podeFinalizar || saving !== null}>
            {saving === "finalizar" ? "Salvando..." : existingItem ? "Salvar correção" : "Finalizar atendimento"}
          </Botao>
        </div>
      )}
    </Modal>
  );
}

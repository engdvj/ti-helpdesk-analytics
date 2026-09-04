"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Bar } from "@/components/ui/Bar";
import { Botao } from "@/components/ui/Botao";
import { Modal } from "@/components/ui/Modal";
import { computers as computersApi, type ScoreComponente } from "@/lib/api";

import { ComputerHardwareForm } from "./ComputerHardwareForm";

const NIVEL_LABEL: Record<string, string> = { bom: "Bom", atencao: "Atenção", critico: "Crítico" };

function gb(mb: number | null): string {
  if (mb == null) return "—";
  const v = mb / 1024;
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} GB`;
}

function corComponente(c: ScoreComponente): string {
  if (c.pontos <= 0) return "var(--critico)";
  if (c.pontos < c.peso) return "var(--aviso)";
  return "var(--positivo, #4ba67b)";
}

export function ComputerDetailModal({
  computerId,
  onClose,
  onEditar,
  podeEditar = false,
}: {
  computerId: number;
  onClose: () => void;
  /** Só passado quando `podeEditar` — abre o modal de edição do PC. */
  onEditar?: () => void;
  /** Sem isto (default): detalhe só-leitura — sem "Editar", sem informar/editar/
   * remover hardware à mão. O score e as specs continuam visíveis pra todos. */
  podeEditar?: boolean;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR(["computer", computerId], () => computersApi.get(computerId));
  const [editandoHw, setEditandoHw] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  const manual = data != null && data.id_glpi_computer == null;
  const podeMexerHardware = podeEditar && manual;

  function revalidarLista() {
    void globalMutate((key) => Array.isArray(key) && (key[0] === "computers" || key[0] === "computer"));
  }

  async function removerHardware() {
    if (!window.confirm("Remover os dados de hardware informados? O score volta a ficar sem nota.")) return;
    setRemovendo(true);
    try {
      await computersApi.deleteHardware(computerId);
      await mutate();
      revalidarLista();
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <Modal title={data ? (data.hostname ?? data.patrimonio ?? `Computador #${data.id}`) : "Computador"} onClose={onClose} maxWidth={560}>
      {isLoading && !data ? (
        <p style={{ color: "var(--apagado)" }}>Carregando...</p>
      ) : error || !data ? (
        <p style={{ color: "var(--critico)" }}>Não foi possível carregar o computador.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <p style={{ color: "var(--apagado)", fontSize: "var(--fonte-label)", margin: 0 }}>
            {data.patrimonio ? `Patrimônio ${data.patrimonio}` : "Sem patrimônio"}
            {" · "}
            {manual ? "Cadastro manual" : `Importado do GLPI (Computer #${data.id_glpi_computer})`}
          </p>

          {editandoHw && podeMexerHardware ? (
            <ComputerHardwareForm
              computerId={computerId}
              initial={data.hardware}
              onCancel={() => setEditandoHw(false)}
              onSaved={(detalhe) => {
                void mutate(detalhe, { revalidate: false });
                revalidarLista();
                setEditandoHw(false);
              }}
            />
          ) : data.hardware_score == null ? (
            <div className="preventiva-detail-box" style={{ color: "var(--apagado)" }}>
              <p style={{ margin: 0 }}>
                Sem dados de hardware —{" "}
                {manual ? "este PC não roda o GLPI Agent." : "este computador não foi importado do GLPI Agent."}
              </p>
              {podeMexerHardware && (
                <Botao variant="secundario" onClick={() => setEditandoHw(true)} style={{ marginTop: "0.7rem" }}>
                  Informar manualmente
                </Botao>
              )}
            </div>
          ) : (
            <>
              {/* --- Score de saúde --- */}
              <div className="preventiva-detail-box">
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.9rem" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "2.6rem", fontWeight: 600, lineHeight: 1 }}>
                    {data.hardware_score}
                  </span>
                  <span style={{ color: "var(--apagado)" }}>/ 100</span>
                  <span className={`preventiva-badge is-nivel-${data.hardware_nivel}`} style={{ marginLeft: "auto" }}>
                    {NIVEL_LABEL[data.hardware_nivel ?? ""] ?? data.hardware_nivel}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {(data.score_componentes ?? []).map((c) => (
                    <div key={c.dimensao} style={{ display: "grid", gridTemplateColumns: "8.5rem 1fr", gap: "0.6rem", alignItems: "center" }}>
                      <span style={{ fontSize: "var(--fonte-label)" }}>
                        {c.dimensao}
                        <span style={{ color: "var(--apagado)" }}> · {c.pontos}/{c.peso}</span>
                      </span>
                      <div title={c.texto} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Bar pct={Math.round((c.pontos / c.peso) * 100)} height={8} color={corComponente(c)} />
                      </div>
                    </div>
                  ))}
                </div>
                {data.hardware && (
                  <p style={{ color: "var(--apagado)", fontSize: "0.68rem", marginTop: "0.8rem", marginBottom: 0 }}>
                    {manual ? "Informado manualmente" : "Última leitura do GLPI"}: {data.hardware.atualizado_em.slice(0, 10)}
                  </p>
                )}
              </div>

              {/* --- Especificações --- */}
              {data.hardware && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
                    <h3 style={{ fontSize: "var(--fonte-label)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--apagado)", margin: 0 }}>
                      Especificações
                    </h3>
                    {podeMexerHardware && (
                      <span style={{ display: "flex", gap: "0.75rem" }}>
                        <button type="button" className="preventiva-linkish" onClick={() => setEditandoHw(true)}>Editar</button>
                        <button type="button" className="preventiva-linkish is-danger" onClick={removerHardware} disabled={removendo}>
                          Remover
                        </button>
                      </span>
                    )}
                  </div>
                  <dl className="preventiva-detail-specs">
                    <dt>CPU</dt><dd>{data.hardware.cpu_designacao ?? "—"}</dd>
                    <dt>Memória</dt><dd>{gb(data.hardware.ram_mb)}</dd>
                    <dt>Disco</dt>
                    <dd>
                      {data.hardware.disco_tipo ?? "—"}
                      {data.hardware.disco_total_mb != null && ` · ${gb(data.hardware.disco_livre_mb)} livres de ${gb(data.hardware.disco_total_mb)}`}
                    </dd>
                    <dt>Sistema</dt>
                    <dd>
                      {data.hardware.so_nome ?? "—"}
                      {data.hardware.so_instalado_em && ` · instalado em ${data.hardware.so_instalado_em}`}
                    </dd>
                    <dt>Vídeo</dt>
                    <dd>
                      {data.hardware.gpu_designacao ?? "—"}
                      {data.hardware.gpu_memoria_mb != null && ` · ${gb(data.hardware.gpu_memoria_mb)}`}
                    </dd>
                  </dl>
                </div>
              )}
            </>
          )}

          {!editandoHw && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <Botao variant="secundario" onClick={onClose}>Fechar</Botao>
              {podeEditar && onEditar && <Botao variant="primario" onClick={onEditar}>Editar</Botao>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

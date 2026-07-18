"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import useSWR from "swr";

import { Avatar } from "@/components/ui/Avatar";
import { Bar } from "@/components/ui/Bar";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import {
  adminApi,
  analytics,
  competencies,
  type CompetencyActivityProgress,
  type CompetencySituationProgress,
  type CompetencyTechnicianDetail,
  type ScoreTargets,
  type TechSnapshot,
  type TechnicianProfile,
  type TechnicianRecentTicket,
} from "@/lib/api";
import { useCumulativo } from "@/lib/cumulativo-context";
import { formatPeriodRef } from "@/lib/date";
import { GRANULARIDADE_OPTIONS, useGranularidade } from "@/lib/granularidade-context";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { SCORE_LABELS, scoreColor, snapshotHasActivity } from "@/lib/score";
import { useScoreMode } from "@/lib/score-mode-context";
import { useSnapshots } from "@/lib/snapshot-context";
import { resolveTechnicianDisplay, useTechnicians } from "@/lib/technicians";
import { unitDisplayName, useUnits } from "@/lib/units";

type Tab = "resumo" | "chamados" | "indicadores";

interface Props {
  snapshot: TechSnapshot;
  entitiesId?: number;
  granularidade?: "diaria" | "semanal" | "mensal";
  cumulativo?: boolean;
  stackIndex?: number;
  isTopMost?: boolean;
  onActivate?: () => void;
  onClose: () => void;
}

/** Modal de drill-down por tecnico - decalcado de TeamModal.tsx (portal +
 * abas) da branch multicampeonato do fifa_analytics, simplificado pra 3
 * abas: Resumo (stat-tiles + sub-scores), Chamados (recentes), Indicadores
 * (sinais derivados dos chamados; não são a matriz declarada do módulo de
 * Competências e não entram no ranking). */
export function TechnicianModal({
  snapshot,
  entitiesId,
  granularidade,
  cumulativo,
  stackIndex = 0,
  isTopMost = true,
  onActivate,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("resumo");
  const usersId = snapshot.users_id;
  const cascadeIndex = stackIndex % 6;
  const { dataInicio, dataFim } = useSnapshots();
  const { data, error, isLoading } = useSWR(
    ["tech-profile", usersId, entitiesId, granularidade, cumulativo, snapshot.snapshot_seq, snapshot.score_mode ?? "equipe", dataInicio, dataFim],
    () => analytics.technicianProfile(
      usersId, entitiesId, granularidade, cumulativo, snapshot.snapshot_seq, snapshot.score_mode ?? "equipe",
      dataInicio, dataFim,
    ),
  );
  const {
    data: competencyData,
    error: competencyError,
    isLoading: competencyLoading,
  } = useSWR(
    tab === "indicadores" ? ["competency-technician", usersId] : null,
    () => competencies.technician(usersId),
  );

  const { data: technicians } = useTechnicians();
  const { data: units } = useUnits();
  const display = resolveTechnicianDisplay(
    usersId,
    snapshot.nome_completo || snapshot.username || "Técnico",
    technicians,
  );
  const title = (
    <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <Avatar nome={display.nome} foto={display.foto} size={28} />
      <span>
        {display.nome}
        <small style={{ display: "block", color: "var(--apagado)", fontFamily: "var(--font-mono)", fontSize: "0.58rem" }}>
          {unitDisplayName(display.unidadeSlug ?? snapshot.unidade_slug, units)}
        </small>
      </span>
    </span>
  );

  return (
    <Modal
      title={title}
      onClose={onClose}
      maxWidth={800}
      draggable
      modeless
      initialOffset={{ x: cascadeIndex * 24, y: cascadeIndex * 18 }}
      zIndex={200 + stackIndex}
      closeOnEscape={isTopMost}
      onActivate={onActivate}
    >
      <div style={{ marginBottom: "1rem" }}>
        <Tabs
          tabs={[
            { key: "resumo", label: "resumo" },
            { key: "chamados", label: "chamados" },
            { key: "indicadores", label: "indicadores" },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
        />
      </div>

      {tab === "resumo" && <ResumoTab atual={snapshot} details={data?.detalhes_snapshot} />}
      {tab === "chamados" && isLoading && <p style={{ color: "var(--apagado)" }}>Carregando...</p>}
      {tab === "chamados" && error && <p style={{ color: "var(--critico)" }}>{String((error as Error).message ?? error)}</p>}
      {tab === "chamados" && data && <ChamadosTab chamados={data.chamados_recentes} />}
      {tab === "indicadores" && competencyLoading && <p style={{ color: "var(--apagado)" }}>Carregando competências...</p>}
      {tab === "indicadores" && competencyError && <p style={{ color: "var(--critico)" }}>{String((competencyError as Error).message ?? competencyError)}</p>}
      {tab === "indicadores" && competencyData && <CompetencyIndicatorsTab data={competencyData} />}
    </Modal>
  );
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value);
}

function ResumoTab({
  atual,
  details,
}: {
  atual: TechSnapshot;
  details?: TechnicianProfile["detalhes_snapshot"];
}) {
  const [activeTile, setActiveTile] = useState<string | null>(null);
  const { cumulativo, setCumulativo } = useCumulativo();
  const { granularidade, setGranularidade } = useGranularidade();
  const { scoreMode, setScoreMode } = useScoreMode();
  const { data: snapshots, seqs, snapshotSeq, setSnapshotSeq, resetPeriodRange } = useSnapshots();
  const chamados = Number.isInteger(atual.chamados_resolvidos)
    ? atual.chamados_resolvidos.toFixed(0)
    : atual.chamados_resolvidos.toFixed(1);
  // Chamado com mais de 1 tecnico divide credito (peso_credito = 1/n) - so
  // aparece a diferenca entre "total de chamados tocados" e "creditos" pra
  // quem realmente teve algum chamado compartilhado (~5-7% da base, ver
  // CLAUDE.md). Pra maioria (credito == total), a legenda extra so
  // repetiria o mesmo numero - fica escondida nesse caso.
  const totalChamados = details?.chamados.length;
  const chamadosCaption =
    totalChamados != null && totalChamados > 0 && totalChamados !== atual.chamados_resolvidos
      ? `${totalChamados} chamados no total`
      : undefined;
  const tiles: Omit<SummaryTileProps, "isOpen" | "onToggle">[] = [
    {
      label: scoreMode === "metas" ? "Score por metas" : "Score relativo à equipe",
      value: atual.score_geral == null ? "—" : atual.score_geral.toFixed(1),
      caption: scoreMode === "metas" ? "100 = meta atingida" : "50 = média da equipe",
      color: scoreColor(atual.score_geral),
      details: <ScoreBreakdown snapshot={atual} />,
      tooltipClassName: "is-score-breakdown",
    },
    {
      label: "Chamados creditados",
      value: chamados,
      caption: chamadosCaption,
      color: "var(--tinta)",
      details: details && (
        <SummaryDetailList
          items={details.chamados.map((chamado) => ({
            label: `#${chamado.tickets_id}`,
            value: `${formatNumber(chamado.credito)} crédito`,
            nameSortValue: chamado.tickets_id,
            sortValue: chamado.credito,
          }))}
        />
      ),
    },
    {
      label: "Categorias distintas",
      value: atual.n_categorias.toFixed(0),
      color: "var(--tinta)",
      details: details && (
        <SummaryDetailList
          items={details.categorias.map((categoria) => ({
            label: categoria.nome,
            value: `${categoria.chamados} ${categoria.chamados === 1 ? "chamado" : "chamados"}`,
            nameSortValue: categoria.nome,
            sortValue: categoria.chamados,
          }))}
        />
      ),
    },
    {
      label: "Resposta média",
      value: snapshotHasActivity(atual) ? `${atual.resposta_media_min.toFixed(0)} min` : "—",
      color: "var(--tinta)",
      details: details && (
        <SummaryDetailList
          items={details.tempos_resposta.map((tempo) => ({
            label: `#${tempo.tickets_id}`,
            value: `${formatNumber(tempo.minutos)} min`,
            nameSortValue: tempo.tickets_id,
            sortValue: tempo.minutos,
          }))}
        />
      ),
    },
  ];

  const periodOptions = (seqs.length ? seqs : [atual.snapshot_seq]).map((seq) => ({
    seq,
    periodo: snapshots?.find((snapshot) => snapshot.snapshot_seq === seq)?.periodo_ref
      ?? (seq === atual.snapshot_seq ? atual.periodo_ref : String(seq)),
  }));

  return (
    <div>
      <div className="tecnico-snapshot-controls">
        <button
          type="button"
          className={`tecnico-snapshot-mode ${cumulativo ? "is-cumulative" : "is-individual"}`}
          onClick={() => {
            if (cumulativo) resetPeriodRange();
            setCumulativo(!cumulativo);
          }}
          title="Alternar entre intervalo agregado e período individual"
        >
          {cumulativo ? "Intervalo" : "Individual"}
        </button>
        <select
          className="tecnico-snapshot-mode is-neutral"
          aria-label="Alterar período"
          value={snapshotSeq ?? atual.snapshot_seq}
          onChange={(event) => setSnapshotSeq(Number(event.target.value))}
        >
          {periodOptions.map(({ seq, periodo }) => (
            <option key={seq} value={seq}>{formatPeriodRef(periodo)}</option>
          ))}
        </select>
        <select
          className="tecnico-snapshot-mode is-neutral"
          aria-label="Alterar granularidade"
          value={granularidade}
          onChange={(event) => {
            setGranularidade(event.target.value as TechSnapshot["granularidade"]);
            setCumulativo(false);
            resetPeriodRange();
          }}
        >
          {GRANULARIDADE_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          className={`tecnico-snapshot-mode ${scoreMode === "metas" ? "is-score-targets" : "is-score-team"}`}
          onClick={() => setScoreMode(scoreMode === "metas" ? "equipe" : "metas")}
          title="Alternar entre comparação relativa e metas absolutas"
        >
          {scoreMode === "metas" ? "Metas" : "Equipe"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.6rem" }}>
        {tiles.map((tile) => (
          <SummaryTile
            key={tile.label}
            {...tile}
            isOpen={activeTile === tile.label}
            onToggle={() => setActiveTile((current) => current === tile.label ? null : tile.label)}
          />
        ))}
      </div>
    </div>
  );
}

interface SummaryTileProps {
  label: string;
  value: string;
  caption?: string;
  color: string;
  details?: ReactNode;
  tooltipClassName?: string;
  isOpen: boolean;
  onToggle: () => void;
}

interface TooltipPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
}

function SummaryTile({ label, value, caption, color, details, tooltipClassName, isOpen, onToggle }: SummaryTileProps) {
  const tooltipId = useId();
  const tileRef = useRef<HTMLButtonElement>(null);
  const detailsSideRef = useRef<"left" | "right" | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const isScoreBreakdown = tooltipClassName === "is-score-breakdown";

  const positionDetails = useCallback(() => {
    if (!details || !tileRef.current) return;

    const rect = tileRef.current.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 10;
    const panelMaxHeight = isScoreBreakdown ? 360 : 280;
    const preferredWidth = isScoreBreakdown ? 430 : 280;
    const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding,
    );
    const roomRight = window.innerWidth - rect.right - gap - viewportPadding;
    const roomLeft = rect.left - gap - viewportPadding;
    const bestSideRoom = Math.max(roomRight, roomLeft);

    if (bestSideRoom >= 220) {
      let side = detailsSideRef.current;
      const selectedRoom = side === "right" ? roomRight : roomLeft;
      if (!side || selectedRoom < 220) {
        side = roomRight >= roomLeft ? "right" : "left";
        detailsSideRef.current = side;
      }
      const sideRoom = side === "right" ? roomRight : roomLeft;
      const sideWidth = Math.min(preferredWidth, sideRoom);
      const top = Math.min(
        Math.max(rect.top, viewportPadding),
        Math.max(viewportPadding, window.innerHeight - panelMaxHeight - viewportPadding),
      );
      setTooltipPosition({
        left: side === "right" ? rect.right + gap : rect.left - gap - sideWidth,
        top,
        width: sideWidth,
      });
      return;
    }

    const roomBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const roomAbove = rect.top - gap - viewportPadding;
    setTooltipPosition(roomBelow >= roomAbove
      ? { left, top: rect.bottom + gap, width }
      : { left, bottom: window.innerHeight - rect.top + gap, width });
  }, [details, isScoreBreakdown]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => positionDetails();
    window.addEventListener("sumula-modal-move", updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("sumula-modal-move", updatePosition);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, positionDetails]);

  function toggleDetails() {
    if (!details) return;
    if (isOpen) {
      setTooltipPosition(null);
      detailsSideRef.current = null;
    } else {
      detailsSideRef.current = null;
      positionDetails();
    }
    onToggle();
  }

  return (
    <button
      type="button"
      ref={tileRef}
      className={`tecnico-resumo-tile ${details ? "has-details" : ""} ${isOpen ? "is-open" : ""}`}
      aria-controls={details ? tooltipId : undefined}
      aria-expanded={details ? isOpen : undefined}
      style={{ borderLeftColor: color }}
      onClick={toggleDetails}
    >
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: "1.2rem",
          fontWeight: 800,
          color,
        }}
      >
        {value}
      </span>
      <span style={{ display: "block", fontSize: "0.65rem", color: "var(--apagado)" }}>{label}</span>
      {caption && (
        <span style={{ display: "block", fontSize: "0.6rem", color: "var(--apagado)", opacity: 0.8, marginTop: "0.15rem" }}>
          {caption}
        </span>
      )}
      {details && isOpen && tooltipPosition && createPortal(
        <div
          id={tooltipId}
          role="region"
          aria-label={`Detalhes de ${label}`}
          className={`tecnico-resumo-tooltip is-portaled ${tooltipClassName ?? ""}`}
          style={tooltipPosition}
          onClick={(event) => event.stopPropagation()}
        >
          {details}
        </div>,
        document.body,
      )}
    </button>
  );
}

interface SummaryDetailItem {
  label: string;
  value: string;
  nameSortValue: string | number;
  sortValue: number;
}

type SortKey = "name" | "value";
type SortDirection = "asc" | "desc";

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

function compareSortableItems<T extends Pick<SummaryDetailItem, "label" | "nameSortValue" | "sortValue">>(
  a: T,
  b: T,
  sort: SortState,
): number {
  let difference: number;
  if (sort.key === "value") {
    difference = a.sortValue - b.sortValue;
  } else if (typeof a.nameSortValue === "number" && typeof b.nameSortValue === "number") {
    difference = a.nameSortValue - b.nameSortValue;
  } else {
    difference = String(a.nameSortValue).localeCompare(String(b.nameSortValue), "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  }

  if (difference === 0) difference = a.label.localeCompare(b.label, "pt-BR");
  return sort.direction === "asc" ? difference : -difference;
}

function SummarySortControls({
  sort,
  onChange,
  valueLabel = "Valor",
}: {
  sort: SortState;
  onChange: (sort: SortState) => void;
  valueLabel?: string;
}) {
  const options: { key: SortKey; label: string; ascLabel: string; descLabel: string }[] = [
    { key: "name", label: "Nome", ascLabel: "Ordenar nomes de A a Z", descLabel: "Ordenar nomes de Z a A" },
    { key: "value", label: valueLabel, ascLabel: "Ordenar valores do menor para o maior", descLabel: "Ordenar valores do maior para o menor" },
  ];

  return (
    <div className="tecnico-resumo-sort" aria-label="Ordenação dos dados">
      {options.map((option) => (
        <div key={option.key} className="tecnico-resumo-sort-group">
          <span>{option.label}</span>
          <button
            type="button"
            aria-label={option.ascLabel}
            aria-pressed={sort.key === option.key && sort.direction === "asc"}
            onClick={() => onChange({ key: option.key, direction: "asc" })}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            aria-label={option.descLabel}
            aria-pressed={sort.key === option.key && sort.direction === "desc"}
            onClick={() => onChange({ key: option.key, direction: "desc" })}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function SummaryDetailList({ items }: { items: SummaryDetailItem[] }) {
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" });
  if (items.length === 0) return <span>Sem dados neste recorte.</span>;

  const orderedItems = [...items].sort((a, b) => compareSortableItems(a, b, sort));

  return (
    <div>
      <SummarySortControls sort={sort} onChange={setSort} />
      <dl className="tecnico-resumo-detail-list">
        {orderedItems.map((item, index) => (
          <div key={`${item.label}-${index}`}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ScoreBreakdown({ snapshot }: { snapshot: TechSnapshot }) {
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" });
  const { data: targets } = useSWR("public-score-targets", () => adminApi.getScoreTargets());
  if (!snapshotHasActivity(snapshot)) {
    return <p style={{ margin: 0, color: "var(--superficie)" }}>Sem atividade neste período; não há score calculado.</p>;
  }

  const scoreMode = snapshot.score_mode ?? "equipe";
  const scores = SCORE_LABELS.map(({ key, label }) => ({
    key,
    label,
    nameSortValue: label,
    sortValue: snapshot[key] as number,
    rawValue: scoreRawValue(snapshot, key, targets),
  })).sort((a, b) => compareSortableItems(a, b, sort));

  return (
    <div className={`tecnico-score-breakdown is-${scoreMode}`}>
      <div className="tecnico-score-method">
        <strong>{scoreMode === "metas" ? "Nota por meta" : "Nota relativa"}</strong>
        <span>
          {scoreMode === "metas"
            ? "Resultado bruto → nota. 100 pts = meta atingida."
            : "Resultado bruto → nota. 50 pts = média da equipe."}
        </span>
      </div>
      <SummarySortControls sort={sort} onChange={setSort} valueLabel="Nota" />
      {scores.map(({ key, label, sortValue, rawValue }) => (
        <SubScoreBar key={key} label={label} value={sortValue} rawValue={rawValue} inverse />
      ))}
    </div>
  );
}

function scoreRawValue(
  snapshot: TechSnapshot,
  key: (typeof SCORE_LABELS)[number]["key"],
  targets?: ScoreTargets,
): string {
  const metas = snapshot.score_mode === "metas";
  if (key === "score_volume") {
    const rate = snapshot.volume_por_dia == null ? "" : ` (${formatNumber(snapshot.volume_por_dia)}/dia)`;
    const target = metas && targets ? ` · meta ${formatNumber(targets.volume_por_dia)}/dia` : "";
    return `Resultado: ${formatNumber(snapshot.chamados_resolvidos)} créditos${rate}${target}`;
  }
  if (key === "score_complexidade") {
    const target = metas && targets ? ` · meta ${formatNumber(targets.complexidade_categoria, 2)}x` : "";
    return `Resultado: ${formatNumber(snapshot.complexidade_categoria_media, 2)}x${target}`;
  }
  if (key === "score_velocidade_resposta") {
    const target = metas && targets ? ` · meta ≤ ${formatNumber(targets.resposta_min)} min` : "";
    return `Resultado: ${formatNumber(snapshot.resposta_media_min)} min${target}`;
  }
  if (key === "score_abrangencia") {
    const ratio = snapshot.abrangencia_ratio == null ? "" : ` (${formatNumber(snapshot.abrangencia_ratio, 2)}/chamado)`;
    const target = metas && targets ? ` · meta ${formatNumber(targets.abrangencia_ratio, 2)}/chamado` : "";
    return `Resultado: ${snapshot.n_categorias} categorias${ratio}${target}`;
  }
  const target = metas && targets ? ` · meta ${formatNumber(targets.qualidade)}` : "";
  return `Resultado: ${formatNumber(snapshot.resposta_qualidade_media ?? 0)}/100${target}`;
}

function SubScoreBar({
  label,
  value,
  rawValue,
  inverse = false,
}: {
  label: string;
  value: number;
  rawValue?: string;
  inverse?: boolean;
}) {
  const labelColor = inverse ? "var(--superficie)" : "var(--tinta)";
  const captionColor = inverse
    ? "color-mix(in srgb, var(--superficie) 58%, transparent)"
    : "var(--apagado)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem" }}>
        <span style={{ fontSize: "var(--fonte-label)", fontWeight: 600, color: labelColor }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fonte-dados)", fontWeight: 700, color: scoreColor(value), flexShrink: 0 }}>
          {value.toFixed(0)} pts
        </span>
      </div>
      <Bar
        pct={value}
        height={8}
        color={scoreColor(value)}
        trackColor={inverse ? "color-mix(in srgb, var(--superficie) 22%, transparent)" : undefined}
      />
      {rawValue && (
        <span style={{ fontSize: "0.58rem", lineHeight: 1.25, color: captionColor }}>{rawValue}</span>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<number, string> = {
  5: "Solucionado",
  6: "Fechado",
};

function statusLabel(status: number): string {
  return STATUS_LABELS[status] ?? `Status ${status}`;
}

type ChamadoSortKey = "tickets_id" | "categoria_nome" | "status" | "foi_reaberto" | "resposta_qualidade";

const CHAMADO_COLUMNS: { key: ChamadoSortKey; label: string }[] = [
  { key: "tickets_id", label: "Chamado" },
  { key: "categoria_nome", label: "Categoria" },
  { key: "status", label: "Status" },
  { key: "foi_reaberto", label: "Reaberto" },
  { key: "resposta_qualidade", label: "Qualidade" },
];

function ChamadosTab({ chamados }: { chamados: TechnicianRecentTicket[] }) {
  const [sortKey, setSortKey] = useState<ChamadoSortKey>("tickets_id");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    return [...chamados].sort((a, b) => {
      let diff: number;
      if (sortKey === "categoria_nome") {
        diff = (a.categoria_nome ?? "").localeCompare(b.categoria_nome ?? "", "pt-BR", { numeric: true, sensitivity: "base" });
      } else if (sortKey === "foi_reaberto") {
        diff = Number(a.foi_reaberto) - Number(b.foi_reaberto);
      } else {
        diff = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [chamados, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / LIST_PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((clampedPage - 1) * LIST_PAGE_SIZE, clampedPage * LIST_PAGE_SIZE);

  function toggleSort(key: ChamadoSortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "categoria_nome" ? "asc" : "desc");
    }
    setPage(1);
  }

  if (chamados.length === 0) return <p style={{ color: "var(--apagado)" }}>Nenhum chamado resolvido ainda.</p>;

  return (
    <div>
      <div className="tecnico-chamados-table-wrap">
        <table className="tecnico-chamados-table">
          <thead>
            <tr>
              {CHAMADO_COLUMNS.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)}>
                  <span>
                    {col.label}
                    {sortKey === col.key && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.tickets_id}>
                <td className="tecnico-chamados-id">#{c.tickets_id}</td>
                <td>{c.categoria_nome ?? "—"}</td>
                <td>
                  <span className={`tecnico-chamados-status is-status-${c.status}`}>{statusLabel(c.status)}</span>
                </td>
                <td>{c.foi_reaberto ? "Sim" : "—"}</td>
                <td className="tecnico-chamados-qualidade" style={{ color: scoreColor(c.resposta_qualidade) }}>
                  {c.resposta_qualidade.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tecnico-chamados-pagination">
        <span>{chamados.length} chamado{chamados.length === 1 ? "" : "s"} · página {clampedPage} de {totalPages}</span>
        <div>
          <button
            type="button"
            className="tecnico-chamados-page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage <= 1}
          >
            Anterior
          </button>
          <button
            type="button"
            className="tecnico-chamados-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={clampedPage >= totalPages}
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}

const COMPETENCY_LEVEL_META: Record<CompetencyTechnicianDetail["nivel"], { label: string; color: string }> = {
  nao_avaliado: { label: "Ainda não avaliado", color: "var(--apagado)" },
  em_desenvolvimento: { label: "Em desenvolvimento", color: "var(--aviso)" },
  competente: { label: "Competente", color: "var(--acento)" },
  dominio: { label: "Domínio", color: "var(--positivo, #4ba67b)" },
};

type CompetencySituationStatus = "demonstrada" | "em_evolucao" | "nao_demonstrada" | "pendente";

const COMPETENCY_SITUATION_META: Record<CompetencySituationStatus, { label: string; color: string }> = {
  demonstrada: { label: "Demonstrada", color: "var(--positivo, #4ba67b)" },
  em_evolucao: { label: "Em evolução", color: "var(--aviso)" },
  nao_demonstrada: { label: "Não demonstrada", color: "var(--critico)" },
  pendente: { label: "Não avaliada", color: "var(--apagado)" },
};

function competencySituationStatus(situation: CompetencySituationProgress): CompetencySituationStatus {
  if (!situation.avaliada) return "pendente";
  if (situation.pontos >= situation.pontos_maximos) return "demonstrada";
  if (situation.pontos <= 0) return "nao_demonstrada";
  return "em_evolucao";
}

function formatCompetencyPoints(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(".", ",");
}

function formatCompetencyDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatCompetencyContent(
  fallback: string,
  options: { valor: string; rotulo: string }[],
  value: string | string[] | null,
): string {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return fallback;
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => options.find((option) => option.valor === item)?.rotulo ?? item).join(" · ");
}

function CompetencyIndicatorsTab({ data }: { data: CompetencyTechnicianDetail }) {
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const activities = data.atividades.filter((activity) => activity.situacoes_total > 0);
  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId) ?? activities[0] ?? null;
  const situations = activities.flatMap((activity) => activity.situacoes);
  const demonstrated = situations.filter((situation) => competencySituationStatus(situation) === "demonstrada").length;
  const inProgress = situations.filter((situation) => {
    const status = competencySituationStatus(situation);
    return status === "em_evolucao" || status === "nao_demonstrada";
  }).length;
  const pending = situations.filter((situation) => !situation.avaliada).length;
  const nextSituation = [...situations]
    .filter((situation) => !situation.avaliada || situation.pontos < situation.pontos_maximos)
    .sort((a, b) => Number(a.avaliada) - Number(b.avaliada)
      || (a.pontos / a.pontos_maximos) - (b.pontos / b.pontos_maximos)
      || b.pontos_maximos - a.pontos_maximos)[0] ?? null;
  const latestAssessment = situations
    .flatMap((situation) => situation.ultima_avaliacao ? [situation.ultima_avaliacao] : [])
    .sort((a, b) => new Date(b.avaliado_em).getTime() - new Date(a.avaliado_em).getTime())[0] ?? null;
  const level = COMPETENCY_LEVEL_META[data.nivel];

  if (situations.length === 0) {
    return (
      <div className="competency-indicators-empty">
        <span>Mapa de competências</span>
        <strong>Nenhuma situação foi cadastrada ainda.</strong>
        <p>Assim que o catálogo receber atividades e critérios, este retrato individual aparecerá aqui.</p>
      </div>
    );
  }

  return (
    <div className="competency-indicators">
      <section className="competency-indicators-hero">
        <div
          className="competency-indicators-ring"
          style={{
            "--competency-progress": `${Math.max(0, Math.min(100, data.percentual)) * 3.6}deg`,
            "--competency-color": level.color,
          } as CSSProperties}
        >
          <div>
            <strong>{data.percentual.toFixed(0)}%</strong>
            <span>{level.label}</span>
          </div>
        </div>

        <div className="competency-indicators-reading">
          <span className="competency-indicators-kicker">Retrato atual</span>
          <h3>
            {data.situacoes_avaliadas === 0
              ? "Aguardando a primeira avaliação"
              : `${demonstrated} competência${demonstrated === 1 ? "" : "s"} demonstrada${demonstrated === 1 ? "" : "s"}`}
          </h3>
          <p>
            {data.situacoes_avaliadas === 0
              ? "O catálogo já está pronto para este técnico, mas ainda não há evidências registradas."
              : `${formatCompetencyPoints(data.pontos)} de ${formatCompetencyPoints(data.pontos_maximos)} pontos comprovados em ${data.situacoes_avaliadas} situações.`}
          </p>
          <div className="competency-indicators-insights">
            <div>
              <span>Cobertura do mapa</span>
              <strong>{data.situacoes_avaliadas} de {data.situacoes_total} avaliadas</strong>
              <small>{latestAssessment ? `Última evidência em ${formatCompetencyDate(latestAssessment.avaliado_em)}` : "Sem evidências registradas"}</small>
            </div>
            <div>
              <span>Próxima ação</span>
              <strong>{nextSituation?.nome ?? "Revisão periódica"}</strong>
              <small>
                {nextSituation
                  ? (nextSituation.avaliada ? "Evoluir a competência já avaliada" : "Registrar a primeira evidência")
                  : "Mapa atual concluído; programe uma reavaliação"}
              </small>
            </div>
          </div>
        </div>

        <div className="competency-indicators-totals">
          <div className="is-positive"><strong>{demonstrated}</strong><span>Demonstradas</span></div>
          <div className="is-warning"><strong>{inProgress}</strong><span>Em evolução</span></div>
          <div><strong>{pending}</strong><span>Não avaliadas</span></div>
        </div>
      </section>

      {activities.length > 1 && <section className="competency-activity-map">
        <header>
          <div>
            <span>Mapa por atividade</span>
            <strong>Onde estão os pontos e as lacunas</strong>
          </div>
          <small>{activities.length} atividade{activities.length === 1 ? "" : "s"}</small>
        </header>

        <div className="competency-activity-map-grid">
          {activities.map((activity) => {
            const active = selectedActivity?.id === activity.id;
            return (
              <button
                type="button"
                key={activity.id}
                className={`competency-activity-map-card ${active ? "is-selected" : ""}`}
                onClick={() => setSelectedActivityId(activity.id)}
                aria-pressed={active}
              >
                <span className="competency-activity-map-title">
                  <strong>{activity.nome}</strong>
                  <b>{activity.percentual.toFixed(0)}%</b>
                </span>
                <span className="competency-activity-segments" aria-label={`${activity.situacoes_avaliadas} de ${activity.situacoes_total} situações avaliadas`}>
                  {activity.situacoes.map((situation) => {
                    const status = competencySituationStatus(situation);
                    return (
                      <i
                        key={situation.id}
                        style={{ background: COMPETENCY_SITUATION_META[status].color }}
                        title={`${situation.nome}: ${COMPETENCY_SITUATION_META[status].label}`}
                      />
                    );
                  })}
                </span>
                <span className="competency-activity-map-footer">
                  <small>{activity.situacoes_avaliadas}/{activity.situacoes_total} avaliadas</small>
                  <small>{formatCompetencyPoints(activity.pontos)}/{formatCompetencyPoints(activity.pontos_maximos)} pts</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>}

      {selectedActivity && <CompetencyActivityDetail activity={selectedActivity} />}
    </div>
  );
}

function CompetencyActivityDetail({ activity }: { activity: CompetencyActivityProgress }) {
  return (
    <section className="competency-indicator-detail">
      <header>
        <div>
          <span>Situações de {activity.nome}</span>
          <strong>{formatCompetencyContent(activity.descricao, activity.escopo_opcoes, activity.escopo_valor) || "Evidências e critérios desta atividade"}</strong>
        </div>
        <div>
          <strong>{activity.percentual.toFixed(0)}%</strong>
          <small>{formatCompetencyPoints(activity.pontos)}/{formatCompetencyPoints(activity.pontos_maximos)} pontos</small>
        </div>
      </header>

      <div className="competency-indicator-situations">
        {activity.situacoes.map((situation) => {
          const status = competencySituationStatus(situation);
          const meta = COMPETENCY_SITUATION_META[status];
          const assessment = situation.ultima_avaliacao;
          return (
            <details key={situation.id} className="competency-indicator-situation">
              <summary>
                <i style={{ background: meta.color }} />
                <span>
                  <strong>{situation.nome}</strong>
                  <small style={{ color: meta.color }}>{meta.label}</small>
                </span>
                <b>{formatCompetencyPoints(situation.pontos)}/{formatCompetencyPoints(situation.pontos_maximos)}</b>
              </summary>
              <div className="competency-indicator-situation-body">
                {situation.contexto && <div><span>Situação</span><p>{situation.contexto}</p></div>}
                <div><span>Critério esperado</span><p>{formatCompetencyContent(situation.procedimento_esperado, situation.procedimento_opcoes, situation.procedimento_valor)}</p></div>
                {assessment ? (
                  <div className="is-evidence">
                    <span>Evidência registrada</span>
                    <p>{assessment.evidencia || "Avaliação registrada sem evidência textual."}</p>
                    {assessment.observacao && <small>{assessment.observacao}</small>}
                    <small>{formatCompetencyDate(assessment.avaliado_em)} · {assessment.avaliado_por}</small>
                  </div>
                ) : (
                  <div className="is-pending"><span>Próximo passo</span><p>Realizar uma avaliação prática e registrar a evidência observada.</p></div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

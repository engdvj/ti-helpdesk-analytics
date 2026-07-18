"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
  type TooltipContentProps,
} from "recharts";

import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import type { TechSnapshot } from "@/lib/api";
import { findLeaderIds } from "@/lib/comparison";
import { useCumulativo } from "@/lib/cumulativo-context";
import { formatDatePtBr, formatPeriodRef } from "@/lib/date";
import { metricValue, useMetric, type MetricOption } from "@/lib/metric-context";
import { snapshotHasActivity } from "@/lib/score";
import { useScoreMode } from "@/lib/score-mode-context";
import { useSnapshots } from "@/lib/snapshot-context";
import { resolveTechnicianDisplay, useTechnicians } from "@/lib/technicians";
import { unitDisplayName, useUnits } from "@/lib/units";
import { usePopoutWindow } from "@/lib/use-popout-window";

const SERIES_COLORS = ["#58a6ff", "#f2cc60", "#3fb950", "#f778ba", "#ff7b72", "#a371f7", "#39c5cf", "#d29922"];

interface Props {
  selectedIds: number[];
  onRemove: (usersId: number) => void;
  onClear: () => void;
}

interface SeriesDefinition {
  usersId: number;
  key: string;
  nome: string;
  foto: string | null;
  color: string;
  unidade: string;
}

interface ComparisonDatum extends Record<string, string | number | number[] | null> {
  seq: number;
  periodo: string;
  label: string;
  compactLabel: string;
  leaders: number[];
}

interface TimelineWindowState {
  key: string;
  startIndex: number;
  endIndex: number;
}

function compactPeriodLabel(periodo: string): string {
  const formatted = formatPeriodRef(periodo);
  const separator = formatted.includes("–") ? "–" : "â€“";
  const parts = formatted.split(separator);
  return parts.length > 1 ? parts[parts.length - 1] : formatted;
}

function ComparisonTooltip({
  active,
  payload,
  series,
  metric,
}: TooltipContentProps & { series: SeriesDefinition[]; metric: MetricOption }) {
  if (!active || !payload.length) return null;
  const datum = payload[0]?.payload as ComparisonDatum | undefined;
  if (!datum) return null;

  const orderedSeries = [...series].sort((a, b) => {
    const av = datum[a.key];
    const bv = datum[b.key];
    const aNum = typeof av === "number" ? av : null;
    const bNum = typeof bv === "number" ? bv : null;
    if (aNum == null && bNum == null) return 0;
    if (aNum == null) return 1;
    if (bNum == null) return -1;
    return metric.higherIsBetter ? bNum - aNum : aNum - bNum;
  });

  return (
    <div className="ranking-chart-tooltip">
      <strong>{formatPeriodRef(datum.periodo)}</strong>
      <span>{metric.label}</span>
      {orderedSeries.map((item) => {
        const value = datum[item.key];
        const leader = datum.leaders.includes(item.usersId);
        return (
          <div key={item.usersId} className={leader ? "is-leader" : ""}>
            <i style={{ background: item.color }} />
            <span>{item.nome}<small>{item.unidade}</small></span>
            {leader && <em>Líder</em>}
            <b>{typeof value === "number" ? metric.format(value) : "Sem atividade"}</b>
          </div>
        );
      })}
      <small>Clique para fixar este momento</small>
    </div>
  );
}

function LeaderDot({ usersId, color, ...props }: DotItemDotProps & { usersId: number; color: string }) {
  if (props.cx == null || props.cy == null) return <g />;
  const datum = props.payload as ComparisonDatum;
  const leader = datum.leaders.includes(usersId);
  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      r={leader ? 5 : 3}
      fill={color}
      stroke={leader ? "var(--ouro)" : "var(--superficie)"}
      strokeWidth={leader ? 3 : 1.5}
    />
  );
}

function TimelineWindowControl({
  data,
  startIndex,
  endIndex,
  onChange,
  onReset,
}: {
  data: ComparisonDatum[];
  startIndex: number;
  endIndex: number;
  onChange: (startIndex: number, endIndex: number, focusedIndex: number) => void;
  onReset: () => void;
}) {
  const maxIndex = data.length - 1;
  if (maxIndex < 1) return null;

  const startPct = (startIndex / maxIndex) * 100;
  const endPct = (endIndex / maxIndex) * 100;
  const visibleCount = endIndex - startIndex + 1;
  const fullRange = startIndex === 0 && endIndex === maxIndex;

  return (
    <section className="ranking-timeline" aria-label="Recorte visível do gráfico">
      <header>
        <span>{data[startIndex].label}</span>
        <strong>{visibleCount} {visibleCount === 1 ? "ponto visível" : "pontos visíveis"}</strong>
        <span>{data[endIndex].label}</span>
        <button type="button" onClick={onReset} disabled={fullRange}>Ver tudo</button>
      </header>
      <div className="ranking-timeline-track">
        <i />
        <b style={{ left: `${startPct}%`, right: `${100 - endPct}%` }} />
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={startIndex}
          aria-label="Início do recorte do gráfico"
          aria-valuetext={data[startIndex].label}
          onChange={(event) => {
            const next = Math.min(Number(event.target.value), endIndex - 1);
            onChange(next, endIndex, next);
          }}
        />
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={endIndex}
          aria-label="Fim do recorte do gráfico"
          aria-valuetext={data[endIndex].label}
          onChange={(event) => {
            const next = Math.max(Number(event.target.value), startIndex + 1);
            onChange(startIndex, next, next);
          }}
        />
      </div>
    </section>
  );
}

export function RankingComparison({ selectedIds, onRemove, onClear }: Props) {
  const { data, seqs, snapshotSeq, dataInicio, dataFim } = useSnapshots();
  const { cumulativo } = useCumulativo();
  const { metric } = useMetric();
  const { scoreMode } = useScoreMode();
  const { data: technicians } = useTechnicians();
  const { data: units } = useUnits();
  const rangeKey = `${cumulativo}:${dataInicio ?? ""}:${dataFim ?? ""}:${snapshotSeq}`;
  const [selectedMoment, setSelectedMoment] = useState<{ rangeKey: string; seq: number } | null>(null);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindowState | null>(null);
  const selectedMomentSeq = selectedMoment?.rangeKey === rangeKey ? selectedMoment.seq : null;
  const popoutTitle = `Comparativo do ranking — ${selectedIds.length} ${selectedIds.length === 1 ? "técnico" : "técnicos"}`;
  const { container: popoutContainer, blocked: popoutBlocked, retry: retryPopout } = usePopoutWindow({
    title: popoutTitle,
    onClose: onClear,
  });

  if (!data || snapshotSeq == null || selectedIds.length === 0) return null;

  // A granularidade define o que cada ponto representa e o intervalo apenas
  // recorta a timeline. A distincao antiga acumulado/individual nao deve
  // esconder os demais dias, semanas ou meses do grafico comparativo.
  const visibleSeqs = seqs;
  const hasTimeline = visibleSeqs.length > 1;
  const snapshotMap = new Map<string, TechSnapshot>();
  for (const snapshot of data) snapshotMap.set(`${snapshot.snapshot_seq}:${snapshot.users_id}`, snapshot);

  const series: SeriesDefinition[] = selectedIds.map((usersId, index) => {
    const fallback = data.find((snapshot) => snapshot.users_id === usersId);
    const display = resolveTechnicianDisplay(usersId, fallback?.nome_completo || fallback?.username || `Técnico ${usersId}`, technicians);
    return {
      usersId,
      key: `tech_${usersId}`,
      nome: display.nome,
      foto: display.foto,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      unidade: unitDisplayName(display.unidadeSlug ?? fallback?.unidade_slug, units),
    };
  });

  const chartData: ComparisonDatum[] = visibleSeqs.map((seq) => {
    const representative = data.find((snapshot) => snapshot.snapshot_seq === seq);
    const comparable = series.flatMap((item) => {
      const snapshot = snapshotMap.get(`${seq}:${item.usersId}`);
      if (!snapshot || !snapshotHasActivity(snapshot)) return [];
      const value = metricValue(snapshot, metric);
      return value == null ? [] : [{ usersId: item.usersId, value }];
    });
    const leaders = [...findLeaderIds(comparable, metric.higherIsBetter)];
    const periodo = representative?.periodo_ref ?? String(seq);
    const datum: ComparisonDatum = {
      seq,
      periodo,
      label: formatPeriodRef(periodo),
      compactLabel: compactPeriodLabel(periodo),
      leaders,
    };
    for (const item of series) {
      const snapshot = snapshotMap.get(`${seq}:${item.usersId}`);
      datum[item.key] = snapshot && snapshotHasActivity(snapshot) ? metricValue(snapshot, metric) : null;
    }
    return datum;
  });

  const timelineKey = `${cumulativo}:${dataInicio ?? ""}:${dataFim ?? ""}:${chartData.map((datum) => datum.periodo).join("|")}`;
  const activeTimelineWindow = timelineWindow?.key === timelineKey ? timelineWindow : null;
  const timelineStartIndex = Math.max(0, Math.min(activeTimelineWindow?.startIndex ?? 0, chartData.length - 1));
  const timelineEndIndex = Math.max(
    timelineStartIndex,
    Math.min(activeTimelineWindow?.endIndex ?? chartData.length - 1, chartData.length - 1),
  );
  const displayedChartData = chartData.slice(timelineStartIndex, timelineEndIndex + 1);

  function updateTimelineWindow(startIndex: number, endIndex: number, focusedIndex: number) {
    setTimelineWindow({ key: timelineKey, startIndex, endIndex });
    const focused = chartData[focusedIndex];
    if (focused) setSelectedMoment({ rangeKey, seq: focused.seq });
  }

  const effectiveMomentSeq = selectedMomentSeq != null && visibleSeqs.includes(selectedMomentSeq)
    ? selectedMomentSeq
    : snapshotSeq;
  const selectedDatum = chartData.find((datum) => datum.seq === effectiveMomentSeq) ?? chartData[chartData.length - 1];
  const selectedSnapshots = series.map((item) => {
    const snapshot = snapshotMap.get(`${effectiveMomentSeq}:${item.usersId}`);
    const value = snapshot && snapshotHasActivity(snapshot) ? metricValue(snapshot, metric) : null;
    return { ...item, snapshot, value };
  }).sort((a, b) => {
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    return metric.higherIsBetter ? b.value - a.value : a.value - b.value;
  });
  const scoreScale = metric.key.toString().startsWith("score_");
  const title = (
    <span className="ranking-comparison-modal-title">
      Comparativo do ranking
      <small>{series.length} {series.length === 1 ? "técnico" : "técnicos"}</small>
    </span>
  );

  const content = (
    <>
      {popoutContainer && (
        <div className="ranking-comparison-popout-header">
          {title}
          <button type="button" onClick={onClear} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="ranking-comparison-header">
        <div>
          <strong>{metric.label}</strong>
          <p>
            {metric.key === "score_geral" ? (scoreMode === "metas" ? "Score por metas" : "Score relativo à equipe") : "Valor bruto"}
            {dataInicio && dataFim
              ? ` · ${visibleSeqs.length} ${visibleSeqs.length === 1 ? "ponto" : "pontos"} · ${formatDatePtBr(dataInicio)} – ${formatDatePtBr(dataFim)}`
              : selectedDatum ? ` · período ${selectedDatum.label}` : ""}
          </p>
        </div>
        <span>Clique no gráfico para analisar um momento</span>
      </div>

      <div className="ranking-comparison-legend">
        {series.map((item) => (
          <button key={item.usersId} type="button" onClick={() => onRemove(item.usersId)} title={`Remover ${item.nome}`}>
            <i style={{ background: item.color }} />
            <span>{item.nome}<small>{item.unidade}</small></span>
            <X size={12} />
          </button>
        ))}
      </div>

      <div className="ranking-comparison-chart is-recharts">
        <ResponsiveContainer width="100%" height={360} minWidth={320}>
          <LineChart
            data={displayedChartData}
            margin={{ top: 18, right: 24, left: 4, bottom: 4 }}
            onClick={(state) => {
              const index = Number(state.activeTooltipIndex);
              if (Number.isInteger(index) && displayedChartData[index]) {
                setSelectedMoment({ rangeKey, seq: displayedChartData[index].seq });
              }
            }}
          >
            <defs>
              <filter id="ranking-line-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--linha)" strokeDasharray="3 5" opacity={0.65} />
            <XAxis
              dataKey="compactLabel"
              stroke="var(--apagado)"
              tick={{ fill: "var(--apagado)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={34}
            />
            <YAxis
              stroke="var(--apagado)"
              tick={{ fill: "var(--apagado)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={58}
              reversed={!metric.higherIsBetter}
              domain={scoreScale ? [0, 100] : ["auto", "auto"]}
              tickFormatter={(value: number) => metric.format(value)}
            />
            <Tooltip
              content={(props) => <ComparisonTooltip {...props} series={series} metric={metric} />}
              cursor={{ stroke: "var(--acento)", strokeWidth: 1, strokeDasharray: "4 4" }}
              allowEscapeViewBox={{ x: false, y: true }}
            />
            {selectedDatum && (
              <ReferenceLine x={selectedDatum.compactLabel} stroke="var(--aviso)" strokeWidth={2} strokeDasharray="5 4" />
            )}
            {series.map((item) => (
              <Line
                key={item.usersId}
                type="monotone"
                dataKey={item.key}
                name={item.nome}
                stroke={item.color}
                strokeWidth={3}
                connectNulls={false}
                filter="url(#ranking-line-glow)"
                dot={(props: DotItemDotProps) => <LeaderDot {...props} usersId={item.usersId} color={item.color} />}
                activeDot={{ r: 7, strokeWidth: 3, stroke: "var(--superficie)" }}
                animationDuration={450}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {hasTimeline && (
          <TimelineWindowControl
            data={chartData}
            startIndex={timelineStartIndex}
            endIndex={timelineEndIndex}
            onChange={updateTimelineWindow}
            onReset={() => updateTimelineWindow(0, chartData.length - 1, chartData.length - 1)}
          />
        )}
        <p>
          <span /> Anel dourado = líder naquele ponto
          {hasTimeline && " · ajuste as duas alças para aproximar o intervalo."}
        </p>
      </div>

      {selectedDatum && (
        <section className="ranking-moment-panel">
          <header>
            <div>
              <h3>Momento selecionado</h3>
              <strong>{selectedDatum.label}</strong>
            </div>
            {effectiveMomentSeq !== snapshotSeq && (
              <button type="button" onClick={() => setSelectedMoment({ rangeKey, seq: snapshotSeq })}>
                <RotateCcw size={13} /> Snapshot atual
              </button>
            )}
          </header>
          <div className="ranking-moment-grid">
            {selectedSnapshots.map((item, index) => {
              const leader = selectedDatum.leaders.includes(item.usersId);
              return (
                <article key={item.usersId} className={leader ? "is-leader" : ""}>
                  <div className="ranking-moment-person">
                    <span>{item.value == null ? "—" : index + 1}</span>
                    <Avatar nome={item.nome} foto={item.foto} size={26} />
                    <strong title={`${item.nome} · ${item.unidade}`}>
                      {item.nome}<small>{item.unidade}</small>
                    </strong>
                    {leader && <em>Líder</em>}
                  </div>
                  <div className="ranking-moment-primary" style={{ color: item.color }}>
                    {item.value == null ? "Sem atividade" : metric.format(item.value)}
                    <small>{metric.label}</small>
                  </div>
                  {item.snapshot && snapshotHasActivity(item.snapshot) && (
                    <dl>
                      <div><dt>Score</dt><dd>{item.snapshot.score_geral?.toFixed(1) ?? "—"}</dd></div>
                      <div><dt>Créditos</dt><dd>{item.snapshot.chamados_resolvidos.toFixed(1)}</dd></div>
                      <div><dt>Resposta</dt><dd>{item.snapshot.resposta_media_min.toFixed(0)} min</dd></div>
                      <div><dt>Categorias</dt><dd>{item.snapshot.n_categorias}</dd></div>
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );

  if (popoutContainer) {
    return createPortal(<div className="ranking-comparison-popout">{content}</div>, popoutContainer);
  }

  if (popoutBlocked) {
    return (
      <Modal title={title} onClose={onClear} maxWidth={940} draggable modeless zIndex={225} closeOnEscape>
        <p className="ranking-comparison-popout-blocked">
          O navegador bloqueou a janela externa. <button type="button" onClick={retryPopout}>Tentar de novo</button>
        </p>
        {content}
      </Modal>
    );
  }

  return null;
}

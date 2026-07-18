"use client";

import { ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { RankBadge } from "@/components/ui/RankBadge";
import type { TechSnapshot } from "@/lib/api";
import { metricValue, useMetric } from "@/lib/metric-context";
import { scoreColor } from "@/lib/score";
import { resolveTechnicianDisplay, useTechnicians } from "@/lib/technicians";
import { unitDisplayName, useUnits } from "@/lib/units";

const ROLE_LABEL: Record<TechSnapshot["papel"], string> = {
  plantonista: "Plantonista",
  tatico: "Tático",
  coordenadora: "Coordenadora",
};

const SCORE_LIKE_KEYS = new Set(["score_geral", "score_qualidade"]);

interface Props {
  snapshot: TechSnapshot;
  rank?: number | null;
  onClick: () => void;
}

/** Card compacto da aba Perfis. A leitura segue a mesma ordem do ranking:
 * posicao, identidade e metrica usada na ordenacao. */
export function TechnicianCard({ snapshot, rank, onClick }: Props) {
  const { data: technicians } = useTechnicians();
  const { data: units } = useUnits();
  const { metric } = useMetric();
  const display = resolveTechnicianDisplay(
    snapshot.users_id,
    snapshot.nome_completo || snapshot.username,
    technicians,
  );
  const value = metricValue(snapshot, metric);
  const isScoreLike = SCORE_LIKE_KEYS.has(metric.key);
  const accentColor = isScoreLike ? scoreColor(value) : scoreColor(snapshot.score_geral);
  const progress = value == null ? 0 : Math.min(Math.max(value, 0), 100);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir perfil de ${display.nome}`}
      className={`sumula-cartao technician-profile-card ${isScoreLike ? "has-score-scale" : ""}`}
      style={{ "--technician-card-accent": accentColor } as CSSProperties}
    >
      <header className="technician-profile-card-header">
        <span className="technician-profile-card-rank" title={rank == null ? "Sem posição" : `${rank}º lugar`}>
          <RankBadge rank={rank ?? null} />
        </span>
        <Avatar nome={display.nome} foto={display.foto} size={36} />
        <div className="technician-profile-card-identity">
          <strong>{display.nome}</strong>
          <span>
            {ROLE_LABEL[snapshot.papel]} · {unitDisplayName(display.unidadeSlug ?? snapshot.unidade_slug, units)}
          </span>
        </div>
        <ChevronRight className="technician-profile-card-arrow" size={16} aria-hidden />
      </header>

      <section className="technician-profile-card-metric">
        <div>
          <span>{metric.label}</span>
          <strong>{value == null ? "—" : metric.format(value)}</strong>
        </div>
        {isScoreLike && (
          <span className="technician-profile-card-progress" aria-hidden>
            <i style={{ width: `${progress}%` }} />
          </span>
        )}
      </section>
    </button>
  );
}

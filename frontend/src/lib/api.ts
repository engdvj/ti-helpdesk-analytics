const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* corpo nao-JSON, mantem o detail generico */
    }
    throw new Error(detail);
  }
  return res.json();
}

export interface Unit {
  slug: string;
  nome: string;
  entities_id: number;
  completename: string;
  ativa: boolean;
  ordem: number;
}

export interface Technician {
  users_id: number;
  username: string;
  nome_completo: string;
  glpi_profile: string;
  papel: "coordenadora" | "tatico" | "plantonista";
  ativo: boolean;
}

export interface TechSnapshot {
  users_id: number;
  nome_completo: string;
  username: string;
  papel: Technician["papel"];
  chamados_resolvidos: number;
  urgencia_media: number;
  n_categorias: number;
  resposta_media_min: number;
  resolucao_media_h: number;
  score_volume: number;
  score_velocidade_resolucao: number;
  score_complexidade: number;
  score_velocidade_resposta: number;
  score_abrangencia: number;
  score_geral: number;
  confianca: number;
  nivel_evidencia: "baixa" | "media" | "alta";
  rank: number;
  snapshot_seq: number;
  periodo_ref: string;
  granularidade: "diaria_acumulada" | "semanal" | "mensal";
}

export interface TechnicianRecentTicket {
  tickets_id: number;
  itilcategories_id: number | null;
  urgency: number;
  solvedate: string;
  solve_delay_stat: number;
  takeintoaccount_delay_stat: number;
  foi_reaberto: boolean;
}

export interface TechnicianProfile {
  atual: TechSnapshot;
  historico: Pick<TechSnapshot, "snapshot_seq" | "periodo_ref" | "score_geral" | "confianca">[];
  chamados_recentes: TechnicianRecentTicket[];
}

export const units = {
  list: () => req<Unit[]>("/units"),
};

export const technicians = {
  list: (papel?: string) => req<Technician[]>(`/technicians${papel ? `?papel=${papel}` : ""}`),
};

export const analytics = {
  snapshots: (opts: { granularidade?: string; entitiesId?: number; snapshotSeq?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.granularidade) params.set("granularidade", opts.granularidade);
    if (opts.entitiesId != null) params.set("entities_id", String(opts.entitiesId));
    if (opts.snapshotSeq != null) params.set("snapshot_seq", String(opts.snapshotSeq));
    const qs = params.toString();
    return req<TechSnapshot[]>(`/analytics/snapshots${qs ? `?${qs}` : ""}`);
  },
  technicianProfile: (usersId: number, entitiesId?: number, granularidade?: string) => {
    const params = new URLSearchParams();
    if (entitiesId != null) params.set("entities_id", String(entitiesId));
    if (granularidade) params.set("granularidade", granularidade);
    const qs = params.toString();
    return req<TechnicianProfile>(`/analytics/technicians/${usersId}${qs ? `?${qs}` : ""}`);
  },
};

export interface ScoreWeights {
  score_volume: number;
  score_velocidade_resolucao: number;
  score_complexidade: number;
  score_velocidade_resposta: number;
  score_abrangencia: number;
}

export interface AdminCredentials {
  username: string;
  password: string;
}

function adminHeaders({ username, password }: AdminCredentials): HeadersInit {
  return { "X-Admin-Username": username, "X-Admin-Password": password };
}

export const adminApi = {
  verify: (creds: AdminCredentials) => req<{ ok: boolean }>("/admin/verify", { method: "POST", headers: adminHeaders(creds) }),
  collect: (creds: AdminCredentials) =>
    req<{ status: string; counts: Record<string, number> }>("/admin/collect", {
      method: "POST",
      headers: adminHeaders(creds),
    }),
  getWeights: () => req<ScoreWeights>("/admin/weights"),
  setWeights: (weights: ScoreWeights, creds: AdminCredentials) =>
    req<ScoreWeights>("/admin/weights", {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(weights),
    }),
  resetWeights: (creds: AdminCredentials) =>
    req<ScoreWeights>("/admin/weights/reset", { method: "POST", headers: adminHeaders(creds) }),
};

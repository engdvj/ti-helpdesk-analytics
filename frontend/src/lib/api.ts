const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Setado pelo SessionProvider (login/restauracao/logout) - `req()` anexa em
// toda chamada em vez de cada funcao de API precisar receber o token
// explicitamente (dezenas de call sites existentes, ver lib/session-context.tsx).
let sessionToken: string | null = null;
export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (sessionToken) headers.set("X-Session-Token", sessionToken);
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
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
  unidade_slug: string | null;
  foto: string | null;
  foto_fonte: "glpi" | "upload" | null;
  nome_exibicao: string | null;
  tem_senha: boolean;
}

export type CompetencyActivityType = string;
export type CompetencyFieldType = "escala" | "radio" | "selecao" | "multipla_selecao" | "sim_nao";
export type CompetencyContentFieldType = "texto_curto" | "texto_longo" | "radio" | "selecao" | "multipla_selecao";

export interface CompetencyActivityTypeDefinition {
  id: number;
  slug: string;
  nome: string;
  descricao: string;
  cor: string;
  ordem: number;
  ativa: boolean;
}

export interface CompetencyContentOption {
  valor: string;
  rotulo: string;
}

export interface CompetencyOption {
  valor: string;
  rotulo: string;
  pontos: number;
}

export interface CompetencySituation {
  id: number;
  atividade_id: number;
  nome: string;
  contexto: string;
  procedimento_esperado: string;
  procedimento_tipo_campo: CompetencyContentFieldType;
  procedimento_opcoes: CompetencyContentOption[];
  procedimento_valor: string | string[] | null;
  pontos_maximos: number;
  tipo_campo: CompetencyFieldType;
  opcoes: CompetencyOption[];
  ordem: number;
  ativa: boolean;
}

export interface CompetencyActivity {
  id: number;
  nome: string;
  descricao: string;
  tipo: CompetencyActivityType;
  escopo_tipo_campo: CompetencyContentFieldType;
  escopo_opcoes: CompetencyContentOption[];
  escopo_valor: string | string[] | null;
  ordem: number;
  ativa: boolean;
  situacoes: CompetencySituation[];
}

export interface CompetencyAssessment {
  id: number;
  users_id: number;
  situacao_id: number;
  pontos: number;
  resposta: string | string[] | boolean | null;
  evidencia: string | null;
  observacao: string | null;
  avaliado_por: string;
  avaliado_em: string;
  anonimo: boolean;
  avaliador_users_id: number | null;
}

export interface CompetencySituationProgress extends Omit<CompetencySituation, "atividade_id" | "ordem" | "ativa"> {
  pontos: number;
  avaliada: boolean;
  n_avaliacoes: number;
  avaliacoes: CompetencyAssessment[];
}

export interface CompetencyActivityProgress {
  id: number;
  nome: string;
  descricao: string;
  escopo_tipo_campo: CompetencyContentFieldType;
  escopo_opcoes: CompetencyContentOption[];
  escopo_valor: string | string[] | null;
  pontos: number;
  pontos_maximos: number;
  percentual: number;
  situacoes_avaliadas: number;
  situacoes_total: number;
  situacoes: CompetencySituationProgress[];
}

export type CompetencyLevel = "nao_avaliado" | "em_desenvolvimento" | "competente" | "dominio";

export interface CompetencyTechnicianSummary {
  users_id: number;
  nome: string;
  username: string;
  papel: Technician["papel"];
  unidade_slug: string | null;
  foto: string | null;
  pontos: number;
  pontos_maximos: number;
  percentual: number;
  situacoes_avaliadas: number;
  situacoes_total: number;
  nivel: CompetencyLevel;
}

export interface CompetencyTechnicianDetail extends CompetencyTechnicianSummary {
  atividades: CompetencyActivityProgress[];
}

export interface CompetencyActivityInput {
  nome: string;
  descricao: string;
  tipo: CompetencyActivityType;
  escopo_tipo_campo: CompetencyContentFieldType;
  escopo_opcoes: CompetencyContentOption[];
  escopo_valor: string | string[] | null;
  ordem?: number;
  ativa?: boolean;
}

export interface CompetencySituationInput {
  nome: string;
  contexto: string;
  procedimento_esperado: string;
  procedimento_tipo_campo: CompetencyContentFieldType;
  procedimento_opcoes: CompetencyContentOption[];
  procedimento_valor: string | string[] | null;
  pontos_maximos: number;
  tipo_campo: CompetencyFieldType;
  opcoes: CompetencyOption[];
  ordem?: number;
  ativa?: boolean;
}

export interface CompetencyAssessmentInput {
  users_id: number;
  situacao_id: number;
  pontos?: number | null;
  resposta?: string | string[] | boolean | null;
  evidencia?: string | null;
  observacao?: string | null;
  anonimo?: boolean;
}

export type ScoreMode = "equipe" | "metas";

export interface TechSnapshot {
  users_id: number;
  nome_completo: string;
  username: string;
  papel: Technician["papel"];
  chamados_resolvidos: number;
  chamados_atendidos?: number;
  dias_ativos_periodo?: number;
  volume_por_dia?: number;
  abrangencia_ratio?: number;
  urgencia_media: number;
  n_categorias: number;
  resposta_media_min: number;
  resolucao_media_h: number;
  complexidade_categoria_media: number;
  resposta_qualidade_media?: number;
  score_volume: number;
  score_complexidade: number;
  score_velocidade_resposta: number;
  score_abrangencia: number;
  score_qualidade: number;
  score_geral: number | null;
  confianca: number;
  nivel_evidencia: "baixa" | "media" | "alta";
  rank: number | null;
  elegivel?: boolean;
  score_mode?: ScoreMode;
  snapshot_seq: number;
  periodo_ref: string;
  granularidade: "diaria" | "semanal" | "mensal";
  cumulativo: boolean;
  unidade_slug?: string | null;
}

export interface SnapshotPeriod {
  ref: string;
  inicio: string;
  fim: string;
}

export interface TechnicianRecentTicket {
  tickets_id: number;
  categoria_nome: string | null;
  status: number;
  solvedate: string;
  foi_reaberto: boolean;
  resposta_qualidade: number;
}

export interface TechnicianCategorySkill {
  itilcategories_id: number;
  nome: string;
  chamados: number;
  qualidade_media: number;
  resolucao_media_h: number;
  taxa_reabertura: number;
  complexidade_media: number;
  habilidade_score: number;
  classificacao: "ponto_forte" | "gap" | "consistente" | "pouca_experiencia";
}

export interface TechnicianComplexitySkill {
  faixa: "baixa" | "media" | "alta";
  chamados: number;
  qualidade_media: number | null;
  resolucao_media_h: number | null;
}

export interface TechnicianSkills {
  por_categoria: TechnicianCategorySkill[];
  por_complexidade: TechnicianComplexitySkill[];
}

export interface TechnicianProfile {
  atual: TechSnapshot;
  historico: Pick<TechSnapshot, "snapshot_seq" | "periodo_ref" | "score_geral" | "confianca">[];
  chamados_recentes: TechnicianRecentTicket[];
  habilidades: TechnicianSkills;
  detalhes_snapshot: {
    categorias: { itilcategories_id: number; nome: string; credito: number; chamados: number }[];
    chamados: { tickets_id: number; credito: number }[];
    tempos_resposta: { tickets_id: number; minutos: number }[];
  };
}

export const units = {
  list: () => req<Unit[]>("/units"),
};

export const technicians = {
  list: (opts: { papel?: string; includeInactive?: boolean; unidadeSlug?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.papel) params.set("papel", opts.papel);
    if (opts.includeInactive) params.set("include_inactive", "true");
    if (opts.unidadeSlug) params.set("unidade_slug", opts.unidadeSlug);
    const qs = params.toString();
    return req<Technician[]>(`/technicians${qs ? `?${qs}` : ""}`);
  },
};

export const competencies = {
  catalog: (includeInactive = false) =>
    req<CompetencyActivity[]>(`/competencies/catalog${includeInactive ? "?include_inactive=true" : ""}`),
  activityTypes: (includeInactive = false) =>
    req<CompetencyActivityTypeDefinition[]>(`/competencies/activity-types${includeInactive ? "?include_inactive=true" : ""}`),
  matrix: (unidadeSlug?: string) => {
    const query = unidadeSlug ? `?unidade_slug=${encodeURIComponent(unidadeSlug)}` : "";
    return req<CompetencyTechnicianSummary[]>(`/competencies/matrix${query}`);
  },
  technician: (usersId: number) =>
    req<CompetencyTechnicianDetail>(`/competencies/technicians/${usersId}`),
  history: (usersId: number) =>
    req<CompetencyAssessment[]>(`/competencies/technicians/${usersId}/history`),
};

export interface CategoryDifficulty {
  itilcategories_id: number;
  categoria_pai: string;
  categoria_nome: string;
  categoria_completa: string;
  n_chamados: number;
  resolucao_media_h: number | null;
  sugestao_automatica: number;
  override: number | null;
  dificuldade_atual: number;
}

export const categoryDifficulty = {
  list: () => req<CategoryDifficulty[]>("/admin/category-difficulty"),
};

export const analytics = {
  periods: (opts: { granularidade?: string; entitiesId?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.granularidade) params.set("granularidade", opts.granularidade);
    if (opts.entitiesId != null) params.set("entities_id", String(opts.entitiesId));
    const qs = params.toString();
    return req<SnapshotPeriod[]>(`/analytics/periods${qs ? `?${qs}` : ""}`);
  },
  snapshots: (opts: {
    granularidade?: string;
    cumulativo?: boolean;
    scoreMode?: ScoreMode;
    entitiesId?: number;
    snapshotSeq?: number;
    dataInicio?: string;
    dataFim?: string;
  } = {}) => {
    const params = new URLSearchParams();
    if (opts.granularidade) params.set("granularidade", opts.granularidade);
    if (opts.cumulativo != null) params.set("cumulativo", String(opts.cumulativo));
    if (opts.scoreMode) params.set("score_mode", opts.scoreMode);
    if (opts.entitiesId != null) params.set("entities_id", String(opts.entitiesId));
    if (opts.snapshotSeq != null) params.set("snapshot_seq", String(opts.snapshotSeq));
    if (opts.dataInicio) params.set("data_inicio", opts.dataInicio);
    if (opts.dataFim) params.set("data_fim", opts.dataFim);
    const qs = params.toString();
    return req<TechSnapshot[]>(`/analytics/snapshots${qs ? `?${qs}` : ""}`);
  },
  technicianProfile: (
    usersId: number,
    entitiesId?: number,
    granularidade?: string,
    cumulativo?: boolean,
    snapshotSeq?: number,
    scoreMode?: ScoreMode,
    dataInicio?: string,
    dataFim?: string,
  ) => {
    const params = new URLSearchParams();
    if (entitiesId != null) params.set("entities_id", String(entitiesId));
    if (granularidade) params.set("granularidade", granularidade);
    if (cumulativo != null) params.set("cumulativo", String(cumulativo));
    if (scoreMode) params.set("score_mode", scoreMode);
    if (snapshotSeq != null) params.set("snapshot_seq", String(snapshotSeq));
    if (dataInicio) params.set("data_inicio", dataInicio);
    if (dataFim) params.set("data_fim", dataFim);
    const qs = params.toString();
    return req<TechnicianProfile>(`/analytics/technicians/${usersId}${qs ? `?${qs}` : ""}`);
  },
};

export interface ScoreWeights {
  score_volume: number;
  score_complexidade: number;
  score_velocidade_resposta: number;
  score_abrangencia: number;
  score_qualidade: number;
}

export interface ScoreTargets {
  volume_por_dia: number;
  complexidade_categoria: number;
  resposta_min: number;
  abrangencia_ratio: number;
  qualidade: number;
}

export interface AutoCollectSettings {
  minutes: number;
}

export interface AdminCredentials {
  username: string;
  password: string;
}

export type SubjectType = "tecnico" | "admin";

export interface SessionInfo {
  token: string;
  subject_type: SubjectType;
  users_id: number | null;
  nome_completo: string | null;
}

export const authApi = {
  login: (username: string, password: string) =>
    req<SessionInfo>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  logout: (token: string) =>
    req<{ ok: boolean }>("/auth/logout", { method: "POST", headers: { "X-Session-Token": token } }),
  me: (token: string) => req<SessionInfo>("/auth/me", { headers: { "X-Session-Token": token } }),
  changePassword: (senhaAtual: string, senhaNova: string) =>
    req<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova }),
    }),
};

export type CollectionRunStatus = "queued" | "running" | "success" | "error";
export type CollectionRunSort =
  | "requested_at"
  | "started_at"
  | "finished_at"
  | "duration_seconds"
  | "status"
  | "requested_by";

export interface CollectionRun {
  id: string;
  status: CollectionRunStatus;
  requested_by: string;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  counts: Record<string, number> | null;
  error: string | null;
  error_details: string | null;
}

export interface CollectionRunPage {
  items: CollectionRun[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  active: CollectionRun | null;
}

export interface CollectionRunQuery {
  page: number;
  pageSize: number;
  sortBy: CollectionRunSort;
  sortDir: "asc" | "desc";
  status?: CollectionRunStatus;
}

export interface RoleVisibility {
  mostrar_plantonistas: boolean;
  mostrar_taticos: boolean;
  mostrar_coordenacao: boolean;
}

export interface ConfigPresetParameters {
  score_weights: ScoreWeights;
  score_targets: ScoreTargets;
  category_overrides: Record<string, number>;
  role_visibility: RoleVisibility;
}

export interface ConfigPreset {
  id: string;
  nome: string;
  criado_em: string;
  atualizado_em: string;
  parametros: ConfigPresetParameters;
}

export interface ConfigPresetBundle {
  formato: "ti-helpdesk-analytics-presets";
  versao: 1;
  presets: ConfigPreset[];
}

function adminHeaders({ username, password }: AdminCredentials): HeadersInit {
  return { "X-Admin-Username": username, "X-Admin-Password": password };
}

export const adminApi = {
  verify: (creds: AdminCredentials) => req<{ ok: boolean }>("/admin/verify", { method: "POST", headers: adminHeaders(creds) }),
  createCompetencyActivityType: (payload: Omit<CompetencyActivityTypeDefinition, "id" | "slug" | "ativa"> & { slug?: string }, creds: AdminCredentials) =>
    req<CompetencyActivityTypeDefinition>("/competencies/activity-types", {
      method: "POST",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateCompetencyActivityType: (typeId: number, payload: Partial<Omit<CompetencyActivityTypeDefinition, "id" | "slug">>, creds: AdminCredentials) =>
    req<CompetencyActivityTypeDefinition>(`/competencies/activity-types/${typeId}`, {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteCompetencyActivityType: (typeId: number, creds: AdminCredentials) =>
    req<{ ok: boolean }>(`/competencies/activity-types/${typeId}`, {
      method: "DELETE",
      headers: adminHeaders(creds),
    }),
  createCompetencyActivity: (payload: CompetencyActivityInput, creds: AdminCredentials) =>
    req<CompetencyActivity>("/competencies/activities", {
      method: "POST",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateCompetencyActivity: (activityId: number, payload: Partial<CompetencyActivityInput>, creds: AdminCredentials) =>
    req<CompetencyActivity>(`/competencies/activities/${activityId}`, {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteCompetencyActivity: (activityId: number, creds: AdminCredentials) =>
    req<{ ok: boolean }>(`/competencies/activities/${activityId}`, {
      method: "DELETE",
      headers: adminHeaders(creds),
    }),
  createCompetencySituation: (activityId: number, payload: CompetencySituationInput, creds: AdminCredentials) =>
    req<CompetencySituation>(`/competencies/activities/${activityId}/situations`, {
      method: "POST",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateCompetencySituation: (situationId: number, payload: Partial<CompetencySituationInput>, creds: AdminCredentials) =>
    req<CompetencySituation>(`/competencies/situations/${situationId}`, {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteCompetencySituation: (situationId: number, creds: AdminCredentials) =>
    req<{ ok: boolean }>(`/competencies/situations/${situationId}`, {
      method: "DELETE",
      headers: adminHeaders(creds),
    }),
  assessCompetency: (payload: CompetencyAssessmentInput) =>
    req<CompetencyAssessment>("/competencies/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  collect: (creds: AdminCredentials) =>
    req<CollectionRun>("/admin/collect", {
      method: "POST",
      headers: adminHeaders(creds),
    }),
  listCollectionRuns: (query: CollectionRunQuery, creds: AdminCredentials) => {
    const params = new URLSearchParams({
      page: String(query.page),
      page_size: String(query.pageSize),
      sort_by: query.sortBy,
      sort_dir: query.sortDir,
    });
    if (query.status) params.set("status", query.status);
    return req<CollectionRunPage>(`/admin/collection-runs?${params}`, { headers: adminHeaders(creds) });
  },
  getCollectionRun: (runId: string, creds: AdminCredentials) =>
    req<CollectionRun>(`/admin/collection-runs/${encodeURIComponent(runId)}`, { headers: adminHeaders(creds) }),
  getAutoCollect: () => req<AutoCollectSettings>("/admin/auto-collect"),
  setAutoCollect: (minutes: number, creds: AdminCredentials) =>
    req<AutoCollectSettings>("/admin/auto-collect", {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify({ minutes }),
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
  getScoreTargets: () => req<ScoreTargets>("/admin/score-targets"),
  setScoreTargets: (targets: ScoreTargets, creds: AdminCredentials) =>
    req<ScoreTargets>("/admin/score-targets", {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(targets),
    }),
  resetScoreTargets: (creds: AdminCredentials) =>
    req<ScoreTargets>("/admin/score-targets/reset", { method: "POST", headers: adminHeaders(creds) }),
  getRoleVisibility: () => req<RoleVisibility>("/admin/role-visibility"),
  setRoleVisibility: (visibility: RoleVisibility, creds: AdminCredentials) =>
    req<RoleVisibility>("/admin/role-visibility", {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(visibility),
    }),
  updateTechnician: (usersId: number, updates: TechnicianProfileUpdate, creds: AdminCredentials) =>
    req<Technician>(`/admin/technicians/${usersId}`, {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }),
  setTechnicianPassword: (usersId: number, senha: string, creds: AdminCredentials) =>
    req<{ ok: boolean }>(`/admin/technicians/${usersId}/password`, {
      method: "POST",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    }),
  setCategoryDifficulty: (itilcategoriesId: number, peso: number | null, creds: AdminCredentials) =>
    req<{ itilcategories_id: number; override: number | null }>(`/admin/category-difficulty/${itilcategoriesId}`, {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify({ peso }),
    }),
  listConfigPresets: (creds: AdminCredentials) =>
    req<ConfigPreset[]>("/admin/config-presets", { headers: adminHeaders(creds) }),
  createConfigPreset: (nome: string, creds: AdminCredentials) =>
    req<ConfigPreset>("/admin/config-presets", {
      method: "POST",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    }),
  updateConfigPreset: (presetId: string, creds: AdminCredentials, nome?: string) =>
    req<ConfigPreset>(`/admin/config-presets/${encodeURIComponent(presetId)}`, {
      method: "PUT",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(nome ? { nome } : {}),
    }),
  applyConfigPreset: (presetId: string, creds: AdminCredentials) =>
    req<ConfigPreset>(`/admin/config-presets/${encodeURIComponent(presetId)}/apply`, {
      method: "POST",
      headers: adminHeaders(creds),
    }),
  deleteConfigPreset: (presetId: string, creds: AdminCredentials) =>
    req<{ ok: boolean }>(`/admin/config-presets/${encodeURIComponent(presetId)}`, {
      method: "DELETE",
      headers: adminHeaders(creds),
    }),
  exportConfigPresets: (creds: AdminCredentials) =>
    req<ConfigPresetBundle>("/admin/config-presets/export", { headers: adminHeaders(creds) }),
  exportConfigPreset: (presetId: string, creds: AdminCredentials) =>
    req<ConfigPresetBundle>(`/admin/config-presets/${encodeURIComponent(presetId)}/export`, {
      headers: adminHeaders(creds),
    }),
  importConfigPresets: (bundle: ConfigPresetBundle, creds: AdminCredentials) =>
    req<ConfigPreset[]>("/admin/config-presets/import", {
      method: "POST",
      headers: { ...adminHeaders(creds), "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    }),
};

export interface TechnicianProfileUpdate {
  papel?: Technician["papel"];
  ativo?: boolean;
  unidade_slug?: string | null;
  nome_exibicao?: string;
  foto?: string;
}

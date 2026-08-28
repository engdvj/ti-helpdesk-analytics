"use client";

import { useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";

import { Avatar } from "@/components/ui/Avatar";
import { Bar } from "@/components/ui/Bar";
import { Botao } from "@/components/ui/Botao";
import { Tabs } from "@/components/ui/Tabs";
import { useAdmin } from "@/lib/admin-context";
import { useSession } from "@/lib/session-context";
import {
  adminApi,
  competencies,
  type CompetencyActivity,
  type CompetencyAssessment,
  type CompetencyActivityInput,
  type CompetencyActivityType,
  type CompetencyActivityTypeDefinition,
  type CompetencyContentFieldType,
  type CompetencyContentOption,
  type CompetencyFieldType,
  type CompetencyOption,
  type CompetencyLevel,
  type CompetencySituation,
  type CompetencySituationInput,
  type CompetencySituationProgress,
  type CompetencyTechnicianDetail,
} from "@/lib/api";

type ModuleView = "matriz" | "catalogo";

const LEVEL_META: Record<CompetencyLevel, { label: string; color: string }> = {
  nao_avaliado: { label: "Não avaliado", color: "var(--apagado)" },
  em_desenvolvimento: { label: "Em desenvolvimento", color: "var(--aviso)" },
  competente: { label: "Competente", color: "var(--acento)" },
  dominio: { label: "Domínio", color: "var(--positivo, #4ba67b)" },
};

const FIELD_TYPES: { value: CompetencyFieldType; label: string; description: string }[] = [
  { value: "escala", label: "Escala de pontos", description: "Controle numérico ou deslizante." },
  { value: "radio", label: "Rádio", description: "Uma opção visível por vez." },
  { value: "selecao", label: "Lista de opções", description: "Uma opção em uma lista compacta." },
  { value: "multipla_selecao", label: "Múltipla escolha", description: "Soma os pontos das opções marcadas." },
  { value: "sim_nao", label: "Sim ou não", description: "Sim concede a pontuação máxima." },
];

const CONTENT_FIELD_TYPES: { value: CompetencyContentFieldType; label: string; description: string }[] = [
  { value: "texto_curto", label: "Texto curto", description: "Uma linha objetiva." },
  { value: "texto_longo", label: "Texto longo", description: "Conteúdo detalhado em várias linhas." },
  { value: "radio", label: "Rádio", description: "Opções visíveis com escolha única." },
  { value: "selecao", label: "Lista de opções", description: "Escolha única em uma lista compacta." },
  { value: "multipla_selecao", label: "Múltipla escolha", description: "Permite selecionar mais de uma opção." },
];

const EMPTY_ACTIVITY: CompetencyActivityInput = {
  nome: "",
  descricao: "",
  tipo: "operacional",
  escopo_tipo_campo: "texto_longo",
  escopo_opcoes: [],
  escopo_valor: "",
  ordem: 0,
};
const EMPTY_SITUATION: CompetencySituationInput = {
  nome: "",
  contexto: "",
  procedimento_esperado: "",
  procedimento_tipo_campo: "texto_longo",
  procedimento_opcoes: [],
  procedimento_valor: "",
  pontos_maximos: 1,
  tipo_campo: "escala",
  opcoes: [],
  ordem: 0,
};

function points(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(".", ",");
}

function formatAssessmentDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function CompetencyModule({ unidadeSlug }: { unidadeSlug?: string }) {
  const { isAdmin } = useAdmin();
  const [view, setView] = useState<ModuleView>("matriz");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { data: catalog, error: catalogError, mutate: mutateCatalog } = useSWR(
    ["competency-catalog", isAdmin],
    () => competencies.catalog(isAdmin),
  );
  const { data: activityTypes, error: activityTypesError, mutate: mutateActivityTypes } = useSWR(
    ["competency-activity-types", isAdmin],
    () => competencies.activityTypes(isAdmin),
  );
  const { data: matrix, error: matrixError, mutate: mutateMatrix } = useSWR(
    ["competency-matrix", unidadeSlug ?? "geral"],
    () => competencies.matrix(unidadeSlug),
  );

  const visibleMatrix = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return matrix ?? [];
    return (matrix ?? []).filter((tech) =>
      `${tech.nome} ${tech.username}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [matrix, search]);

  const effectiveSelectedId = selectedId != null && visibleMatrix.some((tech) => tech.users_id === selectedId)
    ? selectedId
    : visibleMatrix[0]?.users_id ?? null;

  async function refreshAll() {
    await Promise.all([mutateCatalog(), mutateActivityTypes(), mutateMatrix()]);
  }

  return (
    <section className="competency-module">
      <header className="competency-module-header">
        <div>
          <span className="sumula-carimbo">Matriz de competências</span>
          <h2>O que cada técnico sabe executar</h2>
          <p>
            Competência demonstrada em situações práticas. Chamados ajudam como evidência, mas não concedem pontos automaticamente.
          </p>
        </div>
        <div className="competency-module-principle">
          <span>Estrutura</span>
          <strong>Atividade → situação → procedimento → evidência → pontos</strong>
          <small>Níveis iniciais: competente a partir de 60%; domínio a partir de 85%.</small>
        </div>
      </header>

      <Tabs
        tabs={[
          { key: "matriz", label: "Matriz da equipe" },
          { key: "catalogo", label: isAdmin ? "Catálogo e critérios" : "Catálogo" },
        ]}
        active={view}
        onChange={(key) => setView(key as ModuleView)}
      />

      {(catalogError || activityTypesError || matrixError) && (
        <p className="competency-error">Não foi possível carregar o módulo de competências.</p>
      )}

      {view === "matriz" && (
        <CompetencyMatrix
          catalog={catalog}
          rows={visibleMatrix}
          selectedId={effectiveSelectedId}
          search={search}
          onSearch={setSearch}
          onSelect={setSelectedId}
          onAssessmentSaved={mutateMatrix}
        />
      )}

      {view === "catalogo" && (
        <CompetencyCatalog
          activities={catalog}
          activityTypes={activityTypes}
          onChanged={refreshAll}
        />
      )}
    </section>
  );
}

function CompetencyMatrix({
  catalog,
  rows,
  selectedId,
  search,
  onSearch,
  onSelect,
  onAssessmentSaved,
}: {
  catalog?: CompetencyActivity[];
  rows: Awaited<ReturnType<typeof competencies.matrix>>;
  selectedId: number | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: number) => void;
  onAssessmentSaved: () => Promise<unknown>;
}) {
  const activeSituations = catalog?.reduce(
    (total, activity) => total + (activity.ativa ? activity.situacoes.filter((s) => s.ativa).length : 0),
    0,
  ) ?? 0;

  if (!catalog || !rows) return <p className="competency-loading">Carregando matriz...</p>;
  if (activeSituations === 0) {
    return (
      <div className="competency-empty">
        <strong>A matriz ainda não possui situações.</strong>
        <span>Comece no Catálogo: crie uma atividade, descreva uma situação prática e defina o procedimento esperado.</span>
      </div>
    );
  }

  return (
    <div className="competency-matrix-layout">
      <aside className="competency-technician-list">
        <div className="competency-list-header">
          <div>
            <strong>Equipe</strong>
            <span>{rows.length} técnico{rows.length === 1 ? "" : "s"}</span>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar técnico..."
            aria-label="Buscar técnico na matriz"
          />
        </div>

        <div className="competency-technician-scroll">
          {rows.map((tech) => {
            const meta = LEVEL_META[tech.nivel];
            return (
              <button
                type="button"
                key={tech.users_id}
                className={`competency-technician-row ${selectedId === tech.users_id ? "is-selected" : ""}`}
                onClick={() => onSelect(tech.users_id)}
                aria-pressed={selectedId === tech.users_id}
              >
                <Avatar nome={tech.nome} foto={tech.foto} size={34} />
                <span className="competency-technician-identity">
                  <strong>{tech.nome}</strong>
                  <small style={{ color: meta.color }}>{meta.label}</small>
                </span>
                <span className="competency-technician-score">
                  <strong>{tech.percentual.toFixed(0)}%</strong>
                  <small>{tech.situacoes_avaliadas}/{tech.situacoes_total}</small>
                </span>
                <span className="competency-technician-bar">
                  <Bar pct={tech.percentual} height={4} color={meta.color} />
                </span>
              </button>
            );
          })}
          {rows.length === 0 && <p className="competency-list-empty">Nenhum técnico encontrado.</p>}
        </div>
      </aside>

      <TechnicianCompetencyDetail usersId={selectedId} onAssessmentSaved={onAssessmentSaved} />
    </div>
  );
}

function TechnicianCompetencyDetail({
  usersId,
  onAssessmentSaved,
}: {
  usersId: number | null;
  onAssessmentSaved: () => Promise<unknown>;
}) {
  const { data, error, mutate } = useSWR(
    usersId == null ? null : ["competency-technician", usersId],
    () => competencies.technician(usersId as number),
  );

  if (usersId == null) return <div className="competency-detail-empty">Selecione um técnico.</div>;
  if (error) return <div className="competency-detail-empty is-error">Não foi possível carregar este técnico.</div>;
  if (!data) return <div className="competency-detail-empty">Carregando competências...</div>;

  async function saved() {
    await Promise.all([mutate(), onAssessmentSaved()]);
  }

  const meta = LEVEL_META[data.nivel];
  return (
    <article className="competency-detail">
      <header className="competency-detail-header">
        <div className="competency-detail-person">
          <Avatar nome={data.nome} foto={data.foto} size={48} />
          <div>
            <span>Mapa individual</span>
            <h3>{data.nome}</h3>
            <small style={{ color: meta.color }}>{meta.label}</small>
          </div>
        </div>
        <div className="competency-detail-total">
          <strong>{data.percentual.toFixed(0)}%</strong>
          <span>{points(data.pontos)} de {points(data.pontos_maximos)} pontos</span>
          <small>{data.situacoes_avaliadas} de {data.situacoes_total} situações avaliadas</small>
        </div>
      </header>

      <Bar pct={data.percentual} height={8} color={meta.color} />

      <div className="competency-activity-progress-list">
        {data.atividades.map((activity) => (
          <ActivityProgressCard key={activity.id} activity={activity} technician={data} onSaved={saved} />
        ))}
      </div>
    </article>
  );
}

function ActivityProgressCard({
  activity,
  technician,
  onSaved,
}: {
  activity: CompetencyTechnicianDetail["atividades"][number];
  technician: CompetencyTechnicianDetail;
  onSaved: () => Promise<void>;
}) {
  return (
    <details className="competency-activity-progress" open>
      <summary>
        <div>
          <strong>{activity.nome}</strong>
          <span>{contentFieldDisplay(activity.descricao, activity.escopo_opcoes, activity.escopo_valor) || `${activity.situacoes_total} situações práticas`}</span>
        </div>
        <div className="competency-activity-total">
          <strong>{activity.percentual.toFixed(0)}%</strong>
          <small>{points(activity.pontos)}/{points(activity.pontos_maximos)} pts</small>
        </div>
      </summary>
      <div className="competency-activity-progress-bar">
        <Bar pct={activity.percentual} height={5} />
      </div>
      <div className="competency-situation-progress-list">
        {activity.situacoes.map((situation) => (
          <SituationProgressRow
            key={situation.id}
            situation={situation}
            usersId={technician.users_id}
            onSaved={onSaved}
          />
        ))}
      </div>
    </details>
  );
}

function SituationProgressRow({
  situation,
  usersId,
  onSaved,
}: {
  situation: CompetencySituationProgress;
  usersId: number;
  onSaved: () => Promise<void>;
}) {
  const { isAdmin } = useAdmin();
  const { subjectType, usersId: sessionUsersId } = useSession();
  const isTecnico = subjectType === "tecnico";
  // Admin avalia qualquer um; tecnico avalia colegas, nunca a si mesmo.
  const canEvaluate = isAdmin || (isTecnico && sessionUsersId !== usersId);
  const myPrevious = isAdmin
    ? situation.avaliacoes.find((a) => a.avaliador_users_id == null)
    : situation.avaliacoes.find((a) => a.avaliador_users_id === sessionUsersId);
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(situation.pontos);
  const [response, setResponse] = useState<string | string[] | boolean | null>(
    myPrevious?.resposta ?? (situation.tipo_campo === "multipla_selecao" ? [] : null),
  );
  const [evidence, setEvidence] = useState(myPrevious?.evidencia ?? "");
  const [note, setNote] = useState("");
  const [anonimo, setAnonimo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const percentage = situation.pontos_maximos ? situation.pontos / situation.pontos_maximos * 100 : 0;
  const responseIsValid = situation.tipo_campo === "escala"
    || (situation.tipo_campo === "sim_nao" && typeof response === "boolean")
    || (situation.tipo_campo === "multipla_selecao" && Array.isArray(response) && response.length > 0)
    || ((situation.tipo_campo === "radio" || situation.tipo_campo === "selecao") && typeof response === "string" && response.length > 0);

  function responseLabel(value: string | string[] | boolean | null): string | null {
    if (value == null) return null;
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => situation.opcoes.find((option) => option.valor === item)?.rotulo ?? item).join(", ");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEvaluate) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.assessCompetency({
        users_id: usersId,
        situacao_id: situation.id,
        pontos: situation.tipo_campo === "escala" ? score : null,
        resposta: situation.tipo_campo === "escala" ? null : response,
        evidencia: evidence.trim() || null,
        observacao: note.trim() || null,
        anonimo: isTecnico ? anonimo : false,
      });
      await onSaved();
      setEditing(false);
      setNote("");
      setAnonimo(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`competency-situation-progress ${situation.avaliada ? "is-assessed" : ""}`}>
      <div className="competency-situation-main">
        <div>
          <strong>{situation.nome}</strong>
          {situation.contexto && <p>{situation.contexto}</p>}
        </div>
        <div className="competency-situation-points">
          <strong>{points(situation.pontos)}/{points(situation.pontos_maximos)}</strong>
          <small>{situation.avaliada ? "avaliada" : "pendente"}</small>
        </div>
      </div>
      <Bar pct={percentage} height={4} color={situation.avaliada ? "var(--acento)" : "var(--apagado)"} />

      <details className="competency-procedure">
        <summary>Procedimento esperado</summary>
        <p>{contentFieldDisplay(situation.procedimento_esperado, situation.procedimento_opcoes, situation.procedimento_valor)}</p>
      </details>

      {situation.n_avaliacoes > 0 && (
        <details className="competency-latest-evidence">
          <summary>
            Média de {situation.n_avaliacoes} avaliaç{situation.n_avaliacoes === 1 ? "ão" : "ões"}
          </summary>
          {situation.avaliacoes.map((assessment) => (
            <AssessmentDetail key={assessment.id} assessment={assessment} responseLabel={responseLabel} />
          ))}
        </details>
      )}

      {canEvaluate && !editing && (
        <Botao variant="secundario" onClick={() => {
          setScore(myPrevious?.pontos ?? situation.pontos);
          setResponse(myPrevious?.resposta ?? (situation.tipo_campo === "multipla_selecao" ? [] : null));
          setEvidence(myPrevious?.evidencia ?? "");
          setAnonimo(false);
          setEditing(true);
        }}>
          {myPrevious ? "Reavaliar" : "Avaliar"}
        </Botao>
      )}

      {canEvaluate && editing && (
        <form className="competency-assessment-form" onSubmit={save}>
          {situation.tipo_campo === "escala" && (
            <label>
              <span>Pontos demonstrados</span>
              <div className="competency-score-control">
                <input
                  type="range"
                  min="0"
                  max={situation.pontos_maximos}
                  step="0.5"
                  value={score}
                  onChange={(event) => setScore(Number(event.target.value))}
                />
                <input
                  aria-label={`Pontos em ${situation.nome}`}
                  type="number"
                  min="0"
                  max={situation.pontos_maximos}
                  step="0.5"
                  value={score}
                  onChange={(event) => setScore(Number(event.target.value))}
                />
                <strong>/ {points(situation.pontos_maximos)}</strong>
              </div>
            </label>
          )}
          {situation.tipo_campo === "radio" && (
            <fieldset className="competency-assessment-options">
              <legend>Escolha uma opção</legend>
              {situation.opcoes.map((option) => (
                <label key={option.valor}>
                  <input type="radio" name={`situation-${situation.id}`} value={option.valor} checked={response === option.valor} onChange={() => setResponse(option.valor)} />
                  <span>{option.rotulo}</span><strong>{points(option.pontos)} pts</strong>
                </label>
              ))}
            </fieldset>
          )}
          {situation.tipo_campo === "selecao" && (
            <label>
              <span>Selecione uma opção</span>
              <select value={typeof response === "string" ? response : ""} onChange={(event) => setResponse(event.target.value || null)} required>
                <option value="">Selecione...</option>
                {situation.opcoes.map((option) => <option key={option.valor} value={option.valor}>{option.rotulo} · {points(option.pontos)} pts</option>)}
              </select>
            </label>
          )}
          {situation.tipo_campo === "multipla_selecao" && (
            <fieldset className="competency-assessment-options">
              <legend>Marque as opções demonstradas</legend>
              {situation.opcoes.map((option) => {
                const selected = Array.isArray(response) && response.includes(option.valor);
                return (
                  <label key={option.valor}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setResponse((current) => {
                        const values = Array.isArray(current) ? current : [];
                        return selected ? values.filter((value) => value !== option.valor) : [...values, option.valor];
                      })}
                    />
                    <span>{option.rotulo}</span><strong>{points(option.pontos)} pts</strong>
                  </label>
                );
              })}
              <small>A pontuação é a soma das opções, limitada a {points(situation.pontos_maximos)} pontos.</small>
            </fieldset>
          )}
          {situation.tipo_campo === "sim_nao" && (
            <fieldset className="competency-assessment-options is-boolean">
              <legend>O técnico demonstrou esta competência?</legend>
              <label><input type="radio" name={`situation-${situation.id}`} checked={response === true} onChange={() => setResponse(true)} /><span>Sim</span><strong>{points(situation.pontos_maximos)} pts</strong></label>
              <label><input type="radio" name={`situation-${situation.id}`} checked={response === false} onChange={() => setResponse(false)} /><span>Não</span><strong>0 pts</strong></label>
            </fieldset>
          )}
          <label>
            <span>Evidência observada</span>
            <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Ex.: executou sozinho em chamado, simulação ou acompanhamento..." />
          </label>
          <label>
            <span>Observação para evolução</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="O que já domina e qual é o próximo passo?" />
          </label>
          {isTecnico && (
            <label className="competency-anonymous-toggle">
              <input type="checkbox" checked={anonimo} onChange={(event) => setAnonimo(event.target.checked)} />
              <span>Avaliar anonimamente (sua identidade não aparece nem para o admin)</span>
            </label>
          )}
          {error && <p className="competency-error">{error}</p>}
          <div className="competency-form-actions">
            <Botao type="submit" variant="primario" disabled={saving || !responseIsValid}>{saving ? "Salvando..." : "Registrar avaliação"}</Botao>
            <Botao type="button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Botao>
          </div>
        </form>
      )}
    </section>
  );
}

function AssessmentDetail({
  assessment,
  responseLabel,
}: {
  assessment: CompetencyAssessment;
  responseLabel: (value: string | string[] | boolean | null) => string | null;
}) {
  return (
    <div className="competency-assessment-detail">
      <span>{points(assessment.pontos)} pts · {formatAssessmentDate(assessment.avaliado_em)} por {assessment.avaliado_por}</span>
      {responseLabel(assessment.resposta) && <p><strong>Resposta:</strong> {responseLabel(assessment.resposta)}</p>}
      {assessment.evidencia && <p><strong>Evidência:</strong> {assessment.evidencia}</p>}
      {assessment.observacao && <p><strong>Observação:</strong> {assessment.observacao}</p>}
    </div>
  );
}

type ActivitySortKey = "ordem" | "nome" | "tipo" | "situacoes" | "pontos";
type SituationSortKey = "ordem" | "nome" | "tipo" | "pontos";
type SortDirection = "asc" | "desc";

function activityTypeLabel(type: CompetencyActivityType, definitions: CompetencyActivityTypeDefinition[]): string {
  return definitions.find((option) => option.slug === type)?.nome ?? type;
}

function fieldTypeLabel(type: CompetencyFieldType): string {
  return FIELD_TYPES.find((option) => option.value === type)?.label ?? type;
}

function newCompetencyOption(): CompetencyOption {
  const valor = globalThis.crypto?.randomUUID?.() ?? `opcao-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { valor, rotulo: "", pontos: 0 };
}

function newContentOption(): CompetencyContentOption {
  const valor = globalThis.crypto?.randomUUID?.() ?? `conteudo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { valor, rotulo: "" };
}

function contentFieldDisplay(
  fallback: string,
  options: CompetencyContentOption[],
  value: string | string[] | null,
): string {
  if (value == null || (Array.isArray(value) && value.length === 0) || value === "") return fallback;
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => options.find((option) => option.valor === item)?.rotulo ?? item).join(" · ");
}

function CompetencyCatalog({
  activities,
  activityTypes,
  onChanged,
}: {
  activities?: CompetencyActivity[];
  activityTypes?: CompetencyActivityTypeDefinition[];
  onChanged: () => Promise<void>;
}) {
  const { credentials } = useAdmin();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CompetencyActivityType | "todos">("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativas" | "inativas">("todos");
  const [sortKey, setSortKey] = useState<ActivitySortKey>("ordem");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [editingActivity, setEditingActivity] = useState<number | null>(null);
  const [activityDraft, setActivityDraft] = useState<CompetencyActivityInput>(EMPTY_ACTIVITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    const filtered = (activities ?? []).filter((activity) => {
      if (typeFilter !== "todos" && activity.tipo !== typeFilter) return false;
      if (statusFilter === "ativas" && !activity.ativa) return false;
      if (statusFilter === "inativas" && activity.ativa) return false;
      if (!normalizedQuery) return true;
      return `${activity.nome} ${activity.descricao} ${activityTypeLabel(activity.tipo, activityTypes ?? [])}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery);
    });
    return filtered.sort((a, b) => {
      let difference = 0;
      if (sortKey === "nome") difference = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      else if (sortKey === "tipo") difference = activityTypeLabel(a.tipo, activityTypes ?? []).localeCompare(activityTypeLabel(b.tipo, activityTypes ?? []), "pt-BR");
      else if (sortKey === "situacoes") difference = a.situacoes.length - b.situacoes.length;
      else if (sortKey === "pontos") {
        difference = a.situacoes.reduce((total, item) => total + item.pontos_maximos, 0)
          - b.situacoes.reduce((total, item) => total + item.pontos_maximos, 0);
      } else difference = a.ordem - b.ordem;
      return sortDir === "asc" ? difference : -difference;
    });
  }, [activities, activityTypes, query, sortDir, sortKey, statusFilter, typeFilter]);

  if (!activities || !activityTypes) return <p className="competency-loading">Carregando catálogo...</p>;

  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageActivities = filteredActivities.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetActivityForm() {
    setActivityDraft(EMPTY_ACTIVITY);
    setEditingActivity(null);
    setShowActivityForm(false);
  }

  async function saveActivity(event: FormEvent) {
    event.preventDefault();
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      if (editingActivity == null) await adminApi.createCompetencyActivity(activityDraft, credentials);
      else await adminApi.updateCompetencyActivity(editingActivity, activityDraft, credentials);
      await onChanged();
      resetActivityForm();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function editActivity(activity: CompetencyActivity) {
    setActivityDraft({
      nome: activity.nome,
      descricao: activity.descricao,
      tipo: activity.tipo,
      escopo_tipo_campo: activity.escopo_tipo_campo,
      escopo_opcoes: activity.escopo_opcoes,
      escopo_valor: activity.escopo_valor,
      ordem: activity.ordem,
      ativa: activity.ativa,
    });
    setEditingActivity(activity.id);
    setShowActivityForm(true);
  }

  async function toggleActivity(activity: CompetencyActivity) {
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateCompetencyActivity(activity.id, { ativa: !activity.ativa }, credentials);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteActivity(activity: CompetencyActivity) {
    if (!credentials || !window.confirm(`Excluir definitivamente a atividade “${activity.nome}” e suas situações sem avaliações?`)) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.deleteCompetencyActivity(activity.id, credentials);
      if (expandedActivity === activity.id) setExpandedActivity(null);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="competency-catalog">
      <header className="competency-catalog-header">
        <div>
          <h3>Catálogo de atividades e situações</h3>
          <p>Estruture atividades por tipo e defina como cada situação será avaliada e pontuada.</p>
        </div>
        {credentials && (
          <div className="competency-catalog-header-actions">
            <Botao onClick={() => setShowTypeManager((current) => !current)}>{showTypeManager ? "Fechar tipos" : "Gerenciar tipos"}</Botao>
            {!showActivityForm && <Botao variant="primario" onClick={() => {
              setActivityDraft({ ...EMPTY_ACTIVITY, tipo: activityTypes.find((type) => type.ativa)?.slug ?? "operacional" });
              setEditingActivity(null);
              setShowActivityForm(true);
            }}>Nova atividade</Botao>}
          </div>
        )}
      </header>

      {credentials && showTypeManager && <ActivityTypeManager types={activityTypes} activities={activities} onChanged={onChanged} />}

      {!credentials && <p className="competency-readonly-note">Modo consulta. Entre como admin para usar o CRUD completo.</p>}

      {credentials && showActivityForm && (
        <ActivityForm
          draft={activityDraft}
          onChange={setActivityDraft}
          onSubmit={saveActivity}
          onCancel={resetActivityForm}
          saving={saving}
          editing={editingActivity != null}
          activityTypes={activityTypes}
        />
      )}

      <div className="competency-catalog-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          placeholder="Buscar atividade, descrição ou tipo..."
          aria-label="Buscar no catálogo"
        />
        <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as CompetencyActivityType | "todos"); setPage(1); }} aria-label="Filtrar atividades por tipo">
          <option value="todos">Todos os tipos</option>
          {activityTypes.map((type) => <option key={type.slug} value={type.slug}>{type.nome}{type.ativa ? "" : " (inativo)"}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }} aria-label="Filtrar atividades por status">
          <option value="todos">Todos os status</option>
          <option value="ativas">Ativas</option>
          <option value="inativas">Inativas</option>
        </select>
        <select value={sortKey} onChange={(event) => { setSortKey(event.target.value as ActivitySortKey); setPage(1); }} aria-label="Ordenar atividades">
          <option value="ordem">Ordem definida</option>
          <option value="nome">Nome</option>
          <option value="tipo">Tipo</option>
          <option value="situacoes">Quantidade de situações</option>
          <option value="pontos">Total de pontos</option>
        </select>
        <button type="button" className="competency-sort-direction" onClick={() => setSortDir((current) => current === "asc" ? "desc" : "asc")} aria-label={sortDir === "asc" ? "Ordenação crescente" : "Ordenação decrescente"}>
          {sortDir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {error && <p className="competency-error">{error}</p>}

      <div className="competency-catalog-summary">
        <span>{filteredActivities.length} de {activities.length} atividades</span>
        <label>Por página
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {[5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="competency-catalog-list is-compact">
        {pageActivities.map((activity) => (
          <CatalogActivityCard
            key={activity.id}
            activity={activity}
            typeDefinition={activityTypes.find((type) => type.slug === activity.tipo)}
            expanded={expandedActivity === activity.id}
            saving={saving}
            onExpand={() => setExpandedActivity((current) => current === activity.id ? null : activity.id)}
            onEdit={() => editActivity(activity)}
            onToggle={() => toggleActivity(activity)}
            onDelete={() => deleteActivity(activity)}
            onChanged={onChanged}
          />
        ))}
        {pageActivities.length === 0 && (
          <div className="competency-empty"><strong>Nenhuma atividade encontrada.</strong><span>Ajuste os filtros ou crie uma nova atividade.</span></div>
        )}
      </div>

      {filteredActivities.length > 0 && (
        <div className="competency-catalog-pagination">
          <span>Página {currentPage} de {totalPages}</span>
          <div>
            <Botao onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1}>Anterior</Botao>
            <Botao onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={currentPage >= totalPages}>Próxima</Botao>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogActivityCard({
  activity,
  typeDefinition,
  expanded,
  saving: parentSaving,
  onExpand,
  onEdit,
  onToggle,
  onDelete,
  onChanged,
}: {
  activity: CompetencyActivity;
  typeDefinition?: CompetencyActivityTypeDefinition;
  expanded: boolean;
  saving: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onChanged: () => Promise<void>;
}) {
  const { credentials } = useAdmin();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativas" | "inativas">("todos");
  const [fieldFilter, setFieldFilter] = useState<CompetencyFieldType | "todos">("todos");
  const [sortKey, setSortKey] = useState<SituationSortKey>("ordem");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [showForm, setShowForm] = useState(false);
  const [editingSituation, setEditingSituation] = useState<number | null>(null);
  const [draft, setDraft] = useState<CompetencySituationInput>(EMPTY_SITUATION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalPoints = activity.situacoes.reduce((total, situation) => total + situation.pontos_maximos, 0);

  const filteredSituations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return activity.situacoes
      .filter((situation) => {
        if (statusFilter === "ativas" && !situation.ativa) return false;
        if (statusFilter === "inativas" && situation.ativa) return false;
        if (fieldFilter !== "todos" && situation.tipo_campo !== fieldFilter) return false;
        if (!normalizedQuery) return true;
        return `${situation.nome} ${situation.contexto} ${situation.procedimento_esperado}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        let difference = 0;
        if (sortKey === "nome") difference = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
        else if (sortKey === "tipo") difference = fieldTypeLabel(a.tipo_campo).localeCompare(fieldTypeLabel(b.tipo_campo), "pt-BR");
        else if (sortKey === "pontos") difference = a.pontos_maximos - b.pontos_maximos;
        else difference = a.ordem - b.ordem;
        return sortDir === "asc" ? difference : -difference;
      });
  }, [activity.situacoes, fieldFilter, query, sortDir, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSituations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageSituations = filteredSituations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetForm() {
    setDraft(EMPTY_SITUATION);
    setEditingSituation(null);
    setShowForm(false);
  }

  function editSituation(situation: CompetencySituation) {
    setDraft({
      nome: situation.nome,
      contexto: situation.contexto,
      procedimento_esperado: situation.procedimento_esperado,
      procedimento_tipo_campo: situation.procedimento_tipo_campo,
      procedimento_opcoes: situation.procedimento_opcoes,
      procedimento_valor: situation.procedimento_valor,
      pontos_maximos: situation.pontos_maximos,
      tipo_campo: situation.tipo_campo,
      opcoes: situation.opcoes,
      ordem: situation.ordem,
      ativa: situation.ativa,
    });
    setEditingSituation(situation.id);
    setShowForm(true);
  }

  async function saveSituation(event: FormEvent) {
    event.preventDefault();
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      if (editingSituation == null) await adminApi.createCompetencySituation(activity.id, draft, credentials);
      else await adminApi.updateCompetencySituation(editingSituation, draft, credentials);
      await onChanged();
      resetForm();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSituation(situation: CompetencySituation) {
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateCompetencySituation(situation.id, { ativa: !situation.ativa }, credentials);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSituation(situation: CompetencySituation) {
    if (!credentials || !window.confirm(`Excluir definitivamente a situação “${situation.nome}”?`)) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.deleteCompetencySituation(situation.id, credentials);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`competency-catalog-activity is-compact ${activity.ativa ? "" : "is-inactive"}`}>
      <div className="competency-catalog-activity-row">
        <button type="button" className="competency-catalog-expand" onClick={onExpand} aria-expanded={expanded} aria-label={`${expanded ? "Recolher" : "Expandir"} ${activity.nome}`}>
          {expanded ? "−" : "+"}
        </button>
        <span className="competency-type-badge" style={{ borderColor: typeDefinition?.cor, color: typeDefinition?.cor }}>{typeDefinition?.nome ?? activity.tipo}</span>
        <button type="button" className="competency-catalog-activity-title" onClick={onExpand}>
          <strong>{activity.nome}</strong>
          <small>{contentFieldDisplay(activity.descricao, activity.escopo_opcoes, activity.escopo_valor) || "Sem objetivo definido"}</small>
        </button>
        <span className="competency-catalog-count"><strong>{activity.situacoes.length}</strong><small>situações</small></span>
        <span className="competency-catalog-count"><strong>{points(totalPoints)}</strong><small>pontos</small></span>
        <span className={`competency-status-badge ${activity.ativa ? "is-active" : "is-inactive"}`}>{activity.ativa ? "Ativa" : "Inativa"}</span>
        {credentials && (
          <div className="competency-catalog-row-actions">
            <Botao onClick={onEdit}>Editar</Botao>
            <Botao onClick={onToggle} disabled={parentSaving}>{activity.ativa ? "Desativar" : "Ativar"}</Botao>
            <Botao variant="destrutivo" onClick={onDelete} disabled={parentSaving}>Excluir</Botao>
          </div>
        )}
      </div>

      {expanded && (
        <div className="competency-catalog-activity-body">
          <div className="competency-situation-toolbar">
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar situação..." aria-label={`Buscar situações em ${activity.nome}`} />
            <select value={fieldFilter} onChange={(event) => { setFieldFilter(event.target.value as CompetencyFieldType | "todos"); setPage(1); }} aria-label="Filtrar situações por tipo de campo">
              <option value="todos">Todos os campos</option>
              {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }} aria-label="Filtrar situações por status">
              <option value="todos">Todos os status</option><option value="ativas">Ativas</option><option value="inativas">Inativas</option>
            </select>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SituationSortKey)} aria-label="Ordenar situações">
              <option value="ordem">Ordem</option><option value="nome">Nome</option><option value="tipo">Tipo do campo</option><option value="pontos">Pontos</option>
            </select>
            <button type="button" className="competency-sort-direction" onClick={() => setSortDir((current) => current === "asc" ? "desc" : "asc")} aria-label={sortDir === "asc" ? "Situações em ordem crescente" : "Situações em ordem decrescente"}>{sortDir === "asc" ? "↑" : "↓"}</button>
            {credentials && !showForm && <Botao variant="primario" onClick={() => { setDraft(EMPTY_SITUATION); setEditingSituation(null); setShowForm(true); }}>Nova situação</Botao>}
          </div>

          {showForm && (
            <SituationForm draft={draft} onChange={setDraft} onSubmit={saveSituation} onCancel={resetForm} saving={saving} editing={editingSituation != null} />
          )}
          {error && <p className="competency-error">{error}</p>}

          <div className="competency-catalog-situations is-compact">
            {pageSituations.map((situation) => (
              <details key={situation.id} className={`competency-catalog-situation is-compact ${situation.ativa ? "" : "is-inactive"}`}>
                <summary>
                  <div>
                    <strong>{situation.nome}</strong>
                    <span>{situation.contexto || "Situação prática"}</span>
                  </div>
                  <span className="competency-field-badge">{fieldTypeLabel(situation.tipo_campo)}</span>
                  <strong>{points(situation.pontos_maximos)} pts</strong>
                </summary>
                <div className="competency-catalog-situation-body">
                  <span>Procedimento esperado</span>
                  <p>{contentFieldDisplay(situation.procedimento_esperado, situation.procedimento_opcoes, situation.procedimento_valor)}</p>
                  {situation.opcoes.length > 0 && (
                    <div className="competency-option-preview">
                      {situation.opcoes.map((option) => <span key={option.valor}>{option.rotulo} · {points(option.pontos)} pts</span>)}
                    </div>
                  )}
                  {credentials && (
                    <div className="competency-form-actions">
                      <Botao onClick={() => editSituation(situation)}>Editar</Botao>
                      <Botao onClick={() => toggleSituation(situation)} disabled={saving}>{situation.ativa ? "Desativar" : "Ativar"}</Botao>
                      <Botao variant="destrutivo" onClick={() => deleteSituation(situation)} disabled={saving}>Excluir</Botao>
                    </div>
                  )}
                </div>
              </details>
            ))}
            {pageSituations.length === 0 && <p className="competency-list-empty">Nenhuma situação encontrada.</p>}
          </div>

          <div className="competency-situation-pagination">
            <span>{filteredSituations.length} situações · página {currentPage} de {totalPages}</span>
            <label>Por página <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label>
            <div><Botao onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1}>Anterior</Botao><Botao onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={currentPage >= totalPages}>Próxima</Botao></div>
          </div>
        </div>
      )}
    </article>
  );
}

type ActivityTypeDraft = { nome: string; descricao: string; cor: string; ordem: number };

function ActivityTypeManager({
  types,
  activities,
  onChanged,
}: {
  types: CompetencyActivityTypeDefinition[];
  activities: CompetencyActivity[];
  onChanged: () => Promise<void>;
}) {
  const { credentials } = useAdmin();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ActivityTypeDraft>({ nome: "", descricao: "", cor: "#58a6ff", ordem: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setEditingId(null);
    setDraft({ nome: "", descricao: "", cor: "#58a6ff", ordem: types.length });
    setShowForm(true);
  }

  function startEdit(type: CompetencyActivityTypeDefinition) {
    setEditingId(type.id);
    setDraft({ nome: type.nome, descricao: type.descricao, cor: type.cor, ordem: type.ordem });
    setShowForm(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId == null) await adminApi.createCompetencyActivityType(draft, credentials);
      else await adminApi.updateCompetencyActivityType(editingId, draft, credentials);
      await onChanged();
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(type: CompetencyActivityTypeDefinition) {
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateCompetencyActivityType(type.id, { ativa: !type.ativa }, credentials);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(type: CompetencyActivityTypeDefinition) {
    if (!credentials || !window.confirm(`Excluir definitivamente o tipo “${type.nome}”?`)) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.deleteCompetencyActivityType(type.id, credentials);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="competency-type-manager">
      <header>
        <div><strong>Tipos de atividade</strong><span>Cadastro reutilizável em todo o catálogo.</span></div>
        {!showForm && <Botao variant="primario" onClick={startCreate}>Novo tipo</Botao>}
      </header>
      {showForm && (
        <form className="competency-type-form" onSubmit={save}>
          <label><span>Nome</span><input required minLength={2} value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} placeholder="Ex.: Infraestrutura" /></label>
          <label><span>Descrição</span><input value={draft.descricao} onChange={(event) => setDraft({ ...draft, descricao: event.target.value })} placeholder="Quando este tipo deve ser usado?" /></label>
          <label><span>Cor</span><input type="color" value={draft.cor} onChange={(event) => setDraft({ ...draft, cor: event.target.value })} /></label>
          <label><span>Ordem</span><input type="number" step="1" value={draft.ordem} onChange={(event) => setDraft({ ...draft, ordem: Number(event.target.value) })} /></label>
          <div className="competency-form-actions"><Botao type="submit" variant="primario" disabled={saving}>{saving ? "Salvando..." : "Salvar tipo"}</Botao><Botao type="button" onClick={() => setShowForm(false)}>Cancelar</Botao></div>
        </form>
      )}
      {error && <p className="competency-error">{error}</p>}
      <div className="competency-type-list">
        {types.map((type) => {
          const usage = activities.filter((activity) => activity.tipo === type.slug).length;
          return (
            <div key={type.id} className={type.ativa ? "" : "is-inactive"}>
              <i style={{ background: type.cor }} />
              <span><strong>{type.nome}</strong><small>{type.slug}{type.descricao ? ` · ${type.descricao}` : ""}</small></span>
              <span className="competency-catalog-count"><strong>{usage}</strong><small>atividades</small></span>
              <span className={`competency-status-badge ${type.ativa ? "is-active" : "is-inactive"}`}>{type.ativa ? "Ativo" : "Inativo"}</span>
              <div className="competency-catalog-row-actions"><Botao onClick={() => startEdit(type)}>Editar</Botao><Botao onClick={() => toggle(type)} disabled={saving}>{type.ativa ? "Desativar" : "Ativar"}</Botao><Botao variant="destrutivo" onClick={() => remove(type)} disabled={saving || usage > 0}>Excluir</Botao></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConfigurableContentField({
  label,
  fieldType,
  options,
  value,
  required = false,
  placeholder,
  onChange,
}: {
  label: string;
  fieldType: CompetencyContentFieldType;
  options: CompetencyContentOption[];
  value: string | string[] | null;
  required?: boolean;
  placeholder: string;
  onChange: (fieldType: CompetencyContentFieldType, options: CompetencyContentOption[], value: string | string[] | null) => void;
}) {
  const isChoice = ["radio", "selecao", "multipla_selecao"].includes(fieldType);

  function changeType(nextType: CompetencyContentFieldType) {
    const nextIsChoice = ["radio", "selecao", "multipla_selecao"].includes(nextType);
    onChange(
      nextType,
      nextIsChoice ? (options.length >= 2 ? options : [newContentOption(), newContentOption()]) : [],
      nextType === "multipla_selecao" ? [] : "",
    );
  }

  return (
    <fieldset className="competency-content-field">
      <legend>{label}</legend>
      <div className="competency-content-field-config">
        <label>
          <span>Formato do campo</span>
          <select value={fieldType} onChange={(event) => changeType(event.target.value as CompetencyContentFieldType)}>
            {CONTENT_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <small>{CONTENT_FIELD_TYPES.find((type) => type.value === fieldType)?.description}</small>
        </label>
      </div>
      {fieldType === "texto_curto" && <label><span>Conteúdo</span><input required={required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(fieldType, options, event.target.value)} placeholder={placeholder} /></label>}
      {fieldType === "texto_longo" && <label><span>Conteúdo</span><textarea required={required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(fieldType, options, event.target.value)} placeholder={placeholder} /></label>}
      {isChoice && (
        <div className="competency-content-choice-builder">
          <div className="competency-content-option-list">
            {options.map((option, index) => (
              <div key={option.valor}>
                <label><span>Opção {index + 1}</span><input required value={option.rotulo} onChange={(event) => onChange(fieldType, options.map((item) => item.valor === option.valor ? { ...item, rotulo: event.target.value } : item), value)} placeholder="Descreva a opção" /></label>
                <Botao type="button" variant="destrutivo" disabled={options.length <= 2} onClick={() => {
                  const nextOptions = options.filter((item) => item.valor !== option.valor);
                  const nextValue = Array.isArray(value) ? value.filter((item) => item !== option.valor) : value === option.valor ? "" : value;
                  onChange(fieldType, nextOptions, nextValue);
                }}>Remover</Botao>
              </div>
            ))}
          </div>
          <Botao type="button" onClick={() => onChange(fieldType, [...options, newContentOption()], value)}>Adicionar opção</Botao>
          <div className="competency-content-value">
            <span>Valor exibido</span>
            {fieldType === "radio" && options.map((option) => <label key={option.valor}><input required={required} type="radio" name={`${label}-content`} checked={value === option.valor} onChange={() => onChange(fieldType, options, option.valor)} /><span>{option.rotulo || `Opção ${options.indexOf(option) + 1}`}</span></label>)}
            {fieldType === "selecao" && <select required={required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(fieldType, options, event.target.value)}><option value="">Selecione...</option>{options.map((option) => <option key={option.valor} value={option.valor}>{option.rotulo || "Opção sem nome"}</option>)}</select>}
            {fieldType === "multipla_selecao" && options.map((option) => {
              const selected = Array.isArray(value) && value.includes(option.valor);
              return <label key={option.valor}><input type="checkbox" checked={selected} onChange={() => {
                const values = Array.isArray(value) ? value : [];
                onChange(fieldType, options, selected ? values.filter((item) => item !== option.valor) : [...values, option.valor]);
              }} /><span>{option.rotulo || `Opção ${options.indexOf(option) + 1}`}</span></label>;
            })}
          </div>
        </div>
      )}
    </fieldset>
  );
}

function ActivityForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  saving,
  editing,
  activityTypes,
}: {
  draft: CompetencyActivityInput;
  onChange: (value: CompetencyActivityInput) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  editing: boolean;
  activityTypes: CompetencyActivityTypeDefinition[];
}) {
  const scopeOptionsValid = !["radio", "selecao", "multipla_selecao"].includes(draft.escopo_tipo_campo)
    || (draft.escopo_opcoes.length >= 2 && draft.escopo_opcoes.every((option) => option.rotulo.trim().length > 0));

  return (
    <form className="competency-catalog-form" onSubmit={onSubmit}>
      <div className="competency-form-heading">
        <strong>{editing ? "Editar atividade" : "Nova atividade"}</strong>
        <span>Um agrupamento de trabalho técnico, não uma categoria de chamado.</span>
      </div>
      <label>
        <span>Nome da atividade</span>
        <input required minLength={2} value={draft.nome} onChange={(e) => onChange({ ...draft, nome: e.target.value })} placeholder="Ex.: Administração de acessos" />
      </label>
      <div className="competency-form-grid">
        <label>
          <span>Tipo da atividade</span>
          <select value={draft.tipo} onChange={(event) => onChange({ ...draft, tipo: event.target.value as CompetencyActivityType })}>
            {activityTypes.map((type) => <option key={type.slug} value={type.slug} disabled={!type.ativa && type.slug !== draft.tipo}>{type.nome}{type.ativa ? "" : " (inativo)"}</option>)}
          </select>
          <small>{activityTypes.find((type) => type.slug === draft.tipo)?.descricao || "Agrupa atividades semelhantes."}</small>
        </label>
        <label>
          <span>Ordem de exibição</span>
          <input type="number" step="1" value={draft.ordem ?? 0} onChange={(event) => onChange({ ...draft, ordem: Number(event.target.value) })} />
          <small>Menores aparecem primeiro.</small>
        </label>
      </div>
      <ConfigurableContentField
        label="Objetivo e escopo"
        fieldType={draft.escopo_tipo_campo}
        options={draft.escopo_opcoes}
        value={draft.escopo_valor}
        placeholder="Que conjunto de responsabilidades esta atividade representa?"
        onChange={(escopo_tipo_campo, escopo_opcoes, escopo_valor) => onChange({
          ...draft,
          escopo_tipo_campo,
          escopo_opcoes,
          escopo_valor,
          descricao: contentFieldDisplay("", escopo_opcoes, escopo_valor),
        })}
      />
      <div className="competency-form-actions">
        <Botao type="submit" variant="primario" disabled={saving || !scopeOptionsValid}>{saving ? "Salvando..." : "Salvar atividade"}</Botao>
        <Botao type="button" onClick={onCancel} disabled={saving}>Cancelar</Botao>
      </div>
    </form>
  );
}

function SituationForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  saving,
  editing,
}: {
  draft: CompetencySituationInput;
  onChange: (value: CompetencySituationInput) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  editing: boolean;
}) {
  const procedureHasValue = draft.procedimento_tipo_campo === "multipla_selecao"
    ? Array.isArray(draft.procedimento_valor) && draft.procedimento_valor.length > 0
    : typeof draft.procedimento_valor === "string" && draft.procedimento_valor.trim().length > 0;
  const procedureOptionsValid = !["radio", "selecao", "multipla_selecao"].includes(draft.procedimento_tipo_campo)
    || (draft.procedimento_opcoes.length >= 2 && draft.procedimento_opcoes.every((option) => option.rotulo.trim().length > 0));
  const assessmentOptionsValid = !["radio", "selecao", "multipla_selecao"].includes(draft.tipo_campo)
    || (draft.opcoes.length >= 2 && draft.opcoes.every((option) => option.rotulo.trim().length > 0 && option.pontos <= draft.pontos_maximos));

  return (
    <form className="competency-catalog-form is-situation" onSubmit={onSubmit}>
      <div className="competency-form-heading">
        <strong>{editing ? "Editar situação" : "Nova situação prática"}</strong>
        <span>O ponto só deve ser concedido quando o técnico demonstrar este procedimento.</span>
      </div>
      <label>
        <span>Situação</span>
        <input required minLength={2} value={draft.nome} onChange={(e) => onChange({ ...draft, nome: e.target.value })} placeholder="Ex.: Usuário não consegue acessar o sistema" />
      </label>
      <label>
        <span>Contexto e sinais</span>
        <textarea value={draft.contexto} onChange={(e) => onChange({ ...draft, contexto: e.target.value })} placeholder="Como o problema se apresenta? Quais restrições importam?" />
      </label>
      <ConfigurableContentField
        label="Procedimento esperado para resolver"
        fieldType={draft.procedimento_tipo_campo}
        options={draft.procedimento_opcoes}
        value={draft.procedimento_valor}
        required
        placeholder="Liste diagnóstico, verificações, execução, validação e registro."
        onChange={(procedimento_tipo_campo, procedimento_opcoes, procedimento_valor) => onChange({
          ...draft,
          procedimento_tipo_campo,
          procedimento_opcoes,
          procedimento_valor,
          procedimento_esperado: contentFieldDisplay("", procedimento_opcoes, procedimento_valor),
        })}
      />
      <div className="competency-form-grid is-situation-settings">
        <label>
          <span>Tipo de avaliação</span>
          <select
            value={draft.tipo_campo}
            onChange={(event) => {
              const tipo_campo = event.target.value as CompetencyFieldType;
              const needsOptions = ["radio", "selecao", "multipla_selecao"].includes(tipo_campo);
              onChange({
                ...draft,
                tipo_campo,
                opcoes: needsOptions
                  ? (draft.opcoes.length >= 2 ? draft.opcoes : [newCompetencyOption(), newCompetencyOption()])
                  : [],
              });
            }}
          >
            {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <small>{FIELD_TYPES.find((type) => type.value === draft.tipo_campo)?.description}</small>
        </label>
        <label className="competency-points-field">
          <span>Pontuação máxima</span>
          <input type="number" min="0.5" max="1000" step="0.5" value={draft.pontos_maximos} onChange={(e) => onChange({ ...draft, pontos_maximos: Number(e.target.value) })} />
          <small>Limite total desta situação.</small>
        </label>
        <label>
          <span>Ordem de exibição</span>
          <input type="number" step="1" value={draft.ordem ?? 0} onChange={(event) => onChange({ ...draft, ordem: Number(event.target.value) })} />
          <small>Menores aparecem primeiro.</small>
        </label>
      </div>
      {["radio", "selecao", "multipla_selecao"].includes(draft.tipo_campo) && (
        <fieldset className="competency-options-editor">
          <legend>Opções e pontuação</legend>
          <p>Cadastre ao menos duas opções. O valor técnico é gerado automaticamente e permanece estável nas avaliações.</p>
          <div className="competency-option-editor-list">
            {draft.opcoes.map((option, index) => (
              <div className="competency-option-row" key={option.valor}>
                <label>
                  <span>Opção {index + 1}</span>
                  <input
                    required
                    maxLength={160}
                    value={option.rotulo}
                    onChange={(event) => onChange({
                      ...draft,
                      opcoes: draft.opcoes.map((item) => item.valor === option.valor ? { ...item, rotulo: event.target.value } : item),
                    })}
                    placeholder="Ex.: Executa com autonomia"
                  />
                </label>
                <label>
                  <span>Pontos</span>
                  <input
                    type="number"
                    required
                    min="0"
                    max={draft.pontos_maximos}
                    step="0.5"
                    value={option.pontos}
                    onChange={(event) => onChange({
                      ...draft,
                      opcoes: draft.opcoes.map((item) => item.valor === option.valor ? { ...item, pontos: Number(event.target.value) } : item),
                    })}
                  />
                </label>
                <Botao
                  type="button"
                  variant="destrutivo"
                  disabled={draft.opcoes.length <= 2}
                  onClick={() => onChange({ ...draft, opcoes: draft.opcoes.filter((item) => item.valor !== option.valor) })}
                >Remover</Botao>
              </div>
            ))}
          </div>
          <Botao type="button" onClick={() => onChange({ ...draft, opcoes: [...draft.opcoes, newCompetencyOption()] })}>Adicionar opção</Botao>
        </fieldset>
      )}
      {draft.tipo_campo === "sim_nao" && <p className="competency-field-hint">Sim concede {points(draft.pontos_maximos)} pontos; não concede zero.</p>}
      <div className="competency-form-actions">
        <Botao type="submit" variant="primario" disabled={saving || !procedureHasValue || !procedureOptionsValid || !assessmentOptionsValid}>{saving ? "Salvando..." : "Salvar situação"}</Botao>
        <Botao type="button" onClick={onCancel} disabled={saving}>Cancelar</Botao>
      </div>
    </form>
  );
}

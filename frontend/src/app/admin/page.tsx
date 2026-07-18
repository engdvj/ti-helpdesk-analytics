"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";

import { CategoryDifficultyPanel } from "@/components/admin/CategoryDifficultyPanel";
import { CollectionPanel } from "@/components/admin/CollectionPanel";
import { ConfigPresetsPanel } from "@/components/admin/ConfigPresetsPanel";
import { Avatar } from "@/components/ui/Avatar";
import { Botao } from "@/components/ui/Botao";
import { Tabs } from "@/components/ui/Tabs";
import { useAdmin } from "@/lib/admin-context";
import {
  adminApi,
  type RoleVisibility,
  type ScoreTargets,
  type ScoreWeights,
  type Technician,
  type TechnicianProfileUpdate,
  type Unit,
} from "@/lib/api";
import { resizeImageToDataUrl } from "@/lib/image";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { useRoleVisibility } from "@/lib/role-visibility";
import { SCORE_LABELS } from "@/lib/score";
import { useTechnicians } from "@/lib/technicians";
import { useUnits } from "@/lib/units";

type AdminTab = "coleta" | "score" | "presets" | "equipe" | "categorias";

const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: "coleta", label: "Coleta" },
  { key: "score", label: "Score" },
  { key: "presets", label: "Presets" },
  { key: "equipe", label: "Equipe" },
  { key: "categorias", label: "Categorias" },
];

export default function AdminPage() {
  const { isAdmin, lock } = useAdmin();
  const [tab, setTab] = useState<AdminTab>("coleta");

  if (!isAdmin) return <LoginForm />;

  return (
    <main className="sumula-container-hub admin-page" style={{ flex: 1 }}>
      <div className="admin-page-header">
        <h1>Admin</h1>
        <Botao variant="destrutivo" onClick={lock}>
          Sair
        </Botao>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <Tabs tabs={ADMIN_TABS} active={tab} onChange={(key) => setTab(key as AdminTab)} />
      </div>

      {tab === "coleta" && <CollectionPanel />}

      {tab === "score" && (
        <div className="admin-dashboard-stack">
          <WeightsPanel />
          <ScoreTargetsPanel />
        </div>
      )}

      {tab === "presets" && <ConfigPresetsPanel />}

      {tab === "equipe" && (
        <div className="admin-dashboard-stack">
          <RoleVisibilityPanel />
          <TechniciansPanel />
        </div>
      )}

      {tab === "categorias" && <CategoryDifficultyPanel />}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.6rem 0.75rem",
  border: "1.5px solid var(--linha)",
  background: "var(--superficie)",
  color: "var(--tinta)",
  fontSize: "var(--fonte-corpo)",
};

function LoginForm() {
  const { unlock } = useAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await unlock(username, password);
    setLoading(false);
    if (!ok) setError("Usuário ou senha incorretos.");
  }

  return (
    <main className="sumula-container-estreita" style={{ flex: 1 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-titulo)", fontWeight: 600, marginBottom: "1.25rem" }}>
        Entrar como admin
      </h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuário"
          autoFocus
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          autoComplete="current-password"
          style={inputStyle}
        />
        {error && <p style={{ color: "var(--critico)", fontSize: "var(--fonte-label)" }}>{error}</p>}
        <Botao type="submit" variant="primario" disabled={loading || !username || !password}>
          {loading ? "Verificando..." : "Entrar"}
        </Botao>
      </form>
    </main>
  );
}

const ROLE_VISIBILITY_OPTIONS: { key: keyof RoleVisibility; label: string; description: string }[] = [
  {
    key: "mostrar_plantonistas",
    label: "Plantonistas",
    description: "Permite exibir plantonistas no Ranking e em Técnicos.",
  },
  {
    key: "mostrar_taticos",
    label: "Táticos",
    description: "Permite exibir técnicos táticos no Ranking e em Técnicos.",
  },
  {
    key: "mostrar_coordenacao",
    label: "Coordenação",
    description: "Permite exibir a coordenação no Ranking e em Técnicos.",
  },
];

function RoleVisibilityPanel() {
  const { credentials } = useAdmin();
  const { data, error: loadError, mutate } = useRoleVisibility();
  const [saving, setSaving] = useState<keyof RoleVisibility | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function toggle(key: keyof RoleVisibility) {
    if (!credentials || !data) return;
    setSaving(key);
    setSaveError(null);
    try {
      const saved = await adminApi.setRoleVisibility({ ...data, [key]: !data[key] }, credentials);
      await mutate(saved, { revalidate: false });
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="sumula-cartao admin-panel">
      <div className="admin-panel-header">
        <h2>Visibilidade da equipe</h2>
        <p>Escolha quais papéis aparecem no Ranking e em Técnicos para todos os visitantes.</p>
      </div>

      {loadError && <p style={{ color: "var(--critico)" }}>Não foi possível carregar a configuração.</p>}
      {!data && !loadError && <p style={{ color: "var(--apagado)" }}>Carregando visibilidade...</p>}

      {data && (
        <div className="admin-role-list">
          {ROLE_VISIBILITY_OPTIONS.map(({ key, label, description }) => (
            <label key={key} className="admin-role-option" style={{ cursor: saving ? "wait" : "pointer" }}>
              <span>
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
              <span className="admin-role-control">
                <span style={{ color: data[key] ? "var(--acento)" : "var(--apagado)" }}>
                  {data[key] ? "Habilitado" : "Oculto"}
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={data[key]}
                  disabled={saving !== null}
                  onChange={() => toggle(key)}
                  style={{ width: 20, height: 20, accentColor: "var(--acento)", cursor: saving ? "wait" : "pointer" }}
                />
              </span>
            </label>
          ))}
        </div>
      )}

      {saveError && <p className="admin-panel-result is-error">{saveError}</p>}
    </section>
  );
}

function NumberField({
  label,
  suffix,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: number;
  step: string;
  min?: string;
  max?: string;
  onChange: (value: number) => void;
}) {
  const stepNum = Number(step) || 1;
  const minNum = min != null ? Number(min) : undefined;
  const maxNum = max != null ? Number(max) : undefined;
  const decimals = step.includes(".") ? step.split(".")[1].length : 0;

  function bump(delta: number) {
    let next = Math.round((value + delta) * 10 ** decimals) / 10 ** decimals;
    if (minNum != null) next = Math.max(minNum, next);
    if (maxNum != null) next = Math.min(maxNum, next);
    onChange(next);
  }

  return (
    <div className="admin-weight-field">
      <span className="admin-weight-field-label">
        <span className="admin-weight-field-label-main">{label}</span>
        {suffix && <small className="admin-weight-field-label-suffix">{suffix}</small>}
      </span>
      <div className="admin-weight-field-control">
        <button type="button" onClick={() => bump(-stepNum)} aria-label={`Diminuir ${label}`}>
          −
        </button>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="admin-weight-input"
        />
        <button type="button" onClick={() => bump(stepNum)} aria-label={`Aumentar ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

function WeightsPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, mutate } = useSWR("admin-weights", () => adminApi.getWeights());
  const [draft, setDraft] = useState<ScoreWeights | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weights = draft ?? data;
  if (!weights) return <p className="sumula-cartao admin-panel" style={{ color: "var(--apagado)" }}>Carregando pesos...</p>;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const somaOk = Math.abs(total - 1) <= 0.01;

  function setField(key: keyof ScoreWeights, value: number) {
    setDraft({ ...(weights as ScoreWeights), [key]: value });
  }

  async function save() {
    if (!credentials || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await adminApi.setWeights(draft, credentials);
      await mutate(saved, { revalidate: false });
      await mutateGlobal((key) => Array.isArray(key) && (key[0] === "snapshots" || key[0] === "tech-profile"));
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      const reverted = await adminApi.resetWeights(credentials);
      await mutate(reverted, { revalidate: false });
      await mutateGlobal((key) => Array.isArray(key) && (key[0] === "snapshots" || key[0] === "tech-profile"));
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sumula-cartao admin-panel admin-weights-panel">
      <div className="admin-panel-header">
        <h2>Pesos do score</h2>
        <p>Devem somar 1,00. Alterações são reaplicadas imediatamente em todo o histórico.</p>
      </div>

      <div className="admin-weights-grid">
        {SCORE_LABELS.map(({ key, label }) => (
          <NumberField
            key={key}
            label={label}
            value={weights[key]}
            step="0.01"
            min="0"
            max="1"
            onChange={(v) => setField(key, v)}
          />
        ))}
      </div>

      {error && <p className="admin-panel-result is-error">{error}</p>}

      <div className="admin-weights-footer">
        <p style={{ color: somaOk ? "var(--apagado)" : "var(--critico)" }}>
          Soma: <strong>{total.toFixed(2)}</strong> {!somaOk && "(precisa ser 1.00)"}
        </p>
        <div>
          <Botao variant="primario" onClick={save} disabled={saving || !somaOk || !draft}>
            Salvar
          </Botao>
          <Botao variant="secundario" onClick={reset} disabled={saving}>
            Restaurar
          </Botao>
        </div>
      </div>
    </section>
  );
}

const SCORE_TARGET_FIELDS: { key: keyof ScoreTargets; label: string; suffix: string; step: string }[] = [
  { key: "volume_por_dia", label: "Créditos por dia", suffix: "créditos/dia", step: "0.1" },
  { key: "abrangencia_ratio", label: "Abrangência", suffix: "categorias/chamado", step: "0.01" },
  { key: "complexidade_categoria", label: "Complexidade real", suffix: "dificuldade média das categorias", step: "0.1" },
  { key: "qualidade", label: "Qualidade da resposta", suffix: "pontos de 100", step: "1" },
  { key: "resposta_min", label: "Velocidade de resposta", suffix: "minutos ou menos", step: "1" },
];

function ScoreTargetsPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, mutate } = useSWR("admin-score-targets", () => adminApi.getScoreTargets());
  const [draft, setDraft] = useState<ScoreTargets | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = draft ?? data;
  if (!targets) return <p className="sumula-cartao admin-panel" style={{ color: "var(--apagado)" }}>Carregando metas...</p>;

  function setField(key: keyof ScoreTargets, value: number) {
    setDraft({ ...(targets as ScoreTargets), [key]: value });
  }

  async function save() {
    if (!credentials || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await adminApi.setScoreTargets(draft, credentials);
      await mutate(saved, { revalidate: false });
      await mutateGlobal((key) => Array.isArray(key) && (key[0] === "snapshots" || key[0] === "tech-profile"));
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!credentials) return;
    setSaving(true);
    setError(null);
    try {
      const reverted = await adminApi.resetScoreTargets(credentials);
      await mutate(reverted, { revalidate: false });
      await mutateGlobal((key) => Array.isArray(key) && (key[0] === "snapshots" || key[0] === "tech-profile"));
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sumula-cartao admin-panel admin-weights-panel">
      <div className="admin-panel-header">
        <h2>Metas absolutas</h2>
        <p>Atingir a meta vale 100 na métrica. Ao salvar, todo o histórico é atualizado imediatamente.</p>
      </div>

      <div className="admin-weights-grid">
        {SCORE_TARGET_FIELDS.map(({ key, label, suffix, step }) => (
          <NumberField
            key={key}
            label={label}
            suffix={suffix}
            value={targets[key]}
            step={step}
            min="0.01"
            onChange={(v) => setField(key, v)}
          />
        ))}
      </div>

      {error && <p className="admin-panel-result is-error">{error}</p>}

      <div className="admin-weights-footer">
        <p>Usadas somente no modo “Metas”.</p>
        <div>
          <Botao variant="primario" onClick={save} disabled={saving || !draft}>
            Salvar
          </Botao>
          <Botao variant="secundario" onClick={reset} disabled={saving}>
            Restaurar
          </Botao>
        </div>
      </div>
    </section>
  );
}

const ROLE_OPTIONS: { value: Technician["papel"]; label: string }[] = [
  { value: "plantonista", label: "Plantonista" },
  { value: "tatico", label: "Tático" },
  { value: "coordenadora", label: "Coordenadora" },
];

function TechniciansPanel() {
  const { data, mutate } = useTechnicians({ includeInactive: true });
  const { data: units } = useUnits();
  const [page, setPage] = useState(1);

  const sortedTechnicians = data
    ? [...data].sort(
      (a, b) => Number(b.ativo) - Number(a.ativo)
        || a.nome_completo.localeCompare(b.nome_completo, "pt-BR"),
    )
    : [];
  const totalPages = Math.max(1, Math.ceil(sortedTechnicians.length / LIST_PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageTechnicians = sortedTechnicians.slice(
    (clampedPage - 1) * LIST_PAGE_SIZE,
    clampedPage * LIST_PAGE_SIZE,
  );

  function applyUpdate(updated: Technician) {
    mutate(
      (prev) => prev?.map((t) => (t.users_id === updated.users_id ? updated : t)),
      { revalidate: false },
    );
  }

  return (
    <section className="sumula-cartao admin-panel admin-technicians-panel">
      <div className="admin-panel-header">
        <h2>Técnicos</h2>
        <p>Status, papel, unidade, foto e nome aplicam imediatamente. “Complexo inteiro” inclui o técnico em todas as unidades.</p>
      </div>

      {!data && <p style={{ color: "var(--apagado)" }}>Carregando técnicos...</p>}

      {data && (
        <>
          <div className="admin-tech-list">
            {pageTechnicians.map((tech) => (
              <TechnicianRow key={tech.users_id} tech={tech} units={units ?? []} onSaved={applyUpdate} />
            ))}
          </div>

          <div className="admin-pagination">
            <span>
              {sortedTechnicians.length} técnico{sortedTechnicians.length === 1 ? "" : "s"} · página {clampedPage} de {totalPages}
            </span>
            <div>
              <Botao
                variant="secundario"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={clampedPage <= 1}
              >
                Anterior
              </Botao>
              <Botao
                variant="secundario"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={clampedPage >= totalPages}
              >
                Próxima
              </Botao>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function TechnicianRow({ tech, units, onSaved }: { tech: Technician; units: Unit[]; onSaved: (t: Technician) => void }) {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [papel, setPapel] = useState<Technician["papel"]>(tech.papel);
  const [ativo, setAtivo] = useState(tech.ativo);
  const [unidadeSlug, setUnidadeSlug] = useState(tech.unidade_slug ?? "");
  const [nomeExibicao, setNomeExibicao] = useState(tech.nome_exibicao ?? "");
  const [fotoDraft, setFotoDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = papel !== tech.papel
    || ativo !== tech.ativo
    || unidadeSlug !== (tech.unidade_slug ?? "")
    || nomeExibicao !== (tech.nome_exibicao ?? "")
    || fotoDraft !== null;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 160);
      setFotoDraft(dataUrl);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save() {
    if (!credentials || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const updates: TechnicianProfileUpdate = {};
      if (papel !== tech.papel) updates.papel = papel;
      if (ativo !== tech.ativo) updates.ativo = ativo;
      if (unidadeSlug !== (tech.unidade_slug ?? "")) updates.unidade_slug = unidadeSlug || null;
      if (nomeExibicao !== (tech.nome_exibicao ?? "")) updates.nome_exibicao = nomeExibicao;
      if (fotoDraft !== null) updates.foto = fotoDraft;
      const saved = await adminApi.updateTechnician(tech.users_id, updates, credentials);
      onSaved(saved);
      await mutateGlobal((key) => (
        Array.isArray(key)
        && ["technicians", "snapshots", "snapshot-periods", "tech-profile"].includes(String(key[0]))
      ));
      setFotoDraft(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`admin-tech-row ${ativo ? "is-active" : "is-inactive"}`}>
      <div className="admin-tech-identity">
        <Avatar nome={nomeExibicao || tech.nome_completo} foto={fotoDraft ?? tech.foto} size={40} />
        <div className="admin-tech-row-info">
          <strong>{tech.nome_completo}</strong>
          <span>{tech.username}</span>
        </div>
      </div>

      <button
        type="button"
        className={`admin-tech-status ${ativo ? "is-active" : "is-inactive"}`}
        aria-pressed={ativo}
        onClick={() => setAtivo((current) => !current)}
      >
        <i /> {ativo ? "Ativo" : "Inativo"}
      </button>

      <select
        aria-label={`Papel de ${tech.nome_completo}`}
        value={papel}
        onChange={(e) => setPapel(e.target.value as Technician["papel"])}
        className="admin-tech-select"
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        aria-label={`Unidade de ${tech.nome_completo}`}
        value={unidadeSlug}
        onChange={(e) => setUnidadeSlug(e.target.value)}
        className="admin-tech-select"
      >
        <option value="">Complexo inteiro</option>
        {units.filter((unit) => unit.ativa).map((unit) => (
          <option key={unit.slug} value={unit.slug}>{unit.nome}</option>
        ))}
      </select>

      <input
        aria-label={`Nome de exibição de ${tech.nome_completo}`}
        type="text"
        value={nomeExibicao}
        onChange={(e) => setNomeExibicao(e.target.value)}
        placeholder={tech.nome_completo}
        className="admin-tech-input"
      />

      <label className="admin-tech-upload">
        Trocar foto
        <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      </label>

      <Botao variant="primario" onClick={save} disabled={!dirty || saving}>
        {saving ? "Salvando..." : "Salvar"}
      </Botao>

      {error && <p className="admin-panel-result is-error">{error}</p>}
    </div>
  );
}

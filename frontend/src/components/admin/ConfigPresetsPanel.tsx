"use client";

import { Download, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Botao } from "@/components/ui/Botao";
import { useAdmin } from "@/lib/admin-context";
import { adminApi, type ConfigPreset, type ConfigPresetBundle } from "@/lib/api";

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || "preset";
}

function downloadBundle(bundle: ConfigPresetBundle, filename: string) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function presetSummary(preset: ConfigPreset): string {
  const categories = Object.keys(preset.parametros.category_overrides).length;
  const visibleRoles = Object.values(preset.parametros.role_visibility).filter(Boolean).length;
  return `${categories} ${categories === 1 ? "categoria ajustada" : "categorias ajustadas"} · ${visibleRoles}/3 papéis visíveis`;
}

export function ConfigPresetsPanel() {
  const { credentials } = useAdmin();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error: loadError, mutate } = useSWR(
    credentials ? ["config-presets", credentials.username] : null,
    () => adminApi.listConfigPresets(credentials!),
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function start(action: string) {
    setBusy(action);
    setError(null);
    setNotice(null);
  }

  async function invalidateConfiguration() {
    await mutateGlobal((key) => {
      if (typeof key === "string") {
        return ["admin-weights", "admin-score-targets", "role-visibility", "category-difficulty"].includes(key);
      }
      return Array.isArray(key) && (key[0] === "snapshots" || key[0] === "tech-profile");
    });
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const cleaned = name.trim();
    if (!credentials || !cleaned) return;
    start("create");
    try {
      const created = await adminApi.createConfigPreset(cleaned, credentials);
      await mutate((current) => [created, ...(current ?? [])], { revalidate: false });
      setName("");
      setNotice(`Preset “${created.nome}” salvo.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function applyPreset(preset: ConfigPreset) {
    if (!credentials) return;
    if (!window.confirm(`Aplicar “${preset.nome}”? A configuração analítica atual será substituída.`)) return;
    start(`apply:${preset.id}`);
    try {
      await adminApi.applyConfigPreset(preset.id, credentials);
      await invalidateConfiguration();
      setNotice(`Preset “${preset.nome}” aplicado em toda a análise.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function updatePreset(preset: ConfigPreset) {
    if (!credentials) return;
    if (!window.confirm(`Atualizar “${preset.nome}” com todos os parâmetros salvos atualmente?`)) return;
    start(`update:${preset.id}`);
    try {
      const updated = await adminApi.updateConfigPreset(preset.id, credentials);
      await mutate(
        (current) => current?.map((item) => item.id === updated.id ? updated : item),
        { revalidate: false },
      );
      setNotice(`Preset “${preset.nome}” atualizado.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deletePreset(preset: ConfigPreset) {
    if (!credentials) return;
    if (!window.confirm(`Excluir o preset “${preset.nome}”?`)) return;
    start(`delete:${preset.id}`);
    try {
      await adminApi.deleteConfigPreset(preset.id, credentials);
      await mutate((current) => current?.filter((item) => item.id !== preset.id), { revalidate: false });
      setNotice(`Preset “${preset.nome}” excluído.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportOne(preset: ConfigPreset) {
    if (!credentials) return;
    start(`export:${preset.id}`);
    try {
      const bundle = await adminApi.exportConfigPreset(preset.id, credentials);
      downloadBundle(bundle, `ti-analytics-${safeFileName(preset.nome)}.json`);
      setNotice(`Preset “${preset.nome}” exportado.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportAll() {
    if (!credentials) return;
    start("export-all");
    try {
      const bundle = await adminApi.exportConfigPresets(credentials);
      downloadBundle(bundle, "ti-analytics-presets.json");
      setNotice(`${bundle.presets.length} ${bundle.presets.length === 1 ? "preset exportado" : "presets exportados"}.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!credentials || !file) return;
    if (file.size > 2_000_000) {
      setError("O arquivo excede o limite de 2 MB.");
      return;
    }
    start("import");
    try {
      const parsed = JSON.parse(await file.text()) as ConfigPresetBundle;
      const importedCount = Array.isArray(parsed?.presets) ? parsed.presets.length : 0;
      const saved = await adminApi.importConfigPresets(parsed, credentials);
      await mutate(saved, { revalidate: false });
      setNotice(`${importedCount} ${importedCount === 1 ? "preset importado" : "presets importados"}; nenhum foi aplicado automaticamente.`);
    } catch (cause) {
      setError(cause instanceof SyntaxError ? "O arquivo não contém um JSON válido." : (cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sumula-cartao admin-panel admin-presets-panel">
      <div className="admin-panel-header admin-presets-header">
        <div>
          <h2>Presets de configuração</h2>
          <p>Guarde e restaure pesos, metas, complexidade das categorias e visibilidade da equipe.</p>
        </div>
        <div className="admin-presets-file-actions">
          <label className="admin-presets-file-button">
            <Upload size={14} /> Importar JSON
            <input type="file" accept="application/json,.json" onChange={importFile} disabled={busy !== null} />
          </label>
          <button type="button" onClick={exportAll} disabled={busy !== null || !data?.length}>
            <Download size={14} /> Exportar todos
          </button>
        </div>
      </div>

      <form className="admin-presets-create" onSubmit={create}>
        <label>
          <span>Nome do novo preset</span>
          <input
            type="text"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Operação normal, Plantão crítico…"
          />
        </label>
        <Botao type="submit" variant="primario" disabled={busy !== null || !name.trim()}>
          <Save size={14} /> {busy === "create" ? "Salvando..." : "Salvar configuração atual"}
        </Botao>
      </form>

      <p className="admin-presets-explanation">
        “Salvar” captura somente valores já salvos nos outros painéis. Importar adiciona o backup à biblioteca; aplicar é sempre uma ação separada.
      </p>

      {loadError && <p className="admin-panel-result is-error">Não foi possível carregar os presets.</p>}
      {!data && !loadError && <p style={{ color: "var(--apagado)" }}>Carregando presets...</p>}

      {data && data.length === 0 && (
        <div className="admin-presets-empty">
          <Save size={22} />
          <strong>Nenhum preset salvo</strong>
          <span>Salve a configuração atual ou importe um backup JSON.</span>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="admin-presets-list">
          {data.map((preset) => (
            <article key={preset.id}>
              <div className="admin-preset-identity">
                <strong>{preset.nome}</strong>
                <span>{presetSummary(preset)}</span>
                <small>Atualizado em {DATE_FORMAT.format(new Date(preset.atualizado_em))}</small>
              </div>
              <div className="admin-preset-actions">
                <button type="button" className="is-primary" onClick={() => applyPreset(preset)} disabled={busy !== null}>
                  {busy === `apply:${preset.id}` ? "Aplicando..." : "Aplicar"}
                </button>
                <button type="button" onClick={() => updatePreset(preset)} disabled={busy !== null} title="Substituir pelo estado atual">
                  <RefreshCw size={13} /> {busy === `update:${preset.id}` ? "Atualizando..." : "Atualizar"}
                </button>
                <button type="button" onClick={() => exportOne(preset)} disabled={busy !== null}>
                  <Download size={13} /> Exportar
                </button>
                <button type="button" className="is-danger" onClick={() => deletePreset(preset)} disabled={busy !== null} aria-label={`Excluir ${preset.nome}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {notice && <p className="admin-panel-result is-success">{notice}</p>}
      {error && <p className="admin-panel-result is-error">{error}</p>}
    </section>
  );
}

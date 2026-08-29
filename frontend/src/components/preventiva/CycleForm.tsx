"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { Botao } from "@/components/ui/Botao";
import { cycles as cyclesApi, technicians as techniciansApi } from "@/lib/api";

export function CycleForm() {
  const router = useRouter();
  const { data: techs } = useSWR("technicians", () => techniciansApi.list());
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataEncerramento, setDataEncerramento] = useState("");
  const [responsavelId, setResponsavelId] = useState<number | "">("");
  const [intAlta, setIntAlta] = useState(3);
  const [intNormal, setIntNormal] = useState(6);
  const [intBaixa, setIntBaixa] = useState(12);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!nome.trim() || responsavelId === "") return;
    setSaving(true);
    setError(null);
    try {
      const cycle = await cyclesApi.create({
        nome: nome.trim(),
        data_inicio: dataInicio || null,
        data_prevista_encerramento: dataEncerramento || null,
        responsavel_id: Number(responsavelId),
        intervalo_alta_meses: intAlta,
        intervalo_normal_meses: intNormal,
        intervalo_baixa_meses: intBaixa,
      });
      router.push(`/preventiva/${cycle.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form className="preventiva-cycle-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label>
        Nome / período do ciclo
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Preventiva Setembro 2026" required />
      </label>

      <label>
        Data de início
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
      </label>
      <label>
        Data final (prevista)
        <input type="date" value={dataEncerramento} min={dataInicio || undefined} onChange={(e) => setDataEncerramento(e.target.value)} />
      </label>

      <label className="is-full">
        Responsável pelo ciclo
        <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value ? Number(e.target.value) : "")} required>
          <option value="">Selecione...</option>
          {(techs ?? []).map((t) => (
            <option key={t.users_id} value={t.users_id}>{t.nome_exibicao || t.nome_completo}</option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Intervalo até a próxima preventiva (meses)</legend>
        <p>Calcula sozinho a data da próxima preventiva de cada computador, conforme a prioridade dele.</p>
        <div className="preventiva-cycle-form-intervalos">
          <label>
            Alta
            <input type="number" inputMode="numeric" min={1} max={60} value={intAlta} onChange={(e) => setIntAlta(Number(e.target.value) || 1)} />
          </label>
          <label>
            Normal
            <input type="number" inputMode="numeric" min={1} max={60} value={intNormal} onChange={(e) => setIntNormal(Number(e.target.value) || 1)} />
          </label>
          <label>
            Baixa
            <input type="number" inputMode="numeric" min={1} max={60} value={intBaixa} onChange={(e) => setIntBaixa(Number(e.target.value) || 1)} />
          </label>
        </div>
      </fieldset>

      <Botao type="submit" variant="primario" disabled={saving || !nome.trim() || responsavelId === ""}>
        {saving ? "Criando..." : "Criar ciclo"}
      </Botao>
      {error && <p className="admin-panel-result is-error">{error}</p>}
    </form>
  );
}

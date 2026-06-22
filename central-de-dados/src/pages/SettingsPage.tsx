import { FormEvent, useEffect, useState } from "react";
import { DEFAULT_FORM_CONFIG, type FormConfig } from "../../lib/defaults";
import { getSupabase, isPreviewMode, type FormConfig } from "../lib/supabase";

export default function SettingsPage() {
  const [config, setConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isPreviewMode()) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase nao configurado.");
      setLoading(false);
      return;
    }

    supabase
      .from("form_config")
      .select("*")
      .eq("id", "default")
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(queryError.message);
          return;
        }
        if (data) {
          setConfig({
            title: data.title,
            message: data.message,
            name_label: data.name_label,
            number16_label: data.number16_label,
            number4_label: data.number4_label,
            number3_label: data.number3_label,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (isPreviewMode()) {
        setMessage("Configuracao salva no preview local.");
        return;
      }

      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase nao configurado.");

      const { error: updateError } = await supabase
        .from("form_config")
        .update({
          ...config,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      if (updateError) throw updateError;
      setMessage("Configuracao salva.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card muted">Carregando configuracoes...</div>;
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div>
        <h1>Configuracoes</h1>
        <p className="muted">Estes textos podem ser buscados pelo frontend via `/api/form-config`.</p>
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor="title">Titulo</label>
          <input id="title" value={config.title} onChange={(event) => setConfig({ ...config, title: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="message">Mensagem</label>
          <textarea id="message" rows={3} value={config.message} onChange={(event) => setConfig({ ...config, message: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="name_label">Rotulo do nome</label>
          <input
            id="name_label"
            value={config.name_label}
            onChange={(event) => setConfig({ ...config, name_label: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="number16_label">Rotulo dos 16 digitos</label>
          <input
            id="number16_label"
            value={config.number16_label}
            onChange={(event) => setConfig({ ...config, number16_label: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="number4_label">Rotulo dos 4 digitos</label>
          <input
            id="number4_label"
            value={config.number4_label}
            onChange={(event) => setConfig({ ...config, number4_label: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="number3_label">Rotulo dos 3 digitos</label>
          <input
            id="number3_label"
            value={config.number3_label}
            onChange={(event) => setConfig({ ...config, number3_label: event.target.value })}
          />
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}

import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase, isPreviewMode } from "../lib/supabase";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isPreviewMode()) {
        navigate("/recebimentos");
        return;
      }

      const supabase = getSupabase();
      if (!supabase) throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const admin = await supabase.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
      if (!admin.data) {
        await supabase.auth.signOut();
        throw new Error("Seu usuario nao possui permissao de administrador.");
      }

      navigate("/recebimentos");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card stack" onSubmit={onSubmit}>
        <div>
          <h1>Entrar</h1>
          <p className="muted">Use o email e a senha cadastrados no Supabase Auth.</p>
          {isPreviewMode() ? <p className="success">Modo preview ativo: qualquer login abre o painel demo.</p> : null}
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

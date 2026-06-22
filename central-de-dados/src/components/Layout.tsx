import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getSupabase, isPreviewMode } from "../lib/supabase";

export default function Layout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function boot() {
      if (isPreviewMode()) {
        if (active) setReady(true);
        return;
      }

      const supabase = getSupabase();
      if (!supabase) {
        if (active) {
          setError("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
          setReady(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/login", { replace: true });
        return;
      }

      const admin = await supabase.from("admin_users").select("user_id").eq("user_id", data.session.user.id).maybeSingle();
      if (!admin.data) {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      if (active) {
        setError("");
        setReady(true);
      }
    }

    boot();
    return () => {
      active = false;
    };
  }, [navigate]);

  async function logout() {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    navigate("/login");
  }

  if (error) {
    return (
      <div className="page">
        <div className="card error">{error}</div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="page">
        <div className="card muted">Carregando painel...</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>Central de dados</strong>
        <nav>
          <NavLink to="/recebimentos" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Recebimentos
          </NavLink>
          <NavLink to="/configuracoes" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Configuracoes
          </NavLink>
          <button type="button" className="linkish" onClick={logout}>
            Sair
          </button>
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}

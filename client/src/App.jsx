import { useEffect, useRef, useState } from "react";
import { Avatar } from "primereact/avatar";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Divider } from "primereact/divider";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { ProgressBar } from "primereact/progressbar";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";
import { api } from "./api";

const statuses = ["Pendiente de contacto", "En validación", "Validado", "No contactado - 3 intentos", "Disponible para recojo", "Entregado"];
const digits = (value) => String(value || "").replace(/\D/g, "");
const initials = (name = "") => name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const severityFor = (status = "") => {
  if (status === "Entregado") return "success";
  if (status.includes("No contactado")) return "danger";
  if (status.includes("Validado") || status.includes("Disponible")) return "info";
  return "warning";
};

export function App() {
  const toast = useRef(null);
  const [user, setUser] = useState(null);
  const [loginDni, setLoginDni] = useState("");
  const [loginError, setLoginError] = useState("");
  const [dni, setDni] = useState("");
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [attemptOpen, setAttemptOpen] = useState(false);
  const [attempt, setAttempt] = useState({ channel: "Llamada", result: "Sin respuesta", notes: "" });
  const notify = (severity, summary, detail) => toast.current?.show({ severity, summary, detail, life: 3800 });

  const search = async (query = dni, preserve = true) => {
    try {
      const data = await api(`/api/cases?dni=${encodeURIComponent(digits(query))}`);
      setRecords(data.records);
      setTotal(data.total);
      if (preserve && selected) setSelected(data.records.find((row) => String(row.id) === String(selected.id)) || null);
    } catch (error) { notify("error", "Búsqueda no disponible", error.message); }
  };

  useEffect(() => { api("/api/me").then(setUser).then(() => search("", false)).catch(() => {}); }, []);
  const login = async (event) => {
    event.preventDefault();
    try {
      const current = await api("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dni: digits(loginDni) }) });
      setUser(current); setLoginError(""); await search("", false);
    } catch (error) { setLoginError(error.message); }
  };
  const logout = async () => { await api("/api/logout", { method: "POST" }); setUser(null); setRecords([]); setSelected(null); setDni(""); };
  const patch = (key, value) => setSelected((current) => ({ ...current, [key]: value }));
  const save = async () => {
    try {
      await api(`/api/cases/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: selected.full_name, email: selected.email, phone: selected.phone, address: selected.address, department: selected.department, province: selected.province, district: selected.district, store: selected.store, storeAddress: selected.store_address, deliveryStatus: selected.delivery_status, contactVerified: selected.contact_verified }) });
      notify("success", "Gestión guardada", "Los datos del ganador fueron actualizados."); await search(dni);
    } catch (error) { notify("error", "No se pudo guardar", error.message); }
  };
  const saveAttempt = async () => {
    try {
      await api(`/api/cases/${selected.id}/attempts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt) });
      setAttemptOpen(false); setAttempt({ channel: "Llamada", result: "Sin respuesta", notes: "" });
      notify("success", "Intento registrado", "El historial del caso fue actualizado."); await search(dni);
    } catch (error) { notify("error", "No se pudo registrar", error.message); }
  };

  if (!user) return <Login dni={loginDni} setDni={setLoginDni} onSubmit={login} error={loginError} />;
  return <div className="app-shell">
    <Toast ref={toast} />
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup"><span className="brand-eyebrow">RIMAC × EFECTIBANK</span><span className="brand-title">Gestión de ganadores</span></div>
        <div className="header-actions">
          <div className="user-chip"><Avatar label={user.role === "supervisor" ? "S" : "G"} shape="circle" /><span>{user.role === "supervisor" ? "Supervisor" : "Gestor"}</span></div>
          {user.role === "supervisor" && <Button label="Exportar PRIX" icon="pi pi-file-excel" className="export-button" outlined onClick={() => { window.location.href = "/api/export"; }} />}
          <Button aria-label="Salir" icon="pi pi-sign-out" className="logout-button" text onClick={logout} />
        </div>
      </div>
    </header>
    <main className="workspace">
      <section className="page-intro">
        <div><p className="eyebrow">CENTRO DE GESTIÓN</p><h1>Gestiona el recojo de cada premio</h1><p>Consulta al ganador por DNI, valida sus datos y registra cada contacto en un solo lugar.</p></div>
        <div className="base-counter"><i className="pi pi-users" /><div><strong>{total}</strong><span>ganadores en la base</span></div></div>
      </section>
      <Card className="search-card">
        <form className="search-form" onSubmit={(event) => { event.preventDefault(); search(); }}>
          <div className="search-icon"><i className="pi pi-search" /></div>
          <span className="search-input"><label htmlFor="winner-dni">Buscar ganador</label><InputText id="winner-dni" value={dni} placeholder="Ingresa el DNI del ganador" onChange={(event) => setDni(digits(event.target.value))} keyfilter="int" maxLength={8} autoFocus /></span>
          <Button type="submit" label="Buscar" icon="pi pi-arrow-right" iconPos="right" />
        </form>
        <p className="search-hint"><i className="pi pi-info-circle" /> Ingresa los 8 dígitos del DNI para ver el caso.</p>
      </Card>
      <div className="content-grid">
        <aside className="results-card">
          <div className="section-heading"><div><p className="eyebrow">RESULTADOS</p><h2>{dni ? "Coincidencias" : "Búsqueda de casos"}</h2></div>{dni && <span className="result-count">{records.length}</span>}</div>
          <Results records={records} selected={selected} onSelect={setSelected} searched={Boolean(dni)} />
        </aside>
        <section className="case-card"><CaseForm winner={selected} patch={patch} save={save} openAttempt={() => setAttemptOpen(true)} /></section>
      </div>
    </main>
    <Dialog header="Registrar intento de contacto" visible={attemptOpen} className="attempt-dialog" onHide={() => setAttemptOpen(false)} footer={<div className="dialog-footer"><Button label="Cancelar" text onClick={() => setAttemptOpen(false)} /><Button label="Guardar intento" icon="pi pi-check" onClick={saveAttempt} /></div>}>
      <p className="dialog-description">Registra el medio utilizado y el resultado del contacto con el ganador.</p>
      <div className="dialog-fields"><Field label="Canal"><Dropdown value={attempt.channel} options={["Llamada", "Correo", "SMS"]} onChange={(event) => setAttempt({ ...attempt, channel: event.value })} /></Field><Field label="Resultado"><InputText value={attempt.result} onChange={(event) => setAttempt({ ...attempt, result: event.target.value })} /></Field><Field label="Observación"><InputTextarea value={attempt.notes} rows={3} autoResize onChange={(event) => setAttempt({ ...attempt, notes: event.target.value })} /></Field></div>
    </Dialog>
  </div>;
}

function Login({ dni, setDni, onSubmit, error }) { return <div className="login-page"><Card className="login-card"><div className="login-mark"><i className="pi pi-shield" /></div><p className="eyebrow">RIMAC × EFECTIBANK</p><h1>Gestión de ganadores</h1><p className="login-copy">Ingresa tu DNI para acceder a la gestión de casos.</p><form onSubmit={onSubmit}><Field label="DNI del colaborador"><InputText value={dni} placeholder="Ingresa tu DNI" onChange={(event) => setDni(digits(event.target.value))} keyfilter="int" maxLength={9} autoFocus /></Field>{error && <Message severity="error" text={error} />}<Button label="Ingresar al sistema" icon="pi pi-arrow-right" iconPos="right" type="submit" /></form><p className="login-footnote">Tu perfil se asigna automáticamente según el DNI ingresado.</p></Card></div>; }
function Results({ records, selected, onSelect, searched }) {
  if (!searched) return <Empty icon="pi pi-id-card" title="Busca un caso por DNI" description="Los datos del ganador aparecerán aquí cuando realices una búsqueda." />;
  if (!records.length) return <Empty icon="pi pi-search" title="No encontramos coincidencias" description="Verifica los 8 dígitos del DNI e inténtalo nuevamente." />;
  return <div className="result-list">{records.map((record) => <button type="button" key={record.id} className={`result-item ${String(selected?.id) === String(record.id) ? "selected" : ""}`} onClick={() => onSelect(record)}><Avatar label={initials(record.full_name)} shape="circle" /><span className="result-details"><strong>{record.full_name}</strong><small>DNI {record.dni}</small><Tag value={record.delivery_status} severity={severityFor(record.delivery_status)} /></span><i className="pi pi-chevron-right" /></button>)}</div>;
}
function Empty({ icon, title, description }) { return <div className="empty-state"><div className="empty-icon"><i className={icon} /></div><h3>{title}</h3><p>{description}</p></div>; }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function CaseForm({ winner, patch, save, openAttempt }) {
  if (!winner) return <Empty icon="pi pi-arrow-left" title="Selecciona un ganador" description="Elige un resultado para consultar y actualizar la información del caso." />;
  const attemptCount = winner.attempts.length;
  return <div className="case-form">
    <div className="case-hero"><div className="winner-identity"><Avatar label={initials(winner.full_name)} size="xlarge" shape="circle" /><div><p className="eyebrow">CASO SELECCIONADO</p><h2>{winner.full_name}</h2><span>DNI {winner.dni}</span></div></div><Tag value={winner.delivery_status} severity={severityFor(winner.delivery_status)} /></div>
    <div className="attempt-summary"><div><strong>Intentos de contacto</strong><span>{attemptCount} de 3 registrados</span></div><ProgressBar value={(attemptCount / 3) * 100} showValue={false} /><span className={attemptCount >= 3 ? "limit reached" : "limit"}>{attemptCount >= 3 ? "Límite de intentos alcanzado" : `${3 - attemptCount} intento${3 - attemptCount === 1 ? "" : "s"} disponible${3 - attemptCount === 1 ? "" : "s"}`}</span></div>
    <section className="form-section"><div className="form-section-title"><i className="pi pi-user" /><div><h3>Datos de contacto</h3><p>Confirma los datos proporcionados por el ganador.</p></div></div><div className="form-grid"><Field label="Nombre completo"><InputText value={winner.full_name || ""} onChange={(event) => patch("full_name", event.target.value)} /></Field><Field label="Correo"><InputText value={winner.email || ""} onChange={(event) => patch("email", event.target.value)} /></Field><Field label="Teléfono móvil"><InputText value={winner.phone || ""} keyfilter="int" onChange={(event) => patch("phone", digits(event.target.value))} /></Field><Field label="Dirección"><InputText value={winner.address || ""} onChange={(event) => patch("address", event.target.value)} /></Field></div></section>
    <section className="form-section"><div className="form-section-title"><i className="pi pi-map-marker" /><div><h3>Punto de recojo</h3><p>Registra la ubicación acordada para la entrega.</p></div></div><div className="form-grid"><Field label="Departamento"><InputText value={winner.department || ""} onChange={(event) => patch("department", event.target.value)} /></Field><Field label="Provincia"><InputText value={winner.province || ""} onChange={(event) => patch("province", event.target.value)} /></Field><Field label="Distrito"><InputText value={winner.district || ""} onChange={(event) => patch("district", event.target.value)} /></Field><Field label="Tienda EFE o La Curacao"><InputText value={winner.store || ""} onChange={(event) => patch("store", event.target.value)} /></Field><Field label="Dirección de tienda"><InputText value={winner.store_address || ""} onChange={(event) => patch("store_address", event.target.value)} /></Field><Field label="Estado del caso"><Dropdown value={winner.delivery_status} options={statuses} onChange={(event) => patch("delivery_status", event.value)} /></Field></div></section>
    <div className="case-controls"><div className="verification"><Checkbox inputId="verified" checked={Boolean(winner.contact_verified)} onChange={(event) => patch("contact_verified", event.checked)} /><label htmlFor="verified">Datos confirmados con el ganador</label></div><div className="form-actions"><Button label="Registrar intento" icon="pi pi-phone" outlined disabled={attemptCount >= 3} onClick={openAttempt} /><Button label="Guardar cambios" icon="pi pi-save" onClick={save} /></div></div>
    <Divider />
    <section className="history-section"><div className="history-heading"><div><p className="eyebrow">SEGUIMIENTO</p><h3>Historial de contactos</h3></div><span>{attemptCount} registro{attemptCount === 1 ? "" : "s"}</span></div>{attemptCount ? <ul className="history">{winner.attempts.map((item) => <li key={item.id}><div className="history-icon"><i className={item.channel === "Correo" ? "pi pi-envelope" : item.channel === "SMS" ? "pi pi-comments" : "pi pi-phone"} /></div><div><strong>{item.channel} · {item.result}</strong><span>{new Date(item.attempt_at).toLocaleString("es-PE")}</span>{item.notes && <small>{item.notes}</small>}</div></li>)}</ul> : <p className="history-empty">Todavía no se han registrado intentos de contacto.</p>}</section>
  </div>;
}

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
const severityFor = (status = "") => status === "Entregado" ? "success" : status.includes("No contactado") ? "danger" : status.includes("Validado") || status.includes("Disponible") ? "info" : "warning";
const formatLima = (value) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const requiredFields = ["full_name", "email", "phone", "address", "department", "province", "district", "store", "store_address"];

function validateWinner(winner) {
  const errors = {};
  requiredFields.forEach((key) => { if (!String(winner[key] || "").trim()) errors[key] = "Este campo es obligatorio."; });
  if (winner.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(winner.email.trim())) errors.email = "Ingresa un correo válido.";
  if (winner.phone && !/^9\d{8}$/.test(digits(winner.phone))) errors.phone = "Ingresa un celular peruano de 9 dígitos que inicie en 9.";
  return errors;
}

export function App() {
  const toast = useRef(null);
  const [user, setUser] = useState(null);
  const [loginDni, setLoginDni] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [dni, setDni] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [attemptOpen, setAttemptOpen] = useState(false);
  const [attempt, setAttempt] = useState({ channel: "Llamada", result: "No contacto", notes: "" });
  const [attemptErrors, setAttemptErrors] = useState({});
  const [savingAttempt, setSavingAttempt] = useState(false);
  const notify = (severity, summary, detail) => toast.current?.show({ severity, summary, detail, life: 3800 });

  const search = async (query = dni, preserve = true, allowEmpty = false) => {
    const cleanDni = digits(query);
    if (!allowEmpty && cleanDni.length !== 8) {
      setSearchError("Ingresa los 8 dígitos del DNI del ganador."); setRecords([]); setSelected(null); return;
    }
    setSearching(true); setSearchError("");
    try {
      const data = await api(`/api/cases?dni=${encodeURIComponent(cleanDni)}`);
      setRecords(data.records); setTotal(data.total);
      if (preserve && selected) setSelected(data.records.find((row) => String(row.id) === String(selected.id)) || null);
    } catch (error) { notify("error", "Búsqueda no disponible", error.message); } finally { setSearching(false); }
  };
  useEffect(() => { api("/api/me").then(setUser).then(() => search("", false, true)).catch(() => {}); }, []);
  const login = async (event) => {
    event.preventDefault(); const cleanDni = digits(loginDni);
    if (cleanDni.length < 8 || cleanDni.length > 9) { setLoginError("Ingresa un DNI válido de 8 o 9 dígitos."); document.getElementById("login-dni")?.focus(); return; }
    setLoggingIn(true); setLoginError("");
    try { const current = await api("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dni: cleanDni }) }); setUser(current); await search("", false, true); } catch (error) { setLoginError(error.message); document.getElementById("login-dni")?.focus(); } finally { setLoggingIn(false); }
  };
  const logout = async () => { await api("/api/logout", { method: "POST" }); setUser(null); setRecords([]); setSelected(null); setDni(""); };
  const patch = (key, value) => { setSelected((current) => ({ ...current, [key]: value })); setFormErrors((current) => ({ ...current, [key]: undefined })); };
  const select = (record) => { setSelected(record); setFormErrors({}); };
  const save = async () => {
    const errors = validateWinner(selected); setFormErrors(errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) { notify("warn", "Revisa los datos", "Completa los campos marcados antes de guardar."); document.getElementById(`field-${firstInvalid}`)?.focus(); return; }
    setSaving(true);
    try {
      await api(`/api/cases/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: selected.full_name, email: selected.email.trim(), phone: selected.phone, address: selected.address, department: selected.department, province: selected.province, district: selected.district, store: selected.store, storeAddress: selected.store_address, observation: selected.observation, deliveryStatus: selected.delivery_status, contactVerified: selected.contact_verified }) });
      notify("success", "Gestión guardada", "Los datos del ganador fueron actualizados."); await search(dni);
    } catch (error) { notify("error", "No se pudo guardar", error.message); } finally { setSaving(false); }
  };
  const openAttempt = () => { setAttemptErrors({}); setAttemptOpen(true); };
  const saveAttempt = async () => {
    const errors = {}; if (!attempt.result.trim()) errors.result = "Indica el resultado del contacto."; if (attempt.notes.length > 500) errors.notes = "La observación no puede superar 500 caracteres.";
    setAttemptErrors(errors); const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) { document.getElementById(`attempt-${firstInvalid}`)?.focus(); return; }
    setSavingAttempt(true);
    try { await api(`/api/cases/${selected.id}/attempts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt) }); setAttemptOpen(false); setAttempt({ channel: "Llamada", result: "No contacto", notes: "" }); notify("success", "Intento registrado", "El historial del caso fue actualizado."); await search(dni); } catch (error) { notify("error", "No se pudo registrar", error.message); } finally { setSavingAttempt(false); }
  };

  if (!user) return <Login dni={loginDni} setDni={setLoginDni} onSubmit={login} error={loginError} loading={loggingIn} />;
  return <div className="app-shell"><Toast ref={toast} />
    <header className="app-header"><div className="header-inner"><div className="brand-lockup"><span className="brand-eyebrow">COBRANZAS PERÚ</span><span className="brand-title">Gestión de ganadores</span></div><div className="header-actions"><div className="user-chip"><i className="pi pi-user" /><span>USUARIO LOGUEADO: {user.dni}</span></div>{user.role === "supervisor" && <><Button label="Exportar PRIX" icon="pi pi-file-excel" className="export-button" outlined onClick={() => { window.location.href = "/api/export"; }} /><Button label="Exportar intentos" icon="pi pi-download" className="export-button" outlined onClick={() => { window.location.href = "/api/export/attempts"; }} /></>}<Button aria-label="Cerrar sesión" tooltip="Cerrar sesión" tooltipOptions={{ position: "bottom" }} icon="pi pi-sign-out" className="logout-button" text onClick={logout} /></div></div></header>
    <main className="workspace"><section className="page-intro"><div><p className="eyebrow">CENTRO DE GESTIÓN</p><h1>Gestiona el recojo de cada premio</h1><p>Consulta al ganador por DNI, valida sus datos y registra cada contacto en un solo lugar.</p></div><div className="base-counter"><i className="pi pi-users" /><div><strong>{total}</strong><span>ganadores en la base</span></div></div></section>
      <Card className="search-card"><form className="search-form" noValidate onSubmit={(event) => { event.preventDefault(); search(); }} aria-busy={searching}><div className="search-icon"><i className="pi pi-search" /></div><span className="search-input"><label htmlFor="winner-dni">Buscar ganador por DNI</label><InputText id="winner-dni" value={dni} placeholder="Ingresa los 8 dígitos" className={searchError ? "p-invalid" : ""} onChange={(event) => { setDni(digits(event.target.value)); setSearchError(""); }} keyfilter="int" maxLength={8} autoFocus aria-describedby="search-help search-error" /></span><Button type="submit" label="Buscar" icon="pi pi-arrow-right" iconPos="right" loading={searching} disabled={searching || dni.length !== 8} /></form><p id="search-help" className="search-hint"><i className="pi pi-info-circle" /> Ingresa los 8 dígitos del DNI para ver el caso.</p>{searchError && <small id="search-error" className="field-error"><i className="pi pi-exclamation-circle" /> {searchError}</small>}</Card>
      <div className="content-grid"><aside className="results-card" aria-busy={searching}><div className="section-heading"><div><p className="eyebrow">RESULTADOS</p><h2>{dni ? "Coincidencias" : "Búsqueda de casos"}</h2></div>{dni.length === 8 && <span className="result-count">{records.length}</span>}</div><Results records={records} selected={selected} onSelect={select} searched={dni.length === 8} loading={searching} /></aside><section className="case-card"><CaseForm winner={selected} patch={patch} errors={formErrors} save={save} saving={saving} openAttempt={openAttempt} /></section></div>
    </main>
    <Dialog header="Registrar intento de contacto" visible={attemptOpen} className="attempt-dialog" closable={!savingAttempt} dismissableMask={!savingAttempt} onHide={() => !savingAttempt && setAttemptOpen(false)} footer={<div className="dialog-footer"><Button label="Cancelar" text disabled={savingAttempt} onClick={() => setAttemptOpen(false)} /><Button label="Guardar intento" icon="pi pi-check" loading={savingAttempt} disabled={savingAttempt} onClick={saveAttempt} /></div>}><p className="dialog-description">Registra el medio utilizado y el resultado del contacto con el ganador.</p><div className="dialog-fields"><Field label="Canal"><Dropdown value={attempt.channel} options={["Llamada", "Correo", "SMS"]} disabled={savingAttempt} onChange={(event) => setAttempt({ ...attempt, channel: event.value })} /></Field><Field label="Resultado" required error={attemptErrors.result}><Dropdown inputId="attempt-result" value={attempt.result} options={["Contacto con titular", "Contacto con tercero", "No contacto"]} className={attemptErrors.result ? "p-invalid" : ""} disabled={savingAttempt} onChange={(event) => { setAttempt({ ...attempt, result: event.value }); setAttemptErrors((current) => ({ ...current, result: undefined })); }} /></Field><Field label="Observación" error={attemptErrors.notes}><InputTextarea id="attempt-notes" value={attempt.notes} rows={3} maxLength={500} autoResize className={attemptErrors.notes ? "p-invalid" : ""} disabled={savingAttempt} onChange={(event) => { setAttempt({ ...attempt, notes: event.target.value }); setAttemptErrors((current) => ({ ...current, notes: undefined })); }} /><small className="character-count">{attempt.notes.length}/500</small></Field></div></Dialog>
  </div>;
}

function Login({ dni, setDni, onSubmit, error, loading }) { return <div className="login-page"><Card className="login-card"><div className="login-mark"><i className="pi pi-shield" /></div><p className="eyebrow">COBRANZAS PERÚ</p><h1>Gestión de ganadores</h1><p className="login-copy">Ingresa tu DNI para acceder a la gestión de casos.</p><form noValidate onSubmit={onSubmit}><Field label="DNI del colaborador" required error={error}><InputText id="login-dni" value={dni} placeholder="Ingresa tu DNI" className={error ? "p-invalid" : ""} disabled={loading} onChange={(event) => { setDni(digits(event.target.value)); }} keyfilter="int" maxLength={9} autoFocus /></Field><Button label="Ingresar al sistema" icon="pi pi-arrow-right" iconPos="right" type="submit" loading={loading} disabled={loading || dni.length < 8} /></form><p className="login-footnote">Tu perfil se asigna automáticamente según el DNI ingresado.</p></Card></div>; }
function Results({ records, selected, onSelect, searched, loading }) { if (loading) return <div className="results-loading"><i className="pi pi-spin pi-spinner" /><span>Buscando información…</span></div>; if (!searched) return <Empty icon="pi pi-id-card" title="Busca un caso por DNI" description="Los datos del ganador aparecerán aquí cuando realices una búsqueda." />; if (!records.length) return <Empty icon="pi pi-search" title="No encontramos coincidencias" description="Verifica los 8 dígitos del DNI e inténtalo nuevamente." />; return <div className="result-list">{records.map((record) => <button type="button" key={record.id} className={`result-item ${String(selected?.id) === String(record.id) ? "selected" : ""}`} onClick={() => onSelect(record)}><Avatar label={initials(record.full_name)} shape="circle" /><span className="result-details"><strong>{record.full_name}</strong><small>DNI {record.dni}</small><Tag value={record.delivery_status} severity={severityFor(record.delivery_status)} /></span><i className="pi pi-chevron-right" /></button>)}</div>; }
function Empty({ icon, title, description }) { return <div className="empty-state"><div className="empty-icon"><i className={icon} /></div><h3>{title}</h3><p>{description}</p></div>; }
function Field({ label, children, error, required = false }) { return <label className="field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{error && <small className="field-error"><i className="pi pi-exclamation-circle" /> {error}</small>}</label>; }
function CaseForm({ winner, patch, errors, save, saving, openAttempt }) {
  if (!winner) return <Empty icon="pi pi-arrow-left" title="Selecciona un ganador" description="Elige un resultado para consultar y actualizar la información del caso." />;
  const attemptCount = winner.attempts.length;
  const textField = (key, label, props = {}) => <Field label={label} required error={errors[key]}><InputText id={`field-${key}`} value={winner[key] || ""} className={errors[key] ? "p-invalid" : ""} disabled={saving} {...props} onChange={(event) => patch(key, props.digitsOnly ? digits(event.target.value) : event.target.value)} /></Field>;
  return <div className="case-form"><div className="case-hero"><div className="winner-identity"><Avatar label={initials(winner.full_name)} size="xlarge" shape="circle" /><div><p className="eyebrow">CASO SELECCIONADO</p><h2>{winner.full_name}</h2><span>DNI {winner.dni}</span></div></div><Tag value={winner.delivery_status} severity={severityFor(winner.delivery_status)} /></div><div className="attempt-summary"><div><strong>Intentos de contacto</strong><span>{attemptCount} de 3 registrados</span></div><ProgressBar value={(attemptCount / 3) * 100} showValue={false} /><span className={attemptCount >= 3 ? "reached" : "limit"}>{attemptCount >= 3 ? "Límite de intentos alcanzado" : `${3 - attemptCount} intento${3 - attemptCount === 1 ? "" : "s"} disponible${3 - attemptCount === 1 ? "" : "s"}`}</span></div>
    <section className="form-section"><div className="form-section-title"><i className="pi pi-user" /><div><h3>Datos de contacto</h3><p>Los campos con * son obligatorios para guardar.</p></div></div><div className="form-grid"><Field label="DNI"><InputText value={winner.dni || ""} disabled /></Field>{textField("full_name", "Nombre completo")}{textField("email", "Correo", { type: "email" })}{textField("phone", "Teléfono móvil", { keyfilter: "int", maxLength: 9, inputMode: "numeric", digitsOnly: true })}<Field label="Observación"><InputTextarea id="field-observation" value={winner.observation || ""} rows={2} maxLength={500} autoResize disabled={saving} onChange={(event) => patch("observation", event.target.value)} /><small className="character-count">{(winner.observation || "").length}/500</small></Field></div><div className="verification"><Checkbox inputId="verified" checked={Boolean(winner.contact_verified)} disabled={saving} onChange={(event) => patch("contact_verified", event.checked)} /><label htmlFor="verified">Datos confirmados con el ganador</label></div></section>
    <section className="form-section"><div className="form-section-title"><i className="pi pi-map-marker" /><div><h3>Punto de recojo</h3><p>Registra la ubicación acordada para la entrega.</p></div></div><div className="form-grid">{textField("address", "Dirección")}{textField("department", "Departamento")}{textField("province", "Provincia")}{textField("district", "Distrito")}{textField("store", "Tienda EFE o La Curacao")}{textField("store_address", "Dirección de tienda")}<Field label="Estado del caso"><Dropdown value={winner.delivery_status} options={statuses} disabled={saving} onChange={(event) => patch("delivery_status", event.value)} /></Field></div></section>
    <div className="case-controls"><div className="form-actions"><Button label="Registrar intento" icon="pi pi-phone" outlined disabled={saving || attemptCount >= 3} onClick={openAttempt} /><Button label="Guardar cambios" icon="pi pi-save" loading={saving} disabled={saving} onClick={save} /></div></div><Divider />
    <section className="history-section"><div className="history-heading"><div><p className="eyebrow">SEGUIMIENTO</p><h3>Historial de contactos</h3></div><span>{attemptCount} registro{attemptCount === 1 ? "" : "s"}</span></div>{attemptCount ? <ul className="history">{winner.attempts.map((item) => <li key={item.id}><div className="history-icon"><i className={item.channel === "Correo" ? "pi pi-envelope" : item.channel === "SMS" ? "pi pi-comments" : "pi pi-phone"} /></div><div><strong>{item.channel} · {item.result}</strong><span>{formatLima(item.attempt_at)}</span>{item.notes && <small>{item.notes}</small>}</div></li>)}</ul> : <p className="history-empty">Todavía no se han registrado intentos de contacto.</p>}</section>
  </div>;
}

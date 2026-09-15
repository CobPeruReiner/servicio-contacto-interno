import express from "express";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET es obligatorio");
const supervisors = new Set(
  JSON.parse(await readFile("./data/supervisors.json", "utf8")),
);
const winners = JSON.parse(
  Buffer.from(
    (await readFile("./data/winners.b64", "utf8")).trim(),
    "base64",
  ).toString("utf8"),
);
app.use(express.json({ limit: "300kb" }));

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim().split(/=(.*)/s))
      .filter((v) => v[0]),
  );
}
function auth(req, res, next) {
  try {
    req.user = jwt.verify(cookies(req).contacto, secret);
    next();
  } catch {
    res.status(401).json({ error: "Sesión requerida" });
  }
}
function supervisor(req, res, next) {
  if (req.user.role !== "supervisor")
    return res.status(403).json({ error: "Acceso exclusivo para supervisión" });
  next();
}
function clean(value, max = 300) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}
async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS winners (
    id BIGSERIAL PRIMARY KEY, dni VARCHAR(12) UNIQUE NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL, phone VARCHAR(30) NOT NULL,
    province TEXT, district TEXT, store TEXT, store_address TEXT, delivery_status TEXT NOT NULL DEFAULT 'Pendiente de contacto',
    contact_verified BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by VARCHAR(12) NOT NULL DEFAULT 'sistema');
    CREATE INDEX IF NOT EXISTS idx_winners_dni ON winners(dni);
    CREATE TABLE IF NOT EXISTS contact_attempts (
      id BIGSERIAL PRIMARY KEY, winner_id BIGINT NOT NULL REFERENCES winners(id), attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      channel VARCHAR(20) NOT NULL, result TEXT NOT NULL, notes TEXT, created_by VARCHAR(12) NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_attempts_winner ON contact_attempts(winner_id, attempt_at);`);
  for (const row of winners)
    await pool.query(
      `INSERT INTO winners(dni,full_name,email,phone,updated_by) VALUES($1,$2,$3,$4,'sistema') ON CONFLICT(dni) DO NOTHING`,
      [row.dni, row.fullName, row.email, row.phone],
    );
}
async function cases(dni = "") {
  if (!dni) return [];
  const params = [`${dni}%`];
  const where = "WHERE w.dni LIKE $1";
  const result = await pool.query(
    `SELECT w.*, COALESCE(a.total,0)::int AS attempts FROM winners w LEFT JOIN (SELECT winner_id,COUNT(*) total FROM contact_attempts GROUP BY winner_id) a ON a.winner_id=w.id ${where} ORDER BY w.full_name LIMIT 30`,
    params,
  );
  const records = await Promise.all(
    result.rows.map(async (r) => ({
      ...r,
      attempts: (
        await pool.query(
          "SELECT id,attempt_at,channel,result,notes FROM contact_attempts WHERE winner_id=$1 ORDER BY attempt_at",
          [r.id],
        )
      ).rows,
    })),
  );
  return records;
}
app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/api/login", (req, res) => {
  const dni = digits(req.body.dni);
  if (!/^\d{8,9}$/.test(dni))
    return res.status(400).json({ error: "Ingrese un DNI válido" });
  const role = supervisors.has(dni) ? "supervisor" : "gestor";
  const token = jwt.sign({ dni, role }, secret, { expiresIn: "8h" });
  res.cookie("contacto", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ dni, role });
});
app.post("/api/logout", (_req, res) => {
  res.clearCookie("contacto");
  res.status(204).end();
});
app.get("/api/me", auth, (req, res) => res.json(req.user));
app.get("/api/cases", auth, async (req, res, next) => {
  try {
    const dni = digits(req.query.dni);
    const total = await pool.query(
      "SELECT COUNT(*)::int AS total FROM winners",
    );
    res.json({ total: total.rows[0].total, records: await cases(dni) });
  } catch (e) {
    next(e);
  }
});
app.put("/api/cases/:id", auth, async (req, res, next) => {
  try {
    const b = req.body;
    const status = clean(b.deliveryStatus, 80) || "Pendiente de contacto";
    if (!clean(b.fullName) || !clean(b.email) || !digits(b.phone))
      return res
        .status(400)
        .json({ error: "Nombre, correo y teléfono son obligatorios" });
    await pool.query(
      `UPDATE winners SET full_name=$1,email=$2,phone=$3,province=$4,district=$5,store=$6,store_address=$7,delivery_status=$8,contact_verified=$9,updated_at=NOW(),updated_by=$10 WHERE id=$11`,
      [
        clean(b.fullName),
        clean(b.email),
        digits(b.phone),
        clean(b.province),
        clean(b.district),
        clean(b.store),
        clean(b.storeAddress),
        status,
        Boolean(b.contactVerified),
        req.user.dni,
        Number(req.params.id),
      ],
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/cases/:id/attempts", auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM winners WHERE id=$1 FOR UPDATE", [
      Number(req.params.id),
    ]);
    const count = await client.query(
      "SELECT COUNT(*)::int AS total FROM contact_attempts WHERE winner_id=$1",
      [Number(req.params.id)],
    );
    if (count.rows[0].total >= 3) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El caso ya tiene 3 intentos" });
    }
    const channel = clean(req.body.channel, 20),
      result = clean(req.body.result, 200);
    if (!channel || !result) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Canal y resultado son obligatorios" });
    }
    await client.query(
      "INSERT INTO contact_attempts(winner_id,channel,result,notes,created_by) VALUES($1,$2,$3,$4,$5)",
      [
        Number(req.params.id),
        channel,
        result,
        clean(req.body.notes, 500),
        req.user.dni,
      ],
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    next(e);
  } finally {
    client.release();
  }
});
const prixHeaders = [
  "SOLICITANTE",
  "PEDIDO CLIENTE",
  "TRATAMIENTO",
  "EMPRESA",
  "",
  "DIRECCIÓN",
  "País",
  "Departamento",
  "Provincia",
  "Distrito",
  "CÓDIGO POSTAL",
  "VIA PAGO",
  "CONDICION DE PAGO",
  "TELEFONO",
  "TELEFONO MOVIL",
  "CORREO",
  "TIPO DE ENVIO",
  "SKU",
  "CANTIDAD",
  "Centro",
  "Centro de Entrega",
  "Código",
  "TEXTO Cabecera",
  "Centro se halla Costo",
  "Nombres",
  "DNI",
  "Rango Horario",
  "Fecha Entrega",
  "Comentario",
  "Dirección de la tienda La Curacao o Efe más cercana",
];
app.get("/api/export", auth, supervisor, async (_req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("DD");
    sheet.addRow(prixHeaders);
    (await pool.query("SELECT * FROM winners ORDER BY full_name")).rows.forEach(
      (w) =>
        sheet.addRow([
          "",
          "",
          "",
          "",
          "",
          "",
          "Perú",
          "",
          w.province,
          w.district,
          "",
          "",
          "",
          w.phone,
          w.phone,
          w.email,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          w.full_name,
          w.dni,
          "",
          "",
          w.delivery_status,
          w.store_address || w.store,
        ]),
    );
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c) => (c.width = 20));
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Plantilla_de_carga_PRIX_DD.xlsx",
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});
app.use(express.static("public"));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "No fue posible completar la operación" });
});
await init();
app.listen(4008, "0.0.0.0", () => console.log("Servicio listo en puerto 4008"));

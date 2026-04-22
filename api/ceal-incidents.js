import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data", "ceal");
const localStoreFile = path.join(dataDir, "incidents.local.json");
const uploadsDir = path.join(dataDir, "uploads");
const maxFileSizeBytes = 10 * 1024 * 1024;
const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx"];
const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getStorageMode() {
  if (process.env.CEAL_REPORT_WEBHOOK_URL) {
    return "webhook";
  }

  if (process.env.VERCEL === "1") {
    return "unconfigured";
  }

  return "filesystem";
}

function validateString(value, maxLength) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, maxLength);
}

function validateFile(file) {
  if (!file || file.size === 0) {
    return { ok: true };
  }

  if (file.size > maxFileSizeBytes) {
    return { ok: false, message: "El archivo supera el máximo de 10 MB." };
  }

  const extension = path.extname(file.name || "").toLowerCase();
  const hasAllowedExtension = allowedExtensions.includes(extension);
  const hasAllowedType = allowedMimeTypes.has(file.type);

  if (!hasAllowedExtension && !hasAllowedType) {
    return { ok: false, message: "Formato no permitido. Usa imagen, PDF o Word." };
  }

  return { ok: true };
}

async function readLocalStore() {
  try {
    const raw = await readFile(localStoreFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function persistLocally(record, file) {
  await mkdir(dataDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });

  let storedFile = null;

  if (file && file.size) {
    const extension = path.extname(file.name || "").toLowerCase() || ".bin";
    const safeName = `${record.report_id}${extension}`;
    const targetPath = path.join(uploadsDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(targetPath, buffer);
    storedFile = {
      original_name: file.name,
      stored_name: safeName,
      mime_type: file.type || "application/octet-stream",
      size: file.size,
      relative_path: path.posix.join("data", "ceal", "uploads", safeName),
    };
  }

  const records = await readLocalStore();
  records.unshift({
    ...record,
    evidence: storedFile,
  });

  await writeFile(localStoreFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

async function forwardToWebhook(record, file) {
  const form = new FormData();
  form.set("report_id", record.report_id);
  form.set("submitted_at", record.submitted_at);
  form.set("issue_type", record.issue_type);
  form.set("unit", record.unit);
  form.set("date", record.date);
  form.set("description", record.description);
  form.set("wants_followup", record.wants_followup);

  if (file && file.size) {
    form.set("evidence", file, file.name);
  }

  const headers = {};
  if (process.env.CEAL_REPORT_WEBHOOK_TOKEN) {
    headers.authorization = `Bearer ${process.env.CEAL_REPORT_WEBHOOK_TOKEN}`;
  }

  const response = await fetch(process.env.CEAL_REPORT_WEBHOOK_URL, {
    method: "POST",
    headers,
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "El webhook externo rechazó el reporte.");
  }
}

export async function GET() {
  const storageMode = getStorageMode();
  const acceptsSubmissions = storageMode !== "unconfigured";

  return json({
    ok: true,
    accepts_submissions: acceptsSubmissions,
    storage_mode: storageMode,
    max_file_size_bytes: maxFileSizeBytes,
    message:
      storageMode === "webhook"
        ? "El formulario envía incidencias a un endpoint externo configurado."
        : storageMode === "filesystem"
          ? "El formulario guarda incidencias en el almacenamiento local del proyecto."
          : "Configura CEAL_REPORT_WEBHOOK_URL para usar recepción persistente en producción.",
  });
}

export async function POST(request) {
  const storageMode = getStorageMode();
  if (storageMode === "unconfigured") {
    return json(
      {
        error:
          "Producción sin recepción configurada. Define CEAL_REPORT_WEBHOOK_URL o usa un entorno local con almacenamiento habilitado.",
      },
      503,
    );
  }

  try {
    const form = await request.formData();

    const issueType = validateString(form.get("issue_type"), 80);
    const unit = validateString(form.get("unit"), 160);
    const date = validateString(form.get("date"), 40);
    const description = validateString(form.get("description"), 500);
    const wantsFollowup = validateString(form.get("wants_followup"), 10) || "yes";
    const evidence = form.get("evidence");
    const file = evidence instanceof File ? evidence : null;

    if (!issueType || !unit || !date || !description) {
      return json({ error: "Faltan campos obligatorios del reporte." }, 400);
    }

    const fileValidation = validateFile(file);
    if (!fileValidation.ok) {
      return json({ error: fileValidation.message }, 400);
    }

    const report = {
      report_id: `ceal-${randomUUID().slice(0, 8)}`,
      submitted_at: new Date().toISOString(),
      issue_type: issueType,
      unit,
      date,
      description,
      wants_followup: wantsFollowup === "no" ? "no" : "yes",
    };

    if (storageMode === "webhook") {
      await forwardToWebhook(report, file);
    } else {
      await persistLocally(report, file);
    }

    return json({
      ok: true,
      report_id: report.report_id,
      storage_mode: storageMode,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "No se pudo procesar el reporte.",
      },
      500,
    );
  }
}

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEGAL_FILES = [
  { slug: "terms-of-service", filename: "terms-of-service.md" },
  { slug: "privacy-policy", filename: "privacy-policy.md" },
];

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToHtml(lines) {
  const parts = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        parts.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (trimmed.startsWith("## ")) {
      if (inList) {
        parts.push("</ul>");
        inList = false;
      }
      parts.push(`<h2>${escapeHtml(trimmed.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    if (inList) {
      parts.push("</ul>");
      inList = false;
    }

    parts.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  if (inList) {
    parts.push("</ul>");
  }

  return parts.join("");
}

function parseMarkdownContent(markdown) {
  const lines = markdown.split(/\r?\n/);
  let title = "";
  const bodyLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!title && trimmed.startsWith("# ")) {
      title = trimmed.replace(/^#\s+/, "");
      continue;
    }
    bodyLines.push(line);
  }

  if (!title) {
    throw new Error("Missing title heading in markdown");
  }

  const body = markdownToHtml(bodyLines);
  if (!body) {
    throw new Error("Generated body is empty");
  }

  return { title, body };
}

async function ensureLegalContent() {
  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "legal");

  for (const item of LEGAL_FILES) {
    const filePath = path.join(baseDir, item.filename);
    const markdown = await readFile(filePath, "utf8");
    const { title, body } = parseMarkdownContent(markdown);

    const result = await prisma.content.upsert({
      where: { slug: item.slug },
      update: { title, body },
      create: { slug: item.slug, title, body },
    });

    process.stdout.write(`[ensure_legal_content] upsert ${item.slug} -> id ${result.id}\n`);
  }
}

ensureLegalContent()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    process.stderr.write(`ensure_legal_content failed: ${err && err.message ? err.message : String(err)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOC_SLUG = "vtur";
const SOURCE_PATH = process.argv[2] || "public/VTUR_DOCUMENTACAO.md";

if (!SUPABASE_URL) {
  console.error("SUPABASE_URL ou PUBLIC_SUPABASE_URL não configurados.");
  process.exit(1);
}

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY não configurado (necessário para sobrescrever documentação)." );
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function publish() {
  const markdown = readFileSync(SOURCE_PATH, "utf8");
  if (!markdown.trim()) {
    throw new Error(`O arquivo ${SOURCE_PATH} está vazio.`);
  }

  const content = markdown.endsWith("\n") ? markdown : `${markdown}\n`;

  const { error } = await client.from("system_documentation").upsert(
    {
      slug: DOC_SLUG,
      markdown: content,
      updated_at: new Date().toISOString(),
      updated_by: process.env.DOCS_UPDATED_BY || "publish-documentacao-script",
    },
    { onConflict: "slug" }
  );

  if (error) {
    throw error;
  }

  console.log("Documentação publicada em system_documentation.");
}

publish().catch((err) => {
  console.error("Falha ao publicar documentação:", err.message || err);
  process.exit(1);
});

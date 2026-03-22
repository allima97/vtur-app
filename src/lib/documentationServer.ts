import { randomUUID } from "node:crypto";

import {
  type DocumentationSection,
  buildDocumentationMarkdownFromSections,
  normalizeDocumentationSectionInput,
  parseLegacyDocumentationSections,
  sortDocumentationSections,
} from "./documentation";
import { DOC_PRIMARY_SLUG, DOC_SLUGS } from "./systemName";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return UUID_REGEX.test(String(value || "").trim());
}

function mapRowToSection(row: any): DocumentationSection {
  return normalizeDocumentationSectionInput(
    {
      id: row?.id,
      slug: row?.slug || DOC_PRIMARY_SLUG,
      role_scope: row?.role_scope,
      module_key: row?.module_key,
      route_pattern: row?.route_pattern,
      title: row?.title,
      summary: row?.summary,
      content_markdown: row?.content_markdown,
      tone: row?.tone,
      sort_order: row?.sort_order,
      is_active: row?.is_active,
      updated_at: row?.updated_at,
      updated_by: row?.updated_by,
      source: "sections",
    },
    0,
  );
}

export async function fetchDocumentationSections(client: any, slugs: readonly string[] = DOC_SLUGS) {
  const { data, error } = await client
    .from("system_documentation_sections")
    .select(
      "id, slug, role_scope, module_key, route_pattern, title, summary, content_markdown, tone, sort_order, is_active, updated_at, updated_by"
    )
    .in("slug", [...slugs])
    .order("role_scope", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;

  return Array.isArray(data) ? sortDocumentationSections(data.map(mapRowToSection)) : [];
}

export async function persistDocumentationSections(params: {
  client: any;
  userId: string;
  sections: Array<Partial<DocumentationSection>>;
  slug?: string;
}) {
  const client = params.client;
  const userId = String(params.userId || "").trim();
  const slug = String(params.slug || DOC_PRIMARY_SLUG).trim() || DOC_PRIMARY_SLUG;

  const nextSections = (params.sections || [])
    .map((item, index) =>
      normalizeDocumentationSectionInput(
        {
          ...item,
          slug,
          id: isUuid(item?.id) ? item?.id : randomUUID(),
        },
        index,
      )
    )
    .filter((item) => item.title && item.content_markdown && (item.module_key || item.route_pattern));

  const duplicateCheck = new Set<string>();
  for (const section of nextSections) {
    const key = `${section.slug}::${section.role_scope}::${section.module_key}`;
    if (section.module_key && duplicateCheck.has(key)) {
      throw new Error(`Chave duplicada de documentação: ${section.role_scope}/${section.module_key}.`);
    }
    if (section.module_key) {
      duplicateCheck.add(key);
    }
  }

  const { data: existingRows, error: existingError } = await client
    .from("system_documentation_sections")
    .select("id")
    .eq("slug", slug);
  if (existingError) throw existingError;

  const existingIds = new Set((existingRows || []).map((row: any) => String(row.id || "")));
  const nextIds = new Set(nextSections.map((section) => section.id));
  const idsToDelete = Array.from(existingIds).filter((id) => !nextIds.has(id));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await client
      .from("system_documentation_sections")
      .delete()
      .in("id", idsToDelete);
    if (deleteError) throw deleteError;
  }

  const nowIso = new Date().toISOString();
  if (nextSections.length > 0) {
    const rows = nextSections.map((section) => ({
      id: section.id,
      slug: section.slug,
      role_scope: section.role_scope,
      module_key: section.module_key,
      route_pattern: section.route_pattern,
      title: section.title,
      summary: section.summary,
      content_markdown: section.content_markdown.endsWith("\n")
        ? section.content_markdown
        : `${section.content_markdown}\n`,
      tone: section.tone,
      sort_order: section.sort_order,
      is_active: section.is_active,
      updated_at: nowIso,
      updated_by: userId || null,
      created_by: existingIds.has(section.id) ? undefined : userId || null,
    }));

    const { error: upsertError } = await client
      .from("system_documentation_sections")
      .upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;
  }

  const markdown = buildDocumentationMarkdownFromSections(nextSections);
  const { error: docError } = await client
    .from("system_documentation")
    .upsert(
      {
        slug,
        markdown,
        updated_at: nowIso,
        updated_by: userId || null,
      },
      { onConflict: "slug" },
    );
  if (docError) throw docError;

  return fetchDocumentationSections(client, [slug]);
}

export async function persistDocumentationMarkdown(params: {
  client: any;
  userId: string;
  markdown: string;
  slug?: string;
}) {
  const slug = String(params.slug || DOC_PRIMARY_SLUG).trim() || DOC_PRIMARY_SLUG;
  const markdown = String(params.markdown || "").trim();
  if (!markdown) {
    throw new Error("Conteúdo inválido.");
  }

  const sections = parseLegacyDocumentationSections(markdown, slug);
  const savedSections = await persistDocumentationSections({
    client: params.client,
    userId: params.userId,
    slug,
    sections,
  });

  return {
    markdown: buildDocumentationMarkdownFromSections(savedSections),
    sections: savedSections,
  };
}

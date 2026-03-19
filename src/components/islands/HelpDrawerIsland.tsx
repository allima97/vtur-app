import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { descobrirModulo } from "../../config/modulos";
import AppButton from "../ui/primer/AppButton";
import EmptyState from "../ui/EmptyState";

type ModuleSection = {
  title: string;
  content: string;
};

type RoleSections = Record<string, ModuleSection[]>;

function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDocByRole(markdown: string): RoleSections {
  const lines = markdown.split("\n");
  const roles: RoleSections = {};
  let currentRole: string | null = null;
  let currentModule: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentRole || !currentModule) return;
    if (!roles[currentRole]) roles[currentRole] = [];
    const content = buffer.join("\n").trim();
    roles[currentRole].push({ title: currentModule, content });
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentRole = line.replace("## ", "").trim();
      currentModule = null;
      buffer = [];
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      currentModule = line.replace("### ", "").trim();
      buffer = [];
      continue;
    }
    if (currentModule) {
      buffer.push(line);
    }
  }
  flush();
  return roles;
}

function mdToHtml(md: string) {
  let html = md;

  html = html.replace(/^### (.*)$/gim, (_, title) => `<h3>${title}</h3>`);
  html = html.replace(/^## (.*)$/gim, (_, title) => `<h2>${title}</h2>`);
  html = html.replace(/^# (.*)$/gim, (_, title) => `<h1>${title}</h1>`);

  html = html.replace(/!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" />');
  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");
  html = html.replace(/^- (.*)$/gim, "<li>$1</li>");

  const lines = html.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.trim().startsWith("<li>")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(line);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(line);
    }
  }
  if (inList) out.push("</ul>");
  html = out.join("\n");

  html = html.replace(/\n{2,}/g, "<br/><br/>");
  return html;
}

function resolveModuleKey(pathname: string) {
  const modulo = descobrirModulo(pathname);
  if (modulo) return modulo;
  if (pathname === "/" || pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/vendas/importar")) return "Importar Contratos";
  if (pathname.startsWith("/gestor/importar-vendas")) return "Importar Vendas";
  if (pathname.startsWith("/vendas")) return "Vendas";
  if (pathname.startsWith("/orcamentos/importar")) return "Importar Orçamentos";
  if (pathname.startsWith("/orcamentos")) return "Orçamentos";
  if (pathname.startsWith("/clientes")) return "Clientes";
  if (pathname.startsWith("/consultoria-online")) return "Consultoria Online";
  if (pathname.startsWith("/operacao/controle-sac")) return "Operação > Controle SAC";
  if (pathname.startsWith("/operacao/viagens")) return "Operação > Viagens";
  if (pathname.startsWith("/operacao/comissionamento")) return "Comissionamento";
  if (pathname.startsWith("/comissoes/fechamento")) return "Fechamento de Comissão";
  if (pathname.startsWith("/parametros/metas")) return "Metas";
  if (pathname.startsWith("/parametros/equipe")) return "Equipe";
  if (pathname.startsWith("/parametros/escalas")) return "Escalas";
  if (pathname.startsWith("/parametros/cambios")) return "Câmbios";
  if (pathname.startsWith("/parametros/orcamentos")) return "Orçamentos (PDF)";
  if (pathname.startsWith("/parametros/formas-pagamento")) return "Formas de Pagamento";
  if (pathname.startsWith("/parametros/regras-comissao")) return "Regras de Comissão";
  if (pathname.startsWith("/parametros/tipo-produtos")) return "Tipo de Produtos";
  if (pathname.startsWith("/parametros")) return "Parâmetros do Sistema";
  if (pathname.startsWith("/cadastros")) return "Cadastros";
  if (pathname.startsWith("/relatorios")) return "Relatórios";
  if (pathname.startsWith("/master/empresas")) return "Master > Empresas";
  if (pathname.startsWith("/master/usuarios")) return "Master > Usuários";
  if (pathname.startsWith("/master/permissoes")) return "Master > Permissões";
  if (pathname.startsWith("/admin/planos")) return "Planos";
  if (pathname.startsWith("/admin/financeiro")) return "Financeiro";
  if (pathname.startsWith("/admin/empresas")) return "Empresas";
  if (pathname.startsWith("/admin/usuarios")) return "Usuários";
  if (pathname.startsWith("/admin/avisos")) return "Avisos";
  if (pathname.startsWith("/admin/email")) return "E-mail";
  if (pathname.startsWith("/admin/permissoes")) return "Permissões";
  if (pathname.startsWith("/dashboard/logs")) return "Logs";
  if (pathname.startsWith("/dashboard/admin")) return "Dashboard Admin";
  if (pathname.startsWith("/documentacao")) return "Documentação";
  if (pathname.startsWith("/perfil")) return "Perfil";
  return null;
}

function resolveRoleTitle(userType: string, isSystemAdmin: boolean) {
  if (isSystemAdmin) return "Admin do Sistema";
  const normalized = String(userType || "").toUpperCase();
  if (normalized.includes("MASTER")) return "Master";
  if (normalized.includes("GESTOR")) return "Gestor";
  return "Vendedor";
}

export default function HelpDrawerIsland() {
  const { userType, isSystemAdmin } = usePermissoesStore();
  const [raw, setRaw] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPathname(window.location.pathname || "");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOpen = () => setOpen(true);
    window.addEventListener("sgtur:open-help", handleOpen as EventListener);
    return () => window.removeEventListener("sgtur:open-help", handleOpen as EventListener);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/documentacao");
        if (!res.ok) throw new Error("Falha ao carregar documentação.");
        const data = await res.json();
        setRaw(data?.markdown || "");
      } catch {
        setRaw("");
      }
    }
    load();
  }, []);

  const roleTitle = resolveRoleTitle(userType, isSystemAdmin);
  const moduleKey = resolveModuleKey(pathname || "");

  const helpHtml = useMemo(() => {
    if (!raw || !moduleKey) return "";
    const sections = parseDocByRole(raw);
    const roleSections = sections[roleTitle] || [];
    if (roleSections.length === 0) return "";

    const normalizedKey = normalizeText(moduleKey);
    let match =
      roleSections.find((m) => normalizeText(m.title) === normalizedKey) ||
      roleSections.find((m) => normalizeText(m.title).includes(normalizedKey)) ||
      roleSections.find((m) => normalizedKey.includes(normalizeText(m.title)));

    if (!match && normalizedKey.includes("dashboard")) {
      match = roleSections.find((m) =>
        normalizeText(m.title).includes(normalizeText("dashboard"))
      );
    }

    if (!match && normalizedKey.includes("cadastros")) {
      match = roleSections.find((m) =>
        normalizeText(m.title).includes(normalizeText("cadastros"))
      );
    }

    if (!match && normalizedKey.includes("relatorios")) {
      match = roleSections.find((m) =>
        normalizeText(m.title).includes(normalizeText("relatorios"))
      );
    }

    if (!match) return "";

    const markdown = `### ${match.title}\n${match.content}`;
    return mdToHtml(markdown);
  }, [raw, moduleKey, roleTitle]);

  if (!moduleKey || pathname.startsWith("/documentacao")) return null;

  return (
    <>
      <AppButton
        type="button"
        variant="primary"
        className="help-fab"
        onClick={() => setOpen(true)}
        aria-label="Abrir ajuda"
        title="Abrir ajuda"
      >
        ?
      </AppButton>
      {open && (
        <div className="help-drawer">
          <div className="help-drawer-header">
            <strong>Ajuda do módulo</strong>
            <AppButton type="button" variant="secondary" onClick={() => setOpen(false)}>
              Fechar
            </AppButton>
          </div>
          <div className="help-drawer-body doc-content">
            {helpHtml ? (
              <div dangerouslySetInnerHTML={{ __html: helpHtml }} />
            ) : (
              <EmptyState title="Ajuda indisponivel" description="Ajuda ainda nao cadastrada para este modulo." />
            )}
          </div>
        </div>
      )}
    </>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import { renderTemplateText } from "../../lib/messageTemplates";
import { construirLinkWhatsAppComTexto, getPrimeiroNome } from "../../lib/whatsapp";
import { renderSvgUrlToPngObjectUrl, validarPngServidor } from "../../lib/cards/browserPng";
import AppCard from "../ui/primer/AppCard";
import AppButton from "../ui/primer/AppButton";
import AppField from "../ui/primer/AppField";
import FileUploadField from "../ui/primer/FileUploadField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import ConfirmDialog from "../ui/ConfirmDialog";
import {
  OFFICIAL_CARD_THEME_DELETE_NAMES,
  OFFICIAL_CARD_THEME_NAMES,
  OFFICIAL_CARD_TEMPLATE_DELETE_NAMES,
  buildOfficialTemplateRows,
  buildOfficialThemeRows,
  resolveThemeAssetMeta,
} from "../../lib/cards/officialLibrary";
import {
  CARD_ALIGN_OPTIONS,
  CARD_FONT_OPTIONS,
  CARD_STYLE_SECTION_LABELS,
  CARD_STYLE_SECTION_ORDER,
  CARD_WEIGHT_OPTIONS,
  createDefaultCardStyleMap,
  resolveCardStyleMap,
  serializeCardStyleMap,
  type CardStyleMap,
  type CardStyleSectionKey,
} from "../../lib/cards/styleConfig";

const STORAGE_BUCKET = "message-template-themes";

const OCASIOES_OFICIAIS = [
  "Aniversário",
  "Aniversário da Primeira Compra",
  "Aniversário da Primeira Viagem",
  "Natal",
  "Ano Novo",
  "Páscoa",
  "Dia das Mulheres",
  "Dia das Mães",
  "Dia dos Pais",
  "Dia dos Namorados",
  "Dia do Cliente",
  "Cliente Premium",
  "Promoção Exclusiva",
  "Sugestão de Destino",
  "Upgrade VIP",
  "Indicação de Cliente",
  "Lembrete de Passaporte",
  "Lembrete de Visto / Documentação",
  "Retorno de Viagem",
  "Pré-embarque",
  "Contagem Regressiva",
  "Oferta de Recompra",
  "Data Especial Personalizada",
  "Boas-vindas",
  "Pós-viagem / Feedback",
  "Cliente VIP",
  "Cliente Inativo",
  "Campanha Sazonal",
  "Feriado Prolongado",
  "Mensagem Surpresa",
];

type Theme = {
  id: string;
  nome: string;
  categoria: string;
  asset_url: string;
  width_px: number;
  height_px: number;
  title_style?: Record<string, any> | null;
  body_style?: Record<string, any> | null;
  signature_style?: Record<string, any> | null;
  ativo: boolean;
};

type MessageTemplate = {
  id: string;
  nome: string;
  categoria: string | null;
  titulo: string;
  corpo: string;
  assinatura: string | null;
  theme_id: string | null;
  title_style?: Record<string, any> | null;
  body_style?: Record<string, any> | null;
  signature_style?: Record<string, any> | null;
  ativo: boolean;
};

type PreviewCliente = {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  telefone: string | null;
};

type TemplateForm = {
  id: string;
  nome: string;
  titulo: string;
  categoria: string;
  corpo: string;
  footerLead: string;
  assinatura: string;
  consultantRole: string;
  theme_id: string;
  ativo: boolean;
};

type ThemeForm = {
  id: string;
  nome: string;
  categoria: string;
  asset_url: string;
  width_px: number;
  height_px: number;
  ativo: boolean;
};

const initialTemplateForm: TemplateForm = {
  id: "",
  nome: "",
  titulo: "",
  categoria: "",
  corpo: "",
  footerLead: "Com carinho",
  assinatura: "",
  consultantRole: "Consultor de viagens",
  theme_id: "",
  ativo: true,
};

const initialThemeForm: ThemeForm = {
  id: "",
  nome: "",
  categoria: "Aniversário",
  asset_url: "",
  width_px: 1080,
  height_px: 1080,
  ativo: true,
};

function resolveTemplateStyleState(theme: Theme | null, template?: MessageTemplate | null): CardStyleMap {
  return resolveCardStyleMap({
    themeName: theme?.nome,
    themeBuckets: theme
      ? {
          title_style: theme.title_style,
          body_style: theme.body_style,
          signature_style: theme.signature_style,
        }
      : null,
    templateBuckets: template
      ? {
          title_style: template.title_style,
          body_style: template.body_style,
          signature_style: template.signature_style,
        }
      : null,
  });
}

const STYLE_SECTION_SAMPLE: Record<CardStyleSectionKey, string> = {
  title: "Feliz Natal!",
  clientName: "Helena,",
  body: "Mensagem principal",
  footerLead: "Com carinho",
  consultant: "André Lima",
  consultantRole: "Consultor de viagens",
};

function normalizarCategoria(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function categoriasCoincidem(first?: string | null, second?: string | null) {
  const categoriaA = normalizarCategoria(first);
  const categoriaB = normalizarCategoria(second);
  if (!categoriaA || !categoriaB) return false;
  return categoriaA === categoriaB;
}

function buildMensagemDisparo(
  texto: string,
  assinatura: string,
  nomeCliente: string,
  options?: { useFullNameAsFirstName?: boolean }
) {
  return renderTemplateText(texto, {
    nomeCompleto: nomeCliente,
    assinatura,
    consultor: assinatura,
  }, options).trim();
}

function normalizeColorInput(value: unknown, fallback = "#000000") {
  const color = String(value || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractSignatureTextConfig(signatureStyle?: unknown) {
  const content = isRecord(signatureStyle) && isRecord(signatureStyle.content)
    ? signatureStyle.content
    : null;
  const footerLeadRaw = content?.footerLead;
  const consultantRoleRaw = content?.consultantRole;

  return {
    footerLead: footerLeadRaw == null ? "Com carinho" : String(footerLeadRaw).trim(),
    consultantRole:
      consultantRoleRaw == null
        ? "Consultor de viagens"
        : String(consultantRoleRaw).trim() || "Consultor de viagens",
  };
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = Number(image.naturalWidth || 1080);
      const height = Number(image.naturalHeight || 1080);
      URL.revokeObjectURL(objectUrl);
      resolve({ width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler a dimensão da arte."));
    };
    image.src = objectUrl;
  });
}

export default function ParametrosAvisosIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;
  const podeVer = can("Avisos") || can("ParametrosAvisos") || can("Parametros") || can("Admin");

  const [carregandoDados, setCarregandoDados] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [clientesPreview, setClientesPreview] = useState<PreviewCliente[]>([]);
  const [previewClienteId, setPreviewClienteId] = useState("");
  const [previewNomeClienteManual, setPreviewNomeClienteManual] = useState("");
  const [form, setForm] = useState<TemplateForm>(initialTemplateForm);
  const [styleForm, setStyleForm] = useState<CardStyleMap>(() => createDefaultCardStyleMap());
  const [themeForm, setThemeForm] = useState<ThemeForm>(initialThemeForm);
  const [themeFile, setThemeFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvandoTheme, setSalvandoTheme] = useState(false);
  const [carregandoPadrao, setCarregandoPadrao] = useState(false);
  const [mostrarFormularioTema, setMostrarFormularioTema] = useState(false);
  const [mostrarListaArtes, setMostrarListaArtes] = useState(false);
  const [filtroThemeTabelaId, setFiltroThemeTabelaId] = useState("");
  const [previewResolvedUrl, setPreviewResolvedUrl] = useState("");
  const [previewResolvedMime, setPreviewResolvedMime] = useState<"image/png" | "image/svg+xml">("image/svg+xml");
  const [previewResolvedSource, setPreviewResolvedSource] = useState<"server_png" | "browser_png" | "svg">("svg");
  const [gerandoPreviewPng, setGerandoPreviewPng] = useState(false);
  const [themeDeleteId, setThemeDeleteId] = useState<string | null>(null);
  const [configDeleteId, setConfigDeleteId] = useState<string | null>(null);

  async function carregar() {
    try {
      setCarregandoDados(true);
      setErro(null);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data: userData } = await supabase
        .from("users")
        .select("nome_completo")
        .eq("id", userId)
        .maybeSingle();
      setNomeUsuario(String(userData?.nome_completo || authData.user.user_metadata?.name || "").trim());

      const tplResp = await supabase
        .from("user_message_templates")
        .select("id, nome, categoria, titulo, corpo, assinatura, theme_id, title_style, body_style, signature_style, ativo")
        .eq("user_id", userId)
        .order("categoria")
        .order("nome");
      if (tplResp.error) throw tplResp.error;
      setTemplates((tplResp.data || []) as MessageTemplate[]);

      const themesResp = await supabase
        .from("user_message_template_themes")
        .select("id, nome, categoria, asset_url, width_px, height_px, title_style, body_style, signature_style, ativo")
        .eq("user_id", userId)
        .order("categoria")
        .order("nome");
      if (themesResp.error) throw themesResp.error;
      setThemes((themesResp.data || []) as Theme[]);

      const clientesResp = await supabase
        .from("clientes")
        .select("id, nome, whatsapp, telefone")
        .order("nome")
        .limit(200);
      if (!clientesResp.error) {
        const lista = (clientesResp.data || []) as PreviewCliente[];
        setClientesPreview(lista);
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar avisos.");
    } finally {
      setCarregandoDados(false);
    }
  }

  useEffect(() => {
    if (!loadPerm && podeVer) {
      void carregar();
    }
  }, [loadPerm, podeVer]);

  const selectedThemeForForm = useMemo(
    () => themes.find((theme) => theme.id === form.theme_id) || null,
    [themes, form.theme_id],
  );

  const filteredThemesByCategoria = useMemo(() => {
    const categoria = normalizarCategoria(selectedThemeForForm?.categoria || form.categoria);
    if (!categoria) return themes;
    return themes.filter((theme) => normalizarCategoria(theme.categoria) === categoria);
  }, [themes, form.categoria, selectedThemeForForm]);

  const themesTabela = useMemo(() => {
    if (!filtroThemeTabelaId) return themes;
    return themes.filter((theme) => theme.id === filtroThemeTabelaId);
  }, [themes, filtroThemeTabelaId]);

  const previewClienteSelecionado = useMemo(
    () => clientesPreview.find((item) => item.id === previewClienteId) || null,
    [clientesPreview, previewClienteId],
  );

  const previewNomeCliente = useMemo(() => {
    const nomeManual = String(previewNomeClienteManual || "").trim();
    if (nomeManual) return nomeManual;
    const nome = String(previewClienteSelecionado?.nome || "").trim();
    return nome || "Carlos Eduardo Silva";
  }, [previewClienteSelecionado, previewNomeClienteManual]);

  const previewCardTitle = useMemo(
    () => String(form.titulo || form.nome || form.categoria || "Aviso").trim() || "Aviso",
    [form.titulo, form.nome, form.categoria],
  );

  const previewText = useMemo(() => {
    const assinatura = form.assinatura.trim() || nomeUsuario;
    const hasNomeManual = String(previewNomeClienteManual || "").trim().length > 0;
    return buildMensagemDisparo(form.corpo, assinatura, previewNomeCliente, {
      useFullNameAsFirstName: hasNomeManual,
    });
  }, [form.corpo, form.assinatura, nomeUsuario, previewNomeCliente, previewNomeClienteManual]);

  const previewBaseParams = useMemo(() => {
    if (!selectedThemeForForm) return null;
    const resolvedThemeAsset = resolveThemeAssetMeta(selectedThemeForForm);

    const assinatura = form.assinatura.trim() || nomeUsuario || "";
    const nomeManual = String(previewNomeClienteManual || "").trim();
    const params = new URLSearchParams({
      theme_id: selectedThemeForForm.id,
      nome: previewNomeCliente,
      titulo: previewCardTitle,
      corpo: form.corpo,
      footer_lead: form.footerLead,
      assinatura,
      cargo_consultor: form.consultantRole,
      v: String(Date.now()),
    });

    if (nomeManual) {
      params.set("cliente_nome", nomeManual);
      params.set("cliente_nome_literal", nomeManual);
    }
    if (resolvedThemeAsset.asset_url) params.set("theme_asset_url", resolvedThemeAsset.asset_url);
    if (resolvedThemeAsset.width_px) params.set("width", String(resolvedThemeAsset.width_px));
    if (resolvedThemeAsset.height_px) params.set("height", String(resolvedThemeAsset.height_px));
    params.set("style_overrides", JSON.stringify(styleForm));
    return params;
  }, [selectedThemeForForm, previewNomeCliente, previewCardTitle, form.corpo, form.footerLead, form.assinatura, form.consultantRole, nomeUsuario, styleForm, previewNomeClienteManual]);

  const previewThemeSvgUrl = useMemo(() => {
    if (!previewBaseParams) return "";
    return `/api/v1/cards/render.svg?${previewBaseParams.toString()}`;
  }, [previewBaseParams]);

  const previewThemePngUrl = useMemo(() => {
    if (!previewBaseParams) return "";
    return `/api/v1/cards/render.png?${previewBaseParams.toString()}`;
  }, [previewBaseParams]);

  useEffect(() => {
    let active = true;
    let objectUrlToRevoke: string | null = null;

    async function resolverPreviewComPng() {
      if (!previewThemeSvgUrl) {
        setPreviewResolvedUrl("");
        setPreviewResolvedMime("image/svg+xml");
        setPreviewResolvedSource("svg");
        setGerandoPreviewPng(false);
        return;
      }

      setPreviewResolvedUrl(previewThemeSvgUrl);
      setPreviewResolvedMime("image/svg+xml");
      setPreviewResolvedSource("svg");
      if (!previewThemePngUrl) return;

      setGerandoPreviewPng(true);
      try {
        const pngStatus = await validarPngServidor(previewThemePngUrl);
        if (!active) return;
        if (pngStatus.ok) {
          setPreviewResolvedUrl(previewThemePngUrl);
          setPreviewResolvedMime("image/png");
          setPreviewResolvedSource("server_png");
          return;
        }

        try {
          const browserPngUrl = await renderSvgUrlToPngObjectUrl(previewThemeSvgUrl);
          if (!active) {
            URL.revokeObjectURL(browserPngUrl);
            return;
          }
          objectUrlToRevoke = browserPngUrl;
          setPreviewResolvedUrl(browserPngUrl);
          setPreviewResolvedMime("image/png");
          setPreviewResolvedSource("browser_png");
        } catch {
          setPreviewResolvedUrl(previewThemeSvgUrl);
          setPreviewResolvedMime("image/svg+xml");
          setPreviewResolvedSource("svg");
        }
      } finally {
        if (active) setGerandoPreviewPng(false);
      }
    }

    void resolverPreviewComPng();

    return () => {
      active = false;
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
    };
  }, [previewThemeSvgUrl, previewThemePngUrl]);

  const previewWhatsappUrl = useMemo(() => {
    if (!previewThemeSvgUrl) return "";
    const telefone = previewClienteSelecionado?.whatsapp || previewClienteSelecionado?.telefone || "";
    if (!telefone) return "";
    const texto = `${previewText}\n\nCartão:\n${typeof window !== "undefined" ? `${window.location.origin}${previewThemeSvgUrl}` : previewThemeSvgUrl}`;
    return construirLinkWhatsAppComTexto(telefone, texto) || "";
  }, [previewThemeSvgUrl, previewClienteSelecionado, previewText]);

  function abrirPreviewCartao(url: string) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function baixarPreviewCartao() {
    if (!previewResolvedUrl) return;
    const link = document.createElement("a");
    const slug = (getPrimeiroNome(previewNomeCliente) || "cliente")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .toLowerCase();
    const ext = previewResolvedMime === "image/png" ? "png" : "svg";
    link.href = previewResolvedUrl;
    link.download = `cartao-${slug}-${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function resetForm() {
    setForm(initialTemplateForm);
    setStyleForm(createDefaultCardStyleMap());
  }

  function resetThemeForm() {
    setThemeForm(initialThemeForm);
    setThemeFile(null);
  }

  function aplicarPadraoVisual(themeId: string, template?: MessageTemplate | null) {
    const theme = themes.find((item) => item.id === themeId) || null;
    setStyleForm(resolveTemplateStyleState(theme, template || null));
  }

  function atualizarStyleSection(section: CardStyleSectionKey, field: string, value: string | number | boolean) {
    setStyleForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  }

  async function handleThemeFileSelected(file: File | null) {
    setThemeFile(file);
    if (!file) return;
    try {
      const dims = await readImageDimensions(file);
      setThemeForm((prev) => ({
        ...prev,
        asset_url: "",
        width_px: dims.width,
        height_px: dims.height,
      }));
    } catch (e: any) {
      setErro(e?.message || "Não foi possível ler a dimensão da arte.");
    }
  }

  async function uploadThemeAsset(userId: string) {
    if (!themeFile) {
      return {
        asset_url: themeForm.asset_url.trim(),
        storage_path: null as string | null,
      };
    }

    const ext = themeFile.name.split(".").pop()?.toLowerCase() || "png";
    const baseName = themeFile.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${userId}/${Date.now()}-${baseName}.${ext}`;
    const upload = await supabase.storage.from(STORAGE_BUCKET).upload(path, themeFile, {
      upsert: false,
      contentType: themeFile.type || undefined,
    });
    if (upload.error) throw upload.error;

    const publicUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl || "";
    if (!publicUrl) throw new Error("Falha ao gerar URL pública da arte.");

    return { asset_url: publicUrl, storage_path: path };
  }

  async function salvarTheme(e: React.FormEvent) {
    e.preventDefault();
    if (!themeForm.nome.trim()) {
      setErro("Informe o nome da arte.");
      return;
    }
    if (!themeFile && !themeForm.asset_url.trim()) {
      setErro("Envie um arquivo de arte ou informe uma URL.");
      return;
    }

    try {
      setSalvandoTheme(true);
      setErro(null);
      setMsg(null);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error("Sessão inválida.");

      const { data: userData } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();

      const uploadInfo = await uploadThemeAsset(userId);
      const payload = {
        user_id: userId,
        company_id: userData?.company_id || null,
        nome: themeForm.nome.trim(),
        categoria: themeForm.categoria.trim() || "Geral",
        asset_url: uploadInfo.asset_url,
        storage_path: uploadInfo.storage_path,
        width_px: Number(themeForm.width_px || 1080),
        height_px: Number(themeForm.height_px || 1080),
        ativo: themeForm.ativo,
      };

      if (themeForm.id) {
        const { error } = await supabase
          .from("user_message_template_themes")
          .update(payload)
          .eq("id", themeForm.id)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_message_template_themes").insert(payload);
        if (error) throw error;
      }

      setMsg(themeForm.id ? "Arte atualizada." : "Arte cadastrada.");
      resetThemeForm();
      setMostrarFormularioTema(false);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar arte.");
    } finally {
      setSalvandoTheme(false);
    }
  }

  function editarTheme(theme: Theme) {
    setThemeForm({
      id: theme.id,
      nome: theme.nome || "",
      categoria: theme.categoria || "Geral",
      asset_url: theme.asset_url || "",
      width_px: Number(theme.width_px || 1080),
      height_px: Number(theme.height_px || 1080),
      ativo: theme.ativo,
    });
    setThemeFile(null);
    setMostrarFormularioTema(true);
    setErro(null);
    setMsg(null);
  }

  function removerTheme(id: string) {
    setThemeDeleteId(id);
  }

  async function confirmarRemoverTheme() {
    const id = String(themeDeleteId || "").trim();
    if (!id) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      const { error } = await supabase
        .from("user_message_template_themes")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      if (themeForm.id === id) resetThemeForm();
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao excluir arte.");
    } finally {
      setThemeDeleteId(null);
    }
  }

  async function salvarConfiguracao(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.titulo.trim() || !form.corpo.trim() || !form.theme_id) {
      setErro("Nome interno, título do card, arte e mensagem do WhatsApp são obrigatórios.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);
      setMsg(null);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error("Sessão inválida.");

      const { data: userData } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();

      const categoria = selectedThemeForForm?.categoria?.trim() || form.categoria.trim() || null;
      const titulo = form.titulo.trim() || form.nome.trim();
      const serializedStyles = serializeCardStyleMap(styleForm);
      const signatureTextConfig = {
        footerLead: form.footerLead.trim(),
        consultantRole: form.consultantRole.trim() || "Consultor de viagens",
      };
      const payload = {
        user_id: userId,
        company_id: userData?.company_id || null,
        nome: form.nome.trim(),
        categoria,
        assunto: titulo,
        titulo,
        corpo: form.corpo.trim(),
        assinatura: form.assinatura.trim() || null,
        template_base_url: null,
        theme_id: form.theme_id || null,
        title_style: serializedStyles.title_style,
        body_style: serializedStyles.body_style,
        signature_style: {
          ...(serializedStyles.signature_style || {}),
          content: signatureTextConfig,
        },
        ativo: form.ativo,
      };

      if (form.id) {
        const { error } = await supabase
          .from("user_message_templates")
          .update(payload)
          .eq("id", form.id)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_message_templates").insert(payload);
        if (error) throw error;
      }

      setMsg(form.id ? "Configuração atualizada." : "Configuração salva.");
      resetForm();
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar configuração.");
    } finally {
      setSalvando(false);
    }
  }

  function editarConfiguracao(tpl: MessageTemplate) {
    const theme = themes.find((item) => item.id === (tpl.theme_id || "")) || null;
    setForm({
      id: tpl.id,
      nome: tpl.nome || "",
      titulo: tpl.titulo || "",
      categoria: theme?.categoria || tpl.categoria || "",
      corpo: tpl.corpo || "",
      footerLead: extractSignatureTextConfig(tpl.signature_style).footerLead,
      assinatura: tpl.assinatura || "",
      consultantRole: extractSignatureTextConfig(tpl.signature_style).consultantRole,
      theme_id: tpl.theme_id || "",
      ativo: tpl.ativo,
    });
    setStyleForm(resolveTemplateStyleState(theme, tpl));
    setErro(null);
    setMsg(null);
  }

  function removerConfiguracao(id: string) {
    setConfigDeleteId(id);
  }

  async function confirmarRemoverConfiguracao() {
    const id = String(configDeleteId || "").trim();
    if (!id) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      const { error } = await supabase
        .from("user_message_templates")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      if (form.id === id) resetForm();
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao excluir configuração.");
    } finally {
      setConfigDeleteId(null);
    }
  }

  async function duplicarConfiguracao(tpl: MessageTemplate) {
    try {
      setErro(null);
      setMsg(null);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error("Sessão inválida.");

      const { data: userData } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();

      const theme = themes.find((item) => item.id === (tpl.theme_id || "")) || null;

      const payload = {
        user_id: userId,
        company_id: userData?.company_id || null,
        nome: `${tpl.nome} (cópia)`,
        categoria: theme?.categoria || tpl.categoria || null,
        assunto: tpl.titulo || tpl.nome,
        titulo: tpl.titulo || tpl.nome,
        corpo: tpl.corpo || "",
        assinatura: tpl.assinatura || null,
        template_base_url: null,
        theme_id: tpl.theme_id || null,
        title_style: tpl.title_style || {},
        body_style: tpl.body_style || {},
        signature_style: tpl.signature_style || {},
        ativo: tpl.ativo,
      };

      const { error } = await supabase.from("user_message_templates").insert(payload);
      if (error) throw error;
      setMsg("Configuração duplicada.");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao duplicar configuração.");
    }
  }

  async function carregarBibliotecaPadrao() {
    try {
      setCarregandoPadrao(true);
      setErro(null);
      setMsg(null);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error("Sessão inválida.");

      const { data: userData } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();

      const companyId = userData?.company_id || null;

      const { error: deleteTemplatesError } = await supabase
        .from("user_message_templates")
        .delete()
        .eq("user_id", userId)
        .in("nome", OFFICIAL_CARD_TEMPLATE_DELETE_NAMES);
      if (deleteTemplatesError) throw deleteTemplatesError;

      const { error: deleteThemesError } = await supabase
        .from("user_message_template_themes")
        .delete()
        .eq("user_id", userId)
        .in("nome", OFFICIAL_CARD_THEME_DELETE_NAMES);
      if (deleteThemesError) throw deleteThemesError;

      const officialThemeRows = buildOfficialThemeRows(userId, companyId);
      const { error: insertThemesError } = await supabase.from("user_message_template_themes").insert(officialThemeRows);
      if (insertThemesError) throw insertThemesError;

      const { data: insertedThemes, error: selectThemesError } = await supabase
        .from("user_message_template_themes")
        .select("id, nome")
        .eq("user_id", userId)
        .in("nome", OFFICIAL_CARD_THEME_NAMES);
      if (selectThemesError) throw selectThemesError;

      const themeIdByName = Object.fromEntries(
        (insertedThemes || []).map((theme: any) => [String(theme.nome), String(theme.id)]),
      );
      const officialTemplateRows = buildOfficialTemplateRows(userId, companyId, themeIdByName);
      const { error: insertTemplatesError } = await supabase.from("user_message_templates").insert(officialTemplateRows);
      if (insertTemplatesError) throw insertTemplatesError;

      setMsg(`${officialThemeRows.length} artes e ${officialTemplateRows.length} configurações padrão instaladas.`);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao instalar modelos padrão.");
    } finally {
      setCarregandoPadrao(false);
    }
  }

  if (loadPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Acesso negado.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap">
        <AppCard
          tone="info"
          className="mb-3 parametros-avisos-top-card"
          title="CRM"
          subtitle="Gerencie templates e artes com visao de CRM para WhatsApp e e-mail."
        />
      <AppCard tone="info" className="mb-3">
        <div style={{ marginTop: 10, color: "#334155", fontSize: 14 }}>
          Marcadores úteis na mensagem: <strong>[PRIMEIRO_NOME]</strong> e <strong>[CONSULTOR]</strong>.
        </div>
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Ferramentas avançadas</summary>
          <div style={{ marginTop: 10 }}>
            <small style={{ color: "#475569", display: "block", marginBottom: 8 }}>
              Use isso só para instalar ou reinstalar a biblioteca padrão do sistema. Não é necessário na operação diária.
            </small>
            <AppButton type="button" variant="secondary" onClick={carregarBibliotecaPadrao} disabled={carregandoPadrao}>
              {carregandoPadrao ? "Instalando biblioteca..." : "Instalar modelos padrao vtur"}
            </AppButton>
          </div>
        </details>
      </AppCard>

      {(erro || msg) && (
        <AlertMessage variant={erro ? "error" : "success"}>
          {erro || msg}
        </AlertMessage>
      )}

      <datalist id="aviso-categorias-list">
        {OCASIOES_OFICIAIS.map((categoria) => (
          <option key={categoria} value={categoria} />
        ))}
      </datalist>

      <AppCard tone="config" className="mb-3">
        <h4 style={{ marginBottom: 8 }}>1. Artes / Temas por ocasião</h4>
        <small style={{ color: "#64748b", display: "block", marginBottom: 12 }}>
          A arte sobe praticamente pronta. O sistema só injeta o primeiro nome do cliente no ponto definido para o tema.
        </small>
        <div className="mobile-stack-buttons" style={{ marginBottom: 12 }}>
          <AppButton
            variant="primary"
            type="button"
            onClick={() => setMostrarFormularioTema(true)}
            disabled={salvandoTheme}
          >
            Cadastrar arte
          </AppButton>
          <AppButton
            variant="secondary"
            type="button"
            onClick={() => {
              resetThemeForm();
              setMostrarFormularioTema(true);
            }}
            disabled={salvandoTheme}
          >
            Nova arte
          </AppButton>
        </div>

        {mostrarFormularioTema ? (
          <form onSubmit={salvarTheme}>
            <div className="form-row mobile-stack" style={{ gap: 12, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
              <AppField
                wrapperClassName="form-group"
                label="Nome da arte *"
                value={themeForm.nome}
                onChange={(e) => setThemeForm((prev) => ({ ...prev, nome: e.target.value }))}
                required
              />
              <AppField
                wrapperClassName="form-group"
                label="Categoria/Assunto *"
                list="aviso-categorias-list"
                value={themeForm.categoria}
                onChange={(e) => setThemeForm((prev) => ({ ...prev, categoria: e.target.value }))}
                required
              />
              <AppField
                wrapperClassName="form-group"
                label="Largura (px)"
                type="number"
                value={themeForm.width_px}
                readOnly
                disabled
              />
              <AppField
                wrapperClassName="form-group"
                label="Altura (px)"
                type="number"
                value={themeForm.height_px}
                readOnly
                disabled
              />
            </div>
            <div className="form-row mobile-stack" style={{ gap: 12, gridTemplateColumns: "1fr 2fr 1fr" }}>
              <FileUploadField
                wrapperClassName="form-group"
                label="Arquivo da arte"
                accept="image/*"
                onChange={(e) => void handleThemeFileSelected(e.currentTarget.files?.[0] || null)}
                fileName={themeFile?.name || "Nenhum arquivo escolhido"}
              />
              <AppField
                wrapperClassName="form-group"
                label="URL da arte (opcional)"
                value={themeForm.asset_url}
                onChange={(e) => setThemeForm((prev) => ({ ...prev, asset_url: e.target.value }))}
                placeholder="https://..."
              />
              <AppField
                as="select"
                wrapperClassName="form-group"
                label="Ativo"
                value={themeForm.ativo ? "true" : "false"}
                onChange={(e) => setThemeForm((prev) => ({ ...prev, ativo: e.target.value === "true" }))}
                options={[
                  { value: "true", label: "Sim" },
                  { value: "false", label: "Não" },
                ]}
              />
            </div>
            <div className="mobile-stack-buttons">
              <AppButton variant="primary" type="submit" disabled={salvandoTheme}>
                {salvandoTheme ? "Salvando..." : themeForm.id ? "Salvar arte" : "Cadastrar arte"}
              </AppButton>
              <AppButton variant="secondary" type="button" onClick={resetThemeForm} disabled={salvandoTheme}>
                Nova arte
              </AppButton>
              <AppButton
                variant="secondary"
                type="button"
                onClick={() => setMostrarFormularioTema(false)}
                disabled={salvandoTheme}
              >
                Fechar formulário
              </AppButton>
            </div>
          </form>
        ) : null}

        <div className="form-row mobile-stack" style={{ gap: 12, marginTop: 12, gridTemplateColumns: "1fr auto" }}>
          <AppField
            as="select"
            wrapperClassName="form-group"
            label="Filtrar arte para visualização"
            value={filtroThemeTabelaId}
            onChange={(e) => setFiltroThemeTabelaId(e.target.value)}
            disabled={!mostrarListaArtes}
            options={[
              { value: "", label: "Todas" },
              ...themes.map((theme) => ({ value: theme.id, label: `${theme.categoria} • ${theme.nome}` })),
            ]}
          />
          <div className="form-group" style={{ alignSelf: "end" }}>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setMostrarListaArtes((prev) => !prev)}
            >
              {mostrarListaArtes ? "Ocultar artes salvas" : "Mostrar artes salvas"}
            </AppButton>
          </div>
        </div>

        {mostrarListaArtes ? (
          <div className="table-container overflow-x-auto mt-3">
            <table className="table-default table-header-blue table-mobile-cards min-w-[820px]">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Preview</th>
                  <th>Dimensão</th>
                  <th>Status</th>
                  <th className="th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregandoDados && (
                  <tr>
                    <td colSpan={6}>Carregando artes...</td>
                  </tr>
                )}
                {!carregandoDados && themes.length === 0 && (
                  <tr>
                    <td colSpan={6}>Nenhuma arte cadastrada.</td>
                  </tr>
                )}
                {!carregandoDados && themes.length > 0 && themesTabela.length === 0 && (
                  <tr>
                    <td colSpan={6}>Nenhuma arte encontrada para o filtro selecionado.</td>
                  </tr>
                )}
                {!carregandoDados && themesTabela.map((theme) => {
                  const resolvedThemeAsset = resolveThemeAssetMeta(theme);
                  return (
                    <tr key={theme.id}>
                      <td data-label="Nome">{theme.nome}</td>
                      <td data-label="Categoria">{theme.categoria}</td>
                      <td data-label="Preview">
                        <img
                          src={resolvedThemeAsset.asset_url || theme.asset_url}
                          alt={theme.nome}
                          style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #cbd5e1" }}
                        />
                      </td>
                      <td data-label="Dimensão">
                        {resolvedThemeAsset.width_px || theme.width_px}x{resolvedThemeAsset.height_px || theme.height_px}
                      </td>
                      <td data-label="Status">{theme.ativo ? "Ativo" : "Inativo"}</td>
                      <td className="th-actions" data-label="Ações">
                        <div className="action-buttons vtur-table-actions">
                          <AppButton
                            type="button"
                            variant="ghost"
                            icon="pi pi-pencil"
                            className="vtur-table-action"
                            onClick={() => editarTheme(theme)}
                            title="Editar arte"
                            aria-label="Editar arte"
                          />
                          <AppButton
                            type="button"
                            variant="ghost"
                            icon="pi pi-eye"
                            className="vtur-table-action"
                            onClick={() => window.open(resolvedThemeAsset.asset_url || theme.asset_url, "_blank", "noopener,noreferrer")}
                            title="Visualizar arte"
                            aria-label="Visualizar arte"
                          />
                          <AppButton
                            type="button"
                            variant="danger"
                            icon="pi pi-trash"
                            className="vtur-table-action"
                            onClick={() => void removerTheme(theme.id)}
                            title="Excluir arte"
                            aria-label="Excluir arte"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <small style={{ color: "#64748b", display: "block", marginTop: 8 }}>
            Lista de artes oculta para reduzir poluição visual. Clique em "Mostrar artes salvas" quando precisar consultar.
          </small>
        )}
      </AppCard>

      <AppCard tone="config" className="mb-3">
        <h4 style={{ marginBottom: 8 }}>2. Preview e mensagem de disparo</h4>
        <small style={{ color: "#64748b", display: "block", marginBottom: 12 }}>
          Cada configuração liga uma arte a uma mensagem curta de WhatsApp. Essa configuração é a mesma usada no disparo pelo cadastro do cliente.
        </small>

        <div className="form-row mobile-stack parametros-avisos-saved-config-row" style={{ gap: 12, gridTemplateColumns: "1fr" }}>
          <AppField
            as="select"
            wrapperClassName="form-group"
            label="Configuração salva"
            value={form.id}
            onChange={(e) => {
              const nextId = e.target.value;
              if (!nextId) {
                resetForm();
                return;
              }
              const tpl = templates.find((item) => item.id === nextId);
              if (tpl) editarConfiguracao(tpl);
            }}
            options={[
              { value: "", label: "Nova configuração" },
              ...templates.map((tpl) => ({
                value: tpl.id,
                label: `${tpl.categoria || "Sem ocasião"} • ${tpl.nome}`,
              })),
            ]}
          />
        </div>

        {form.id ? (
          <>
        <div className="form-row mobile-stack parametros-avisos-preview-fields-row" style={{ gap: 12 }}>
          <AppField
            as="select"
            wrapperClassName="form-group"
            label="Cliente para teste"
            value={previewClienteId}
            onChange={(e) => setPreviewClienteId(e.target.value)}
            options={[
              { value: "", label: "Selecione" },
              ...clientesPreview.map((cliente) => ({ value: cliente.id, label: cliente.nome || "Cliente sem nome" })),
            ]}
          />
          <AppField
            wrapperClassName="form-group"
            label="Nome do cliente (manual)"
            value={previewNomeClienteManual}
            onChange={(e) => setPreviewNomeClienteManual(e.target.value)}
            placeholder="Ex.: Maria Fernanda"
          />
          <AppField
            as="select"
            wrapperClassName="form-group"
            label="Arte vinculada *"
            value={form.theme_id}
            onChange={(e) => {
              const themeId = e.target.value;
              const theme = themes.find((item) => item.id === themeId) || null;
              setForm((prev) => ({
                ...prev,
                theme_id: themeId,
                categoria: theme?.categoria || prev.categoria || "",
              }));
              aplicarPadraoVisual(themeId);
            }}
            options={[
              { value: "", label: "Selecione" },
              ...filteredThemesByCategoria.map((theme) => ({ value: theme.id, label: `${theme.categoria} • ${theme.nome}` })),
            ]}
          />
        </div>

        <form onSubmit={salvarConfiguracao}>
          <div className="form-row mobile-stack" style={{ gap: 12, gridTemplateColumns: "2fr 1fr 1fr" }}>
            <AppField
              wrapperClassName="form-group"
              label="Nome interno *"
              value={form.nome}
              onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              required
            />
            <AppField
              wrapperClassName="form-group"
              label="Ocasião *"
              list="aviso-categorias-list"
              value={form.categoria}
              onChange={(e) => {
                const categoria = e.target.value;
                setForm((prev) => {
                  const themeAtual = themes.find((item) => item.id === prev.theme_id) || null;
                  const manterTheme = !themeAtual || categoriasCoincidem(themeAtual.categoria, categoria);
                  return {
                    ...prev,
                    categoria,
                    theme_id: manterTheme ? prev.theme_id : "",
                  };
                });
                if (form.theme_id) {
                  const themeAtual = themes.find((item) => item.id === form.theme_id) || null;
                  if (themeAtual && !categoriasCoincidem(themeAtual.categoria, categoria)) {
                    aplicarPadraoVisual("");
                  }
                }
              }}
              placeholder="Natal, Páscoa, Aniversário..."
              required
            />
            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Ativo"
              value={form.ativo ? "true" : "false"}
              onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.value === "true" }))}
              options={[
                { value: "true", label: "Sim" },
                { value: "false", label: "Não" },
              ]}
            />
          </div>

          <div className="form-row mobile-stack" style={{ gap: 12, gridTemplateColumns: "1fr 1.4fr" }}>
            <AppField
              as="textarea"
              wrapperClassName="form-group"
              label="Título do card *"
              className="form-textarea parametros-avisos-short-textarea"
              rows={3}
              value={form.titulo}
              onChange={(e) => setForm((prev) => ({ ...prev, titulo: e.target.value }))}
              placeholder={"Ex.: Feliz Natal!\nFeliz Ano Novo!"}
              caption="Use `Enter` para quebrar o título exatamente onde quiser."
              required
            />
            <AppField
              as="textarea"
              wrapperClassName="form-group"
              label="Mensagem padrão do WhatsApp *"
              className="form-textarea parametros-avisos-message-textarea"
              rows={8}
              value={form.corpo}
              onChange={(e) => setForm((prev) => ({ ...prev, corpo: e.target.value }))}
              placeholder="Ex.: Olá [PRIMEIRO_NOME], passando para desejar um Feliz Natal..."
              caption="Use `Enter` para controlar manualmente as quebras de linha do card. Sem `Enter`, o sistema continua quebrando automaticamente."
              required
            />
          </div>

          <div className="form-row mobile-stack" style={{ gap: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <AppField
              as="textarea"
              wrapperClassName="form-group"
              label="Linha antes da assinatura"
              className="form-textarea parametros-avisos-short-textarea"
              rows={2}
              value={form.footerLead}
              onChange={(e) => setForm((prev) => ({ ...prev, footerLead: e.target.value }))}
              placeholder={"Ex.: Com carinho\nCom admiração"}
              caption="Também aceita `Enter`. Se ficar vazio, essa linha some do card."
            />
            <AppField
              as="textarea"
              wrapperClassName="form-group"
              label="Consultor / assinatura"
              className="form-textarea parametros-avisos-short-textarea"
              rows={3}
              value={form.assinatura}
              onChange={(e) => setForm((prev) => ({ ...prev, assinatura: e.target.value }))}
              placeholder={nomeUsuario || "Nome do consultor"}
              caption="Pode quebrar em duas linhas com `Enter` se o nome precisar."
            />
            <AppField
              as="textarea"
              wrapperClassName="form-group"
              label="Cargo do consultor"
              className="form-textarea parametros-avisos-short-textarea"
              rows={2}
              value={form.consultantRole}
              onChange={(e) => setForm((prev) => ({ ...prev, consultantRole: e.target.value }))}
              placeholder={"Ex.: Consultor de viagens\nEspecialista em turismo"}
              caption="O layout da arte permanece fixo. Só o texto muda."
            />
          </div>

          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Ajustes visuais do card (clique para exibir)</summary>
            <small style={{ color: "#64748b", display: "block", marginTop: 8 }}>
              Ajuste fonte, cor, tamanho e posição de cada bloco. O preview abaixo reflete as mudanças antes de salvar.
            </small>
            <div className="mobile-stack-buttons" style={{ marginTop: 12 }}>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => aplicarPadraoVisual(form.theme_id)}
                disabled={!form.theme_id}
              >
                Restaurar padrão da arte
              </AppButton>
            </div>
            <div className="parametros-avisos-style-grid" style={{ marginTop: 12 }}>
              {CARD_STYLE_SECTION_ORDER.map((section) => {
                const style = styleForm[section];
                return (
                  <details key={section} className="vtur-surface-panel card-blue parametros-avisos-style-card">
                    <summary className="parametros-avisos-style-card-header parametros-avisos-style-card-summary">
                      <strong>{CARD_STYLE_SECTION_LABELS[section]}</strong>
                      <small style={{ color: "#64748b" }}>{STYLE_SECTION_SAMPLE[section]}</small>
                    </summary>
                    <div className="parametros-avisos-style-card-body">
                      <div className="form-row mobile-stack parametros-avisos-style-row parametros-avisos-style-row-3">
                        <AppField
                          as="select"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Fonte"
                          value={style.fontFamily || ""}
                          onChange={(e) => atualizarStyleSection(section, "fontFamily", e.target.value)}
                          options={CARD_FONT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                        />
                        <AppField
                          as="select"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Peso"
                          value={String(style.fontWeight || "500")}
                          onChange={(e) => atualizarStyleSection(section, "fontWeight", e.target.value)}
                          options={CARD_WEIGHT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                        />
                        <AppField
                          as="select"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Alinhamento"
                          value={style.align || "left"}
                          onChange={(e) => atualizarStyleSection(section, "align", e.target.value)}
                          options={CARD_ALIGN_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                        />
                      </div>
                      <div className="form-row mobile-stack parametros-avisos-style-row parametros-avisos-style-row-4">
                        <AppField
                          type="number"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Tamanho"
                          value={Number(style.fontSize || 0)}
                          onChange={(e) => atualizarStyleSection(section, "fontSize", Number(e.target.value || 0))}
                          min={10}
                          max={180}
                        />
                        <AppField
                          type="number"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="X"
                          value={Number(style.x || 0)}
                          onChange={(e) => atualizarStyleSection(section, "x", Number(e.target.value || 0))}
                          min={0}
                          max={3000}
                        />
                        <AppField
                          type="number"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Y"
                          value={Number(style.y || 0)}
                          onChange={(e) => atualizarStyleSection(section, "y", Number(e.target.value || 0))}
                          min={0}
                          max={3000}
                        />
                        <AppField
                          type="number"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Largura"
                          value={Number(style.maxWidth || style.width || 0)}
                          onChange={(e) => atualizarStyleSection(section, "maxWidth", Number(e.target.value || 0))}
                          min={40}
                          max={3000}
                        />
                      </div>
                      <div className="form-row mobile-stack parametros-avisos-style-row parametros-avisos-style-row-3">
                        <div className="form-group parametros-avisos-style-group">
                          <label className="form-label">Cor</label>
                          <input type="color" className="form-input parametros-avisos-style-color-input" value={normalizeColorInput(style.color)} onChange={(e) => atualizarStyleSection(section, "color", e.target.value)} />
                        </div>
                        <AppField
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Hex"
                          value={String(style.color || "")}
                          onChange={(e) => atualizarStyleSection(section, "color", e.target.value)}
                        />
                        <AppField
                          type="number"
                          step="0.01"
                          wrapperClassName="form-group parametros-avisos-style-group"
                          label="Altura da linha"
                          value={Number(style.lineHeight || 1)}
                          onChange={(e) => atualizarStyleSection(section, "lineHeight", Number(e.target.value || 1))}
                          min={0.7}
                          max={2.5}
                        />
                      </div>
                      <div className="parametros-avisos-style-checkbox-row">
                        <label className="form-checkbox parametros-avisos-style-checkbox">
                          <input type="checkbox" checked={style.italic === true} onChange={(e) => atualizarStyleSection(section, "italic", e.target.checked)} />
                          <span>Itálico</span>
                        </label>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </details>

          <div className="mobile-stack-buttons">
            <AppButton variant="primary" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar configuração"}
            </AppButton>
            <AppButton variant="secondary" type="button" onClick={resetForm} disabled={salvando}>
              Nova configuração
            </AppButton>
            {form.id ? (
              <>
                <AppButton
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    const currentTemplate = templates.find((tpl) => tpl.id === form.id);
                    if (currentTemplate) void duplicarConfiguracao(currentTemplate);
                  }}
                  disabled={salvando}
                >
                  Duplicar
                </AppButton>
                <AppButton variant="secondary" type="button" onClick={() => void removerConfiguracao(form.id)} disabled={salvando}>
                  Excluir
                </AppButton>
              </>
            ) : null}
          </div>
        </form>

        <div className="form-row mobile-stack" style={{ gap: 12, gridTemplateColumns: "2fr 1fr" }}>
          <div className="form-group">
            <label className="form-label">Mensagem pronta</label>
            <pre style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{previewText || "Preencha a mensagem para visualizar o texto final."}</pre>
          </div>
          <div className="form-group">
            <label className="form-label">Contexto do preview</label>
            <div className="vtur-surface-panel card-blue" style={{ padding: 12 }}>
              <div><strong>Cliente:</strong> {previewNomeCliente}</div>
              <div><strong>Arte:</strong> {selectedThemeForForm?.nome || "Selecione uma arte"}</div>
              <div><strong>Ocasião:</strong> {form.categoria || selectedThemeForForm?.categoria || "-"}</div>
            </div>
          </div>
        </div>

        {previewResolvedUrl ? (
          <>
            <img src={previewResolvedUrl} alt="Prévia do cartão" style={{ maxWidth: 320, borderRadius: 12, border: "1px solid #cbd5e1" }} />
            <div className="mobile-stack-buttons" style={{ marginTop: 8 }}>
              <AppButton type="button" variant="secondary" onClick={() => abrirPreviewCartao(previewResolvedUrl)}>
                {previewResolvedMime === "image/png" ? "Abrir PNG" : "Abrir SVG"}
              </AppButton>
              <AppButton type="button" variant="secondary" onClick={baixarPreviewCartao}>
                Baixar cartão
              </AppButton>
              <AppButton type="button" variant="secondary" onClick={() => abrirPreviewCartao(previewThemeSvgUrl)}>
                Abrir SVG original
              </AppButton>
              {previewWhatsappUrl ? (
                <AppButton type="button" variant="secondary" onClick={() => window.open(previewWhatsappUrl, "_blank", "noopener,noreferrer")}>
                  Abrir WhatsApp
                </AppButton>
              ) : (
                <AppButton type="button" variant="secondary" disabled title="Cliente sem WhatsApp/telefone">
                  Abrir WhatsApp
                </AppButton>
              )}
            </div>
            <small style={{ color: "#64748b", display: "block", marginTop: 6 }}>
              {gerandoPreviewPng
                ? "Gerando PNG automaticamente..."
                : previewResolvedSource === "server_png"
                  ? "PNG gerado no servidor."
                  : previewResolvedSource === "browser_png"
                    ? "PNG gerado localmente no navegador (fallback automático)."
                    : "PNG indisponível no runtime atual. Preview mantido em SVG."}
            </small>
          </>
        ) : (
          <small style={{ color: "#64748b" }}>Selecione uma arte e preencha a mensagem para pré-visualizar o cartão final.</small>
        )}
          </>
        ) : (
          <small style={{ color: "#64748b", display: "block", marginTop: 12 }}>
            Os campos de edição e preview ficam fechados por padrão. Selecione uma configuração salva para abrir.
          </small>
        )}
      </AppCard>
      <ConfirmDialog
        open={Boolean(themeDeleteId)}
        title="Excluir arte"
        message="Excluir esta arte?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onConfirm={() => void confirmarRemoverTheme()}
        onCancel={() => setThemeDeleteId(null)}
      />
      <ConfirmDialog
        open={Boolean(configDeleteId)}
        title="Excluir configuração"
        message="Excluir esta configuração?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onConfirm={() => void confirmarRemoverConfiguracao()}
        onCancel={() => setConfigDeleteId(null)}
      />
    </div>
    </AppPrimerProvider>
  );
}

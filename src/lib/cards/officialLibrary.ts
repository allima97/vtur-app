export type CardLibraryThemeRow = {
  categoria: string;
  nome: string;
  storage_path: string;
  asset_url: string;
  width_px: number;
  height_px: number;
  title_style: Record<string, unknown>;
  body_style: Record<string, unknown>;
  signature_style: Record<string, unknown>;
  ativo: boolean;
};

export type CardLibraryTemplateRow = {
  nome: string;
  categoria: string;
  assunto: string;
  titulo: string;
  corpo: string;
  assinatura: string;
  layout_key: string;
  ativo: boolean;
  theme_name: string;
  title_style: Record<string, unknown>;
  body_style: Record<string, unknown>;
  signature_style: Record<string, unknown>;
};

const MASTER_LAYOUT_KEY = "master-card-v1";

const LEGACY_THEME_NAMES = [
  "aniversario_base_clean",
  "natal_base_clean",
  "ano_novo_base_clean",
  "pascoa_base_clean",
  "dia_das_maes_base_clean",
  "dia_dos_pais_base_clean",
  "boas_vindas_base_clean",
  "pos_viagem_base_clean",
  "cliente_vip_base_clean",
  "cliente_inativo_base_clean",
  "aniversario_primeira_compra_base_clean",
  "ferias_base_clean",
] as const;

function buildThemeAssetUrl(themeName: string, assetFileName?: string) {
  return `/assets/cards/themes-master/${assetFileName || `${themeName}.svg`}`;
}

function buildThemeStoragePath(themeName: string, assetFileName?: string) {
  return `assets/cards/themes-master/${assetFileName || `${themeName}.svg`}`;
}

export type ThemeAssetMeta = {
  nome?: string | null;
  asset_url?: string | null;
  width_px?: number | null;
  height_px?: number | null;
};

function themeStyles(params: {
  titleColor: string;
  bodyColor: string;
  signatureColor: string;
  titleFontFamily?: string;
  bodyFontFamily?: string;
}) {
  const titleFontFamily = params.titleFontFamily || "Cormorant Garamond, Georgia, serif";
  const bodyFontFamily = params.bodyFontFamily || "Alegreya Sans, Arial, sans-serif";
  return {
    title_style: {
      color: params.titleColor,
      fontFamily: titleFontFamily,
      fontWeight: 700,
      lineHeight: 1.04,
    },
    body_style: {
      color: params.bodyColor,
      fontFamily: bodyFontFamily,
      fontWeight: 500,
      lineHeight: 1.28,
    },
    signature_style: {
      color: params.signatureColor,
      fontFamily: bodyFontFamily,
      fontWeight: 500,
      lineHeight: 1.1,
      italic: false,
    },
  };
}

function createTheme(params: {
  categoria: string;
  nome: string;
  titleColor: string;
  bodyColor: string;
  signatureColor: string;
  titleFontFamily?: string;
  bodyFontFamily?: string;
  assetFileName?: string;
  widthPx?: number;
  heightPx?: number;
}): CardLibraryThemeRow {
  return {
    categoria: params.categoria,
    nome: params.nome,
    storage_path: buildThemeStoragePath(params.nome, params.assetFileName),
    asset_url: buildThemeAssetUrl(params.nome, params.assetFileName),
    width_px: params.widthPx || 1080,
    height_px: params.heightPx || 1080,
    ativo: true,
    ...themeStyles(params),
  };
}

function createTemplate(params: {
  nome: string;
  categoria: string;
  assunto: string;
  titulo: string;
  corpo: string;
  assinatura?: string;
  theme_name: string;
}) {
  return {
    nome: params.nome,
    categoria: params.categoria,
    assunto: params.assunto,
    titulo: params.titulo,
    corpo: params.corpo,
    assinatura: params.assinatura || "[CONSULTOR]",
    theme_name: params.theme_name,
    layout_key: MASTER_LAYOUT_KEY,
    ativo: true,
    title_style: {},
    body_style: {},
    signature_style: {},
  } satisfies CardLibraryTemplateRow;
}

export const OFFICIAL_CARD_THEMES: CardLibraryThemeRow[] = [
  createTheme({
    categoria: "aniversario",
    nome: "birthday-elegant",
    titleColor: "#173E96",
    bodyColor: "#1D2744",
    signatureColor: "#275A69",
    assetFileName: "birthday-elegant.png",
    widthPx: 1024,
    heightPx: 1024,
  }),
  createTheme({
    categoria: "comemorativa",
    nome: "womens-day-soft",
    titleColor: "#B63D67",
    bodyColor: "#7B2A44",
    signatureColor: "#7A3555",
    titleFontFamily: "Parisienne, cursive",
    assetFileName: "womens-day-soft.png",
    widthPx: 1024,
    heightPx: 1024,
  }),
  createTheme({
    categoria: "comemorativa",
    nome: "mothers-day-floral",
    titleColor: "#B05569",
    bodyColor: "#7B3650",
    signatureColor: "#7A3552",
    titleFontFamily: "Parisienne, cursive",
    assetFileName: "mothers-day-floral.png",
    widthPx: 1024,
    heightPx: 1024,
  }),
  createTheme({
    categoria: "sazonal",
    nome: "christmas-gold",
    titleColor: "#B12B2B",
    bodyColor: "#21472E",
    signatureColor: "#305233",
    assetFileName: "christmas-gold.png",
    widthPx: 1024,
    heightPx: 1024,
  }),
  createTheme({
    categoria: "sazonal",
    nome: "new-year-celebration",
    titleColor: "#2440A1",
    bodyColor: "#28324A",
    signatureColor: "#394B61",
    titleFontFamily: "Cormorant Garamond, Georgia, serif",
    bodyFontFamily: "Alegreya Sans, Arial, sans-serif",
    assetFileName: "new-year-celebration.png",
    widthPx: 1024,
    heightPx: 1024,
  }),
  createTheme({
    categoria: "sazonal",
    nome: "easter-pastel",
    titleColor: "#1A6C58",
    bodyColor: "#37514A",
    signatureColor: "#305A4F",
    titleFontFamily: "Cormorant Garamond, Georgia, serif",
    bodyFontFamily: "Alegreya Sans, Arial, sans-serif",
    assetFileName: "easter-pastel.png",
    widthPx: 1024,
    heightPx: 1024,
  }),
  createTheme({ categoria: "comemorativa", nome: "fathers-day-classic", titleColor: "#163F96", bodyColor: "#253861", signatureColor: "#38507B", titleFontFamily: "Parisienne, cursive" }),
  createTheme({ categoria: "comemorativa", nome: "valentines-romantic", titleColor: "#C04A73", bodyColor: "#7A3250", signatureColor: "#8A4460", titleFontFamily: "Parisienne, cursive" }),
  createTheme({ categoria: "relacionamento", nome: "client-day-premium", titleColor: "#21488B", bodyColor: "#293652", signatureColor: "#415575" }),
  createTheme({ categoria: "fidelizacao", nome: "vip-gold", titleColor: "#8F6120", bodyColor: "#4F402A", signatureColor: "#6B5A3C" }),
  createTheme({ categoria: "fidelizacao", nome: "premium-elegant", titleColor: "#245285", bodyColor: "#2B344D", signatureColor: "#436078" }),
  createTheme({ categoria: "reativacao", nome: "inactive-soft-recovery", titleColor: "#5B6D7A", bodyColor: "#42505A", signatureColor: "#5C6C76" }),
  createTheme({ categoria: "onboarding", nome: "welcome-clean", titleColor: "#1C4AA0", bodyColor: "#283A57", signatureColor: "#345571" }),
  createTheme({ categoria: "relacionamento", nome: "surprise-soft", titleColor: "#A5536E", bodyColor: "#6A4960", signatureColor: "#7D5A71" }),
  createTheme({ categoria: "pos-venda", nome: "post-trip-light", titleColor: "#266E69", bodyColor: "#2A4747", signatureColor: "#35615F" }),
  createTheme({ categoria: "pos-venda", nome: "travel-return-soft", titleColor: "#2D6985", bodyColor: "#314455", signatureColor: "#436173" }),
  createTheme({ categoria: "jornada", nome: "pre-embark-clean", titleColor: "#194C92", bodyColor: "#263A56", signatureColor: "#35506E" }),
  createTheme({ categoria: "jornada", nome: "countdown-travel", titleColor: "#256B8E", bodyColor: "#2E445A", signatureColor: "#3F6079" }),
  createTheme({ categoria: "relacionamento", nome: "anniversary-purchase", titleColor: "#184994", bodyColor: "#283B57", signatureColor: "#36526F" }),
  createTheme({ categoria: "pos-venda", nome: "anniversary-trip", titleColor: "#235D8A", bodyColor: "#2C4057", signatureColor: "#3E6277" }),
  createTheme({ categoria: "oportunidade", nome: "travel-opportunity", titleColor: "#14528D", bodyColor: "#293A55", signatureColor: "#3C5771" }),
  createTheme({ categoria: "campanha", nome: "exclusive-offer", titleColor: "#8E5B1A", bodyColor: "#4E4230", signatureColor: "#655842" }),
  createTheme({ categoria: "fidelizacao", nome: "vip-upgrade", titleColor: "#7D5416", bodyColor: "#4B3D2A", signatureColor: "#63513C" }),
  createTheme({ categoria: "relacionamento", nome: "referral-soft", titleColor: "#4A6C8A", bodyColor: "#445264", signatureColor: "#5A6A7C" }),
  createTheme({ categoria: "utilidade", nome: "document-reminder-clean", titleColor: "#225B89", bodyColor: "#324256", signatureColor: "#466175" }),
  createTheme({ categoria: "campanha", nome: "seasonal-campaign", titleColor: "#25628A", bodyColor: "#31475A", signatureColor: "#446376" }),
  createTheme({ categoria: "oportunidade", nome: "long-holiday", titleColor: "#1C6590", bodyColor: "#2D455A", signatureColor: "#416174" }),
  createTheme({ categoria: "recompra", nome: "repurchase-soft", titleColor: "#5B6A7B", bodyColor: "#46515E", signatureColor: "#5D6976" }),
  createTheme({ categoria: "relacionamento", nome: "special-date-soft", titleColor: "#A3526B", bodyColor: "#634A5D", signatureColor: "#7C6073" }),
];

export const OFFICIAL_CARD_TEMPLATES: CardLibraryTemplateRow[] = [
  createTemplate({ nome: "Aniversário", categoria: "relacionamento", assunto: "Feliz aniversário, [PRIMEIRO_NOME]!", titulo: "Feliz Aniversário!", corpo: "Que seu dia seja incrível!\nDesejo muita saúde, felicidade e momentos inesquecíveis.\n\nQue sua próxima viagem seja ainda mais especial!", theme_name: "birthday-elegant" }),
  createTemplate({ nome: "Dia das Mulheres", categoria: "comemorativa", assunto: "Feliz Dia das Mulheres, [PRIMEIRO_NOME]!", titulo: "Feliz Dia das Mulheres!", corpo: "Desejo que seu dia seja repleto de amor, inspiração e momentos especiais.\n\nVocê merece o melhor!", theme_name: "womens-day-soft" }),
  createTemplate({ nome: "Dia das Mães", categoria: "comemorativa", assunto: "Feliz Dia das Mães, [PRIMEIRO_NOME]!", titulo: "Feliz Dia das Mães!", corpo: "Hoje celebramos o amor, o carinho e os momentos mais especiais da vida.\n\nDesejo um dia lindo para você!", theme_name: "mothers-day-floral" }),
  createTemplate({
    nome: "Feliz Natal",
    categoria: "sazonal",
    assunto: "Feliz Natal, [PRIMEIRO_NOME]!",
    titulo: "Feliz Natal!",
    corpo: "Desejo que seu Natal seja repleto de luz, amor e momentos especiais com quem você ama.\n\nQue a magia desta data traga sonhos realizados e novas jornadas incríveis!",
    theme_name: "christmas-gold",
  }),
  createTemplate({
    nome: "Feliz Ano Novo",
    categoria: "sazonal",
    assunto: "Feliz Ano Novo, [PRIMEIRO_NOME]!",
    titulo: "Feliz Ano Novo!",
    corpo: "Desejo que seu Novo Ano seja repleto de conquistas, saúde e, claro, muitas viagens inesquecíveis.\n\nQue cada dia de 2025 traga novas descobertas e aventuras maravilhosas!",
    theme_name: "new-year-celebration",
  }),
  createTemplate({
    nome: "Feliz Páscoa",
    categoria: "sazonal",
    assunto: "Feliz Páscoa, [PRIMEIRO_NOME]!",
    titulo: "Feliz Páscoa!",
    corpo: "Desejo que sua Páscoa seja repleta de alegria, renovação e momentos inesquecíveis.\n\nQue este tempo de celebração traga paz e novas inspirações para suas próximas aventuras!",
    theme_name: "easter-pastel",
  }),
  createTemplate({ nome: "Dia dos Pais", categoria: "comemorativa", assunto: "Feliz Dia dos Pais, [PRIMEIRO_NOME]!", titulo: "Feliz Dia dos Pais!", corpo: "Hoje celebramos aqueles que inspiram, protegem e deixam marcas especiais.\n\nDesejo um dia incrível para você!", theme_name: "fathers-day-classic" }),
  createTemplate({ nome: "Dia dos Namorados", categoria: "comemorativa", assunto: "Feliz Dia dos Namorados, [PRIMEIRO_NOME]!", titulo: "Feliz Dia dos Namorados!", corpo: "Viajar é ainda melhor quando compartilhamos momentos com quem amamos.\n\nDesejo uma data linda para você!", theme_name: "valentines-romantic" }),
  createTemplate({ nome: "Dia do Cliente", categoria: "relacionamento", assunto: "Feliz Dia do Cliente, [PRIMEIRO_NOME]!", titulo: "Feliz Dia do Cliente!", corpo: "Hoje queremos agradecer pela sua confiança e parceria.\n\nÉ um prazer fazer parte das suas histórias de viagem!", theme_name: "client-day-premium" }),
  createTemplate({ nome: "Cliente VIP", categoria: "fidelizacao", assunto: "Você é cliente VIP, [PRIMEIRO_NOME]!", titulo: "Cliente VIP", corpo: "Você é um cliente muito especial para nós.\n\nObrigado pela sua confiança e por fazer parte da nossa história.", theme_name: "vip-gold" }),
  createTemplate({ nome: "Cliente Premium", categoria: "fidelizacao", assunto: "Atendimento Premium para você, [PRIMEIRO_NOME]!", titulo: "Atendimento Premium para você", corpo: "Você faz parte de um grupo de clientes especiais que valorizamos muito.\n\nConte sempre conosco!", theme_name: "premium-elegant" }),
  createTemplate({ nome: "Cliente Inativo", categoria: "reativacao", assunto: "Sentimos sua falta, [PRIMEIRO_NOME]!", titulo: "Sentimos sua falta", corpo: "Faz um tempo que não planejamos uma viagem juntos.\n\nQuando quiser pensar no próximo destino, estarei por aqui para ajudar.", theme_name: "inactive-soft-recovery" }),
  createTemplate({ nome: "Boas-vindas", categoria: "onboarding", assunto: "Seja bem-vindo, [PRIMEIRO_NOME]!", titulo: "Seja bem-vindo!", corpo: "É um prazer ter você conosco.\n\nEstamos prontos para ajudar a transformar seus planos em viagens inesquecíveis.", theme_name: "welcome-clean" }),
  createTemplate({ nome: "Mensagem Surpresa", categoria: "relacionamento", assunto: "Uma mensagem especial para você, [PRIMEIRO_NOME]!", titulo: "Uma mensagem especial para você", corpo: "Passando para desejar uma ótima semana e lembrar que estou à disposição para sua próxima viagem.", theme_name: "surprise-soft" }),
  createTemplate({ nome: "Pós-viagem / Feedback", categoria: "pos-venda", assunto: "Como foi sua viagem, [PRIMEIRO_NOME]?", titulo: "Como foi sua viagem?", corpo: "Espero que sua viagem tenha sido incrível!\n\nSe quiser compartilhar sua experiência, será um prazer ouvir você.", theme_name: "post-trip-light" }),
  createTemplate({ nome: "Retorno de Viagem", categoria: "pos-venda", assunto: "Bem-vindo de volta, [PRIMEIRO_NOME]!", titulo: "Bem-vindo de volta!", corpo: "Espero que seu retorno tenha sido tranquilo e que a viagem tenha deixado ótimas lembranças.", theme_name: "travel-return-soft" }),
  createTemplate({ nome: "Pré-embarque", categoria: "jornada", assunto: "Sua viagem está chegando, [PRIMEIRO_NOME]!", titulo: "Sua viagem está chegando!", corpo: "Quero desejar um excelente embarque e uma experiência maravilhosa.\n\nConte comigo no que precisar!", theme_name: "pre-embark-clean" }),
  createTemplate({ nome: "Contagem Regressiva", categoria: "jornada", assunto: "Falta pouco, [PRIMEIRO_NOME]!", titulo: "Falta pouco!", corpo: "Está chegando o momento da sua próxima viagem.\n\nQue a expectativa já esteja trazendo aquela sensação boa de viver algo especial!", theme_name: "countdown-travel" }),
  createTemplate({ nome: "Aniversário da Primeira Compra", categoria: "relacionamento", assunto: "Celebrando sua primeira compra conosco, [PRIMEIRO_NOME]!", titulo: "Celebrando sua primeira compra conosco!", corpo: "Hoje celebramos um momento especial: o aniversário da sua primeira compra conosco.\n\nObrigado por confiar no nosso trabalho!", theme_name: "anniversary-purchase" }),
  createTemplate({ nome: "Aniversário da Primeira Viagem", categoria: "pos-venda", assunto: "Um marco especial da sua viagem, [PRIMEIRO_NOME]!", titulo: "Um marco especial da sua viagem", corpo: "Hoje lembramos com carinho da sua primeira viagem conosco.\n\nFoi um prazer fazer parte desse momento especial.", theme_name: "anniversary-trip" }),
  createTemplate({ nome: "Sugestão de Destino", categoria: "oportunidade", assunto: "Tenho uma sugestão para você, [PRIMEIRO_NOME]!", titulo: "Tenho uma sugestão para você", corpo: "Separei uma sugestão de destino que pode combinar muito com você.\n\nSe quiser, posso te mostrar opções e valores.", theme_name: "travel-opportunity" }),
  createTemplate({ nome: "Promoção Exclusiva", categoria: "campanha", assunto: "Oferta especial para você, [PRIMEIRO_NOME]!", titulo: "Oferta especial para você", corpo: "Separei uma condição especial que pode ser perfeita para sua próxima viagem.\n\nSe quiser, te envio os detalhes.", theme_name: "exclusive-offer" }),
  createTemplate({ nome: "Upgrade VIP", categoria: "fidelizacao", assunto: "Uma experiência ainda mais especial, [PRIMEIRO_NOME]!", titulo: "Uma experiência ainda mais especial", corpo: "Quero te apresentar uma possibilidade de upgrade para tornar sua próxima viagem ainda mais completa.", theme_name: "vip-upgrade" }),
  createTemplate({ nome: "Indicação de Cliente", categoria: "relacionamento", assunto: "Indique alguém especial, [PRIMEIRO_NOME]!", titulo: "Indique alguém especial", corpo: "Se você conhece alguém que também ama viajar, será um prazer atender essa indicação com o mesmo cuidado.\n\nObrigado pela confiança!", theme_name: "referral-soft" }),
  createTemplate({ nome: "Lembrete de Passaporte", categoria: "utilidade", assunto: "Lembrete importante, [PRIMEIRO_NOME]", titulo: "Lembrete importante", corpo: "Passando para lembrar de verificar a validade do seu passaporte para futuras viagens.\n\nSe precisar de ajuda, conte comigo.", theme_name: "document-reminder-clean" }),
  createTemplate({ nome: "Lembrete de Visto / Documentação", categoria: "utilidade", assunto: "Atenção à documentação, [PRIMEIRO_NOME]", titulo: "Atenção à documentação", corpo: "Antes da próxima viagem, vale conferir toda a documentação necessária para embarcar com tranquilidade.\n\nSe quiser, posso te orientar.", theme_name: "document-reminder-clean" }),
  createTemplate({ nome: "Campanha Sazonal", categoria: "campanha", assunto: "Hora de planejar sua próxima viagem, [PRIMEIRO_NOME]!", titulo: "Hora de planejar sua próxima viagem", corpo: "Temos uma campanha especial no ar e pode haver uma ótima oportunidade para o seu próximo destino.\n\nSe quiser, te mostro as melhores opções.", theme_name: "seasonal-campaign" }),
  createTemplate({ nome: "Feriado Prolongado", categoria: "oportunidade", assunto: "Feriado chegando, [PRIMEIRO_NOME]!", titulo: "Feriado chegando!", corpo: "Um feriado prolongado pode ser a oportunidade ideal para uma viagem rápida e especial.\n\nSe quiser sugestões, estou à disposição.", theme_name: "long-holiday" }),
  createTemplate({ nome: "Oferta de Recompra", categoria: "recompra", assunto: "Vamos planejar a próxima, [PRIMEIRO_NOME]?", titulo: "Vamos planejar a próxima?", corpo: "Depois de uma boa viagem, sempre nasce a vontade da próxima.\n\nQuando quiser, posso te ajudar a planejar um novo roteiro.", theme_name: "repurchase-soft" }),
  createTemplate({ nome: "Data Especial Personalizada", categoria: "relacionamento", assunto: "Uma data especial para você, [PRIMEIRO_NOME]!", titulo: "Uma data especial", corpo: "Hoje é uma data especial e não poderia deixar de te enviar uma mensagem com carinho.\n\nDesejo momentos felizes e experiências incríveis!", theme_name: "special-date-soft" }),
];

export const OFFICIAL_CARD_THEME_NAMES = OFFICIAL_CARD_THEMES.map((theme) => theme.nome);
export const OFFICIAL_CARD_TEMPLATE_NAMES = OFFICIAL_CARD_TEMPLATES.map((template) => template.nome);
export const OFFICIAL_CARD_THEME_DELETE_NAMES = [...LEGACY_THEME_NAMES, ...OFFICIAL_CARD_THEME_NAMES];
export const OFFICIAL_CARD_TEMPLATE_DELETE_NAMES = OFFICIAL_CARD_TEMPLATE_NAMES;

export function resolveThemeAssetMeta(theme?: ThemeAssetMeta | null) {
  const themeName = String(theme?.nome || "").trim();
  const official = OFFICIAL_CARD_THEMES.find((item) => item.nome === themeName) || null;
  return {
    asset_url: String(official?.asset_url || theme?.asset_url || "").trim(),
    width_px: Number(official?.width_px || theme?.width_px || 0),
    height_px: Number(official?.height_px || theme?.height_px || 0),
  };
}

export function buildOfficialThemeRows(userId: string, companyId: string | null) {
  return OFFICIAL_CARD_THEMES.map((theme) => ({
    user_id: userId,
    company_id: companyId,
    ...theme,
  }));
}

export function buildOfficialTemplateRows(userId: string, companyId: string | null, themeIdByName: Record<string, string>) {
  return OFFICIAL_CARD_TEMPLATES.map((template) => ({
    user_id: userId,
    company_id: companyId,
    nome: template.nome,
    categoria: template.categoria,
    assunto: template.assunto,
    titulo: template.titulo,
    corpo: template.corpo,
    assinatura: template.assinatura,
    theme_id: themeIdByName[template.theme_name] || null,
    ativo: template.ativo,
    title_style: template.title_style,
    body_style: template.body_style,
    signature_style: template.signature_style,
  }));
}

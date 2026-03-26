import { getPrimeiroNome, getSaudacaoPorHora } from "./whatsapp";

export type MessageTemplateVars = {
  nomeCompleto?: string | null;
  assinatura?: string | null;
  consultor?: string | null;
  cargoConsultor?: string | null;
  empresa?: string | null;
  origem?: string | null;
  destino?: string | null;
  dataViagem?: string | null;
  dataEmbarque?: string | null;
  dataRetorno?: string | null;
  cta?: string | null;
  mensagem?: string | null;
};

type RenderTemplateOptions = {
  useFullNameAsFirstName?: boolean;
};

export function renderTemplateText(
  template: string,
  vars: MessageTemplateVars,
  options?: RenderTemplateOptions
) {
  const nomeCompleto = (vars.nomeCompleto || "").trim();
  const primeiroNome = options?.useFullNameAsFirstName
    ? nomeCompleto || "Cliente"
    : getPrimeiroNome(nomeCompleto) || nomeCompleto || "Cliente";
  const assinatura = (vars.assinatura || vars.consultor || "").trim();
  const consultor = assinatura;
  const cargoConsultor = (vars.cargoConsultor || "").trim();
  const saudacao = getSaudacaoPorHora();
  const empresa = (vars.empresa || "").trim();
  const origem = (vars.origem || "").trim();
  const destino = (vars.destino || "").trim();
  const dataViagem = (vars.dataViagem || "").trim();
  const dataEmbarque = (vars.dataEmbarque || "").trim();
  const dataRetorno = (vars.dataRetorno || "").trim();
  const cta = (vars.cta || "").trim();
  const mensagem = (vars.mensagem || "").trim();

  return String(template || "")
    .replace(/\[(nome|nome_completo)\]/gi, nomeCompleto || "Cliente")
    .replace(/\[(primeiro_nome|nome_cliente|primeiro_nome_cliente)\]/gi, primeiroNome)
    .replace(/\[(assinatura|nome_usuario|consultor)\]/gi, consultor)
    .replace(/\[(cargo_consultor)\]/gi, cargoConsultor)
    .replace(/\[(saudacao|saudacao_hora)\]/gi, saudacao)
    .replace(/\[(empresa)\]/gi, empresa)
    .replace(/\[(origem)\]/gi, origem)
    .replace(/\[(destino)\]/gi, destino)
    .replace(/\[(data_viagem)\]/gi, dataViagem)
    .replace(/\[(data_embarque)\]/gi, dataEmbarque)
    .replace(/\[(data_retorno)\]/gi, dataRetorno)
    .replace(/\[(cta)\]/gi, cta)
    .replace(/\[(mensagem)\]/gi, mensagem)
    .replace(/\{\{\s*(cliente_nome|nome|nome_completo)\s*\}\}/gi, nomeCompleto || "Cliente")
    .replace(/\{\{\s*(primeiro_nome|nome_cliente|primeiro_nome_cliente)\s*\}\}/gi, primeiroNome)
    .replace(/\{\{\s*(consultor_nome|consultor|assinatura)\s*\}\}/gi, consultor)
    .replace(/\{\{\s*(cargo_consultor)\s*\}\}/gi, cargoConsultor)
    .replace(/\{\{\s*(saudacao|saudacao_hora)\s*\}\}/gi, saudacao)
    .replace(/\{\{\s*(empresa)\s*\}\}/gi, empresa)
    .replace(/\{\{\s*(origem)\s*\}\}/gi, origem)
    .replace(/\{\{\s*(destino)\s*\}\}/gi, destino)
    .replace(/\{\{\s*(data_viagem)\s*\}\}/gi, dataViagem)
    .replace(/\{\{\s*(data_embarque)\s*\}\}/gi, dataEmbarque)
    .replace(/\{\{\s*(data_retorno)\s*\}\}/gi, dataRetorno)
    .replace(/\{\{\s*(cta)\s*\}\}/gi, cta)
    .replace(/\{\{\s*(mensagem)\s*\}\}/gi, mensagem);
}

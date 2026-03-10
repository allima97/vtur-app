import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { registrarLog } from "../../lib/logs";
import { refreshPermissoes } from "../../lib/permissoesStore";
import { clearPermissoesCache } from "../../lib/permissoesCache";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppDialog from "../ui/primer/AppDialog";
import AppNoticeDialog from "../ui/primer/AppNoticeDialog";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type Perfil = {
  nome_completo: string;
  cpf: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  rg: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  email: string;
  uso_individual: boolean | null;
  company_id?: string | null;
  company?: {
    nome_empresa?: string | null;
    nome_fantasia?: string | null;
    cnpj?: string | null;
    endereco?: string | null;
    telefone?: string | null;
    cidade?: string | null;
    estado?: string | null;
  } | null;
  cargo?: string | null;
  created_by_gestor?: boolean | null;
  must_change_password?: boolean | null;
};

type CampoObrigatorioKey =
  | "nome_completo"
  | "cpf"
  | "data_nascimento"
  | "cep"
  | "numero"
  | "telefone"
  | "cidade"
  | "estado"
  | "uso_individual";

const CAMPOS_OBRIGATORIOS_INFO: Record<CampoObrigatorioKey, { label: string; id: string }> = {
  nome_completo: { label: "Nome completo", id: "perfil-nome-completo" },
  cpf: { label: "CPF", id: "perfil-cpf" },
  data_nascimento: { label: "Data de nascimento", id: "perfil-data-nascimento" },
  cep: { label: "CEP", id: "perfil-cep" },
  numero: { label: "Número", id: "perfil-numero" },
  telefone: { label: "Telefone", id: "perfil-telefone" },
  cidade: { label: "Cidade", id: "perfil-cidade" },
  estado: { label: "Estado", id: "perfil-estado" },
  uso_individual: { label: "Uso do sistema", id: "perfil-uso-individual" },
};

function limparDigitos(valor?: string) {
  return (valor || "").replace(/\D/g, "");
}

function validarCpf(valor?: string) {
  const digitos = limparDigitos(valor);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1+$/.test(digitos)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i += 1) {
    soma += Number(digitos[i]) * (10 - i);
  }
  let resto = soma % 11;
  const digito1 = resto < 2 ? 0 : 11 - resto;
  soma = 0;
  for (let i = 0; i < 10; i += 1) {
    soma += Number(digitos[i]) * (11 - i);
  }
  resto = soma % 11;
  const digito2 = resto < 2 ? 0 : 11 - resto;
  return digito1 === Number(digitos[9]) && digito2 === Number(digitos[10]);
}

function validarData(valor?: string) {
  if (!valor) return false;
  const timestamp = Date.parse(valor);
  return !Number.isNaN(timestamp);
}

function validarCep(valor?: string) {
  const digits = limparDigitos(valor);
  return digits.length === 8;
}

function validarTelefone(valor?: string) {
  const digits = limparDigitos(valor);
  return digits.length >= 10;
}

function validarNumero(valor?: string) {
  return Boolean(valor && valor.trim());
}

function obterCamposObrigatoriosFaltando(perfil: Perfil | null, usoIndividual: boolean | null) {
  if (!perfil) {
    return { keys: [] as CampoObrigatorioKey[], labels: [] as string[] };
  }
  const keys: CampoObrigatorioKey[] = [];
  if (!perfil.nome_completo?.trim()) {
    keys.push("nome_completo");
  }
  if (!validarCpf(perfil.cpf)) {
    keys.push("cpf");
  }
  if (!validarData(perfil.data_nascimento)) {
    keys.push("data_nascimento");
  }
  if (!validarCep(perfil.cep)) {
    keys.push("cep");
  }
  if (!validarNumero(perfil.numero)) {
    keys.push("numero");
  }
  if (!validarTelefone(perfil.telefone)) {
    keys.push("telefone");
  }
  if (!perfil.cidade?.trim()) {
    keys.push("cidade");
  }
  if (!perfil.estado?.trim()) {
    keys.push("estado");
  }
  if (typeof usoIndividual !== "boolean") {
    keys.push("uso_individual");
  }
  return {
    keys,
    labels: keys.map((key) => CAMPOS_OBRIGATORIOS_INFO[key].label),
  };
}

export default function PerfilIsland() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [onboarding, setOnboarding] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [usoIndividual, setUsoIndividual] = useState<boolean | null>(null);
  const [empresaAtual, setEmpresaAtual] = useState<{
    id?: string | null;
    nome_empresa?: string | null;
    nome_fantasia?: string | null;
    cnpj?: string | null;
    endereco?: string | null;
    telefone?: string | null;
    cidade?: string | null;
    estado?: string | null;
  } | null>(null);
  const [camposExtrasOk, setCamposExtrasOk] = useState(true);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [modalOnboardingSucesso, setModalOnboardingSucesso] = useState(false);
  const [modalCamposObrigatorios, setModalCamposObrigatorios] = useState(false);
  const [modalSairOnboarding, setModalSairOnboarding] = useState(false);
  const [camposObrigatorios, setCamposObrigatorios] = useState<CampoObrigatorioKey[]>([]);
  const [forcePasswordRequired, setForcePasswordRequired] = useState(false);
  const [atualizandoPermissoes, setAtualizandoPermissoes] = useState(false);
  const bloqueiaEmpresaTipo = Boolean(perfil?.created_by_gestor);
  const usoBloqueado = bloqueiaEmpresaTipo || (Boolean(perfil?.company_id) && usoIndividual === false);
  const campoPendenteStyle = {
    borderColor: "#ef4444",
    boxShadow: "0 0 0 1px rgba(239,68,68,0.35)",
  } as const;

  function focarCampoPendente(keys: CampoObrigatorioKey[]) {
    if (!keys.length || typeof window === "undefined") return;
    const targetId = CAMPOS_OBRIGATORIOS_INFO[keys[0]]?.id;
    if (!targetId) return;
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof (el as HTMLElement).focus === "function") {
          (el as HTMLElement).focus();
        }
      }
    }, 60);
  }

  function marcarCampoPreenchido(key: CampoObrigatorioKey) {
    setCamposObrigatorios((prev) => prev.filter((item) => item !== key));
  }

  function abrirModalCamposObrigatorios(keys: CampoObrigatorioKey[]) {
    setCamposObrigatorios(keys);
    setModalCamposObrigatorios(true);
    focarCampoPendente(keys);
  }

  const cidadeEstado = useMemo(() => {
    if (!perfil) return "";
    const c = perfil.cidade || "";
    const e = perfil.estado || "";
    return [c, e].filter(Boolean).join(" / ");
  }, [perfil]);

  const camposPendentes = useMemo(
    () => obterCamposObrigatoriosFaltando(perfil, usoIndividual),
    [perfil, usoIndividual]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboardingQuery = params.get("onboarding") === "1";
    const forcePasswordQuery = params.get("force_password") === "1";
    const onboardingPath =
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/perfil/onboarding");
    setOnboarding(onboardingQuery || onboardingPath);
    setForcePasswordRequired(forcePasswordQuery);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!onboarding || camposPendentes.keys.length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [onboarding, camposPendentes.keys.length]);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        setErro(null);

        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) {
          window.location.href = "/auth/login";
          return;
        }

        const colsExtras =
          "nome_completo, cpf, data_nascimento, telefone, whatsapp, rg, cep, endereco, numero, complemento, cidade, estado, email, uso_individual, must_change_password, company_id, created_by_gestor, companies(nome_empresa, nome_fantasia, cnpj, endereco, telefone, cidade, estado), user_types(name)";
        const colsBasicos =
          "nome_completo, cpf, data_nascimento, telefone, cidade, estado, email, uso_individual, must_change_password, company_id, companies(nome_empresa, nome_fantasia, cnpj, endereco, telefone, cidade, estado), user_types(name)";

        let extrasDisponiveis = true;
        let { data, error } = await supabase.from("users").select(colsExtras).eq("id", user.id).maybeSingle();

        if (error && (error as any).code === "PGRST204") {
          // Colunas novas ausentes: refaz consulta sem campos extras
          extrasDisponiveis = false;
          const fallback = await supabase.from("users").select(colsBasicos).eq("id", user.id).maybeSingle();
          data = fallback.data;
          error = fallback.error;
        }

        if (error) throw error;

        setCamposExtrasOk(extrasDisponiveis);
        const emailInicial = (data?.email || user.email || "").toLowerCase();
        setPerfil({
          nome_completo: data?.nome_completo || "",
          cpf: data?.cpf || "",
          data_nascimento: data?.data_nascimento || "",
          telefone: data?.telefone || "",
          whatsapp: extrasDisponiveis ? data?.whatsapp || "" : "",
          rg: extrasDisponiveis ? data?.rg || "" : "",
          cep: extrasDisponiveis ? data?.cep || "" : "",
          endereco: extrasDisponiveis ? data?.endereco || "" : "",
          numero: extrasDisponiveis ? data?.numero || "" : "",
          complemento: extrasDisponiveis ? data?.complemento || "" : "",
          cidade: data?.cidade || "",
          estado: data?.estado || "",
          email: emailInicial,
          uso_individual: data?.uso_individual ?? null,
          company_id: data?.company_id || null,
          company: data?.companies || null,
          cargo: data?.user_types?.name || null,
          created_by_gestor: (data as any)?.created_by_gestor ?? null,
          must_change_password: (data as any)?.must_change_password ?? false,
        });
        setNovoEmail(emailInicial);
        const usoInicial =
          typeof data?.uso_individual === "boolean" ? data.uso_individual : true;
        setUsoIndividual(usoInicial);
        setEmpresaAtual(
          data?.companies
            ? {
                id: data?.company_id || null,
                nome_empresa: data?.companies?.nome_empresa || null,
                nome_fantasia: data?.companies?.nome_fantasia || null,
                cnpj: data?.companies?.cnpj || null,
                endereco: data?.companies?.endereco || null,
                telefone: data?.companies?.telefone || null,
                cidade: data?.companies?.cidade || null,
                estado: data?.companies?.estado || null,
              }
            : null
        );
      } catch (e) {
        console.error(e);
        setErro("Não foi possível carregar seu perfil.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  function atualizarCampo(campo: keyof Perfil, valor: string) {
    setPerfil((prev) => (prev ? { ...prev, [campo]: valor } : prev));
    if (["nome_completo", "telefone", "cidade", "estado"].includes(campo)) {
      marcarCampoPreenchido(campo as CampoObrigatorioKey);
    }
  }

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatTelefone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, "$1-$2");
}

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

  async function salvarPerfil() {
    if (!perfil) return;
    setErro(null);
    setMsg(null);
    setSalvando(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        window.location.href = "/auth/login";
        return;
      }

      const usoFinal = typeof usoIndividual === "boolean" ? usoIndividual : true;
      if (onboarding) {
        const pendentes = obterCamposObrigatoriosFaltando(perfil, usoIndividual);
        if (pendentes.keys.length > 0) {
          setErro("Preencha os campos obrigatórios destacados antes de continuar.");
          abrirModalCamposObrigatorios(pendentes.keys);
          setSalvando(false);
          return;
        }
      }
      const companyId = perfil.company_id ?? null;
      if (onboarding && usoFinal === false && !companyId) {
        setErro("Empresa precisa ser vinculada pelo Master/Admin antes de continuar.");
        setSalvando(false);
        return;
      }

      const nomeNormalizado = titleCaseWithExceptions(perfil.nome_completo || "");
      const emailNormalizado = (perfil.email || user.email || "").trim().toLowerCase();
      const payload: Record<string, any> = {
        id: user.id,
        nome_completo: nomeNormalizado || null,
        cpf: perfil.cpf || null,
        telefone: perfil.telefone || null,
        cidade: perfil.cidade || null,
        estado: perfil.estado || null,
        email: emailNormalizado || null,
        data_nascimento: perfil.data_nascimento || null,
        uso_individual: usoFinal,
        company_id: companyId,
        ...(camposExtrasOk
          ? {
              whatsapp: perfil.whatsapp || null,
              rg: perfil.rg || null,
              cep: perfil.cep || null,
              endereco: perfil.endereco || null,
              numero: perfil.numero || null,
              complemento: perfil.complemento || null,
            }
          : {}),
      };

      const { error: updateError } = await supabase
        .from("users")
        .upsert(payload, { onConflict: "id" });

      if (updateError) throw updateError;

      await registrarLog({
        user_id: user.id,
        acao: "perfil_atualizado",
        modulo: "perfil",
        detalhes: { cidade: perfil.cidade, estado: perfil.estado },
      });

      try {
        const resp = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: user.id,
            email: emailNormalizado || "",
            nome_completo: nomeNormalizado || null,
            uso_individual: usoFinal,
            created_by_gestor: perfil.created_by_gestor ?? false,
            company_id: companyId,
          }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          console.error("Erro ao garantir permissões padrão:", text || resp.statusText);
        } else {
          await refreshPermissoes();
        }
      } catch (validationError) {
        console.error("Erro ao chamar /api/users para permissões:", validationError);
      }

      if (onboarding) {
        try {
          const resp = await fetch("/api/welcome-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          if (!resp.ok && resp.status !== 204) {
            const text = await resp.text();
            console.warn("Falha ao enviar e-mail de boas-vindas:", text || resp.statusText);
          }
        } catch (emailError) {
          console.warn("Erro ao disparar e-mail de boas-vindas:", emailError);
        }
      }

      setCamposObrigatorios([]);
      setModalCamposObrigatorios(false);
      if (onboarding) {
        setModalOnboardingSucesso(true);
      } else {
        setMsg("Dados salvos com sucesso.");
      }
    } catch (e: any) {
      console.error(e);
      setErro("Não foi possível salvar seus dados.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarSairOnboarding() {
    setModalSairOnboarding(false);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Erro ao finalizar sessão:", e);
    }
    clearPermissoesCache();
    window.location.href = "/auth/login";
  }

  async function confirmarLoginNoSistema() {
    try {
      await supabase.auth.signOut();
    } catch {}
    clearPermissoesCache();
    window.location.href = "/auth/login";
  }

  async function alterarSenha() {
    setErro(null);
    setMsg(null);
    if (!novaSenha || novaSenha.length < 6) {
      setErro("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmaSenha) {
      setErro("As senhas não conferem.");
      return;
    }
    try {
      setSalvando(true);
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id || null;
      if (currentUserId) {
        await supabase
          .from("users")
          .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
          .eq("id", currentUserId);
      }
      setMsg("Senha alterada com sucesso.");
      setForcePasswordRequired(false);
      setPerfil((prev) => (prev ? { ...prev, must_change_password: false } : prev));
      setNovaSenha("");
      setConfirmaSenha("");
    } catch (e: any) {
      console.error(e);
      setErro("Não foi possível alterar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarEmail() {
    setErro(null);
    setMsg(null);
    const emailNormalizado = novoEmail.trim().toLowerCase();
    if (!emailNormalizado) {
      setErro("Informe um e-mail válido.");
      return;
    }
    try {
      setSalvando(true);
      const { error } = await supabase.auth.updateUser({ email: emailNormalizado });
      if (error) throw error;
      await supabase
        .from("users")
        .update({ email: emailNormalizado })
        .eq("email", perfil?.email || emailNormalizado);
      setMsg("E-mail atualizado. Confirme o novo e-mail para continuar usando.");
      setPerfil((p) => (p ? { ...p, email: emailNormalizado } : p));
    } catch (e: any) {
      console.error(e);
      setErro("Não foi possível alterar o e-mail.");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizarPermissoesAgora() {
    try {
      setAtualizandoPermissoes(true);
      await refreshPermissoes();
      setMsg("Permissoes atualizadas com sucesso.");
    } catch (e) {
      console.error("Erro ao atualizar permissoes:", e);
      setErro("Nao foi possivel atualizar as permissoes agora.");
    } finally {
      setAtualizandoPermissoes(false);
    }
  }

  // Função precisa estar dentro do componente para acessar o estado corretamente
  async function buscarCepIfNeeded(cepRaw: string) {
    if (!camposExtrasOk) return;
    const digits = (cepRaw || "").replace(/\D/g, "");
    console.log("[CEP] Valor recebido:", cepRaw, "| Somente dígitos:", digits);
    if (digits.length !== 8) {
      setCepStatus(null);
      console.log("[CEP] Menos de 8 dígitos, abortando busca");
      return;
    }
    try {
      setCepStatus("Buscando endereço...");
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { mode: "cors" });
      if (!resp.ok) throw new Error("CEP inválido ou indisponível.");
      const data = await resp.json();
      console.log("[CEP] Resposta ViaCEP:", data);
      if (data.erro) throw new Error("CEP não encontrado.");
      setPerfil((prev) =>
        prev
          ? {
              ...prev,
              cep: formatCep(digits),
              endereco: data.logradouro || "",
              cidade: data.localidade || "",
              estado: data.uf || "",
            }
          : prev
      );
      setCepStatus("Endereço carregado pelo CEP.");
      console.log("[CEP] Perfil atualizado com endereço, cidade e estado do ViaCEP");
    } catch (e: any) {
      console.error("Erro ao buscar CEP:", e);
      setCepStatus("Não foi possível carregar o CEP.");
    }
  }

  if (loading) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap perfil-page">
          <AppCard tone="config">Carregando perfil...</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }
  if (!perfil) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap perfil-page">
          <AppCard tone="config">Perfil não encontrado.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap perfil-page vtur-legacy-module">
      <AppNoticeDialog
        open={modalCamposObrigatorios}
        title="Campos obrigatórios"
        onClose={() => setModalCamposObrigatorios(false)}
        message={
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>Para finalizar o cadastro, preencha os campos abaixo:</p>
            <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 6 }}>
              {camposObrigatorios.map((campo) => (
                <li key={campo}>{CAMPOS_OBRIGATORIOS_INFO[campo].label}</li>
              ))}
            </ul>
          </div>
        }
      />
      <AppDialog
        open={modalOnboardingSucesso}
        title="Dados salvos"
        message="Dados salvos com sucesso. Deseja fazer o login no sistema?"
        confirmLabel="Sim"
        cancelLabel="Não"
        onConfirm={confirmarLoginNoSistema}
        onCancel={() => setModalOnboardingSucesso(false)}
      />
      <AppDialog
        open={modalSairOnboarding}
        title="Preencher depois"
        message="Você poderá voltar ao formulário quando quiser, mas o sistema não permitirá o acesso aos módulos até que o cadastro obrigatório esteja concluído."
        confirmLabel="Confirmar saída"
        cancelLabel="Continuar preenchendo"
        onConfirm={confirmarSairOnboarding}
        onCancel={() => setModalSairOnboarding(false)}
      />

      <AppToolbar
        title="Meu perfil"
        subtitle={onboarding ? "Finalize seu cadastro para liberar o acesso ao sistema." : `Revise seus dados, acesso e vínculo atual${cidadeEstado ? ` • ${cidadeEstado}` : ""}.`}
        tone="info"
        sticky
      />
      {onboarding && (
        <AppCard tone="config">
          <p style={{ margin: 0, marginBottom: 6 }}>
            Complete os dados para finalizar seu primeiro acesso e liberar o acesso aos módulos solicitados.
          </p>
          <p style={{ margin: 0, color: "#475569" }}>
            Caso precise sair, clique em <strong>Preencher depois</strong>. Você precisará entrar novamente para continuar o cadastro.
          </p>
          <div className="mobile-stack-buttons" style={{ marginTop: 10 }}>
            <AppButton type="button" variant="secondary" onClick={() => setModalSairOnboarding(true)}>
              Preencher depois
            </AppButton>
          </div>
        </AppCard>
      )}

      {(forcePasswordRequired || perfil?.must_change_password) && (
        <AlertMessage variant="warning" role="alert">
          Por seguranca, altere sua senha antes de acessar os modulos do sistema.
        </AlertMessage>
      )}

      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
      {msg && <AlertMessage variant="success">{msg}</AlertMessage>}

      <div className="flex flex-col gap-3">
        <AppCard title="Dados pessoais" tone="info" style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
          {!camposExtrasOk && (
            <small style={{ color: "#b91c1c", marginBottom: 8 }}>
              Campos extras indisponíveis. Adicione as colunas novas em "users" no banco para editar CEP/WhatsApp/RG/endereço.
            </small>
          )}
            <div
              className="form-group"
              style={
                camposObrigatorios.includes("uso_individual")
                  ? { border: "1px solid #ef4444", borderRadius: 8, padding: 8 }
                  : undefined
              }
            >
              <label>Uso do sistema</label>
              <div className="flex items-center gap-4" style={{ marginTop: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="uso"
                    checked={usoIndividual !== false}
                    onChange={() => {
                      setUsoIndividual(true);
                      marcarCampoPreenchido("uso_individual");
                    }}
                    disabled={usoBloqueado}
                    id="perfil-uso-individual"
                  />
                  Individual
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="uso"
                    checked={usoIndividual === false}
                    onChange={() => {
                      setUsoIndividual(false);
                      marcarCampoPreenchido("uso_individual");
                    }}
                    disabled={usoBloqueado || !perfil?.company_id}
                  />
                  Corporativo
                </label>
              </div>
            <small>
              {usoBloqueado
                ? "Definido pelo gestor/Admin."
                : "Uso corporativo exige vínculo feito pelo Admin/Master."}
            </small>
            {camposObrigatorios.includes("uso_individual") && (
              <small className="text-xs text-red-600 mt-1 block" role="alert">
                Escolha se o uso será individual ou corporativo.
              </small>
            )}
            </div>
          <div
            className="perfil-grid"
            style={{
              gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.1fr)",
              marginTop: 16,
            }}
          >
            <div className="form-group">
              <label>Nome completo</label>
              <input
                className="form-input"
                value={perfil.nome_completo}
                onChange={(e) => atualizarCampo("nome_completo", e.target.value)}
                onBlur={(e) =>
                  atualizarCampo("nome_completo", titleCaseWithExceptions(e.target.value))
                }
                required
                id="perfil-nome-completo"
                style={camposObrigatorios.includes("nome_completo") ? campoPendenteStyle : undefined}
                aria-invalid={camposObrigatorios.includes("nome_completo") ? "true" : undefined}
              />
              {camposObrigatorios.includes("nome_completo") && (
                <small className="text-xs text-red-600 mt-1 block" role="alert">
                  Informe seu nome completo para continuar.
                </small>
              )}
            </div>
            <div className="form-group">
              <label>CPF</label>
              <input
                className="form-input"
                value={formatCpf(perfil.cpf || "")}
                onChange={(e) => atualizarCampo("cpf", formatCpf(e.target.value))}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="form-group">
              <label>RG</label>
              <input
                className="form-input"
                value={perfil.rg || ""}
                onChange={(e) => atualizarCampo("rg", e.target.value)}
                placeholder="Documento"
                disabled={!camposExtrasOk}
              />
            </div>
            <div className="form-group">
              <label>Data Nascimento</label>
              <input
                className="form-input"
                type="date"
                value={perfil.data_nascimento || ""}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => atualizarCampo("data_nascimento", e.target.value)}
              />
            </div>
          </div>

          <div
            className="perfil-grid"
            style={{
              gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 2fr) minmax(0, 0.7fr) minmax(0, 1fr)",
              marginTop: 12,
            }}
          >
            <div className="form-group">
              <label>CEP</label>
              <input
                className="form-input"
                value={formatCep(perfil.cep || "")}
                onChange={(e) => {
                  const val = formatCep(e.target.value);
                  atualizarCampo("cep", val);
                }}
                onBlur={(e) => {
                  const val = formatCep(e.target.value);
                  if (val.replace(/\D/g, "").length === 8) {
                    buscarCepIfNeeded(val);
                  }
                }}
                placeholder="00000-000"
                disabled={!camposExtrasOk}
              />
              <small style={{ color: cepStatus?.includes("Não foi") ? "#b91c1c" : "#475569" }}>
                {cepStatus || "Preencha para auto-preencher endereço."}
              </small>
            </div>
            <div className="form-group">
              <label>Endereço</label>
              <input
                className="form-input"
                value={perfil.endereco || ""}
                onChange={(e) => atualizarCampo("endereco", e.target.value)}
                placeholder="Rua / Avenida"
                disabled={!camposExtrasOk}
              />
            </div>
            <div className="form-group">
              <label>Número</label>
              <input
                className="form-input"
                value={perfil.numero || ""}
                onChange={(e) => atualizarCampo("numero", e.target.value)}
                placeholder="Nº"
                disabled={!camposExtrasOk}
              />
            </div>
            <div className="form-group">
              <label>Complemento</label>
              <input
                className="form-input"
                value={perfil.complemento || ""}
                onChange={(e) => atualizarCampo("complemento", e.target.value)}
                placeholder="Opcional"
                disabled={!camposExtrasOk}
              />
            </div>
          </div>

          <div
            className="perfil-grid"
            style={{
              gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.6fr)",
              marginTop: 12,
            }}
          >
            <div className="form-group">
              <label>E-mail</label>
              <input
                className="form-input"
                type="email"
                value={perfil.email}
                onChange={(e) => {
                  const emailValue = e.target.value.toLowerCase();
                  atualizarCampo("email", emailValue);
                  setNovoEmail(emailValue);
                }}
                placeholder="seu@email.com"
              />
            </div>
            <div className="form-group">
              <label>Telefone</label>
              <input
                className="form-input"
                value={formatTelefone(perfil.telefone || "")}
                onChange={(e) => atualizarCampo("telefone", formatTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                id="perfil-telefone"
                style={camposObrigatorios.includes("telefone") ? campoPendenteStyle : undefined}
                aria-invalid={camposObrigatorios.includes("telefone") ? "true" : undefined}
              />
              {camposObrigatorios.includes("telefone") && (
                <small className="text-xs text-red-600 mt-1 block" role="alert">
                  Precisamos de um telefone válido para contato.
                </small>
              )}
            </div>
            <div className="form-group">
              <label>WhatsApp</label>
              <input
                className="form-input"
                value={formatTelefone(perfil.whatsapp || "")}
                onChange={(e) => atualizarCampo("whatsapp", formatTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                disabled={!camposExtrasOk}
              />
            </div>
            <div className="form-group">
              <label>Cidade</label>
              <input
                className="form-input"
                value={perfil.cidade || ""}
                onChange={(e) => atualizarCampo("cidade", e.target.value)}
                id="perfil-cidade"
                style={camposObrigatorios.includes("cidade") ? campoPendenteStyle : undefined}
                aria-invalid={camposObrigatorios.includes("cidade") ? "true" : undefined}
              />
              {camposObrigatorios.includes("cidade") && (
                <small className="text-xs text-red-600 mt-1 block" role="alert">
                  Informe a cidade onde atua.
                </small>
              )}
            </div>
            <div className="form-group">
              <label>Estado</label>
              <input
                className="form-input"
                value={perfil.estado || ""}
                maxLength={2}
                onChange={(e) => atualizarCampo("estado", e.target.value.toUpperCase())}
                placeholder="UF"
                id="perfil-estado"
                style={camposObrigatorios.includes("estado") ? campoPendenteStyle : undefined}
                aria-invalid={camposObrigatorios.includes("estado") ? "true" : undefined}
              />
              {camposObrigatorios.includes("estado") && (
                <small className="text-xs text-red-600 mt-1 block" role="alert">
                  Escolha a UF onde atua.
                </small>
              )}
            </div>
          </div>
          <div className="mobile-stack-buttons" style={{ marginTop: 16 }}>
            <AppButton type="button" variant="primary" onClick={salvarPerfil} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar dados"}
            </AppButton>
          </div>
        </AppCard>

        <div className="grid md:grid-cols-2 gap-3">
          <AppCard title="Dados de acesso" tone="config" style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="form-group" style={{ flex: 1 }}>
                <label>E-mail de login</label>
                <input
                  className="form-input"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value.toLowerCase())}
                  type="email"
                />
                <small>Será necessário confirmar o novo e-mail.</small>
              </div>
              <div className="mobile-stack-buttons">
                <AppButton type="button" variant="secondary" onClick={alterarEmail} disabled={salvando}>
                  Atualizar e-mail
                </AppButton>
              </div>
            </div>

            <h4 style={{ marginTop: 6, marginBottom: 4 }}>Alterar senha</h4>
            <div className="form-group" style={{ marginTop: 0 }}>
              <label>Nova senha</label>
              <div className="password-field">
                <input
                  className="form-input"
                  type={mostrarSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <AppButton
                  type="button"
                  variant="ghost"
                  className="password-toggle"
                  onClick={() => setMostrarSenha((prev) => !prev)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={mostrarSenha}
                >
                  <i className={`fa-solid ${mostrarSenha ? "fa-eye-slash" : "fa-eye"}`} />
                </AppButton>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 6 }}>
              <label>Confirmar senha</label>
              <div className="password-field">
                <input
                  className="form-input"
                  type={mostrarConfirmacao ? "text" : "password"}
                  value={confirmaSenha}
                  onChange={(e) => setConfirmaSenha(e.target.value)}
                />
                <AppButton
                  type="button"
                  variant="ghost"
                  className="password-toggle"
                  onClick={() => setMostrarConfirmacao((prev) => !prev)}
                  aria-label={mostrarConfirmacao ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={mostrarConfirmacao}
                >
                  <i className={`fa-solid ${mostrarConfirmacao ? "fa-eye-slash" : "fa-eye"}`} />
                </AppButton>
              </div>
            </div>
            <div className="mobile-stack-buttons" style={{ marginTop: 16 }}>
              <AppButton type="button" variant="primary" onClick={alterarSenha} disabled={salvando}>
                Alterar senha
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={atualizarPermissoesAgora}
                disabled={salvando || atualizandoPermissoes}
              >
                {atualizandoPermissoes ? "Atualizando permissoes..." : "Atualizar permissoes"}
              </AppButton>
            </div>
          </AppCard>

          <AppCard title="Empresa" style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
            {empresaAtual ? (
              <p className="perfil-text-wrap" style={{ marginBottom: 12, lineHeight: 1.5 }}>
                <strong>Empresa:</strong> {empresaAtual.nome_empresa || "-"}<br />
                <strong>Fantasia:</strong> {empresaAtual.nome_fantasia || "-"}<br />
                <strong>CNPJ:</strong> {empresaAtual.cnpj ? formatCnpj(empresaAtual.cnpj) : "-"}<br />
                <strong>Endereço:</strong> {empresaAtual.endereco || "-"}<br />
                <strong>Telefone:</strong> {empresaAtual.telefone || "-"}<br />
                <strong>Cidade/Estado:</strong>{" "}
                {[empresaAtual.cidade, empresaAtual.estado].filter(Boolean).join(" / ") || "-"}<br />
                <strong>Cargo:</strong> {perfil.cargo || "-"}
              </p>
            ) : (
              <p style={{ marginBottom: 12 }}>Nenhuma empresa vinculada.</p>
            )}
            <small style={{ opacity: 0.75, display: "block" }}>
              Vinculação de empresa é feita pelo Admin/Master. Se precisar, contate seu gestor.
            </small>
            {!empresaAtual && usoIndividual === false && (
              <small style={{ opacity: 0.75, marginTop: 6, display: "block" }}>
                Seu acesso corporativo depende do vínculo da empresa.
              </small>
            )}
          </AppCard>
        </div>
      </div>
      </div>
    </AppPrimerProvider>
  );
}

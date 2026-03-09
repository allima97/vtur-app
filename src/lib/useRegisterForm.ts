import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type RegisterUserPayload = {
  id: string;
  email: string | null;
  password?: string;
};

export type UseRegisterFormOptions = {
  onSuccess?: (user: RegisterUserPayload) => Promise<void> | void;
  onExistingEmail?: () => void;
  successMessage?: string;
  autoHide?: boolean;
  resetOnSuccess?: boolean;
  showSuccessMessage?: boolean;
  skipAuthSignUp?: boolean;
};

export function useRegisterForm(options: UseRegisterFormOptions = {}) {
  const {
    onSuccess,
    onExistingEmail,
    successMessage,
    autoHide = true,
    resetOnSuccess = true,
    showSuccessMessage = true,
    skipAuthSignUp = false,
  } = options;

  const [email, setEmailState] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMessage = useCallback(() => {
    setMessage("");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showMessage = useCallback(
    (text: string) => {
      setMessage(text);
      if (autoHide) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setMessage("");
          timeoutRef.current = null;
        }, 6000);
      }
    },
    [autoHide]
  );

  const setEmail = useCallback((value: string) => {
    setEmailState(value.toLowerCase());
  }, []);

  const resetFields = useCallback(() => {
    setEmailState("");
    setPassword("");
    setConfirmPassword("");
    clearMessage();
  }, [clearMessage]);

  function isEmailRateLimitError(err: any) {
    const msg = String(err?.message || err || "").toLowerCase();
    return (
      msg.includes("rate limit") ||
      msg.includes("email rate limit exceeded") ||
      msg.includes("too many requests") ||
      msg.includes("over_email_send_rate_limit")
    );
  }

  const triggerAccessEmailForExistingAccount = useCallback(async (targetEmail: string) => {
    try {
      if (!targetEmail) return;
      const origin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : undefined;
      // 1) Tenta reenviar confirmacao de cadastro.
      // 2) Se nao for possivel, tenta recovery como fallback.
      try {
        await supabase.auth.resend({
          type: "signup",
          email: targetEmail,
          options: {
            emailRedirectTo: origin ? `${origin}/auth/login?type=signup` : undefined,
          },
        });
        return "signup_sent";
      } catch (resendErr: any) {
        if (isEmailRateLimitError(resendErr)) return "rate_limited";
        // ignore and try recovery only for non-rate-limit cases
      }
      try {
        await supabase.auth.resetPasswordForEmail(targetEmail, {
          redirectTo: origin ? `${origin}/auth/reset` : undefined,
        });
        return "recovery_sent";
      } catch (recoveryErr: any) {
        if (isEmailRateLimitError(recoveryErr)) return "rate_limited";
      }
      return "failed";
    } catch (err) {
      if (isEmailRateLimitError(err)) return "rate_limited";
      console.warn("Nao foi possivel disparar e-mails de acesso automaticamente:", err);
      return "failed";
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearMessage();
      setLoading(true);

      const emailClean = email.trim().toLowerCase();
      if (!emailClean || !password) {
        showMessage("Informe e-mail e senha");
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        showMessage("A senha deve conter no minimo 6 caracteres");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        showMessage("As senhas nao conferem");
        setLoading(false);
        return;
      }

      try {
        if (skipAuthSignUp) {
          if (!onSuccess) {
            showMessage("Fluxo de cadastro nao configurado.");
            setLoading(false);
            return;
          }
          await onSuccess({ id: "", email: emailClean, password });
          if (showSuccessMessage) {
            showMessage(successMessage || "Conta criada com sucesso.");
          }
          if (resetOnSuccess) {
            resetFields();
          }
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: emailClean,
          password,
        });

        if (error) {
          console.error("Registro error:", error);
          const lower = error.message.toLowerCase();
          const isExistingEmail =
            lower.includes("already registered") ||
            lower.includes("already exists") ||
            lower.includes("user already registered");
          const isEmailRateLimit = lower.includes("rate limit") && lower.includes("email");
          const customMsg = isExistingEmail
            ? "Este e-mail ja possui autenticacao. Verifique seu e-mail para definir/recuperar a senha."
            : error.message || "Nao foi possivel criar a conta.";

          if (isEmailRateLimit && onSuccess) {
            try {
              await onSuccess({ id: "", email: emailClean, password });
              if (showSuccessMessage) {
                showMessage(successMessage || "Conta criada com sucesso.");
              }
              if (resetOnSuccess) {
                resetFields();
              }
              setLoading(false);
              return;
            } catch (fallbackErr: any) {
              showMessage(fallbackErr?.message || customMsg);
              setLoading(false);
              return;
            }
          }

          showMessage(customMsg);
          if (isExistingEmail) {
            const accessStatus = await triggerAccessEmailForExistingAccount(emailClean);
            if (accessStatus === "rate_limited") {
              showMessage(
                "Conta ja existente detectada, mas o limite de envio de e-mail do Supabase foi atingido. Aguarde alguns minutos e tente novamente."
              );
            }
            onExistingEmail?.();
          }
          setLoading(false);
          return;
        }

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          const duplicateMsg =
            "Este e-mail ja possui autenticacao. Verifique seu e-mail para definir/recuperar a senha.";
          showMessage(duplicateMsg);
          const accessStatus = await triggerAccessEmailForExistingAccount(emailClean);
          if (accessStatus === "rate_limited") {
            showMessage(
              "Conta ja existente detectada, mas o limite de envio de e-mail do Supabase foi atingido. Aguarde alguns minutos e tente novamente."
            );
          }
          onExistingEmail?.();
          setLoading(false);
          return;
        }

        const user = data.user;
        if (!user) {
          showMessage("Nao foi possivel criar a conta.");
          setLoading(false);
          return;
        }

        if (onSuccess) {
          await onSuccess({ id: user.id, email: user.email, password });
        }

        if (showSuccessMessage) {
          showMessage(successMessage || "Conta criada com sucesso.");
        }

        if (resetOnSuccess) {
          resetFields();
        }
      } catch (err: any) {
        showMessage(err?.message || "Falha ao criar conta");
      } finally {
        setLoading(false);
      }
    },
    [
      email,
      password,
      confirmPassword,
      onSuccess,
      onExistingEmail,
      successMessage,
      resetFields,
      resetOnSuccess,
      showMessage,
      clearMessage,
      showSuccessMessage,
      skipAuthSignUp,
      triggerAccessEmailForExistingAccount,
    ]
  );

  return {
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    message,
    handleSubmit,
    resetFields,
    showMessage,
  };
}

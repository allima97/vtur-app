/**
 * Testes para src/lib/apiAuth.ts
 *
 * Cobre: parseCookies (parsing de headers de cookie de forma robusta)
 * O buildAuthClient depende do Supabase e é testado via mocks em outro arquivo.
 */

import { describe, it, expect } from "vitest";
import { parseCookies } from "../lib/apiAuth";

describe("parseCookies", () => {
  it("retorna Map vazio para header sem cookies", () => {
    const req = new Request("https://test.com", { headers: {} });
    const result = parseCookies(req);
    expect(result.size).toBe(0);
  });

  it("extrai um cookie simples", () => {
    const req = new Request("https://test.com", {
      headers: { cookie: "session=abc123" },
    });
    const result = parseCookies(req);
    expect(result.get("session")).toBe("abc123");
  });

  it("extrai múltiplos cookies", () => {
    const req = new Request("https://test.com", {
      headers: { cookie: "a=1; b=2; c=3" },
    });
    const result = parseCookies(req);
    expect(result.get("a")).toBe("1");
    expect(result.get("b")).toBe("2");
    expect(result.get("c")).toBe("3");
  });

  it("lida com valores contendo '=' (ex: tokens Base64)", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.payload.sig==";
    const req = new Request("https://test.com", {
      headers: { cookie: `auth_token=${token}` },
    });
    const result = parseCookies(req);
    expect(result.get("auth_token")).toBe(token);
  });

  it("ignora segmentos malformados (sem nome)", () => {
    const req = new Request("https://test.com", {
      headers: { cookie: "=valor_sem_nome; valid=ok" },
    });
    const result = parseCookies(req);
    expect(result.has("")).toBe(false);
    expect(result.get("valid")).toBe("ok");
  });

  it("lida com espaços extras entre cookies", () => {
    const req = new Request("https://test.com", {
      headers: { cookie: "  x=1  ;  y=2  " },
    });
    const result = parseCookies(req);
    expect(result.get("x")).toBe("1");
    expect(result.get("y")).toBe("2");
  });

  it("lida com cookie vazio (valor em branco)", () => {
    const req = new Request("https://test.com", {
      headers: { cookie: "empty=" },
    });
    const result = parseCookies(req);
    expect(result.get("empty")).toBe("");
  });

  it("preserva nomes de cookies com pontos (ex: sb-xxx-auth-token.0)", () => {
    const req = new Request("https://test.com", {
      headers: { cookie: "sb-abc123-auth-token.0=part1; sb-abc123-auth-token.1=part2" },
    });
    const result = parseCookies(req);
    expect(result.get("sb-abc123-auth-token.0")).toBe("part1");
    expect(result.get("sb-abc123-auth-token.1")).toBe("part2");
  });

  it("retorna Map vazio quando header de cookie está ausente", () => {
    const req = new Request("https://test.com");
    const result = parseCookies(req);
    expect(result.size).toBe(0);
  });
});

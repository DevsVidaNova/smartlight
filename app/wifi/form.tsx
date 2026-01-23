"use client";
import { useState } from "react";
import { CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function WifiForm() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    ssid?: string;
    password?: string;
    submit?: string;
  }>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function validateLocal() {
    const next: typeof errors = {};
    const s = ssid.trim();
    const p = password;
    if (!s) next.ssid = "Informe o SSID";
    else if (s.length > 32) next.ssid = "SSID deve ter até 32 caracteres";
    if (!p) next.password = "Informe a senha";
    else if (p.length < 8)
      next.password = "Senha deve ter pelo menos 8 caracteres";
    else if (p.length > 64) next.password = "Senha deve ter até 64 caracteres";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setErrors({});
    if (!validateLocal()) return;
    setPending(true);
    const res = await fetch("/api/wifi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssid: ssid.trim(), password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrors((prev) => ({
        ...prev,
        submit: data.message || "Erro ao enviar configuração",
      }));
      setPending(false);
      return;
    }
    setMessage("Configuração enviada com sucesso");
    setSsid("");
    setPassword("");
    setPending(false);
  }

  return (
    <CardContent className="space-y-4 pt-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ssid">SSID</Label>
          <Input
            id="ssid"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="Nome da rede"
          />
          {errors.ssid ? (
            <div className="text-sm text-red-500">{errors.ssid}</div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha da rede"
          />
          {errors.password ? (
            <div className="text-sm text-red-500">{errors.password}</div>
          ) : null}
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Enviando..." : "Enviar"}
        </Button>
        {errors.submit ? (
          <div className="text-sm text-red-500">{errors.submit}</div>
        ) : null}
        {message ? (
          <div className="text-sm text-green-600">{message}</div>
        ) : null}
      </form>
    </CardContent>
  );
}

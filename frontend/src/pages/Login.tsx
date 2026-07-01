import { useState } from "react";
import { pb } from "../lib/pb";
import { Button, Card, Field, Input } from "../components/ui";

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await pb.collection("users").authWithPassword(email, password);
      onAuth();
    } catch {
      setError("Credenciais inválidas");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4 dark:bg-neutral-950">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit} className="space-y-5 p-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Finance · CNPJ
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Controle financeiro da empresa. Entre para continuar.
            </p>
          </div>

          <Field label="E-mail">
            <Input
              type="email"
              autoComplete="username"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Senha">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full py-2.5">
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}

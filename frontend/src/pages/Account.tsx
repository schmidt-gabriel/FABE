import { useState } from "react";
import { pb } from "../lib/pb";
import { Button, Card, Field, Input } from "../components/ui";

// Edits the single account (the PocketBase superuser, also the app login).
export default function Account() {
  const record = pb.authStore.record;
  const currentEmail = record?.email ?? "";

  const [email, setEmail] = useState(currentEmail);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    if (!record) return;
    try {
      // Validate the current password (changing the email rotates the token
      // key, so we need it to sign in again right after).
      await pb.collection("_superusers").authWithPassword(record.email, emailPassword);
    } catch {
      setEmailMsg({ ok: false, text: "Senha atual incorreta." });
      return;
    }
    try {
      await pb.collection("_superusers").update(record.id, { email });
      // The old token was invalidated by the email change: sign in again.
      await pb.collection("_superusers").authWithPassword(email, emailPassword);
      setEmailPassword("");
      setEmailMsg({ ok: true, text: "Email atualizado." });
    } catch {
      setEmailMsg({ ok: false, text: "Não foi possível atualizar o email." });
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassMsg(null);
    if (!record) return;
    if (password.length < 10) {
      setPassMsg({ ok: false, text: "A nova senha precisa ter ao menos 10 caracteres." });
      return;
    }
    if (password !== confirm) {
      setPassMsg({ ok: false, text: "As senhas não conferem." });
      return;
    }
    try {
      // Validate the current password before changing it.
      await pb.collection("_superusers").authWithPassword(record.email, oldPassword);
    } catch {
      setPassMsg({ ok: false, text: "Senha atual incorreta." });
      return;
    }
    try {
      await pb
        .collection("_superusers")
        .update(record.id, { password, passwordConfirm: confirm });
      // Changing the password invalidates the token: sign in again silently.
      await pb.collection("_superusers").authWithPassword(record.email, password);
      setOldPassword("");
      setPassword("");
      setConfirm("");
      setPassMsg({ ok: true, text: "Senha alterada." });
    } catch {
      setPassMsg({ ok: false, text: "Não foi possível alterar a senha." });
    }
  }

  const msg = (m: { ok: boolean; text: string } | null) =>
    m && (
      <p className={`text-sm ${m.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>
        {m.text}
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <form onSubmit={saveEmail} className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Email</h2>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Conta única (superusuário): vale para o app e para o admin do PocketBase.
            </p>
          </div>
          <Field label="Email">
            <Input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Senha atual">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </Field>
          {msg(emailMsg)}
          <Button type="submit" disabled={email === currentEmail}>
            Salvar email
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Senha</h2>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Mínimo de 10 caracteres. Você continua logado após a troca.
            </p>
          </div>
          <Field label="Senha atual">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </Field>
          <Field label="Nova senha">
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirmar nova senha">
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {msg(passMsg)}
          <Button type="submit">Alterar senha</Button>
        </form>
      </Card>
    </div>
  );
}

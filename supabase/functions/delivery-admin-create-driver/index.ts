import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

  const { data: membership } = await admin
    .from("team_members")
    .select("role,active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership?.active || !["owner", "admin"].includes(membership.role)) {
    return json({ error: "Acesso restrito a administradores." }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Dados inválidos." }, 400); }
  const action = String(body.action || "create-user");

  if (action === "list-users") {
    const [{ data: drivers = [] }, { data: sellers = [] }] = await Promise.all([
      admin.from("delivery_drivers").select("user_id,full_name,phone,active,created_at").order("full_name"),
      admin.from("delivery_staff").select("user_id,full_name,role,active,created_at").order("full_name"),
    ]);

    const rows = [
      ...drivers.map((x: any) => ({ ...x, role: "entregador" })),
      ...sellers.map((x: any) => ({ ...x, phone: null })),
    ];

    const users = [];
    for (const row of rows) {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      users.push({
        ...row,
        email: data.user?.email || null,
      });
    }
    return json({ users });
  }

  if (action === "toggle-user") {
    const userId = String(body.user_id || "");
    const role = body.role === "vendedor" ? "vendedor" : "entregador";
    const active = body.active === true;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Usuário inválido." }, 400);

    const table = role === "vendedor" ? "delivery_staff" : "delivery_drivers";
    const { error } = await admin.from(table).update({ active }).eq("user_id", userId);
    if (error) return json({ error: "Não foi possível alterar o acesso." }, 400);
    return json({ ok: true });
  }

  if (action === "reset-password") {
    const userId = String(body.user_id || "");
    const password = String(body.password || "");
    if (!/^[0-9a-f-]{36}$/i.test(userId) || password.length < 8 || password.length > 128) {
      return json({ error: "Informe uma senha com pelo menos 8 caracteres." }, 400);
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: "Não foi possível redefinir a senha." }, 400);
    return json({ ok: true });
  }

  const full_name = String(body.full_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim() || null;
  const password = String(body.password || "");
  const role = body.role === "vendedor" ? "vendedor" : "entregador";

  if (full_name.length < 2) return json({ error: "Informe o nome." }, 400);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
  if (password.length < 8) return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (createError || !created.user) {
    const msg = createError?.message?.toLowerCase().includes("registered")
      ? "Já existe um usuário com esse e-mail."
      : (createError?.message || "Não foi possível criar o usuário.");
    return json({ error: msg }, 400);
  }

  if (role === "vendedor") {
    const { error: staffError } = await admin.from("delivery_staff").insert({
      user_id: created.user.id,
      full_name,
      role: "vendedor",
      active: true,
    });
    if (staffError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Não foi possível salvar o vendedor." }, 500);
    }
  } else {
    const { error: driverError } = await admin.from("delivery_drivers").insert({
      user_id: created.user.id,
      full_name,
      phone,
      active: true,
    });
    if (driverError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Não foi possível salvar o entregador." }, 500);
    }
  }

  return json({
    ok: true,
    user: { user_id: created.user.id, full_name, email, phone, role, active: true },
  });
});
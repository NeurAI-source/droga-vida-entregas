import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const L = window.L;
import { config } from './public-config.js';

const app = document.querySelector('#app');
const supabase = config.url && config.key ? createClient(config.url, config.key) : null;
const state = { user: null, profile: null, map: null, markers: new Map(), channel: null, demo: !supabase };

function icon(name) {
  const icons = {
    route: '↗', moto: '🛵', box: '📦', map: '⌖', camera: '📷', keyboard: '⌨',
    users: '👥', clock: '◷', alert: '⚠', check: '✓', logout: '↪', admin: '◆'
  };
  return icons[name] || '•';
}

function shell(content, role='') {
  return `<div class="app-shell ${role}">${content}</div>`;
}

function loginView(message='') {
  app.innerHTML = shell(`
    <main class="login-page">
      <section class="brand-panel">
        <div class="brand-mark">DV</div>
        <div><p class="eyebrow">DROGA VIDA POPULAR</p><h1>Entregas</h1><p class="muted">Rotas, pedidos e operação em tempo real.</p></div>
      </section>
      <section class="login-card">
        <p class="eyebrow">ACESSO RESTRITO</p><h2>Entrar na operação</h2>
        ${message ? `<p class="form-message">${message}</p>` : ''}
        <form id="login-form">
          <label>E-mail<input required type="email" name="email" placeholder="voce@drogavida.com.br"></label>
          <label>Senha<input required type="password" name="password" placeholder="••••••••"></label>
          <button class="primary" type="submit">Entrar</button>
        </form>
        ${state.demo ? `<div class="demo-box"><strong>Modo demonstração</strong><span>Supabase ainda não conectado nesta base.</span><div><button data-demo="admin">Abrir como Admin</button><button data-demo="vendedor">Abrir como Vendedor</button><button data-demo="entregador">Abrir como Entregador</button></div></div>` : ''}
      </section>
    </main>
  `);

  document.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabase) return loginView('Conecte o Supabase ou use o modo demonstração.');
    const fd = new FormData(e.currentTarget);
    const { data, error } = await supabase.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') });
    if (error) return loginView('Não foi possível entrar. Confira seus dados.');
    await loadProfile(data.user);
  });

  document.querySelectorAll('[data-demo]').forEach(btn => btn.addEventListener('click', () => {
    state.profile = { full_name: btn.dataset.demo === 'admin' ? 'Administrador' : (btn.dataset.demo === 'vendedor' ? 'Vendedor' : 'João Entregador'), role: btn.dataset.demo };
    routeByRole();
  }));
}

function roleChoiceView(profiles) {
  app.innerHTML = shell(`
    <main class="role-page">
      <section class="role-card">
        <div class="brand-mark">DV</div>
        <p class="eyebrow">DROGA VIDA ENTREGAS</p>
        <h2>Como você quer entrar?</h2>
        <p class="muted">Este login possui mais de um tipo de acesso.</p>
        <div class="role-options">
          ${profiles.map((profile,index) => {
            const title = profile.role === 'admin' ? 'Administrador' : (profile.role === 'vendedor' ? 'Vendedor' : 'Entregador');
            const detail = profile.role === 'admin'
              ? 'Gerenciar operação, usuários e desempenho.'
              : (profile.role === 'vendedor' ? 'Montar e enviar entregas.' : 'Receber e concluir entregas.');
            return '<button class="role-option" data-role-index="' + index + '"><strong>' + title + '</strong><span>' + detail + '</span></button>';
          }).join('')}
        </div>
        <button class="secondary role-logout" id="role-logout">Sair</button>
      </section>
    </main>
  `);

  document.querySelectorAll('[data-role-index]').forEach(btn => btn.addEventListener('click', () => {
    state.profile = profiles[Number(btn.dataset.roleIndex)];
    routeByRole();
  }));
  document.querySelector('#role-logout').addEventListener('click', logout);
}

async function loadProfile(user) {
  state.user = user;

  const [{ data: staff }, { data: seller }, { data: driver }] = await Promise.all([
    supabase.from('team_members').select('user_id,role,active').eq('user_id',user.id).maybeSingle(),
    supabase.from('delivery_staff').select('user_id,full_name,role,active').eq('user_id',user.id).maybeSingle(),
    supabase.from('delivery_drivers').select('user_id,full_name,active').eq('user_id',user.id).maybeSingle()
  ]);

  const profiles = [];
  if (staff?.active && ['owner','admin'].includes(staff.role)) {
    profiles.push({ id:user.id, full_name:'Administrador', role:'admin', active:true });
  }
  if (seller?.active && seller.role === 'vendedor') {
    profiles.push({ id:seller.user_id, full_name:seller.full_name, role:'vendedor', active:true });
  }
  if (driver?.active) {
    profiles.push({ id:driver.user_id, full_name:driver.full_name, role:'entregador', active:true });
  }

  if (!profiles.length) {
    await supabase.auth.signOut();
    return loginView('Seu acesso ao Droga Vida Entregas não está liberado.');
  }

  if (profiles.length > 1) return roleChoiceView(profiles);
  state.profile = profiles[0];
  routeByRole();
}

async function logout() {
  if (state.channel && supabase) await supabase.removeChannel(state.channel);
  state.channel = null;
  if (supabase && state.user?.id && state.profile?.role === 'entregador') {
    await supabase.from('driver_locations').update({ sharing: false, updated_at: new Date().toISOString() }).eq('driver_id', state.user.id);
  }
  if (supabase) await supabase.auth.signOut();
  state.user = null; state.profile = null;
  if (state.map) { state.map.remove(); state.map = null; }
  state.markers.clear();
  loginView();
}

function topbar(title, subtitle) {
  return `<header class="topbar"><div><p class="eyebrow">DROGA VIDA ENTREGAS</p><h1>${title}</h1><p>${subtitle}</p></div><div class="top-actions"><span class="status-pill"><i></i> Online</span><button class="icon-btn" id="logout" title="Sair">${icon('logout')}</button></div></header>`;
}

function driverView() {
  app.innerHTML = shell(`
    ${topbar('Minha rota', `Olá, ${state.profile?.full_name || 'Entregador'}`)}
    <main class="driver-layout">
      <section class="map-card"><div id="map"></div><div class="map-float"><strong>Rota inteligente</strong><span>Mapa-base pronto para receber trânsito e otimização.</span></div></section>
      <section class="driver-sheet">
        <div class="metrics compact performance-metrics"><article><span>Hoje</span><strong id="driver-today">0</strong><small>concluídas</small></article><article><span>Semana</span><strong id="driver-week">0</strong><small>concluídas</small></article><article><span>Mês</span><strong id="driver-month">0</strong><small>concluídas</small></article></div>
        <div class="delivery-section driver-delivery-section"><div class="section-heading"><div><p class="eyebrow">MINHAS ENTREGAS</p><h2>Pendentes</h2></div><span id="driver-pending-count">0</span></div><div id="driver-deliveries" class="delivery-list"><p class="empty-state">Carregando entregas...</p></div></div>
      </section>
    </main>
  `, 'driver');
  document.querySelector('#logout').addEventListener('click', logout);
  initMap('driver');
  if (!state.demo) loadDriverDashboard();
}


function sellerView() {
  app.innerHTML = shell(`
    ${topbar('Envio de entregas', `Olá, ${state.profile?.full_name || 'Vendedor'}`)}
    <main class="seller-main">
      <section class="seller-hero">
        <div><p class="eyebrow">VENDEDOR</p><h2>Monte a entrega e envie para o entregador</h2><p>Cadastre o cliente, endereço e escolha quem vai levar.</p></div>
        <button class="primary inline" id="seller-new-delivery">+ Nova entrega</button>
      </section>
      <section class="seller-metrics">
        <article><span>Enviadas hoje</span><strong id="seller-total">0</strong></article>
        <article><span>Em aberto</span><strong id="seller-open">0</strong></article>
        <article><span>Concluídas</span><strong id="seller-done">0</strong></article>
      </section>
      <section class="queue-panel seller-queue">
        <div class="panel-title"><div><p class="eyebrow">MEUS ENVIOS</p><h2>Entregas de hoje</h2></div><span id="seller-queue-count">0</span></div>
        <div id="seller-delivery-queue" class="queue-list"><p class="empty-state">Carregando...</p></div>
      </section>
    </main>
  `, 'seller');
  document.querySelector('#logout').addEventListener('click', logout);
  document.querySelector('#seller-new-delivery').addEventListener('click', openNewDeliveryModal);
  if (!state.demo) loadSellerDashboard();
}

function adminView() {
  app.innerHTML = shell(`
    <aside class="sidebar"><div class="side-brand"><div class="brand-mark small">DV</div><div><strong>Entregas</strong><span>Central operacional</span></div></div><nav><button class="active">${icon('map')} Mapa ao vivo</button><button>${icon('box')} Entregas</button><button>${icon('users')} Entregadores</button><button>${icon('clock')} Histórico</button></nav><div class="side-user"><span>${icon('admin')}</span><div><strong>${state.profile?.full_name || 'Administrador'}</strong><small>Administrador</small></div></div></aside>
    <main class="admin-main">
      ${topbar('Operação de hoje', 'Acompanhe entregadores, rotas e pedidos em um só lugar.')}
      <section class="admin-actions"><button class="primary inline" id="new-delivery">+ Nova entrega</button><button class="secondary" id="new-driver">+ Novo usuário</button></section>
      <section class="metrics"><article><span>Entregadores ativos</span><strong id="admin-drivers">0</strong><small>cadastrados</small></article><article><span>Entregas totais</span><strong id="admin-total">0</strong><small>hoje</small></article><article><span>Concluídas</span><strong id="admin-completed">0</strong><small>hoje</small></article><article><span>Aguardando</span><strong id="admin-waiting">0</strong><small>sem conclusão</small></article></section>
      <section class="ops-grid"><div class="map-card admin-map"><div id="map"></div><div class="map-legend"><span><i class="green"></i>Em rota</span><span><i class="yellow"></i>Parado</span><span><i class="gray"></i>Offline</span></div></div><aside class="drivers-panel"><div class="panel-title"><div><p class="eyebrow">DESEMPENHO</p><h2>Entregadores</h2></div><span id="admin-driver-label">0 ativos</span></div><div id="admin-driver-stats"><p class="empty-state">Carregando...</p></div></aside></section>
      <section class="queue-panel"><div class="panel-title"><div><p class="eyebrow">FILA</p><h2>Entregas em aberto</h2></div><span id="queue-count">0</span></div><div id="admin-delivery-queue" class="queue-list"><p class="empty-state">Carregando fila...</p></div></section>
    </main>
  `, 'admin');
  document.querySelector('#logout').addEventListener('click', logout);
  document.querySelector('#new-delivery').addEventListener('click', openNewDeliveryModal);
  document.querySelector('#new-driver').addEventListener('click', openNewDriverModal);
  initMap('admin');
  if (!state.demo) loadAdminDashboard();
}


function openModal(title, bodyHtml) {
  document.querySelector('.modal-backdrop')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = '<section class="modal-card"><div class="modal-head"><div><p class="eyebrow">DROGA VIDA ENTREGAS</p><h2>' + escapeHtml(title) + '</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="modal-body">' + bodyHtml + '</div></section>';
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close-modal]')) wrap.remove(); });
  return wrap;
}

async function openNewDriverModal() {
  const modal = openModal('Novo usuário', '<form id="driver-form" class="stack-form"><label>Tipo de acesso<select name="role"><option value="entregador">Entregador</option><option value="vendedor">Vendedor</option></select></label><label>Nome completo<input name="full_name" required placeholder="Nome completo"></label><label>E-mail de acesso<input name="email" type="email" required placeholder="usuario@exemplo.com"></label><label data-phone-field>Telefone<input name="phone" placeholder="(17) 99999-9999"></label><label>Senha inicial<input name="password" type="password" minlength="8" required placeholder="Mínimo 8 caracteres"></label><button class="primary" type="submit">Criar usuário</button><p class="form-help">O usuário entrará com este e-mail e senha. O perfil define o que ele pode acessar.</p></form>');
  const form = modal.querySelector('#driver-form');
  const roleSelect = form.querySelector('[name="role"]');
  const phoneField = form.querySelector('[data-phone-field]');
  const syncFields = () => { phoneField.style.display = roleSelect.value === 'entregador' ? 'grid' : 'none'; };
  roleSelect.addEventListener('change', syncFields); syncFields();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const role = String(fd.get('role') || 'entregador');
    button.disabled = true; button.textContent = 'Criando...';
    const { data, error } = await supabase.functions.invoke('delivery-admin-create-driver', {
      body: {
        full_name: fd.get('full_name'),
        email: fd.get('email'),
        phone: fd.get('phone'),
        password: fd.get('password'),
        role
      }
    });
    if (error || data?.error) {
      button.disabled = false; button.textContent = 'Criar usuário';
      alert(data?.error || 'Não foi possível criar o usuário.');
      return;
    }
    modal.remove();
    await loadAdminDashboard();
    alert(role === 'vendedor' ? 'Vendedor criado com sucesso.' : 'Entregador criado com sucesso.');
  });
}
async function openNewDeliveryModal() {
  const { data: drivers = [] } = await supabase.from('delivery_drivers').select('user_id,full_name').eq('active',true).order('full_name');
  const options = ['<option value="">Aguardando entregador</option>'].concat(drivers.map(d => '<option value="' + d.user_id + '">' + escapeHtml(d.full_name) + '</option>')).join('');
  const modal = openModal('Nova entrega', '<form id="delivery-form" class="stack-form"><div class="form-grid"><label>Código do pedido<input name="order_code" placeholder="Ex.: 1058"></label><label>Cliente<input name="customer_name" required placeholder="Nome do cliente"></label></div><label>Telefone<input name="customer_phone" placeholder="(17) 99999-9999"></label><label>Endereço completo<input name="address_text" required placeholder="Rua, número, bairro"></label><label>Entregador<select name="driver_id">' + options + '</select></label><label>Observação<textarea name="notes" rows="3" placeholder="Referência, troco, observação..."></textarea></label><button class="primary" type="submit">Adicionar à fila</button></form>');
  const form = modal.querySelector('#delivery-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const driverId = String(fd.get('driver_id') || '') || null;
    button.disabled = true; button.textContent = 'Salvando...';
    const { error } = await supabase.from('deliveries').insert({
      order_code: String(fd.get('order_code') || '').trim() || null,
      customer_name: String(fd.get('customer_name') || '').trim(),
      customer_phone: String(fd.get('customer_phone') || '').trim() || null,
      address_text: String(fd.get('address_text') || '').trim(),
      driver_id: driverId,
      status: driverId ? 'atribuida' : 'aguardando',
      notes: String(fd.get('notes') || '').trim() || null,
      created_by: state.user.id
    });
    if (error) {
      button.disabled = false; button.textContent = 'Adicionar à fila';
      alert('Não foi possível cadastrar a entrega.');
      return;
    }
    modal.remove();
    if (state.profile?.role === 'admin') await loadAdminDashboard();
    else if (state.profile?.role === 'vendedor') await loadSellerDashboard();
  });
}

async function assignDelivery(deliveryId, driverId) {
  const assigned = driverId || null;
  const { error } = await supabase.from('deliveries')
    .update({ driver_id: assigned, status: assigned ? 'atribuida' : 'aguardando' })
    .eq('id', deliveryId);
  if (error) return alert('Não foi possível alterar o entregador.');
  if (state.profile?.role === 'admin') await loadAdminDashboard();
  else if (state.profile?.role === 'vendedor') await loadSellerDashboard();
}


function renderSellerQueue(queue, drivers) {
  const holder = document.querySelector('#seller-delivery-queue');
  const count = document.querySelector('#seller-queue-count');
  if (!holder || !count) return;
  count.textContent = queue.length;
  if (!queue.length) {
    holder.innerHTML = '<div class="empty-state success-empty">Nenhuma entrega enviada hoje ainda.</div>';
    return;
  }
  holder.innerHTML = queue.map(item => {
    const isClosed = ['entregue','cancelada'].includes(item.status);
    const options = ['<option value="">Sem entregador</option>'].concat(drivers.map(d => '<option value="' + d.user_id + '"' + (item.driver_id === d.user_id ? ' selected' : '') + '>' + escapeHtml(d.full_name) + '</option>')).join('');
    const code = item.order_code ? '#' + escapeHtml(item.order_code) : 'Sem código';
    const driverSelect = isClosed
      ? '<span class="closed-status">' + escapeHtml(deliveryStatusLabel(item.status)) + '</span>'
      : '<select class="queue-driver" data-seller-assign="' + item.id + '">' + options + '</select>';
    return '<article class="queue-row"><div class="queue-code"><span>Pedido</span><strong>' + code + '</strong></div><div class="queue-main"><strong>' + escapeHtml(item.customer_name || 'Cliente') + '</strong><span>' + escapeHtml(item.address_text || 'Endereço não informado') + '</span><small>' + escapeHtml(deliveryStatusLabel(item.status)) + '</small></div>' + driverSelect + '</article>';
  }).join('');
  holder.querySelectorAll('[data-seller-assign]').forEach(select => select.addEventListener('change', () => assignDelivery(select.dataset.sellerAssign, select.value)));
}

async function loadSellerDashboard() {
  const dayIso = startOfDay().toISOString();
  const [{ data: drivers = [] }, { data: deliveries = [] }] = await Promise.all([
    supabase.from('delivery_drivers').select('user_id,full_name,active').eq('active',true).order('full_name'),
    supabase.from('deliveries').select('id,order_code,customer_name,address_text,driver_id,status,created_at,completed_at').gte('created_at',dayIso).order('created_at',{ascending:false})
  ]);
  document.querySelector('#seller-total').textContent = deliveries.length;
  document.querySelector('#seller-open').textContent = deliveries.filter(d => !['entregue','cancelada'].includes(d.status)).length;
  document.querySelector('#seller-done').textContent = deliveries.filter(d => d.status === 'entregue').length;
  renderSellerQueue(deliveries,drivers);
  ensureDeliveryRealtime();
}

function renderQueue(queue, drivers) {
  const holder = document.querySelector('#admin-delivery-queue');
  const count = document.querySelector('#queue-count');
  if (!holder || !count) return;
  count.textContent = queue.length;
  if (!queue.length) {
    holder.innerHTML = '<div class="empty-state success-empty">✓ Nenhuma entrega em aberto.</div>';
    return;
  }
  holder.innerHTML = queue.map(item => {
    const options = ['<option value="">Sem entregador</option>'].concat(drivers.map(d => '<option value="' + d.user_id + '"' + (item.driver_id === d.user_id ? ' selected' : '') + '>' + escapeHtml(d.full_name) + '</option>')).join('');
    const code = item.order_code ? '#' + escapeHtml(item.order_code) : 'Sem código';
    return '<article class="queue-row"><div class="queue-code"><span>Pedido</span><strong>' + code + '</strong></div><div class="queue-main"><strong>' + escapeHtml(item.customer_name || 'Cliente') + '</strong><span>' + escapeHtml(item.address_text || 'Endereço não informado') + '</span><small>' + escapeHtml(deliveryStatusLabel(item.status)) + '</small></div><select class="queue-driver" data-assign="' + item.id + '">' + options + '</select></article>';
  }).join('');
  holder.querySelectorAll('[data-assign]').forEach(select => select.addEventListener('change', () => assignDelivery(select.dataset.assign, select.value)));
}

function ensureDeliveryRealtime() {
  if (state.channel || !supabase) return;
  state.channel = supabase.channel('delivery-operations')
    .on('postgres_changes', { event:'*', schema:'public', table:'deliveries' }, () => {
      if (state.profile?.role === 'admin') loadAdminDashboard();
      else if (state.profile?.role === 'vendedor') loadSellerDashboard();
      else if (state.profile?.role === 'entregador') loadDriverDashboard();
    })
    .subscribe();
}

function startOfDay(date = new Date()) {
  const d = new Date(date); d.setHours(0,0,0,0); return d;
}
function startOfWeek(date = new Date()) {
  const d = startOfDay(date); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff); return d;
}
function startOfMonth(date = new Date()) {
  const d = startOfDay(date); d.setDate(1); return d;
}
function countPerformance(rows = []) {
  const day = startOfDay().getTime();
  const week = startOfWeek().getTime();
  const month = startOfMonth().getTime();
  const times = rows.map(r => new Date(r.completed_at).getTime()).filter(Number.isFinite);
  return {
    today: times.filter(t => t >= day).length,
    week: times.filter(t => t >= week).length,
    month: times.filter(t => t >= month).length
  };
}
function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function deliveryStatusLabel(status='') {
  const labels = {
    aguardando: 'Aguardando entregador',
    atribuida: 'Aguardando aceite',
    aceita: 'Aceita',
    em_rota: 'Em rota',
    entregue: 'Entregue',
    nao_entregue: 'Não entregue',
    cancelada: 'Cancelada'
  };
  return labels[status] || String(status).replaceAll('_',' ');
}

async function loadDriverDashboard() {
  const statsIso = new Date(Math.min(startOfWeek().getTime(), startOfMonth().getTime())).toISOString();
  const [{ data: completed = [], error: completedError }, { data: pending = [], error: pendingError }] = await Promise.all([
    supabase.from('deliveries').select('id,completed_at').eq('driver_id', state.user.id).eq('status','entregue').gte('completed_at', statsIso),
    supabase.from('deliveries').select('id,order_code,customer_name,customer_phone,address_text,street,street_number,neighborhood,status,route_position,created_at').eq('driver_id', state.user.id).neq('status','entregue').neq('status','cancelada').order('route_position',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true})
  ]);
  const list = document.querySelector('#driver-deliveries');
  if (completedError || pendingError) { if (list) list.innerHTML = '<p class="empty-state">Não foi possível carregar suas entregas.</p>'; return; }
  const perf = countPerformance(completed);
  document.querySelector('#driver-today').textContent = perf.today;
  document.querySelector('#driver-week').textContent = perf.week;
  document.querySelector('#driver-month').textContent = perf.month;
  document.querySelector('#driver-pending-count').textContent = pending.length;
  if (!list) return;
  if (!pending.length) { list.innerHTML = '<div class="empty-state success-empty">✓ Nenhuma entrega pendente agora.</div>'; return; }
  list.innerHTML = pending.map((delivery,index) => {
    const address = delivery.address_text || [delivery.street,delivery.street_number,delivery.neighborhood].filter(Boolean).join(', ');
    const code = delivery.order_code ? '#' + escapeHtml(delivery.order_code) : 'Sem código';
    const customer = escapeHtml(delivery.customer_name || 'Cliente');
    const action = delivery.status === 'atribuida'
      ? '<button class="accept-delivery" data-accept-delivery="' + delivery.id + '">✓ Aceitar entrega</button>'
      : '<button class="complete-delivery" data-complete-delivery="' + delivery.id + '">✓ Concluir entrega</button>';
    return '<article class="delivery-card"><div class="delivery-order"><span>' + (index === 0 ? 'PRÓXIMA' : 'ENTREGA') + '</span><strong>' + code + '</strong></div><div class="delivery-info"><h3>' + customer + '</h3><p>' + escapeHtml(address || 'Endereço não informado') + '</p><small>Status: ' + escapeHtml(deliveryStatusLabel(delivery.status)) + '</small></div>' + action + '</article>';
  }).join('');
  list.querySelectorAll('[data-accept-delivery]').forEach(btn => btn.addEventListener('click', () => acceptDelivery(btn.dataset.acceptDelivery, btn)));
  list.querySelectorAll('[data-complete-delivery]').forEach(btn => btn.addEventListener('click', () => completeDelivery(btn.dataset.completeDelivery, btn)));
  ensureDeliveryRealtime();
}

async function acceptDelivery(deliveryId, button) {
  if (!deliveryId || !state.user?.id) return;
  button.disabled = true;
  button.textContent = 'Aceitando...';
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('deliveries')
    .update({ status:'aceita', accepted_at:now })
    .eq('id',deliveryId)
    .eq('driver_id',state.user.id)
    .eq('status','atribuida');

  if (error) {
    button.disabled = false;
    button.textContent = '✓ Aceitar entrega';
    alert('Não foi possível aceitar esta entrega.');
    return;
  }

  await supabase.from('delivery_events').insert({
    delivery_id:deliveryId,
    driver_id:state.user.id,
    event_type:'entrega_aceita',
    payload:{ accepted_at:now }
  });

  await loadDriverDashboard();
}

async function completeDelivery(deliveryId, button) {
  if (!deliveryId || !state.user?.id) return;
  if (!confirm('Confirmar que esta entrega foi concluída?')) return;
  button.disabled = true; button.textContent = 'Concluindo...';
  const now = new Date().toISOString();
  const { error } = await supabase.from('deliveries').update({ status:'entregue', completed_at: now }).eq('id', deliveryId).eq('driver_id', state.user.id);
  if (error) { button.disabled = false; button.textContent = '✓ Concluir entrega'; alert('Não foi possível concluir esta entrega.'); return; }
  await supabase.from('delivery_events').insert({ delivery_id: deliveryId, driver_id: state.user.id, event_type: 'entrega_concluida', payload: { completed_at: now } });
  await loadDriverDashboard();
}

async function loadAdminDashboard() {
  const dayIso = startOfDay().toISOString();
  const statsIso = new Date(Math.min(startOfWeek().getTime(), startOfMonth().getTime())).toISOString();
  const [{ data: drivers = [] }, { data: today = [] }, { data: monthCompleted = [] }, { data: queue = [] }] = await Promise.all([
    supabase.from('delivery_drivers').select('user_id,full_name,active').eq('active',true).order('full_name'),
    supabase.from('deliveries').select('id,status,driver_id,created_at,completed_at').gte('created_at',dayIso),
    supabase.from('deliveries').select('driver_id,completed_at').eq('status','entregue').gte('completed_at',statsIso),
    supabase.from('deliveries').select('id,order_code,customer_name,address_text,driver_id,status,created_at').neq('status','entregue').neq('status','cancelada').order('created_at',{ascending:false}).limit(100)
  ]);
  document.querySelector('#admin-drivers').textContent = drivers.length;
  document.querySelector('#admin-total').textContent = today.length;
  document.querySelector('#admin-completed').textContent = today.filter(d => d.status === 'entregue').length;
  document.querySelector('#admin-waiting').textContent = today.filter(d => !['entregue','cancelada'].includes(d.status)).length;
  document.querySelector('#admin-driver-label').textContent = drivers.length + ' ativos';
  const holder = document.querySelector('#admin-driver-stats');
  if (holder) {
    holder.innerHTML = drivers.length
      ? drivers.map(driver => {
          const perf = countPerformance(monthCompleted.filter(d => d.driver_id === driver.user_id));
          return '<article class="driver-row performance-row"><div class="avatar">' + escapeHtml(driver.full_name?.[0] || '?') + '</div><div class="driver-performance"><strong>' + escapeHtml(driver.full_name || 'Entregador') + '</strong><div class="driver-stats"><span><b>' + perf.today + '</b> hoje</span><span><b>' + perf.week + '</b> semana</span><span><b>' + perf.month + '</b> mês</span></div></div><button title="Ver entregador">›</button></article>';
        }).join('')
      : '<p class="empty-state">Nenhum entregador cadastrado ainda.</p>';
  }
  renderQueue(queue, drivers);
  ensureDeliveryRealtime();
}

function driverRow(name, detail, status, ago) {
  return `<article class="driver-row"><div class="avatar">${name[0]}</div><div><strong>${name}</strong><span>${detail}</span><small><i></i>${status} · atualizado há ${ago}</small></div><button>›</button></article>`;
}

function initMap(mode) {
  if (state.map) state.map.remove();
  state.markers.clear();
  const center = [-20.8113, -49.3758];
  state.map = L.map('map', { zoomControl: false }).setView(center, 13);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(state.map);
  if (!state.demo) return;
  const points = mode === 'admin'
    ? [[-20.807,-49.376,'João'],[-20.818,-49.365,'Marcos'],[-20.801,-49.389,'Pedro']]
    : [[-20.8113,-49.3758,'Você'],[-20.804,-49.369,'Próxima entrega']];
  points.forEach(([lat,lng,label], idx) => {
    const marker = L.circleMarker([lat,lng], { radius: idx ? 9 : 11, weight: 4, fillOpacity: 1 }).addTo(state.map);
    marker.bindTooltip(label, { permanent: mode === 'admin', direction: 'top', offset: [0,-10] });
  });
}


function setLiveMarker(id, lat, lng, label, sharing = true) {
  if (!state.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  let marker = state.markers.get(id);
  if (!marker) {
    marker = L.circleMarker([lat,lng], { radius: 10, weight: 4, fillOpacity: 1 }).addTo(state.map);
    state.markers.set(id, marker);
  } else {
    marker.setLatLng([lat,lng]);
  }
  marker.setStyle({ opacity: sharing ? 1 : .45, fillOpacity: sharing ? 1 : .35 });
  marker.bindTooltip(label || 'Entregador', { direction: 'top', offset: [0,-10] });
}

function renderLiveDrivers(drivers, locations) {
  const names = new Map(drivers.map(d => [d.user_id, d.full_name]));
  const panel = document.querySelector('.drivers-panel');
  if (!panel) return;
  const active = locations.filter(l => l.sharing);
  panel.innerHTML = '<div class="panel-title"><div><p class="eyebrow">EQUIPE</p><h2>Entregadores</h2></div><span>' + active.length + ' online</span></div>' +
    (drivers.length ? drivers.map(d => {
      const l = locations.find(x => x.driver_id === d.user_id);
      const online = Boolean(l?.sharing);
      return '<article class="driver-row"><div class="avatar">' + (d.full_name?.[0] || '?') + '</div><div><strong>' + (d.full_name || 'Entregador') + '</strong><span>' + (online ? 'Localização ao vivo' : 'Localização desligada') + '</span><small><i style="background:' + (online ? '#49d17d' : '#7d8a82') + '"></i>' + (l?.updated_at ? new Date(l.updated_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : 'sem posição') + '</small></div><button>›</button></article>';
    }).join('') : '<p style="color:#9fb1a7;font-size:12px;padding:18px 0">Nenhum entregador cadastrado ainda.</p>');
  locations.forEach(l => setLiveMarker(l.driver_id, Number(l.latitude), Number(l.longitude), names.get(l.driver_id) || 'Entregador', l.sharing));
}

async function loadAdminRealtime() {
  const [{ data: drivers = [] }, { data: locations = [] }] = await Promise.all([
    supabase.from('delivery_drivers').select('user_id,full_name,active').eq('active', true).order('full_name'),
    supabase.from('driver_locations').select('driver_id,latitude,longitude,sharing,updated_at')
  ]);
  renderLiveDrivers(drivers, locations);
  if (state.channel) await supabase.removeChannel(state.channel);
  state.channel = supabase.channel('admin-driver-locations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, async () => {
      const { data: fresh = [] } = await supabase.from('driver_locations').select('driver_id,latitude,longitude,sharing,updated_at');
      renderLiveDrivers(drivers, fresh);
    })
    .subscribe();
}

function routeByRole() {
  if (state.profile?.role === 'admin') adminView();
  else if (state.profile?.role === 'vendedor') sellerView();
  else driverView();
}

async function boot() {
  if (!supabase) return loginView();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return loginView();
  await loadProfile(session.user);
}

boot();

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const L = window.L;
import { config } from './public-config.js';

const app = document.querySelector('#app');
const supabase = config.url && config.key ? createClient(config.url, config.key) : null;
const state = { user: null, profile: null, map: null, demo: !supabase };

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
        ${state.demo ? `<div class="demo-box"><strong>Modo demonstração</strong><span>Supabase ainda não conectado nesta base.</span><div><button data-demo="admin">Abrir como Admin</button><button data-demo="entregador">Abrir como Entregador</button></div></div>` : ''}
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
    state.profile = { full_name: btn.dataset.demo === 'admin' ? 'Administrador' : 'João Entregador', role: btn.dataset.demo };
    routeByRole();
  }));
}

async function loadProfile(user) {
  state.user = user;

  const { data: staff } = await supabase
    .from('team_members')
    .select('user_id, role, active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (staff?.active && ['owner', 'admin'].includes(staff.role)) {
    state.profile = { id: user.id, full_name: 'Administrador', role: 'admin', active: true };
    return routeByRole();
  }

  const { data: driver } = await supabase
    .from('delivery_drivers')
    .select('user_id, full_name, active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!driver?.active) {
    await supabase.auth.signOut();
    return loginView('Seu acesso ao Droga Vida Entregas não está liberado.');
  }

  state.profile = { id: driver.user_id, full_name: driver.full_name, role: 'entregador', active: true };
  routeByRole();
}

function logout() {
  if (supabase) supabase.auth.signOut();
  state.user = null; state.profile = null;
  if (state.map) { state.map.remove(); state.map = null; }
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
        <div class="metrics compact"><article><span>Hoje</span><strong>8</strong><small>entregas</small></article><article><span>Concluídas</span><strong>5</strong><small>pedidos</small></article><article><span>Pendentes</span><strong>3</strong><small>na rota</small></article></div>
        <h2>Adicionar entrega</h2>
        <div class="quick-actions"><button>${icon('camera')}<span>Foto</span></button><button>${icon('keyboard')}<span>Manual</span></button><button>${icon('box')}<span>Pedidos</span></button></div>
        <div class="next-stop"><div><p class="eyebrow">PRÓXIMA ENTREGA</p><h3>Pedido #1058</h3><p>Rua exemplo, 885 · São José do Rio Preto</p></div><div class="eta"><strong>8 min</strong><span>3,2 km</span></div></div>
        <button class="primary big">${icon('route')} Iniciar rota</button>
      </section>
    </main>
  `, 'driver');
  document.querySelector('#logout').addEventListener('click', logout);
  initMap('driver');
}

function adminView() {
  app.innerHTML = shell(`
    <aside class="sidebar"><div class="side-brand"><div class="brand-mark small">DV</div><div><strong>Entregas</strong><span>Central operacional</span></div></div><nav><button class="active">${icon('map')} Mapa ao vivo</button><button>${icon('box')} Entregas</button><button>${icon('users')} Entregadores</button><button>${icon('clock')} Histórico</button></nav><div class="side-user"><span>${icon('admin')}</span><div><strong>${state.profile?.full_name || 'Administrador'}</strong><small>Administrador</small></div></div></aside>
    <main class="admin-main">
      ${topbar('Operação de hoje', 'Acompanhe entregadores, rotas e pedidos em um só lugar.')}
      <section class="metrics"><article><span>Entregadores online</span><strong>3</strong><small>de 3 ativos</small></article><article><span>Entregas totais</span><strong>24</strong><small>hoje</small></article><article><span>Concluídas</span><strong>16</strong><small>67% do dia</small></article><article><span>Aguardando</span><strong>2</strong><small>sem entregador</small></article></section>
      <section class="ops-grid"><div class="map-card admin-map"><div id="map"></div><div class="map-legend"><span><i class="green"></i>Em rota</span><span><i class="yellow"></i>Parado</span><span><i class="gray"></i>Offline</span></div></div><aside class="drivers-panel"><div class="panel-title"><div><p class="eyebrow">EQUIPE</p><h2>Entregadores</h2></div><span>3 online</span></div>${driverRow('João','Pedido #1284','Em rota','8 s')}${driverRow('Marcos','Pedido #1291','Em rota','12 s')}${driverRow('Pedro','Aguardando pedido','Parado','25 s')}</aside></section>
    </main>
  `, 'admin');
  document.querySelector('#logout').addEventListener('click', logout);
  initMap('admin');
}

function driverRow(name, detail, status, ago) {
  return `<article class="driver-row"><div class="avatar">${name[0]}</div><div><strong>${name}</strong><span>${detail}</span><small><i></i>${status} · atualizado há ${ago}</small></div><button>›</button></article>`;
}

function initMap(mode) {
  if (state.map) state.map.remove();
  const center = [-20.8113, -49.3758];
  state.map = L.map('map', { zoomControl: false }).setView(center, 13);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(state.map);
  const points = mode === 'admin'
    ? [[-20.807,-49.376,'João'],[-20.818,-49.365,'Marcos'],[-20.801,-49.389,'Pedro']]
    : [[-20.8113,-49.3758,'Você'],[-20.804,-49.369,'Próxima entrega']];
  points.forEach(([lat,lng,label], idx) => {
    const marker = L.circleMarker([lat,lng], { radius: idx ? 9 : 11, weight: 4, fillOpacity: 1 }).addTo(state.map);
    marker.bindTooltip(label, { permanent: mode === 'admin', direction: 'top', offset: [0,-10] });
  });
}

function routeByRole() {
  if (state.profile?.role === 'admin') adminView(); else driverView();
}

async function boot() {
  if (!supabase) return loginView();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return loginView();
  await loadProfile(session.user);
}

boot();

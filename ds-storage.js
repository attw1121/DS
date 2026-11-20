(function (root) {
  'use strict';
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) || location.protocol === 'file:';
  let clientPromise;
  async function client() {
    if (!root.DSCloudConfig?.publishableKey) throw new Error('雲端資料庫尚未完成設定。');
    if (!clientPromise) clientPromise = import('https://esm.sh/@supabase/supabase-js@2.119.2').then(({createClient}) =>
      createClient(root.DSCloudConfig.url, root.DSCloudConfig.publishableKey, {
        auth: {persistSession: false, detectSessionInUrl: false, autoRefreshToken: true}
      })).catch(error => { clientPromise = undefined; throw error; });
    return clientPromise;
  }
  function checked(result) {
    if (result.error) {
      const error = new Error(result.error.message);
      if (result.error.code === '23505') error.name = 'ConstraintError';
      throw error;
    }
    return result.data;
  }
  async function authorized() {
    const db = await client();
    const {data, error} = await db.auth.getUser();
    if (error || !data.user) throw new Error('請先登入個人帳號，再讀寫雲端資料。');
    const owner = checked(await db.from('ds_owner').select('user_id').eq('user_id', data.user.id).maybeSingle());
    if (!owner) throw new Error('此帳號沒有網站資料的存取權限。');
    return {db, user: data.user};
  }
  async function allRows(query) {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const page = checked(await query.range(start, start + 499));
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  async function request(resource, endpoint = '', options = {}) {
    if (local) {
      const response = await fetch('/api/' + resource + endpoint, {...options, headers: {'Content-Type': 'application/json'}});
      if (!response.ok) {
        const error = new Error('本機資料庫讀寫失敗，請確認 start-projects.cmd 已啟動。');
        if (response.status === 409) error.name = 'ConstraintError';
        throw error;
      }
      return response.json();
    }
    const {db, user} = await authorized();
    const method = options.method || 'GET';
    if (resource === 'projects') {
      if (method === 'GET' && !endpoint) {
        return (await allRows(db.from('ds_projects').select('id,name,saved_at').order('id')))
          .map(row => ({id: row.id, name: row.name, savedAt: row.saved_at}));
      }
      if (method === 'GET' && /^\/\d+$/.test(endpoint)) {
        const row = checked(await db.from('ds_projects').select('id,name,saved_at,payload').eq('id', endpoint.slice(1)).single());
        return {...row.payload, id: row.id, name: row.name, savedAt: row.saved_at};
      }
      if (method === 'POST') {
        const payload = JSON.parse(options.body);
        return checked(await db.from('ds_projects').insert({owner_id: user.id, name: payload.name, payload}).select('id').single());
      }
    }
    if (resource === 'materials') {
      if (method === 'GET') return allRows(db.from('ds_materials').select('code,kind,size,rise,weight,spec').order('code'));
      if (method === 'POST' || method === 'PUT') {
        checked(await db.rpc('ds_save_materials', {parts: JSON.parse(options.body).parts, adding: method === 'POST'}));
        return {ok: true};
      }
    }
    throw new Error('不支援的資料操作。');
  }
  root.DSStorage = {local, request};
  if (local) return;
  const panel = document.getElementById('cloud-account');
  panel.hidden = false;
  const login = document.getElementById('cloud-login');
  const logout = document.getElementById('cloud-logout');
  const status = document.getElementById('cloud-account-status');
  login.addEventListener('submit', async event => {
    event.preventDefault();
    const button = login.querySelector('button');
    button.disabled = true;
    status.textContent = '登入中…';
    try {
      const db = await client();
      checked(await db.auth.signInWithPassword({email: login.elements.email.value.trim(), password: login.elements.password.value}));
      await authorized();
      login.hidden = true;
      logout.hidden = false;
      status.textContent = '已登入，專案與桿件資料僅供本人存取。';
      root.dispatchEvent(new Event('ds-auth-change'));
    } catch {
      if (clientPromise) { try { await (await clientPromise).auth.signOut({scope: 'local'}); } catch {} }
      status.textContent = '登入失敗。請確認帳號、密碼及網站存取權限。';
    } finally { login.elements.password.value = ''; button.disabled = false; }
  });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try { await (await client()).auth.signOut({scope: 'local'}); } finally { location.reload(); }
  });
})(globalThis);

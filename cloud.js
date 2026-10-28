(function () {
  "use strict";
  const config = window.YINGJI_CLOUD_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey && window.supabase);
  const client = configured ? window.supabase.createClient(config.url, config.anonKey) : null;
  let currentUser = null, saveTimer = null, initialized = false;

  function ensureStyles() {
    if (document.getElementById("cloudStyles")) return;
    const style = document.createElement("style");
    style.id = "cloudStyles";
    style.textContent = `.cloud-login{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:linear-gradient(145deg,#efe9df,#f8f5ef)}.cloud-login-card{width:min(420px,100%);padding:34px;border:1px solid #ded7cc;border-radius:18px;background:#fffdf9;box-shadow:0 28px 80px rgba(56,44,31,.18)}.cloud-login-mark{width:48px;height:48px;display:grid;place-items:center;border-radius:12px;color:#fff;background:#b65339;font:600 21px Georgia}.cloud-login-kicker{margin:18px 0 7px;color:#b65339;font-size:10px;font-weight:800;letter-spacing:.16em}.cloud-login h1{margin:0;font:550 28px Georgia,"Songti SC",serif}.cloud-login-copy{margin:10px 0 0;color:#777970;font-size:12px;line-height:1.7}.cloud-login form{display:grid;gap:13px;margin-top:23px}.cloud-login label{font-size:11px;font-weight:700}.cloud-login input{box-sizing:border-box;width:100%;height:44px;margin-top:6px;padding:0 12px;border:1px solid #ddd8ce;border-radius:8px;outline:none}.cloud-login input:focus{border-color:#b65339;box-shadow:0 0 0 3px rgba(182,83,57,.1)}.cloud-login button{min-height:43px;border:0;border-radius:8px;color:#fff;background:#b65339;font-weight:750;cursor:pointer}.cloud-login button.secondary{color:#98432f;background:#f3e3dc}.cloud-login button.text{min-height:auto;color:#777970;background:none;font-size:11px}.cloud-login small{display:block;margin-top:15px;color:#8b8a82;font-size:9px}.cloud-message{margin-top:16px;padding:10px 12px;border-radius:8px;color:#805321;background:#fff0dc;font-size:11px;line-height:1.5}.cloud-status.synced{color:#34725b;border-color:#b8d2c5;background:#e8f2ec}.cloud-status.saving{color:#9a7429}.cloud-status.error{color:#b65339}`;
    document.head.appendChild(style);
  }

  function translateError(message) {
    const text = String(message || "");
    if (/Invalid login credentials/i.test(text)) return "邮箱或密码不正确。";
    if (/Email not confirmed/i.test(text)) return "邮箱还未确认，请打开验证邮件并点击确认链接。";
    if (/User already registered/i.test(text)) return "这个邮箱已经注册，请直接登录。";
    if (/Password should be at least/i.test(text)) return "密码至少需要 6 位。";
    if (/rate limit/i.test(text)) return "操作过于频繁，请稍后再试。";
    return text || "操作失败，请稍后重试。";
  }

  function loginMarkup(message = "") {
    return `<div class="cloud-login" id="cloudLogin"><div class="cloud-login-card">
      <div class="cloud-login-mark">盈</div><p class="cloud-login-kicker">盈记云同步</p>
      <h1>登录后在电脑和手机使用同一份数据</h1><p class="cloud-login-copy">买入、卖出、分类、配对和统计分析都会保存到你的个人云空间。</p>
      ${message ? `<div class="cloud-message">${message}</div>` : ""}
      <form id="cloudLoginForm"><label>邮箱<input type="email" name="email" autocomplete="email" required placeholder="请输入邮箱"></label>
      <label>密码<input type="password" name="password" autocomplete="current-password" minlength="6" required placeholder="至少 6 位"></label>
      <button type="submit" name="action" value="login">登录</button>
      <button type="submit" name="action" value="signup" class="secondary">首次使用，注册账号</button>
      <button type="button" class="text" id="cloudLocalMode">暂时使用本机数据</button></form>
      <small>请勿在聊天中发送登录密码。每个账号只能读取自己的盈记数据。</small></div></div>`;
  }

  function showLogin(message) {
    ensureStyles(); document.getElementById("cloudLogin")?.remove(); document.body.insertAdjacentHTML("beforeend", loginMarkup(message));
    document.getElementById("cloudLocalMode").addEventListener("click", () => document.getElementById("cloudLogin")?.remove());
    document.getElementById("cloudLoginForm").addEventListener("submit", async event => {
      event.preventDefault(); const button = event.submitter, form = new FormData(event.currentTarget);
      button.disabled = true; button.textContent = "处理中…";
      const credentials = { email: String(form.get("email") || "").trim(), password: String(form.get("password") || "") };
      const response = button.value === "signup" ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
      if (response.error) { showLogin(translateError(response.error.message)); return; }
      if (button.value === "signup" && !response.data.session) { showLogin("注册成功。请打开邮箱中的验证邮件，点击确认链接后返回盈记登录。"); return; }
      currentUser = response.data.user; document.getElementById("cloudLogin")?.remove(); updateStatus("synced", "云端已连接");
      window.dispatchEvent(new CustomEvent("yingji-cloud-ready"));
    });
  }

  function updateStatus(state, text) {
    const button = document.getElementById("cloudStatus"); if (!button) return;
    button.classList.remove("synced", "saving", "error"); if (state) button.classList.add(state);
    button.textContent = text; button.title = currentUser?.email || "盈记云同步";
  }

  async function initialize() {
    if (initialized) return { configured, authenticated: Boolean(currentUser) };
    initialized = true; ensureStyles();
    if (!configured) { updateStatus("error", "云端未配置"); return { configured: false, authenticated: false }; }
    const { data, error } = await client.auth.getSession();
    if (error) updateStatus("error", "云端连接失败");
    currentUser = data?.session?.user || null;
    if (currentUser) updateStatus("synced", "云端已连接"); else { updateStatus("", "登录云端"); showLogin(); }
    client.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; updateStatus(currentUser ? "synced" : "", currentUser ? "云端已连接" : "登录云端"); });
    document.getElementById("cloudStatus")?.addEventListener("click", async () => {
      if (!currentUser) { showLogin(); return; }
      if (confirm(`当前账号：${currentUser.email}\n\n确定退出云端账号吗？`)) { await client.auth.signOut(); location.reload(); }
    });
    return { configured: true, authenticated: Boolean(currentUser) };
  }

  async function loadState() {
    if (!currentUser) return null;
    const { data, error } = await client.from("yingji_data").select("data,updated_at").eq("user_id", currentUser.id).maybeSingle();
    if (error) throw error; return data || null;
  }

  async function saveStateNow(state) {
    if (!currentUser) return false; updateStatus("saving", "正在同步…");
    const { error } = await client.from("yingji_data").upsert({ user_id: currentUser.id, data: state, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { updateStatus("error", "同步失败"); throw error; }
    updateStatus("synced", "已同步"); window.dispatchEvent(new CustomEvent("yingji-cloud-saved")); return true;
  }

  function saveState(state) {
    if (!currentUser) return; clearTimeout(saveTimer); updateStatus("saving", "正在同步…");
    saveTimer = setTimeout(() => saveStateNow(state).catch(error => console.error("盈记云同步失败", error)), 650);
  }

  window.yingjiCloud = { configured, initialize, loadState, saveState, saveStateNow, showLogin, get user() { return currentUser; } };
})();

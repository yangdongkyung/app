(function () {
  const STORAGE_KEY = "jikyeojwo-my-pen-case-v1";
  const ADMIN_STUDENT_ID = "20020709";
  const ADMIN_PASSWORD = "11223344";

  const app = document.querySelector("#app");
  const toast = document.querySelector("#toast");
  const sessionStatus = document.querySelector("#sessionStatus");

  if (new URLSearchParams(location.search).has("resetDemo")) {
    localStorage.removeItem(STORAGE_KEY);
    history.replaceState(null, "", `${location.pathname}${location.hash || "#main"}`);
  }

  const ui = {
    route: getRoute(),
    personalDraft: null,
    reviewSearch: "",
    reviewSort: "latest",
    activePostId: null,
    editingPostId: null,
    activeMessageId: null,
    messageTab: "inbox",
    activePdfId: null,
    adminTab: "users",
  };

  let store = loadStore();

  function createStore() {
    return {
      version: 1,
      session: { userId: null, isAdmin: false },
      users: [],
      personalBoards: {},
      sharedBoardMeta: {},
      sharedBoards: [],
      posts: [],
      friendRequests: [],
      friendships: [],
      messages: [],
      pdfs: [],
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createStore();
      return migrateStore({ ...createStore(), ...JSON.parse(raw) });
    } catch (error) {
      console.warn(error);
      return createStore();
    }
  }

  function migrateStore(next) {
    next.sharedBoardMeta ||= {};
    if (Array.isArray(next.sharedBoards) && next.sharedBoards.length) {
      for (const share of next.sharedBoards) {
        if (!share?.userId) continue;
        if (share.rows?.length && !next.personalBoards[share.userId]) {
          next.personalBoards[share.userId] = share.rows;
        }
        next.sharedBoardMeta[share.userId] = {
          id: share.id || uid("share"),
          userId: share.userId,
          comments: share.comments || [],
          createdAt: share.createdAt || now(),
          updatedAt: share.updatedAt || share.createdAt || now(),
        };
      }
      next.sharedBoards = [];
    }
    return next;
  }

  function sharedBoardEntries() {
    return Object.values(store.sharedBoardMeta || {})
      .map((meta) => ({ ...meta, rows: store.personalBoards[meta.userId] || [] }))
      .filter((share) => share.rows.length);
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getRoute() {
    return (location.hash || "#main").replace("#", "") || "main";
  }

  function setRoute(route) {
    location.hash = route;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function normalizeStudentId(value) {
    return String(value || "").trim().replace(/\s+/g, "");
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function now() {
    return new Date().toISOString();
  }

  function currentUser() {
    if (!store.session.userId) return null;
    return store.users.find((user) => user.id === store.session.userId) || null;
  }

  function isAdmin() {
    return Boolean(store.session.isAdmin);
  }

  function displayName(user) {
    if (!user) return "알 수 없음";
    return user.nickname || user.name;
  }

  function avatar(user, size = "") {
    if (user?.photo) {
      return `<img class="avatar ${size}" src="${esc(user.photo)}" alt="${esc(displayName(user))} 프로필 사진">`;
    }
    return `<div class="avatar ${size}" aria-hidden="true"></div>`;
  }

  function userById(id) {
    return store.users.find((user) => user.id === id) || null;
  }

  function maskStudentId(id) {
    const value = String(id || "");
    if (value.length <= 4) return "****";
    return `${value.slice(0, 2)}${"*".repeat(Math.max(2, value.length - 4))}${value.slice(-2)}`;
  }

  function showToast(message, type = "ok") {
    toast.textContent = message;
    toast.className = `toast show ${type === "error" ? "error" : ""}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.className = "toast";
    }, 2800);
  }

  function passwordMessage(password) {
    if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
    if (!/[A-Za-z]/.test(password)) return "비밀번호에는 영문이 포함되어야 합니다.";
    if (!/[0-9]/.test(password)) return "비밀번호에는 숫자가 포함되어야 합니다.";
    if (!/[^A-Za-z0-9]/.test(password)) return "비밀번호에는 특수기호가 포함되어야 합니다.";
    return "";
  }

  async function hashPassword(password) {
    if (window.crypto?.subtle && window.TextEncoder) {
      const bytes = new TextEncoder().encode(password);
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return btoa(unescape(encodeURIComponent(password)));
  }

  function canUseMajorFeatures() {
    const user = currentUser();
    return Boolean(user && user.approved && !user.suspended && !isAdmin());
  }

  function blockedReason() {
    if (isAdmin()) return "관리자 계정은 사용자 작성 기능 대신 관리자 메뉴를 이용합니다.";
    const user = currentUser();
    if (!user) return "로그인이 필요합니다.";
    if (!user.approved) return "관리자의 가입 승인 후 이용할 수 있습니다.";
    if (user.suspended) return "정지된 회원은 작성 및 공유 기능을 사용할 수 없습니다.";
    return "";
  }

  function requireWritable() {
    const reason = blockedReason();
    if (reason) {
      showToast(reason, "error");
      return false;
    }
    return true;
  }

  function statusPill(user) {
    if (isAdmin()) return `<span class="pill ok">관리자</span>`;
    if (!user) return `<span class="pill">비로그인</span>`;
    if (user.suspended) return `<span class="pill danger">정지</span>`;
    if (!user.approved) return `<span class="pill pending">승인 대기</span>`;
    return `<span class="pill ok">승인 완료</span>`;
  }

  function render() {
    ui.route = getRoute();
    updateChrome();
    switch (ui.route) {
      case "login":
        renderLogin();
        break;
      case "signup":
        renderSignup();
        break;
      case "mypage":
        renderMypage();
        break;
      case "studio":
        renderStudio();
        break;
      case "personal":
        renderPersonal();
        break;
      case "shared":
        renderShared();
        break;
      case "reviews":
        renderReviews();
        break;
      case "friends":
        renderFriends();
        break;
      case "messages":
        renderMessages();
        break;
      case "admin":
        renderAdmin();
        break;
      default:
        renderMain();
    }
  }

  function updateChrome() {
    const user = currentUser();
    const statusText = isAdmin()
      ? "관리자 로그인 중"
      : user
        ? `${displayName(user)}님 · ${user.approved ? "승인 완료" : "승인 대기"}${user.suspended ? " · 정지" : ""}`
        : "둘러보기 중 · 작성 기능은 로그인 후 이용";

    sessionStatus.innerHTML = `${statusPill(user)} <span>${esc(statusText)}</span>`;
    document.querySelector("#loginButton").classList.toggle("hidden", Boolean(user || isAdmin()));
    document.querySelector("#signupButton").classList.toggle("hidden", Boolean(user || isAdmin()));
    document.querySelector("#logoutButton").classList.toggle("hidden", !user && !isAdmin());

    document.querySelectorAll("[data-route]").forEach((button) => {
      button.classList.toggle("active", button.dataset.route === ui.route);
    });
  }

  function mainActionCards() {
    return [
      ["personal", "개인 현황판", "내 필통 속 물품과 수량을 저장"],
      ["shared", "전체 공유 현황판", "공유된 물품 현황과 댓글 확인"],
      ["reviews", "후기 게시판", "필기구와 사무 도구 사용 후기"],
      ["friends", "친구 관리", "친구 요청, 수락, 목록 관리"],
      ["messages", "쪽지함", "친구와 주고받는 쪽지"],
      ["studio", "제작실", "PDF 업로드 후 현황 입력"],
    ].map(([route, title, copy]) => `
      <button class="quick-card" data-route="${route}">
        <strong>${title}</strong>
        <span>${copy}</span>
      </button>
    `).join("");
  }

  function renderMain() {
    const user = currentUser();
    const pendingBox = user && !user.approved
      ? `<div class="status-box"><strong>가입 승인 대기 중입니다.</strong><span>로그인은 되었지만 개인 현황 저장, 공유, 게시글 작성, 친구 요청, 쪽지 전송은 관리자 승인 후 사용할 수 있습니다.</span></div>`
      : "";
    const suspendedBox = user?.suspended
      ? `<div class="status-box"><strong>정지된 회원입니다.</strong><span>로그인과 본인 정보 확인은 가능하지만 작성 및 공유 기능은 사용할 수 없습니다.</span></div>`
      : "";

    app.innerHTML = `
      <section class="hero-panel">
        <div class="page-head">
          <div>
            <p class="brand-eyebrow">중복 구매 줄이기 프로젝트</p>
            <h2 class="page-title">지켜줘 내 텅장, 내 필통!</h2>
            <p class="page-subtitle">필통 속 물품을 확인하고, 중복 구매를 줄여 텅장을 지켜주는 필기구·사무 도구 관리 웹앱</p>
          </div>
          <div class="mini-card">
            <div class="meta">현재 상태</div>
            <strong>${isAdmin() ? "관리자" : user ? displayName(user) : "로그인 전"}</strong>
            <div>${statusPill(user)}</div>
          </div>
        </div>
        ${pendingBox}
        ${suspendedBox}
        <div class="quick-grid">${mainActionCards()}</div>
      </section>
    `;
  }

  function renderLogin() {
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">로그인</h2>
          <p class="page-subtitle">아이디는 이름과 학번을 함께 확인합니다. 가입 승인 전에도 로그인은 가능하지만 주요 기능은 잠깁니다.</p>
        </div>
      </section>
      <section class="cards-grid">
        <form class="window-card form-grid" id="loginForm">
          <h3 class="section-title">로그인</h3>
          <div class="form-field">
            <label for="loginName">아이디(이름)</label>
            <input id="loginName" name="name" autocomplete="username">
          </div>
          <div class="form-field">
            <label for="loginStudentId">학번</label>
            <input id="loginStudentId" name="studentId" inputmode="numeric" autocomplete="username">
          </div>
          <div class="form-field">
            <label for="loginPassword">비밀번호</label>
            <input id="loginPassword" name="password" type="password" autocomplete="current-password">
          </div>
          <div class="split-actions">
            <button class="primary-btn" type="submit">로그인</button>
            <button class="ghost-btn" type="button" data-route="signup">회원가입</button>
          </div>
        </form>

        <form class="window-card form-grid" id="resetPasswordForm">
          <h3 class="section-title">비밀번호 찾기 / 재설정</h3>
          <div class="form-field">
            <label for="resetName">이름</label>
            <input id="resetName" name="name">
          </div>
          <div class="form-field">
            <label for="resetStudentId">학번</label>
            <input id="resetStudentId" name="studentId" inputmode="numeric">
          </div>
          <div class="form-field">
            <label for="resetPassword">새 비밀번호</label>
            <input id="resetPassword" name="password" type="password" autocomplete="new-password">
          </div>
          <button class="success-btn" type="submit">비밀번호 재설정</button>
        </form>
      </section>
    `;
  }

  function renderSignup() {
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">회원가입</h2>
          <p class="page-subtitle">학번은 중복 가입할 수 없으며, 가입 후 관리자 승인을 받아야 정상 이용할 수 있습니다.</p>
        </div>
      </section>
      <form class="window-card form-grid" id="signupForm">
        <div class="two-col form-grid">
          <div class="form-field">
            <label for="signupName">아이디(이름)</label>
            <input id="signupName" name="name" required>
          </div>
          <div class="form-field">
            <label for="signupStudentId">학번</label>
            <input id="signupStudentId" name="studentId" inputmode="numeric" required>
          </div>
          <div class="form-field">
            <label for="signupPassword">비밀번호</label>
            <input id="signupPassword" name="password" type="password" autocomplete="new-password" required>
          </div>
          <div class="form-field">
            <label for="signupPasswordConfirm">비밀번호 확인</label>
            <input id="signupPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" required>
          </div>
        </div>
        <div class="status-box">
          <strong>비밀번호 조건</strong>
          <span>8자 이상, 영문·숫자·특수기호를 모두 포함해야 합니다.</span>
        </div>
        <div class="split-actions">
          <button class="primary-btn" type="submit">가입 신청</button>
          <button class="ghost-btn" type="button" data-route="login">로그인으로 이동</button>
        </div>
      </form>
    `;
  }

  function editableBoardTable(rows, scope) {
    const body = rows.map((row, index) => `
      <tr>
        <td><input class="table-input" name="item" value="${esc(row.item)}" placeholder="샤프, 볼펜, 노트"></td>
        <td><input class="table-input" name="qty" type="number" min="0" max="999" value="${esc(row.qty ?? 1)}"></td>
        <td><input class="table-input" name="note" value="${esc(row.note)}" placeholder="검정색, 사용 중, 리필 필요"></td>
        <td><button class="danger-btn tiny-btn" type="button" data-action="delete-row" data-scope="${scope}" data-index="${index}">삭제</button></td>
      </tr>
    `).join("");

    return `
      <div class="table-wrap" data-board-scope="${scope}">
        <table class="board-table">
          <thead>
            <tr><th>물품</th><th>수량</th><th>기타</th><th>관리</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function readonlyBoardTable(rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>물품</th><th>수량</th><th>기타</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${esc(row.item)}</td>
                <td>${esc(row.qty)}</td>
                <td>${esc(row.note || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function blankBoardRow() {
    return { item: "", qty: 1, note: "" };
  }

  function readBoardRows(scope) {
    const wrap = document.querySelector(`[data-board-scope="${scope}"]`);
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll("tbody tr")).map((tr) => ({
      item: tr.querySelector('[name="item"]').value.trim(),
      qty: tr.querySelector('[name="qty"]').value.trim(),
      note: tr.querySelector('[name="note"]').value.trim(),
    }));
  }

  function validateBoardRows(rows) {
    const cleaned = [];
    for (const row of rows) {
      const empty = !row.item && !row.qty && !row.note;
      if (empty) continue;
      if (!row.item) return { error: "물품 칸이 비어 있는 행은 저장할 수 없습니다." };
      const qty = Number(row.qty);
      if (!Number.isInteger(qty) || qty < 0 || qty > 999) {
        return { error: "수량은 0부터 999까지의 숫자만 입력할 수 있습니다." };
      }
      cleaned.push({ item: row.item, qty, note: row.note });
    }
    if (!cleaned.length) return { error: "저장할 물품을 1개 이상 입력해 주세요." };
    return { rows: cleaned };
  }

  function renderPersonal() {
    const user = currentUser();
    const rows = ui.personalDraft || (user ? store.personalBoards[user.id] : null) || [blankBoardRow()];
    const disabled = !canUseMajorFeatures();
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">개인 현황판</h2>
          <p class="page-subtitle">본인만 볼 수 있는 필기구·사무 도구 목록입니다. 공유 버튼을 누르면 전체 공유 현황판에 등록됩니다.</p>
        </div>
      </section>
      ${disabled ? `<div class="status-box"><strong>작성 기능 잠김</strong><span>${esc(blockedReason())}</span></div>` : ""}
      <section class="window-card">
        <h3 class="section-title">내 현황 <span>물품 · 수량 · 기타</span></h3>
        ${editableBoardTable(rows, "personal")}
        <div class="split-actions" style="margin-top:14px">
          <button class="ghost-btn" type="button" data-action="add-personal-row" ${disabled ? "disabled" : ""}>행 추가</button>
          <button class="primary-btn" type="button" data-action="save-personal" ${disabled ? "disabled" : ""}>저장</button>
          <button class="success-btn" type="button" data-action="share-personal" ${disabled ? "disabled" : ""}>공유</button>
        </div>
      </section>
    `;
  }

  function renderShared() {
    const shares = sharedBoardEntries().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">전체 공유 현황판</h2>
          <p class="page-subtitle">공유를 선택한 사용자의 물품 현황만 표시합니다. 로그인한 승인 회원은 댓글과 대댓글을 남길 수 있습니다.</p>
        </div>
      </section>
      ${shares.length ? `<section class="cards-grid">${shares.map(renderShareCard).join("")}</section>` : `<div class="empty-state">아직 등록된 현황이 없습니다.</div>`}
    `;
  }

  function renderShareCard(share) {
    const owner = userById(share.userId);
    const canDelete = isAdmin() || currentUser()?.id === share.userId;
    return `
      <article class="share-card">
        <div class="share-head">
          <div class="user-line">
            ${avatar(owner)}
            <div>
              <strong>${esc(displayName(owner))}</strong>
              <div class="meta">등록 날짜 ${formatDate(share.createdAt)}${share.updatedAt && share.updatedAt !== share.createdAt ? ` · 수정 ${formatDate(share.updatedAt)}` : ""}</div>
            </div>
          </div>
          ${canDelete ? `<button class="danger-btn tiny-btn" data-action="delete-share" data-id="${share.id}">삭제</button>` : ""}
        </div>
        ${readonlyBoardTable(share.rows)}
        ${renderComments("share", share.id, share.comments || [])}
      </article>
    `;
  }

  function renderComments(type, targetId, comments) {
    const canComment = canUseMajorFeatures();
    return `
      <div class="comment-list">
        <h4 class="section-title">댓글 <span>${comments.length ? `${comments.length}개` : "아직 댓글이 없습니다."}</span></h4>
        ${comments.map((comment) => renderComment(type, targetId, comment)).join("")}
        ${canComment ? `
          <form class="form-grid comment-form" data-target-type="${type}" data-target-id="${targetId}">
            <div class="form-field">
              <label>댓글 작성</label>
              <textarea name="text" rows="2" placeholder="댓글을 입력하세요"></textarea>
            </div>
            <button class="primary-btn" type="submit">댓글 등록</button>
          </form>
        ` : `<div class="status-box"><span>${esc(blockedReason() || "로그인한 사용자만 댓글을 작성할 수 있습니다.")}</span></div>`}
      </div>
    `;
  }

  function renderComment(type, targetId, comment) {
    const author = userById(comment.userId);
    const canDelete = isAdmin() || currentUser()?.id === comment.userId;
    return `
      <div class="comment-item">
        <div class="comment-head">
          <div class="user-line">
            ${avatar(author, "small")}
            <div>
              <strong>${esc(displayName(author))}</strong>
              <div class="meta">${formatDate(comment.createdAt)}</div>
            </div>
          </div>
          ${canDelete ? `<button class="danger-btn tiny-btn" data-action="delete-comment" data-target-type="${type}" data-target-id="${targetId}" data-comment-id="${comment.id}">삭제</button>` : ""}
        </div>
        <div>${esc(comment.text)}</div>
        <div class="reply-list">
          ${(comment.replies || []).map((reply) => renderReply(type, targetId, comment.id, reply)).join("")}
          ${canUseMajorFeatures() ? `
            <form class="reply-form inline-actions" data-target-type="${type}" data-target-id="${targetId}" data-comment-id="${comment.id}">
              <input class="table-input" name="text" placeholder="대댓글 입력">
              <button class="ghost-btn tiny-btn" type="submit">등록</button>
            </form>
          ` : ""}
        </div>
      </div>
    `;
  }

  function renderReply(type, targetId, commentId, reply) {
    const author = userById(reply.userId);
    const canDelete = isAdmin() || currentUser()?.id === reply.userId;
    return `
      <div class="reply-item">
        <div class="comment-head">
          <div class="user-line">
            ${avatar(author, "small")}
            <div>
              <strong>${esc(displayName(author))}</strong>
              <div class="meta">${formatDate(reply.createdAt)}</div>
            </div>
          </div>
          ${canDelete ? `<button class="danger-btn tiny-btn" data-action="delete-reply" data-target-type="${type}" data-target-id="${targetId}" data-comment-id="${commentId}" data-reply-id="${reply.id}">삭제</button>` : ""}
        </div>
        <div>${esc(reply.text)}</div>
      </div>
    `;
  }

  function renderReviews() {
    const posts = filteredPosts();
    const editing = store.posts.find((post) => post.id === ui.editingPostId);
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">후기 게시판</h2>
          <p class="page-subtitle">직접 사용해본 필기구와 사무 도구 후기를 사진, 해시태그, 댓글과 함께 남길 수 있습니다.</p>
        </div>
      </section>

      <section class="window-card form-grid">
        <form id="reviewSearchForm" class="filter-row">
          <input class="table-input" name="search" value="${esc(ui.reviewSearch)}" placeholder="제목, 내용, 해시태그 검색">
          <select class="table-input" id="reviewSort" name="sort" aria-label="정렬">
            <option value="latest" ${ui.reviewSort === "latest" ? "selected" : ""}>최신순</option>
            <option value="comments" ${ui.reviewSort === "comments" ? "selected" : ""}>댓글순</option>
            <option value="views" ${ui.reviewSort === "views" ? "selected" : ""}>조회순</option>
          </select>
          <button class="primary-btn" type="submit">검색</button>
          <button class="ghost-btn" type="button" data-action="clear-review-search">초기화</button>
        </form>
      </section>

      <section class="window-card">
        <h3 class="section-title">${editing ? "후기 수정" : "후기 작성"} <span>${canUseMajorFeatures() ? "승인 회원 작성 가능" : "작성 잠김"}</span></h3>
        ${canUseMajorFeatures() ? renderReviewForm(editing) : `<div class="status-box"><span>${esc(blockedReason())}</span></div>`}
      </section>

      ${posts.length ? `<section class="cards-grid">${posts.map(renderPostCard).join("")}</section>` : `<div class="empty-state">아직 등록된 후기가 없습니다.</div>`}
    `;
  }

  function renderReviewForm(post) {
    return `
      <form class="form-grid" id="reviewForm" data-editing-id="${post?.id || ""}">
        <div class="form-field">
          <label for="postTitle">제목</label>
          <input id="postTitle" name="title" value="${esc(post?.title || "")}" required>
        </div>
        <div class="form-field">
          <label for="postContent">내용</label>
          <textarea id="postContent" name="content" required>${esc(post?.content || "")}</textarea>
        </div>
        <div class="two-col form-grid">
          <div class="form-field">
            <label for="postTags">해시태그</label>
            <input id="postTags" name="hashtags" value="${esc((post?.hashtags || []).join(" "))}" placeholder="#볼펜 #가성비 #필기감">
          </div>
          <div class="form-field">
            <label for="postPhoto">사진</label>
            <input id="postPhoto" name="photo" type="file" accept="image/*">
          </div>
        </div>
        ${post?.photo ? `<img class="post-image" src="${esc(post.photo)}" alt="현재 등록된 후기 사진">` : ""}
        <div class="split-actions">
          <button class="primary-btn" type="submit">${post ? "수정 저장" : "게시글 등록"}</button>
          ${post ? `<button class="ghost-btn" type="button" data-action="cancel-post-edit">수정 취소</button>` : ""}
        </div>
      </form>
    `;
  }

  function filteredPosts() {
    const query = ui.reviewSearch.trim().toLowerCase();
    const visiblePosts = store.posts.filter((post) => !post.hidden || isAdmin() || post.userId === currentUser()?.id);
    const filtered = query
      ? visiblePosts.filter((post) => {
        const haystack = `${post.title} ${post.content} ${(post.hashtags || []).join(" ")}`.toLowerCase();
        return haystack.includes(query);
      })
      : visiblePosts;

    return [...filtered].sort((a, b) => {
      if (ui.reviewSort === "comments") return countComments(b.comments) - countComments(a.comments);
      if (ui.reviewSort === "views") return (b.views || 0) - (a.views || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function countComments(comments = []) {
    return comments.reduce((sum, comment) => sum + 1 + (comment.replies || []).length, 0);
  }

  function renderPostCard(post) {
    const author = userById(post.userId);
    const opened = ui.activePostId === post.id;
    const canManage = isAdmin() || currentUser()?.id === post.userId;
    return `
      <article class="post-card">
        <div class="post-head">
          <div class="user-line">
            ${avatar(author)}
            <div>
              <strong>${esc(displayName(author))}</strong>
              <div class="meta">${formatDate(post.createdAt)} · 조회 ${post.views || 0} · 댓글 ${countComments(post.comments)}</div>
            </div>
          </div>
          ${post.hidden ? `<span class="pill danger">숨김</span>` : ""}
        </div>
        ${post.photo ? `<img class="post-image" src="${esc(post.photo)}" alt="${esc(post.title)} 사진">` : ""}
        <div>
          <h3 class="section-title">${esc(post.title)}</h3>
          <p>${esc(opened ? post.content : shortText(post.content, 120))}</p>
          <div class="tag-row">${(post.hashtags || []).map((tag) => `<button class="tag" data-action="filter-tag" data-tag="${esc(tag)}">${esc(tag)}</button>`).join("")}</div>
        </div>
        <div class="split-actions">
          <button class="ghost-btn" data-action="open-post" data-id="${post.id}">${opened ? "닫기" : "열기"}</button>
          ${canManage ? `<button class="plain-btn" data-action="edit-post" data-id="${post.id}">수정</button>` : ""}
          ${canManage ? `<button class="danger-btn" data-action="delete-post" data-id="${post.id}">삭제</button>` : ""}
          ${isAdmin() ? `<button class="warning-btn" data-action="toggle-hide-post" data-id="${post.id}">${post.hidden ? "숨김 해제" : "숨김"}</button>` : ""}
        </div>
        ${opened ? renderComments("post", post.id, post.comments || []) : ""}
      </article>
    `;
  }

  function shortText(text, max) {
    const value = String(text || "");
    return value.length > max ? `${value.slice(0, max)}...` : value;
  }

  function extractHashtags(text) {
    const matches = String(text || "").match(/#[^\s#,.!?;:()[\]{}]+/g) || [];
    return [...new Set(matches.map((tag) => tag.trim()).filter(Boolean))];
  }

  function renderFriends() {
    const user = currentUser();
    if (!user || isAdmin()) {
      app.innerHTML = lockedPage("친구 관리", "친구 요청과 친구 목록은 로그인한 사용자만 이용할 수 있습니다.");
      return;
    }
    const sent = store.friendRequests.filter((request) => request.fromId === user.id);
    const received = store.friendRequests.filter((request) => request.toId === user.id && request.status === "pending");
    const friends = getFriends(user.id);
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">친구 관리</h2>
          <p class="page-subtitle">이름으로 친구 요청을 보내고, 받은 요청을 수락하거나 거절할 수 있습니다.</p>
        </div>
      </section>
      ${!canUseMajorFeatures() ? `<div class="status-box"><strong>친구 요청 잠김</strong><span>${esc(blockedReason())}</span></div>` : ""}
      <section class="cards-grid">
        <form class="window-card form-grid" id="friendRequestForm">
          <h3 class="section-title">친구 추가</h3>
          <div class="form-field">
            <label for="friendName">친구 이름</label>
            <input id="friendName" name="name" placeholder="이름 입력" ${!canUseMajorFeatures() ? "disabled" : ""}>
          </div>
          <button class="primary-btn" type="submit" ${!canUseMajorFeatures() ? "disabled" : ""}>친구 요청</button>
        </form>
        <section class="window-card">
          <h3 class="section-title">현재 친구 목록 <span>${friends.length}명</span></h3>
          ${friends.length ? friends.map(renderFriendItem).join("") : `<div class="empty-state">아직 등록된 친구가 없습니다.</div>`}
        </section>
      </section>
      <section class="cards-grid">
        <section class="window-card">
          <h3 class="section-title">내가 보낸 친구 요청</h3>
          ${sent.length ? sent.map(renderSentRequest).join("") : `<div class="empty-state">보낸 친구 요청이 없습니다.</div>`}
        </section>
        <section class="window-card">
          <h3 class="section-title">내가 받은 친구 요청</h3>
          ${received.length ? received.map(renderReceivedRequest).join("") : `<div class="empty-state">받은 친구 요청이 없습니다.</div>`}
        </section>
      </section>
    `;
  }

  function renderFriendItem(friendship) {
    const user = currentUser();
    const friendId = friendship.users.find((id) => id !== user.id);
    const friend = userById(friendId);
    return `
      <div class="mini-card message-head">
        <div class="user-line">
          ${avatar(friend)}
          <div>
            <strong>${esc(displayName(friend))}</strong>
            <div class="meta">학번 ${esc(maskStudentId(friend?.studentId))} · 친구 추가 ${formatDate(friendship.createdAt)}</div>
          </div>
        </div>
        <button class="danger-btn tiny-btn" data-action="remove-friend" data-id="${friendship.id}">삭제</button>
      </div>
    `;
  }

  function renderSentRequest(request) {
    const receiver = userById(request.toId);
    const statusMap = { pending: "대기 중", accepted: "수락됨", rejected: "거절됨" };
    return `
      <div class="mini-card message-head">
        <div class="user-line">
          ${avatar(receiver)}
          <div>
            <strong>${esc(displayName(receiver))}</strong>
            <div class="meta">${formatDate(request.createdAt)}</div>
          </div>
        </div>
        <span class="pill ${request.status === "pending" ? "pending" : request.status === "accepted" ? "ok" : "danger"}">${statusMap[request.status]}</span>
      </div>
    `;
  }

  function renderReceivedRequest(request) {
    const sender = userById(request.fromId);
    return `
      <div class="mini-card message-head">
        <div class="user-line">
          ${avatar(sender)}
          <div>
            <strong>${esc(displayName(sender))}</strong>
            <div class="meta">${formatDate(request.createdAt)}</div>
          </div>
        </div>
        <div class="inline-actions">
          <button class="success-btn tiny-btn" data-action="accept-friend" data-id="${request.id}">수락</button>
          <button class="danger-btn tiny-btn" data-action="reject-friend" data-id="${request.id}">거절</button>
        </div>
      </div>
    `;
  }

  function friendshipKey(a, b) {
    return [a, b].sort().join("__");
  }

  function areFriends(a, b) {
    return store.friendships.some((friendship) => friendshipKey(...friendship.users) === friendshipKey(a, b));
  }

  function getFriends(userId) {
    return store.friendships.filter((friendship) => friendship.users.includes(userId));
  }

  function renderMessages() {
    const user = currentUser();
    if (!user || isAdmin()) {
      app.innerHTML = lockedPage("쪽지함", "쪽지는 로그인한 사용자만 이용할 수 있습니다.");
      return;
    }
    const friends = getFriends(user.id).map((friendship) => {
      const friendId = friendship.users.find((id) => id !== user.id);
      return userById(friendId);
    }).filter(Boolean);
    const inbox = store.messages
      .filter((message) => message.toId === user.id && !message.deletedForReceiver)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const sent = store.messages
      .filter((message) => message.fromId === user.id && !message.deletedForSender)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const list = ui.messageTab === "sent" ? sent : inbox;

    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">쪽지함</h2>
          <p class="page-subtitle">친구 관계인 사용자끼리만 쪽지를 주고받을 수 있습니다.</p>
        </div>
      </section>
      ${!canUseMajorFeatures() ? `<div class="status-box"><strong>쪽지 전송 잠김</strong><span>${esc(blockedReason())}</span></div>` : ""}
      <section class="cards-grid">
        <form class="window-card form-grid" id="messageForm">
          <h3 class="section-title">쪽지 작성</h3>
          <div class="form-field">
            <label for="messageTo">받을 사람</label>
            <select id="messageTo" name="toId" ${!canUseMajorFeatures() ? "disabled" : ""}>
              <option value="">친구 선택</option>
              ${friends.map((friend) => `<option value="${friend.id}">${esc(displayName(friend))}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="messageTitle">제목</label>
            <input id="messageTitle" name="title" ${!canUseMajorFeatures() ? "disabled" : ""}>
          </div>
          <div class="form-field">
            <label for="messageBody">내용</label>
            <textarea id="messageBody" name="body" ${!canUseMajorFeatures() ? "disabled" : ""}></textarea>
          </div>
          <button class="primary-btn" type="submit" ${!canUseMajorFeatures() ? "disabled" : ""}>쪽지 전송</button>
        </form>
        <section class="window-card">
          <div class="tabs">
            <button class="${ui.messageTab === "inbox" ? "primary-btn" : "ghost-btn"}" data-action="message-tab" data-tab="inbox">받은 쪽지함</button>
            <button class="${ui.messageTab === "sent" ? "primary-btn" : "ghost-btn"}" data-action="message-tab" data-tab="sent">보낸 쪽지함</button>
          </div>
          <div class="message-list" style="margin-top:14px">
            ${list.length ? list.map((message) => renderMessageItem(message, ui.messageTab)).join("") : `<div class="empty-state">아직 쪽지가 없습니다.</div>`}
          </div>
        </section>
      </section>
    `;
  }

  function renderMessageItem(message, tab) {
    const isReceived = tab === "inbox";
    const counterpart = userById(isReceived ? message.fromId : message.toId);
    const opened = ui.activeMessageId === message.id;
    return `
      <article class="message-item ${isReceived && !message.readAt ? "unread" : ""}">
        <div class="message-head">
          <div class="user-line">
            ${avatar(counterpart, "small")}
            <div>
              <strong>${esc(message.title)}</strong>
              <div class="meta">${isReceived ? "보낸 사람" : "받는 사람"} ${esc(displayName(counterpart))} · ${formatDate(message.createdAt)} ${isReceived && !message.readAt ? "· 읽지 않음" : ""}</div>
            </div>
          </div>
          <div class="inline-actions">
            <button class="ghost-btn tiny-btn" data-action="open-message" data-id="${message.id}">${opened ? "닫기" : "열기"}</button>
            ${isReceived ? `<button class="warning-btn tiny-btn" data-action="report-message" data-id="${message.id}">신고</button>` : ""}
            <button class="danger-btn tiny-btn" data-action="delete-message" data-id="${message.id}" data-tab="${tab}">삭제</button>
          </div>
        </div>
        ${opened ? `<p>${esc(message.body)}</p>${message.reported ? `<span class="pill danger">신고됨 · ${esc(message.reportStatus || "접수")}</span>` : ""}` : ""}
      </article>
    `;
  }

  function renderMypage() {
    const user = currentUser();
    if (!user || isAdmin()) {
      app.innerHTML = lockedPage("마이페이지", "내 정보는 로그인한 사용자만 확인할 수 있습니다.");
      return;
    }
    const myPosts = store.posts.filter((post) => post.userId === user.id);
    const myComments = flattenComments().filter((item) => item.userId === user.id);
    const myShares = sharedBoardEntries().filter((share) => share.userId === user.id);
    const myFriends = getFriends(user.id);
    const received = store.messages.filter((message) => message.toId === user.id && !message.deletedForReceiver);
    const sent = store.messages.filter((message) => message.fromId === user.id && !message.deletedForSender);
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">마이페이지</h2>
          <p class="page-subtitle">별명, 프로필 사진, 비밀번호와 내 활동 내역을 확인합니다.</p>
        </div>
      </section>
      <section class="cards-grid">
        <form class="window-card form-grid" id="profileForm">
          <h3 class="section-title">내 정보</h3>
          <div class="user-line">${avatar(user)}<div><strong>${esc(user.name)}</strong><div class="meta">학번 ${esc(maskStudentId(user.studentId))}</div></div></div>
          <div class="form-field">
            <label for="nickname">별명</label>
            <input id="nickname" name="nickname" value="${esc(user.nickname || "")}">
          </div>
          <div class="form-field">
            <label for="profilePhoto">프로필 사진</label>
            <input id="profilePhoto" name="photo" type="file" accept="image/*">
          </div>
          <button class="primary-btn" type="submit">프로필 저장</button>
        </form>
        <form class="window-card form-grid" id="profilePasswordForm">
          <h3 class="section-title">비밀번호 재설정</h3>
          <div class="form-field">
            <label for="newProfilePassword">새 비밀번호</label>
            <input id="newProfilePassword" name="password" type="password" autocomplete="new-password">
          </div>
          <button class="success-btn" type="submit">비밀번호 변경</button>
        </form>
      </section>
      <section class="cards-grid">
        ${summaryCard("내 게시글", myPosts, (post) => `<strong>${esc(post.title)}</strong><div class="meta">${formatDate(post.createdAt)}</div>`)}
        ${summaryCard("내 댓글", myComments, (comment) => `<strong>${esc(shortText(comment.text, 34))}</strong><div class="meta">${esc(comment.source)} · ${formatDate(comment.createdAt)}</div>`)}
        ${summaryCard("내 공유 현황", myShares, (share) => `<strong>${share.rows.length}개 물품</strong><div class="meta">${formatDate(share.updatedAt || share.createdAt)}</div>`)}
        ${summaryCard("친구 목록", myFriends, (friendship) => {
          const friend = userById(friendship.users.find((id) => id !== user.id));
          return `<strong>${esc(displayName(friend))}</strong><div class="meta">${formatDate(friendship.createdAt)}</div>`;
        })}
        ${summaryCard("받은 쪽지", received, (message) => `<strong>${esc(message.title)}</strong><div class="meta">${formatDate(message.createdAt)}</div>`)}
        ${summaryCard("보낸 쪽지", sent, (message) => `<strong>${esc(message.title)}</strong><div class="meta">${formatDate(message.createdAt)}</div>`)}
      </section>
    `;
  }

  function summaryCard(title, items, renderer) {
    return `
      <section class="window-card">
        <h3 class="section-title">${title} <span>${items.length}개</span></h3>
        ${items.length ? items.slice(0, 6).map((item) => `<div class="mini-card">${renderer(item)}</div>`).join("") : `<div class="empty-state">아직 등록된 내용이 없습니다.</div>`}
      </section>
    `;
  }

  function renderStudio() {
    const user = currentUser();
    if (!user || isAdmin()) {
      app.innerHTML = lockedPage("제작실", "PDF 업로드는 로그인한 사용자만 이용할 수 있습니다.");
      return;
    }
    const myPdfs = store.pdfs.filter((pdf) => pdf.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!ui.activePdfId && myPdfs[0]) ui.activePdfId = myPdfs[0].id;
    const active = myPdfs.find((pdf) => pdf.id === ui.activePdfId);
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">제작실</h2>
          <p class="page-subtitle">PDF 파일명과 업로드 정보를 저장하고, 물품명·수량·기타 내용을 직접 입력합니다.</p>
        </div>
      </section>
      ${!canUseMajorFeatures() ? `<div class="status-box"><strong>PDF 업로드 잠김</strong><span>${esc(blockedReason())}</span></div>` : ""}
      <section class="window-card">
        <div id="pdfDrop" class="drop-zone">
          <div>
            <strong>PDF 파일을 끌어다 놓거나 선택하세요.</strong>
            <div class="meta">PDF 파일만 업로드할 수 있습니다. 파일 내용은 저장하지 않고 파일명과 입력 현황만 보관합니다.</div>
            <input id="pdfInput" type="file" accept="application/pdf,.pdf" ${!canUseMajorFeatures() ? "disabled" : ""}>
          </div>
        </div>
      </section>
      <section class="cards-grid">
        <section class="window-card">
          <h3 class="section-title">업로드한 PDF</h3>
          ${myPdfs.length ? myPdfs.map((pdf) => `
            <div class="mini-card message-head">
              <div><strong>${esc(pdf.fileName)}</strong><div class="meta">${formatDate(pdf.createdAt)}</div></div>
              <button class="ghost-btn tiny-btn" data-action="select-pdf" data-id="${pdf.id}">선택</button>
            </div>
          `).join("") : `<div class="empty-state">아직 업로드한 PDF가 없습니다.</div>`}
        </section>
        <section class="window-card">
          <h3 class="section-title">PDF 물품 입력 <span>${active ? esc(active.fileName) : "선택 없음"}</span></h3>
          ${active ? `
            ${editableBoardTable(active.rows?.length ? active.rows : [blankBoardRow()], "pdf")}
            <div class="split-actions" style="margin-top:14px">
              <button class="ghost-btn" data-action="add-pdf-row">행 추가</button>
              <button class="primary-btn" data-action="save-pdf-rows" data-id="${active.id}">저장</button>
            </div>
          ` : `<div class="empty-state">PDF를 업로드하면 입력 표가 표시됩니다.</div>`}
        </section>
      </section>
    `;
  }

  function renderAdmin() {
    if (!isAdmin()) {
      app.innerHTML = `
        <section class="page-head">
          <div>
            <h2 class="page-title">관리자 홈페이지</h2>
            <p class="page-subtitle">관리자만 접근할 수 있습니다. 관리자 계정으로 로그인해 주세요.</p>
          </div>
          <button class="primary-btn" data-route="login">관리자 로그인</button>
        </section>
      `;
      return;
    }
    const labels = {
      users: "회원 관리",
      posts: "게시물 관리",
      comments: "댓글 관리",
      requests: "친구 요청 관리",
      reports: "쪽지 신고 관리",
    };
    app.innerHTML = `
      <section class="page-head">
        <div>
          <h2 class="page-title">관리자 홈페이지</h2>
          <p class="page-subtitle">회원 승인, 정지, 게시물 숨김, 댓글 삭제, 쪽지 신고 처리를 관리합니다.</p>
        </div>
      </section>
      <section class="admin-grid">
        <nav class="admin-menu">
          ${Object.entries(labels).map(([tab, label]) => `<button class="${ui.adminTab === tab ? "active" : ""}" data-action="admin-tab" data-tab="${tab}">${label}</button>`).join("")}
        </nav>
        <div class="window-card">${renderAdminPanel(ui.adminTab)}</div>
      </section>
    `;
  }

  function renderAdminPanel(tab) {
    if (tab === "posts") return renderAdminPosts();
    if (tab === "comments") return renderAdminComments();
    if (tab === "requests") return renderAdminRequests();
    if (tab === "reports") return renderAdminReports();
    return renderAdminUsers();
  }

  function renderAdminUsers() {
    return `
      <h3 class="section-title">회원 관리 <span>${store.users.length}명</span></h3>
      ${store.users.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>이름</th><th>학번</th><th>상태</th><th>활동</th><th>관리</th></tr></thead>
            <tbody>
              ${store.users.map((user) => `
                <tr>
                  <td>${esc(displayName(user))}<div class="meta">${esc(user.name)}</div></td>
                  <td>${esc(maskStudentId(user.studentId))}</td>
                  <td>${user.suspended ? "정지" : user.approved ? "승인" : "승인 대기"}</td>
                  <td>게시글 ${store.posts.filter((post) => post.userId === user.id).length} · 댓글 ${flattenComments().filter((comment) => comment.userId === user.id).length}</td>
                  <td>
                    <div class="inline-actions">
                      ${!user.approved ? `<button class="success-btn tiny-btn" data-action="approve-user" data-id="${user.id}">승인</button>` : ""}
                      ${user.suspended ? `<button class="ghost-btn tiny-btn" data-action="unsuspend-user" data-id="${user.id}">정지 해제</button>` : `<button class="warning-btn tiny-btn" data-action="suspend-user" data-id="${user.id}">정지</button>`}
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state">가입 신청한 이용자가 없습니다.</div>`}
    `;
  }

  function renderAdminPosts() {
    return `
      <h3 class="section-title">게시물 관리 <span>${store.posts.length}개</span></h3>
      ${store.posts.length ? store.posts.map((post) => {
        const author = userById(post.userId);
        return `
          <div class="mini-card message-head">
            <div>
              <strong>${esc(post.title)}</strong>
              <div class="meta">${esc(displayName(author))} · ${formatDate(post.createdAt)} · ${post.hidden ? "숨김" : "공개"}</div>
            </div>
            <div class="inline-actions">
              <button class="warning-btn tiny-btn" data-action="toggle-hide-post" data-id="${post.id}">${post.hidden ? "숨김 해제" : "숨김"}</button>
              <button class="danger-btn tiny-btn" data-action="delete-post" data-id="${post.id}">삭제</button>
            </div>
          </div>
        `;
      }).join("") : `<div class="empty-state">아직 등록된 후기가 없습니다.</div>`}
    `;
  }

  function renderAdminComments() {
    const comments = flattenComments();
    return `
      <h3 class="section-title">댓글 관리 <span>${comments.length}개</span></h3>
      ${comments.length ? comments.map((comment) => {
        const author = userById(comment.userId);
        return `
          <div class="mini-card message-head">
            <div>
              <strong>${esc(shortText(comment.text, 80))}</strong>
              <div class="meta">${esc(displayName(author))} · ${esc(comment.source)} · ${formatDate(comment.createdAt)} · ${comment.replyId ? "대댓글" : "댓글"}</div>
            </div>
            <button class="danger-btn tiny-btn" data-action="${comment.replyId ? "delete-reply" : "delete-comment"}" data-target-type="${comment.type}" data-target-id="${comment.targetId}" data-comment-id="${comment.commentId}" ${comment.replyId ? `data-reply-id="${comment.replyId}"` : ""}>삭제</button>
          </div>
        `;
      }).join("") : `<div class="empty-state">아직 댓글이 없습니다.</div>`}
    `;
  }

  function renderAdminRequests() {
    return `
      <h3 class="section-title">친구 요청 관리 <span>${store.friendRequests.length}건</span></h3>
      ${store.friendRequests.length ? store.friendRequests.map((request) => `
        <div class="mini-card message-head">
          <div>
            <strong>${esc(displayName(userById(request.fromId)))} → ${esc(displayName(userById(request.toId)))}</strong>
            <div class="meta">${request.status} · ${formatDate(request.createdAt)}</div>
          </div>
          <button class="danger-btn tiny-btn" data-action="admin-delete-request" data-id="${request.id}">삭제</button>
        </div>
      `).join("") : `<div class="empty-state">친구 요청 내역이 없습니다.</div>`}
    `;
  }

  function renderAdminReports() {
    const reports = store.messages.filter((message) => message.reported);
    return `
      <h3 class="section-title">쪽지 신고 관리 <span>${reports.length}건</span></h3>
      ${reports.length ? reports.map((message) => `
        <div class="mini-card">
          <div class="message-head">
            <div>
              <strong>${esc(message.title)}</strong>
              <div class="meta">보낸 사람 ${esc(displayName(userById(message.fromId)))} · 받은 사람 ${esc(displayName(userById(message.toId)))} · 신고일 ${formatDate(message.reportedAt)}</div>
            </div>
            <span class="pill danger">${esc(message.reportStatus || "접수")}</span>
          </div>
          <p><strong>신고 사유</strong> ${esc(message.reportReason || "사유 없음")}</p>
          <div class="inline-actions">
            <button class="success-btn tiny-btn" data-action="resolve-report" data-id="${message.id}">처리 완료</button>
            <button class="warning-btn tiny-btn" data-action="suspend-user" data-id="${message.fromId}">보낸 사람 정지</button>
          </div>
        </div>
      `).join("") : `<div class="empty-state">신고된 쪽지가 없습니다.</div>`}
    `;
  }

  function lockedPage(title, message) {
    return `
      <section class="page-head">
        <div>
          <h2 class="page-title">${esc(title)}</h2>
          <p class="page-subtitle">${esc(message)}</p>
        </div>
        <button class="primary-btn" data-route="login">로그인</button>
      </section>
    `;
  }

  function flattenComments() {
    const output = [];
    for (const post of store.posts) {
      for (const comment of post.comments || []) {
        output.push({ ...comment, type: "post", targetId: post.id, commentId: comment.id, source: `후기: ${post.title}` });
        for (const reply of comment.replies || []) {
          output.push({ ...reply, type: "post", targetId: post.id, commentId: comment.id, replyId: reply.id, source: `후기: ${post.title}` });
        }
      }
    }
    for (const share of sharedBoardEntries()) {
      const owner = userById(share.userId);
      for (const comment of share.comments || []) {
        output.push({ ...comment, type: "share", targetId: share.id, commentId: comment.id, source: `공유 현황: ${displayName(owner)}` });
        for (const reply of comment.replies || []) {
          output.push({ ...reply, type: "share", targetId: share.id, commentId: comment.id, replyId: reply.id, source: `공유 현황: ${displayName(owner)}` });
        }
      }
    }
    return output.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function findTarget(type, id) {
    if (type === "post") return store.posts.find((post) => post.id === id);
    if (type === "share") return Object.values(store.sharedBoardMeta || {}).find((share) => share.id === id);
    return null;
  }

  document.addEventListener("click", async (event) => {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      setRoute(routeButton.dataset.route);
      document.body.classList.remove("menu-open");
      return;
    }

    if (event.target.closest(".menu-toggle")) {
      document.body.classList.toggle("menu-open");
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;

    if (action === "add-personal-row") {
      ui.personalDraft = readBoardRows("personal");
      ui.personalDraft.push(blankBoardRow());
      render();
      return;
    }

    if (action === "delete-row") {
      const scope = actionButton.dataset.scope;
      const rows = readBoardRows(scope);
      rows.splice(Number(actionButton.dataset.index), 1);
      const nextRows = rows.length ? rows : [blankBoardRow()];
      if (scope === "personal") ui.personalDraft = nextRows;
      if (scope === "pdf") {
        const active = store.pdfs.find((pdf) => pdf.id === ui.activePdfId);
        if (active) active.rows = nextRows;
        persist();
      }
      render();
      return;
    }

    if (action === "save-personal" || action === "share-personal") {
      if (!requireWritable()) return;
      const result = validateBoardRows(readBoardRows("personal"));
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      const user = currentUser();
      store.personalBoards[user.id] = result.rows;
      ui.personalDraft = null;
      if (action === "share-personal") {
        const existing = store.sharedBoardMeta[user.id];
        if (existing) {
          existing.updatedAt = now();
        } else {
          store.sharedBoardMeta[user.id] = {
            id: uid("share"),
            userId: user.id,
            comments: [],
            createdAt: now(),
            updatedAt: now(),
          };
        }
        persist();
        showToast("공유 현황판에 등록되었습니다.");
        setRoute("shared");
      } else {
        persist();
        showToast("저장되었습니다.");
        render();
      }
      return;
    }

    if (action === "delete-share") {
      const share = Object.values(store.sharedBoardMeta || {}).find((item) => item.id === actionButton.dataset.id);
      if (!share || (!isAdmin() && share.userId !== currentUser()?.id)) return;
      delete store.sharedBoardMeta[share.userId];
      persist();
      showToast("공유 현황을 삭제했습니다.");
      render();
      return;
    }

    if (action === "delete-comment" || action === "delete-reply") {
      deleteCommentAction(actionButton, action);
      return;
    }

    if (action === "open-post") {
      const id = actionButton.dataset.id;
      if (ui.activePostId === id) {
        ui.activePostId = null;
      } else {
        ui.activePostId = id;
        const post = store.posts.find((item) => item.id === id);
        if (post) post.views = (post.views || 0) + 1;
        persist();
      }
      render();
      return;
    }

    if (action === "edit-post") {
      const post = store.posts.find((item) => item.id === actionButton.dataset.id);
      if (!post || (!isAdmin() && post.userId !== currentUser()?.id)) return;
      ui.editingPostId = post.id;
      setRoute("reviews");
      render();
      return;
    }

    if (action === "cancel-post-edit") {
      ui.editingPostId = null;
      render();
      return;
    }

    if (action === "delete-post") {
      const post = store.posts.find((item) => item.id === actionButton.dataset.id);
      if (!post || (!isAdmin() && post.userId !== currentUser()?.id)) return;
      store.posts = store.posts.filter((item) => item.id !== post.id);
      if (ui.activePostId === post.id) ui.activePostId = null;
      if (ui.editingPostId === post.id) ui.editingPostId = null;
      persist();
      showToast("게시글을 삭제했습니다.");
      render();
      return;
    }

    if (action === "toggle-hide-post") {
      if (!isAdmin()) return;
      const post = store.posts.find((item) => item.id === actionButton.dataset.id);
      if (post) {
        post.hidden = !post.hidden;
        persist();
        showToast(post.hidden ? "게시글을 숨김 처리했습니다." : "게시글 숨김을 해제했습니다.");
        render();
      }
      return;
    }

    if (action === "filter-tag") {
      ui.reviewSearch = actionButton.dataset.tag;
      ui.activePostId = null;
      setRoute("reviews");
      render();
      return;
    }

    if (action === "clear-review-search") {
      ui.reviewSearch = "";
      ui.reviewSort = "latest";
      render();
      return;
    }

    if (action === "accept-friend" || action === "reject-friend") {
      const request = store.friendRequests.find((item) => item.id === actionButton.dataset.id);
      if (!request || request.toId !== currentUser()?.id) return;
      request.status = action === "accept-friend" ? "accepted" : "rejected";
      request.respondedAt = now();
      if (request.status === "accepted" && !areFriends(request.fromId, request.toId)) {
        store.friendships.push({ id: uid("friend"), users: [request.fromId, request.toId], createdAt: now() });
      }
      persist();
      showToast(request.status === "accepted" ? "친구 요청을 수락했습니다." : "친구 요청을 거절했습니다.");
      render();
      return;
    }

    if (action === "remove-friend") {
      const friendship = store.friendships.find((item) => item.id === actionButton.dataset.id);
      if (!friendship || !friendship.users.includes(currentUser()?.id)) return;
      store.friendships = store.friendships.filter((item) => item.id !== friendship.id);
      persist();
      showToast("친구를 삭제했습니다.");
      render();
      return;
    }

    if (action === "message-tab") {
      ui.messageTab = actionButton.dataset.tab;
      ui.activeMessageId = null;
      render();
      return;
    }

    if (action === "open-message") {
      const id = actionButton.dataset.id;
      const message = store.messages.find((item) => item.id === id);
      if (!message || ![message.fromId, message.toId].includes(currentUser()?.id)) return;
      ui.activeMessageId = ui.activeMessageId === id ? null : id;
      if (message.toId === currentUser().id && !message.readAt) {
        message.readAt = now();
        persist();
      }
      render();
      return;
    }

    if (action === "delete-message") {
      const message = store.messages.find((item) => item.id === actionButton.dataset.id);
      if (!message) return;
      const user = currentUser();
      if (message.toId === user?.id && actionButton.dataset.tab === "inbox") message.deletedForReceiver = true;
      if (message.fromId === user?.id && actionButton.dataset.tab === "sent") message.deletedForSender = true;
      persist();
      showToast("쪽지를 삭제했습니다.");
      render();
      return;
    }

    if (action === "report-message") {
      const message = store.messages.find((item) => item.id === actionButton.dataset.id);
      if (!message || message.toId !== currentUser()?.id) return;
      const reason = window.prompt("신고 사유를 입력해 주세요.");
      if (!reason) return;
      message.reported = true;
      message.reportReason = reason.trim();
      message.reportedAt = now();
      message.reportStatus = "접수";
      persist();
      showToast("쪽지를 신고했습니다.");
      render();
      return;
    }

    if (action === "select-pdf") {
      ui.activePdfId = actionButton.dataset.id;
      render();
      return;
    }

    if (action === "add-pdf-row") {
      const active = store.pdfs.find((pdf) => pdf.id === ui.activePdfId);
      if (!active) return;
      active.rows = readBoardRows("pdf");
      active.rows.push(blankBoardRow());
      persist();
      render();
      return;
    }

    if (action === "save-pdf-rows") {
      const result = validateBoardRows(readBoardRows("pdf"));
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      const pdf = store.pdfs.find((item) => item.id === actionButton.dataset.id);
      if (pdf && pdf.userId === currentUser()?.id) {
        pdf.rows = result.rows;
        pdf.updatedAt = now();
        persist();
        showToast("PDF 물품 입력 내용이 저장되었습니다.");
        render();
      }
      return;
    }

    if (action === "admin-tab") {
      ui.adminTab = actionButton.dataset.tab;
      render();
      return;
    }

    if (action === "approve-user") {
      updateUser(actionButton.dataset.id, { approved: true });
      showToast("가입을 승인했습니다.");
      return;
    }

    if (action === "suspend-user") {
      updateUser(actionButton.dataset.id, { suspended: true });
      showToast("이용자를 정지했습니다.");
      return;
    }

    if (action === "unsuspend-user") {
      updateUser(actionButton.dataset.id, { suspended: false });
      showToast("이용자 정지를 해제했습니다.");
      return;
    }

    if (action === "admin-delete-request") {
      store.friendRequests = store.friendRequests.filter((request) => request.id !== actionButton.dataset.id);
      persist();
      showToast("친구 요청을 삭제했습니다.");
      render();
      return;
    }

    if (action === "resolve-report") {
      const message = store.messages.find((item) => item.id === actionButton.dataset.id);
      if (message) {
        message.reportStatus = "처리 완료";
        persist();
        showToast("신고 처리 상태를 변경했습니다.");
        render();
      }
    }
  });

  document.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;

    if (form.id === "loginForm") {
      const data = Object.fromEntries(new FormData(form));
      const name = String(data.name || "").trim();
      const studentId = normalizeStudentId(data.studentId);
      const password = String(data.password || "");

      if (studentId === ADMIN_STUDENT_ID && password === ADMIN_PASSWORD) {
        store.session = { userId: null, isAdmin: true };
        persist();
        showToast("관리자로 로그인했습니다.");
        setRoute("admin");
        return;
      }

      const user = store.users.find((item) => item.name === name && item.studentId === studentId);
      if (!user || user.passwordHash !== await hashPassword(password)) {
        showToast("이름, 학번 또는 비밀번호가 올바르지 않습니다.", "error");
        return;
      }
      store.session = { userId: user.id, isAdmin: false };
      persist();
      showToast(user.approved ? "로그인했습니다." : "로그인했습니다. 관리자 승인 후 주요 기능을 사용할 수 있습니다.");
      setRoute("main");
      return;
    }

    if (form.id === "signupForm") {
      const data = Object.fromEntries(new FormData(form));
      const name = String(data.name || "").trim();
      const studentId = normalizeStudentId(data.studentId);
      const password = String(data.password || "");
      const confirm = String(data.passwordConfirm || "");
      if (!name || !studentId) {
        showToast("이름과 학번을 입력해 주세요.", "error");
        return;
      }
      if (studentId === ADMIN_STUDENT_ID) {
        showToast("이 학번은 관리자 계정으로 예약되어 있습니다.", "error");
        return;
      }
      if (store.users.some((user) => user.studentId === studentId)) {
        showToast("이미 가입된 학번입니다.", "error");
        return;
      }
      const passwordError = passwordMessage(password);
      if (passwordError) {
        showToast(passwordError, "error");
        return;
      }
      if (password !== confirm) {
        showToast("비밀번호 확인이 일치하지 않습니다.", "error");
        return;
      }
      const user = {
        id: uid("user"),
        name,
        studentId,
        nickname: "",
        photo: "",
        passwordHash: await hashPassword(password),
        approved: false,
        suspended: false,
        createdAt: now(),
      };
      store.users.push(user);
      store.session = { userId: user.id, isAdmin: false };
      persist();
      showToast("가입 신청이 완료되었습니다. 관리자 승인을 기다려 주세요.");
      setRoute("main");
      return;
    }

    if (form.id === "resetPasswordForm") {
      const data = Object.fromEntries(new FormData(form));
      const user = store.users.find((item) => item.name === String(data.name || "").trim() && item.studentId === normalizeStudentId(data.studentId));
      if (!user) {
        showToast("해당 이름과 학번의 사용자를 찾을 수 없습니다.", "error");
        return;
      }
      const password = String(data.password || "");
      const passwordError = passwordMessage(password);
      if (passwordError) {
        showToast(passwordError, "error");
        return;
      }
      user.passwordHash = await hashPassword(password);
      persist();
      showToast("비밀번호가 재설정되었습니다.");
      form.reset();
      return;
    }

    if (form.id === "profileForm") {
      const user = currentUser();
      if (!user) return;
      const data = new FormData(form);
      user.nickname = String(data.get("nickname") || "").trim();
      const file = form.querySelector('[name="photo"]').files[0];
      if (file) user.photo = await readFileAsDataUrl(file);
      persist();
      showToast("프로필이 저장되었습니다.");
      render();
      return;
    }

    if (form.id === "profilePasswordForm") {
      const user = currentUser();
      if (!user) return;
      const password = String(new FormData(form).get("password") || "");
      const passwordError = passwordMessage(password);
      if (passwordError) {
        showToast(passwordError, "error");
        return;
      }
      user.passwordHash = await hashPassword(password);
      persist();
      showToast("비밀번호가 변경되었습니다.");
      form.reset();
      return;
    }

    if (form.id === "reviewSearchForm") {
      ui.reviewSearch = String(new FormData(form).get("search") || "").trim();
      ui.reviewSort = String(new FormData(form).get("sort") || "latest");
      ui.activePostId = null;
      render();
      return;
    }

    if (form.id === "reviewForm") {
      if (!requireWritable()) return;
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      const content = String(data.get("content") || "").trim();
      const hashInput = String(data.get("hashtags") || "");
      if (!title || !content) {
        showToast("제목과 내용을 입력해 주세요.", "error");
        return;
      }
      const editingId = form.dataset.editingId;
      const existing = store.posts.find((post) => post.id === editingId);
      if (existing && existing.userId !== currentUser()?.id && !isAdmin()) return;
      const file = form.querySelector('[name="photo"]').files[0];
      const photo = file ? await readFileAsDataUrl(file) : existing?.photo || "";
      const hashtags = [...new Set([...extractHashtags(hashInput), ...extractHashtags(content)])];

      if (existing) {
        Object.assign(existing, { title, content, hashtags, photo, updatedAt: now() });
        showToast("게시글이 수정되었습니다.");
      } else {
        store.posts.push({
          id: uid("post"),
          userId: currentUser().id,
          title,
          content,
          photo,
          hashtags,
          createdAt: now(),
          updatedAt: now(),
          views: 0,
          hidden: false,
          comments: [],
        });
        showToast("게시글이 등록되었습니다.");
      }
      ui.editingPostId = null;
      persist();
      render();
      return;
    }

    if (form.classList.contains("comment-form") || form.classList.contains("reply-form")) {
      if (!requireWritable()) return;
      const data = new FormData(form);
      const text = String(data.get("text") || "").trim();
      if (!text) {
        showToast("댓글 내용을 입력해 주세요.", "error");
        return;
      }
      const target = findTarget(form.dataset.targetType, form.dataset.targetId);
      if (!target) return;
      target.comments ||= [];
      if (form.classList.contains("comment-form")) {
        target.comments.push({ id: uid("comment"), userId: currentUser().id, text, createdAt: now(), replies: [] });
        showToast("댓글이 등록되었습니다.");
      } else {
        const comment = target.comments.find((item) => item.id === form.dataset.commentId);
        if (!comment) return;
        comment.replies ||= [];
        comment.replies.push({ id: uid("reply"), userId: currentUser().id, text, createdAt: now() });
        showToast("대댓글이 등록되었습니다.");
      }
      persist();
      render();
      return;
    }

    if (form.id === "friendRequestForm") {
      if (!requireWritable()) return;
      const name = String(new FormData(form).get("name") || "").trim();
      const me = currentUser();
      const target = store.users.find((user) => user.name === name || user.nickname === name);
      if (!target) {
        showToast("해당 이름의 사용자를 찾을 수 없습니다.", "error");
        return;
      }
      if (target.id === me.id) {
        showToast("본인에게는 친구 요청을 보낼 수 없습니다.", "error");
        return;
      }
      if (areFriends(me.id, target.id)) {
        showToast("이미 친구인 사용자입니다.", "error");
        return;
      }
      const hasPending = store.friendRequests.some((request) =>
        request.status === "pending" &&
        ((request.fromId === me.id && request.toId === target.id) || (request.fromId === target.id && request.toId === me.id))
      );
      if (hasPending) {
        showToast("이미 대기 중인 친구 요청이 있습니다.", "error");
        return;
      }
      store.friendRequests.push({ id: uid("request"), fromId: me.id, toId: target.id, status: "pending", createdAt: now() });
      persist();
      showToast("친구 요청을 보냈습니다.");
      form.reset();
      render();
      return;
    }

    if (form.id === "messageForm") {
      if (!requireWritable()) return;
      const data = Object.fromEntries(new FormData(form));
      const me = currentUser();
      const toId = String(data.toId || "");
      if (!toId || !areFriends(me.id, toId)) {
        showToast("친구 관계인 사용자에게만 쪽지를 보낼 수 있습니다.", "error");
        return;
      }
      const title = String(data.title || "").trim();
      const body = String(data.body || "").trim();
      if (!title || !body) {
        showToast("쪽지 제목과 내용을 입력해 주세요.", "error");
        return;
      }
      store.messages.push({
        id: uid("message"),
        fromId: me.id,
        toId,
        title,
        body,
        createdAt: now(),
        readAt: "",
        deletedForSender: false,
        deletedForReceiver: false,
        reported: false,
      });
      persist();
      showToast("쪽지를 전송했습니다.");
      form.reset();
      ui.messageTab = "sent";
      render();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "reviewSort") {
      ui.reviewSort = event.target.value;
      render();
    }
    if (event.target.id === "pdfInput" && event.target.files.length) {
      handlePdfFiles(event.target.files);
    }
  });

  document.addEventListener("dragover", (event) => {
    const drop = event.target.closest("#pdfDrop");
    if (!drop) return;
    event.preventDefault();
    drop.classList.add("dragover");
  });

  document.addEventListener("dragleave", (event) => {
    const drop = event.target.closest("#pdfDrop");
    if (drop) drop.classList.remove("dragover");
  });

  document.addEventListener("drop", (event) => {
    const drop = event.target.closest("#pdfDrop");
    if (!drop) return;
    event.preventDefault();
    drop.classList.remove("dragover");
    handlePdfFiles(event.dataTransfer.files);
  });

  document.querySelector("#logoutButton").addEventListener("click", () => {
    store.session = { userId: null, isAdmin: false };
    persist();
    showToast("로그아웃했습니다.");
    setRoute("main");
  });

  window.addEventListener("hashchange", render);

  function deleteCommentAction(button, action) {
    const target = findTarget(button.dataset.targetType, button.dataset.targetId);
    if (!target) return;
    const comment = (target.comments || []).find((item) => item.id === button.dataset.commentId);
    if (!comment) return;
    if (action === "delete-comment") {
      if (!isAdmin() && comment.userId !== currentUser()?.id) return;
      target.comments = target.comments.filter((item) => item.id !== comment.id);
      showToast("댓글을 삭제했습니다.");
    } else {
      const reply = (comment.replies || []).find((item) => item.id === button.dataset.replyId);
      if (!reply || (!isAdmin() && reply.userId !== currentUser()?.id)) return;
      comment.replies = comment.replies.filter((item) => item.id !== reply.id);
      showToast("대댓글을 삭제했습니다.");
    }
    persist();
    render();
  }

  function updateUser(id, patch) {
    if (!isAdmin()) return;
    const user = store.users.find((item) => item.id === id);
    if (!user) return;
    Object.assign(user, patch);
    persist();
    render();
  }

  function handlePdfFiles(files) {
    if (!requireWritable()) return;
    const file = Array.from(files)[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      showToast("PDF 파일만 업로드할 수 있습니다.", "error");
      return;
    }
    const item = {
      id: uid("pdf"),
      userId: currentUser().id,
      fileName: file.name,
      createdAt: now(),
      rows: [blankBoardRow()],
    };
    store.pdfs.push(item);
    ui.activePdfId = item.id;
    persist();
    showToast("PDF가 업로드되었습니다.");
    render();
  }

  render();
})();

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultOutputRoot = path.join(repositoryRoot, "artifacts/ui-preview");

const entry = (id, screen, title, variant, outputPath) => ({ id, screen, title, variant, outputPath });

/** Deterministic order shared by gallery and previous/next navigation. */
export const previewManifest = Object.freeze([
  entry("s1-login-success", "S1", "로그인", "success", "screens/s1-login/success.html"),
  entry("s1-login-error", "S1", "로그인 callback 오류", "error", "screens/s1-login/error.html"),
  entry("s1-login-pending", "S1", "승인 대기", "pending", "screens/s1-login/pending.html"),
  entry("s2-home-success", "S2", "학습 홈", "success", "screens/s2-home/success.html"),
  entry("s2-home-loading", "S2", "학습 홈", "loading", "screens/s2-home/loading.html"),
  entry("s2-home-empty", "S2", "학습 홈", "empty", "screens/s2-home/empty.html"),
  entry("s2-home-error", "S2", "학습 홈", "error", "screens/s2-home/error.html"),
  entry("s3-mode-success", "S3", "학습 모드 선택", "success", "screens/s3-mode-select/success.html"),
  entry("s3-mode-resume", "S3", "학습 모드 선택", "resume", "screens/s3-mode-select/resume.html"),
  entry("s3-mode-confirm", "S3", "학습 모드 선택", "confirm", "screens/s3-mode-select/confirm.html"),
  entry("s4-practice-unsubmitted", "S4", "연습 모드", "unsubmitted", "screens/s4-practice/unsubmitted.html"),
  entry("s4-practice-submitted", "S4", "연습 모드", "submitted", "screens/s4-practice/submitted.html"),
  entry("s4-practice-error", "S4", "연습 모드", "error", "screens/s4-practice/error.html"),
  entry("s5-exam-active", "S5", "모의고사", "active", "screens/s5-exam/active.html"),
  entry("s5-exam-preview", "S5", "모의고사", "preview", "screens/s5-exam/preview.html"),
  entry("s5-exam-expired", "S5", "모의고사", "expired", "screens/s5-exam/expired.html"),
  entry("s6-practice-result-success", "S6", "연습 결과", "success", "screens/s6-practice-result/success.html"),
  entry("s6-practice-result-expired", "S6", "연습 결과", "expired", "screens/s6-practice-result/expired.html"),
  entry("s7-exam-result-success", "S7", "모의고사 결과", "success", "screens/s7-exam-result/success.html"),
  entry("s7-exam-result-error", "S7", "모의고사 결과", "error", "screens/s7-exam-result/error.html"),
  entry("s8-history-success", "S8", "모의고사 이력", "success", "screens/s8-history/success.html"),
  entry("s8-history-empty", "S8", "모의고사 이력", "empty", "screens/s8-history/empty.html"),
  entry("s8-history-error", "S8", "모의고사 이력", "error", "screens/s8-history/error.html"),
  entry("s9-leaderboard-success", "S9", "리더보드", "success", "screens/s9-leaderboard/success.html"),
  entry("s9-leaderboard-empty", "S9", "리더보드", "empty", "screens/s9-leaderboard/empty.html"),
  entry("s9-leaderboard-private", "S9", "리더보드", "private", "screens/s9-leaderboard/private.html"),
  entry("s9-leaderboard-error", "S9", "리더보드", "error", "screens/s9-leaderboard/error.html"),
  entry("admin-users-success", "ADMIN", "승인 대기 사용자", "success", "screens/admin-users/success.html"),
  entry("admin-users-empty", "ADMIN", "승인 대기 사용자", "empty", "screens/admin-users/empty.html"),
  entry("admin-users-error", "ADMIN", "승인 대기 사용자", "error", "screens/admin-users/error.html"),
  entry("s10-import-empty", "S10", "문제 은행 임포트", "empty", "screens/s10-admin-import/empty.html"),
  entry("s10-import-validating", "S10", "문제 은행 임포트", "validating", "screens/s10-admin-import/validating.html"),
  entry("s10-import-valid", "S10", "문제 은행 임포트", "valid", "screens/s10-admin-import/valid.html"),
  entry("s10-import-invalid", "S10", "문제 은행 임포트", "invalid", "screens/s10-admin-import/invalid.html"),
  entry("s10-import-commit", "S10", "문제 은행 임포트", "commit", "screens/s10-admin-import/commit.html"),
  entry("s10-import-error", "S10", "문제 은행 임포트", "error", "screens/s10-admin-import/error.html"),
]);

const css = `:root {
  color-scheme: light;
  --bg: #f4f7fb; --surface: #ffffff; --surface-2: #f8fafc; --ink: #172033;
  --muted: #5b677a; --line: #d8e0eb; --primary: #4338ca; --primary-dark: #3730a3;
  --primary-soft: #eef2ff; --success: #047857; --success-soft: #ecfdf5;
  --warning: #92400e; --warning-soft: #fffbeb; --danger: #b91c1c; --danger-soft: #fef2f2;
  --info: #1d4ed8; --info-soft: #eff6ff; --radius: 16px;
  --shadow: 0 14px 38px rgba(35, 48, 75, .09);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ink); background: var(--bg); font-synthesis: none;
}
* { box-sizing: border-box; }
html { min-width: 1024px; scroll-behavior: smooth; }
body { margin: 0; min-height: 100vh; background: var(--bg); }
a { color: inherit; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid rgba(79, 70, 229, .36); outline-offset: 3px; }
.skip { position: fixed; left: 16px; top: -64px; z-index: 20; padding: 10px 14px; border-radius: 8px; color: white; background: var(--primary); }
.skip:focus { top: 16px; }
.topbar { position: sticky; top: 0; z-index: 10; display: flex; min-height: 72px; align-items: center; justify-content: space-between; gap: 24px; padding: 0 32px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.96); }
.brand { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; font-weight: 850; letter-spacing: -.02em; }
.brand-mark { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 11px; color: white; background: linear-gradient(145deg, #4f46e5, #312e81); box-shadow: 0 8px 20px rgba(67,56,202,.24); font-size: 13px; }
.brand-copy { display: grid; gap: 2px; }.brand-copy small { color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
.topnav { display: flex; gap: 6px; }.topnav a, .side-nav a { border-radius: 9px; color: var(--muted); font-size: 14px; font-weight: 700; text-decoration: none; }
.topnav a { padding: 9px 12px; }.topnav a:hover, .side-nav a:hover { color: var(--primary); background: var(--primary-soft); }
.shell { display: grid; grid-template-columns: 238px minmax(0, 1fr); max-width: 1536px; min-height: calc(100vh - 72px); margin: auto; }
.sidebar { display: flex; flex-direction: column; padding: 28px 18px; border-right: 1px solid var(--line); background: var(--surface); }
.side-label { margin: 0 10px 10px; color: #8490a3; font-size: 10px; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
.side-nav { display: grid; gap: 5px; }.side-nav a { padding: 11px 12px; }.side-nav a.current { color: var(--primary); background: var(--primary-soft); }
.side-meta { margin-top: auto; padding: 14px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); background: var(--surface-2); font-size: 12px; line-height: 1.5; }
.main { min-width: 0; padding: 42px 48px 56px; }.content { max-width: 1120px; margin: 0 auto; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.eyebrow { margin: 0 0 8px; color: var(--primary); font-size: 11px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; }
h1, h2, h3, p { overflow-wrap: break-word; }h1 { margin: 0; font-size: 32px; line-height: 1.2; letter-spacing: -.035em; }h2 { margin: 0; font-size: 21px; letter-spacing: -.02em; }h3 { margin: 0; font-size: 16px; }
.lead { max-width: 760px; margin: 10px 0 0; color: var(--muted); line-height: 1.65; }.muted { color: var(--muted); }.small { font-size: 13px; }
.badge { display: inline-flex; align-items: center; gap: 6px; width: max-content; padding: 5px 9px; border-radius: 999px; color: #3730a3; background: var(--primary-soft); font-size: 11px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
.badge.success { color: var(--success); background: var(--success-soft); }.badge.warning { color: var(--warning); background: var(--warning-soft); }.badge.danger { color: var(--danger); background: var(--danger-soft); }
.grid { display: grid; gap: 18px; }.grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }.grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }.grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.card { min-width: 0; padding: 24px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }.card.flat { box-shadow: none; }.card p:last-child { margin-bottom: 0; }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }.card-head p { margin: 5px 0 0; }
.metric { padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }.metric strong { display: block; margin-top: 8px; font-size: 27px; letter-spacing: -.04em; }.metric span { color: var(--muted); font-size: 12px; font-weight: 750; }
.btn { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; padding: 9px 15px; border: 1px solid transparent; border-radius: 9px; color: white; background: var(--primary); font-size: 14px; font-weight: 800; text-decoration: none; }.btn.secondary { border-color: var(--line); color: var(--ink); background: white; }.btn.ghost { color: var(--primary); background: var(--primary-soft); }.actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 20px; }
.banner, .state { padding: 18px 20px; border: 1px solid #bfdbfe; border-radius: 13px; color: #1e3a8a; background: var(--info-soft); }.banner.success, .state.success { border-color: #a7f3d0; color: #065f46; background: var(--success-soft); }.banner.warning, .state.empty { border-color: #fde68a; color: #78350f; background: var(--warning-soft); }.banner.danger, .state.error { border-color: #fecaca; color: #991b1b; background: var(--danger-soft); }.state.loading { border-color: #c7d2fe; color: #3730a3; background: var(--primary-soft); }.state h2 { margin-bottom: 8px; }.state p { margin: 0; line-height: 1.6; }
.skeleton { position: relative; overflow: hidden; height: 14px; border-radius: 6px; background: #dfe5ef; }.skeleton + .skeleton { margin-top: 12px; }.skeleton.short { width: 56%; }.skeleton::after { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.72), transparent); content: ""; transform: translateX(-100%); }
.cert-title { margin: 9px 0 8px; font-size: 22px; line-height: 1.32; }.meta-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }.chip { padding: 6px 9px; border-radius: 8px; color: #475569; background: #f1f5f9; font-size: 12px; font-weight: 700; }
.question-layout { display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 20px; }.question { padding: 28px; }.question-number { color: var(--muted); font-size: 12px; font-weight: 800; }.question-text { margin: 14px 0 20px; font-size: 20px; font-weight: 750; line-height: 1.5; }.choices { display: grid; gap: 10px; }.choice { display: flex; gap: 11px; align-items: flex-start; padding: 14px; border: 1px solid var(--line); border-radius: 11px; background: white; }.choice.selected { border-color: #818cf8; background: var(--primary-soft); }.choice.correct { border-color: #6ee7b7; background: var(--success-soft); }.choice input { margin-top: 3px; accent-color: var(--primary); }
.navigator { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin-top: 14px; }.qnum { display: grid; aspect-ratio: 1; place-items: center; border: 1px solid var(--line); border-radius: 8px; color: #475569; background: white; font-size: 12px; font-weight: 800; }.qnum.current { border-color: var(--primary); color: white; background: var(--primary); }.qnum.answered { color: var(--success); background: var(--success-soft); }.qnum.flagged::after { color: #d97706; content: "•"; }
.timer { display: grid; place-items: center; padding: 22px; border-radius: 14px; color: white; background: #172033; }.timer strong { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 30px; letter-spacing: .06em; }.timer span { margin-top: 5px; color: #b7c1d2; font-size: 11px; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }caption { padding: 0 0 12px; color: var(--muted); text-align: left; }th, td { padding: 13px 14px; border-bottom: 1px solid var(--line); text-align: left; }thead th { color: var(--muted); background: var(--surface-2); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }tbody th { font-weight: 800; }.current-row { background: var(--primary-soft); }
.progress { overflow: hidden; height: 8px; margin-top: 9px; border-radius: 999px; background: #e8edf5; }.progress > span { display: block; width: var(--value); height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--primary), #818cf8); }.domain-list { display: grid; gap: 14px; }.domain-row { display: grid; grid-template-columns: minmax(220px, 1fr) 2fr 56px; gap: 16px; align-items: center; font-size: 13px; }.domain-row strong { text-align: right; }
.dropzone { display: grid; min-height: 210px; place-items: center; padding: 30px; border: 2px dashed #aab5c5; border-radius: 16px; text-align: center; background: var(--surface-2); }.drop-icon { display: grid; width: 52px; height: 52px; place-items: center; margin: 0 auto 12px; border-radius: 14px; color: var(--primary); background: var(--primary-soft); font-size: 22px; }.error-list { margin: 12px 0 0; padding-left: 22px; color: var(--danger); }.error-list li + li { margin-top: 8px; }
.dialog { max-width: 610px; margin: 20px auto 0; padding: 26px; border: 1px solid #c7d2fe; border-radius: 17px; background: white; box-shadow: 0 24px 64px rgba(15,23,42,.20); }.dialog h2 { margin-bottom: 8px; }
.footer-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 34px; padding-top: 22px; border-top: 1px solid var(--line); }.footer-nav a { color: var(--primary); font-size: 13px; font-weight: 800; text-decoration: none; }
.gallery-hero { padding: 64px 56px 42px; color: white; background: radial-gradient(circle at 84% 18%, rgba(129,140,248,.38), transparent 28%), linear-gradient(135deg, #172033, #27245d 62%, #4338ca); }.gallery-hero .brand { color: white; }.gallery-hero h1 { max-width: 780px; margin-top: 54px; font-size: 52px; }.gallery-hero .lead { color: #d9def0; font-size: 18px; }.review-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }.review-meta span { padding: 8px 11px; border: 1px solid rgba(255,255,255,.18); border-radius: 9px; background: rgba(255,255,255,.08); font-size: 12px; }
.gallery-main { max-width: 1480px; margin: auto; padding: 42px 48px 64px; }.gallery-section + .gallery-section { margin-top: 42px; }.section-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }.section-head p { margin: 6px 0 0; color: var(--muted); }.gallery-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }.preview-card { overflow: hidden; border: 1px solid var(--line); border-radius: 17px; background: white; box-shadow: var(--shadow); }.preview-visual { position: relative; min-height: 178px; padding: 18px; background: #eef2f7; }.mini-window { overflow: hidden; min-height: 142px; border-radius: 10px; background: white; box-shadow: 0 8px 22px rgba(31,41,55,.11); }.mini-bar { height: 22px; border-bottom: 1px solid #e5e7eb; background: #fff; }.mini-layout { display: grid; grid-template-columns: 42px 1fr; min-height: 120px; }.mini-side { background: #f8fafc; border-right: 1px solid #e5e7eb; }.mini-body { padding: 14px; }.mini-line { height: 6px; margin-bottom: 7px; border-radius: 4px; background: #dfe5ef; }.mini-line.accent { width: 34%; background: #818cf8; }.mini-line.short { width: 62%; }.mini-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 11px; }.mini-box { height: 45px; border: 1px solid #e2e8f0; border-radius: 7px; background: #fafcff; }.preview-copy { padding: 20px; }.preview-copy h3 { font-size: 18px; }.preview-copy p { min-height: 42px; margin: 8px 0 16px; color: var(--muted); font-size: 13px; line-height: 1.55; }.variant-links { display: flex; flex-wrap: wrap; gap: 6px; }.variant-links a { padding: 6px 8px; border-radius: 7px; color: var(--primary); background: var(--primary-soft); font-size: 11px; font-weight: 800; text-decoration: none; }
.note { padding: 20px; border: 1px solid var(--line); border-radius: 14px; color: var(--muted); background: white; font-size: 13px; line-height: 1.65; }.kbd { padding: 2px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; color: var(--ink); background: white; font-family: ui-monospace, monospace; font-size: 11px; }
@media (max-width: 1180px) { .gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.main { padding-inline: 32px; }.grid.four { grid-template-columns: repeat(2, 1fr); } }
@media (prefers-reduced-motion: no-preference) { .skeleton::after { animation: shimmer 1.8s infinite; } @keyframes shimmer { to { transform: translateX(100%); } } }
`;

const fixture = Object.freeze({
  certification: "AWS Certified DevOps Engineer – Professional",
  code: "DOP-C02",
  questions: 75,
  minutes: 180,
  threshold: "75%",
  rawScore: "60 / 75",
  accuracy: "80.00%",
  reference: "800",
  serverNow: "2025-01-15 09:00 UTC",
  domains: [
    ["SDLC Automation", 22, 88], ["Configuration Management and IaC", 17, 76],
    ["Security and Compliance", 17, 82], ["Resilient Cloud Solutions", 15, 73],
    ["Monitoring and Logging", 15, 80], ["Incident and Event Response", 14, 78],
  ],
});

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const relativeHref = (fromFile, toFile) => path.posix.relative(path.posix.dirname(fromFile), toFile) || path.posix.basename(toFile);
const findEntry = (id) => previewManifest.find((item) => item.id === id);

function statePanel(state, title, message, action = "") {
  return `<section class="state ${state}" aria-labelledby="state-title"${state === "loading" ? ' aria-busy="true"' : state === "error" ? ' role="alert"' : ""}><h2 id="state-title">${title}</h2><p>${message}</p>${action ? `<div class="actions">${action}</div>` : ""}</section>`;
}

function scoreSummary(includePass = false) {
  return `<div class="grid four" aria-label="점수 요약">
    <div class="metric"><span>원점수</span><strong>${fixture.rawScore}</strong></div>
    <div class="metric"><span>정답률</span><strong>${fixture.accuracy}</strong></div>
    <div class="metric"><span>합격 기준</span><strong>${fixture.threshold}</strong></div>
    <div class="metric"><span>참고 환산값${includePass ? " · 합격" : ""}</span><strong>${fixture.reference}</strong></div>
  </div>`;
}

function domainBreakdown() {
  return `<section class="card flat" aria-labelledby="domain-title"><div class="card-head"><div><h2 id="domain-title">도메인별 성과</h2><p class="muted small">원점수와 정답률을 우선 표시합니다.</p></div></div><div class="domain-list">${fixture.domains.map(([name, weight, score]) => `<div class="domain-row"><span>${name} · ${weight}%</span><div class="progress" aria-hidden="true"><span style="--value:${score}%"></span></div><strong>${score}%</strong></div>`).join("")}</div></section>`;
}

function certificationCard() {
  return `<article class="card"><span class="badge success">학습 가능</span><p class="eyebrow">AWS · ${fixture.code}</p><h2 class="cert-title">${fixture.certification}</h2><p class="muted">실전 도메인 비율을 반영한 연습과 모의고사를 제공합니다.</p><div class="meta-row"><span class="chip">${fixture.questions}문항</span><span class="chip">${fixture.minutes}분</span><span class="chip">합격 ${fixture.threshold}</span><span class="chip">all or nothing</span></div><div class="actions"><span class="btn">학습 모드 선택</span><span class="btn secondary">시험 정보</span></div></article>`;
}

function questionCard(submitted = false) {
  return `<div class="question-layout"><section class="card question" aria-labelledby="question-title"><div class="card-head"><div><span class="question-number">QUESTION 18 / 75 · Security and Compliance</span><h2 id="question-title" class="question-text">여러 AWS 계정에서 보안 이벤트를 중앙 수집하기 위한 가장 적합한 구성을 선택하세요.</h2></div><span class="badge warning">Flag</span></div><fieldset class="choices"><legend class="muted small">정답 2개를 선택하세요 · 선택 2 / 2</legend><label class="choice selected ${submitted ? "correct" : ""}"><input type="checkbox" checked disabled> AWS Organizations와 delegated administrator를 구성합니다.</label><label class="choice"><input type="checkbox" disabled> 각 계정에서 독립된 로컬 알림만 사용합니다.</label><label class="choice selected ${submitted ? "correct" : ""}"><input type="checkbox" checked disabled> Security Hub findings를 중앙 계정으로 집계합니다.</label><label class="choice"><input type="checkbox" disabled> 모든 CloudTrail 로깅을 비활성화합니다.</label></fieldset>${submitted ? `<div class="banner success"><strong>정답입니다 · 1.00점</strong><p>조직 단위의 delegated administrator와 중앙 findings 집계로 운영 경계를 유지합니다.</p><p class="small">안전한 Markdown 예시: <code>&lt;script&gt;alert(1)&lt;/script&gt;</code>는 텍스트로 표시되며, 위험 URL은 링크로 만들지 않습니다.</p></div>` : `<div class="actions"><span class="btn">답안 제출</span><span class="btn secondary">임시 선택 상태</span></div>`}</section><aside class="grid" aria-label="문항 탐색"><div class="card flat"><h3>문항 탐색</h3><div class="navigator">${Array.from({ length: 20 }, (_, index) => `<span class="qnum ${index === 17 ? "current flagged" : index < 12 ? "answered" : ""}">${index + 1}</span>`).join("")}</div><p class="muted small">응답 12 · 미응답 63 · Flag 3</p></div><div class="card flat"><h3>언어</h3><div class="actions"><span class="btn ghost">한국어</span><span class="btn secondary">English</span></div></div></aside></div>`;
}

function renderScreenBody(item) {
  const { screen, variant } = item;
  if (screen === "S1") {
    if (variant === "error") return statePanel("error", "로그인을 완료할 수 없습니다", "인증 정보나 token을 노출하지 않는 안전한 callback 오류입니다.", '<span class="btn secondary">로그인 화면으로</span>');
    if (variant === "pending") return `<section class="card"><span class="badge warning">승인 대기</span><h2 class="cert-title">관리자 승인을 기다리고 있어요</h2><p class="lead">현재 계정은 승인 상태만 확인할 수 있습니다. 보호된 학습 데이터는 표시하지 않습니다.</p><div class="banner warning"><strong>마지막 확인</strong><p>${fixture.serverNow} · 승인 전에는 이 화면만 사용할 수 있습니다.</p></div><div class="actions"><span class="btn">승인 상태 새로고침</span><span class="btn secondary">로그아웃</span></div></section>`;
    return `<div class="grid two"><section class="card"><p class="eyebrow">PRIVATE LEARNING WORKSPACE</p><h2 class="cert-title">클라우드 자격증 학습을 한 곳에서</h2><p class="lead">연습, 모의고사, 이력과 리더보드를 일관된 흐름으로 관리합니다.</p><div class="actions"><span class="btn">Google로 계속하기</span></div><p class="muted small">별도 비밀번호를 저장하지 않습니다.</p></section><aside class="card flat" aria-label="서비스 특징"><h2>학습 흐름</h2><div class="grid"><div class="banner">01 · 자격증과 모드를 선택합니다.</div><div class="banner">02 · 문제별 피드백 또는 실전 시간을 경험합니다.</div><div class="banner">03 · 도메인별 결과를 검토합니다.</div></div></aside></div>`;
  }
  if (screen === "S2") {
    if (variant === "loading") return `<div class="grid two"><div class="card">${'<div class="skeleton"></div>'.repeat(3)}<div class="skeleton short"></div></div><div class="card">${'<div class="skeleton"></div>'.repeat(4)}</div></div>`;
    if (variant === "empty") return statePanel("empty", "이용 가능한 자격증이 없습니다", "현재 조건에서 학습 가능한 자격증이 없습니다. 나중에 catalog를 다시 확인하세요.");
    if (variant === "error") return statePanel("error", "카탈로그를 표시할 수 없습니다", "보호 정보 없이 잘못된 certification 데이터를 안내합니다.", '<span class="btn secondary">관리자에게 문의</span>');
    return `<div class="banner"><strong>이어 풀 수 있는 연습이 있습니다</strong><p>DOP-C02 · 18 / 75번 · 마지막 저장 ${fixture.serverNow}</p></div><section aria-labelledby="provider-title"><div class="card-head"><div><p class="eyebrow">PROVIDER</p><h2 id="provider-title">Amazon Web Services</h2></div><span class="badge">1 certification</span></div>${certificationCard()}</section>`;
  }
  if (screen === "S3") {
    const modes = `<div class="grid two"><article class="card"><span class="badge success">시간 제한 없음</span><h2 class="cert-title">연습 모드</h2><p class="muted">문항을 제출하면 답이 잠기고 즉시 정답과 해설을 확인합니다.</p><div class="actions"><span class="btn">연습 시작</span></div></article><article class="card"><span class="badge warning">${fixture.minutes}분</span><h2 class="cert-title">모의고사</h2><p class="muted">75문항을 제한 시간 안에 풀고 제출 후 전체 결과를 검토합니다.</p><div class="actions"><span class="btn">모의고사 시작</span></div></article></div>`;
    if (variant === "resume") return `${modes}<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title" aria-describedby="resume-description"><h2 id="resume-title">진행 중인 연습이 있습니다</h2><p id="resume-description" class="muted">18번 문항부터 이어 풀거나 기존 세션을 명시적으로 교체하세요. 선택 전에는 상태가 바뀌지 않습니다.</p><div class="actions"><span class="btn">이어 풀기</span><span class="btn secondary">새로 시작</span></div></div>`;
    if (variant === "confirm") return `${modes}<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><h2 id="confirm-title">모의고사를 시작할까요?</h2><p id="confirm-description" class="muted">확인 시점부터 서버 기준 ${fixture.minutes}분이 시작되는 표현입니다. 이 정적 화면은 타이머를 실행하지 않습니다.</p><div class="actions"><span class="btn">확인하고 시작</span><span class="btn secondary">취소</span></div></div>`;
    return `<section class="card flat"><p class="eyebrow">AWS · ${fixture.code}</p><h2>${fixture.certification}</h2><div class="meta-row"><span class="chip">${fixture.questions}문항</span><span class="chip">${fixture.minutes}분</span><span class="chip">합격 ${fixture.threshold}</span></div></section>${modes}`;
  }
  if (screen === "S4") {
    if (variant === "error") return statePanel("error", "연습 세션을 불러오지 못했습니다", "입력은 유지되며 동일 요청으로 성공할 수 있는 오류입니다.", '<span class="btn">다시 시도</span>');
    return questionCard(variant === "submitted");
  }
  if (screen === "S5") {
    if (variant === "expired") return statePanel("empty", "시험 시간이 만료되었습니다", "저장된 상태로 결과가 확정되었는지 확인한 뒤 모의고사 결과 화면으로 이동합니다.", '<span class="btn">결과 확인</span>');
    const active = `<div class="question-layout"><div>${questionCard(false).replace('<div class="question-layout">', '').replace('</div>', '')}</div><aside class="grid"><div class="timer"><strong>02:14:36</strong><span>고정 서버 타이머 표현</span></div><div class="card flat"><h3>진행 현황</h3><p class="muted">응답 42 · 미응답 33 · Flag 6</p></div></aside></div>`;
    if (variant === "preview") return `${active}<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title" aria-describedby="submit-description"><h2 id="submit-title">모의고사를 제출할까요?</h2><p id="submit-description" class="muted">서버에 저장된 상태 기준으로 미응답 33개, Flag 6개가 있습니다.</p><div class="actions"><span class="btn">제출 확정</span><span class="btn secondary">계속 풀기</span></div></div>`;
    return active;
  }
  if (screen === "S6") {
    if (variant === "expired") return statePanel("empty", "연습 결과가 만료되었습니다", "완료 시점부터 168시간이 지나 더 이상 볼 수 없습니다.", '<span class="btn">새 연습 시작</span>');
    return `${scoreSummary()}<div class="banner warning"><strong>복습 가능 기간</strong><p>2025-01-22 09:00 UTC까지 · 완료 후 168시간</p></div>${domainBreakdown()}`;
  }
  if (screen === "S7") {
    if (variant === "error") return statePanel("error", "모의고사 결과를 불러오지 못했습니다", "안전한 오류 메시지만 표시합니다.", '<span class="btn">다시 시도</span>');
    return `<div class="banner success"><strong>합격</strong><p>합격 기준 ${fixture.threshold}를 충족했습니다. Reference 1000은 참고값입니다.</p></div>${scoreSummary(true)}${domainBreakdown()}`;
  }
  if (screen === "S8") {
    if (variant === "empty") return statePanel("empty", "아직 모의고사 이력이 없습니다", "연습 결과는 이력과 추이에 포함되지 않습니다.", '<span class="btn">모의고사 시작</span>');
    if (variant === "error") return statePanel("error", "이력을 불러오지 못했습니다", "현재 조회 조건은 유지됩니다.", '<span class="btn">다시 시도</span>');
    return `<div class="grid three"><div class="metric"><span>모의고사 응시</span><strong>3회</strong></div><div class="metric"><span>최고 정답률</span><strong>80.00%</strong></div><div class="metric"><span>점수 공개</span><strong>비공개</strong></div></div><section class="card flat" aria-labelledby="trend-title"><h2 id="trend-title">정답률 추이</h2><div class="domain-list"><div class="domain-row"><span>Attempt 1</span><div class="progress"><span style="--value:72%"></span></div><strong>72%</strong></div><div class="domain-row"><span>Attempt 2</span><div class="progress"><span style="--value:76%"></span></div><strong>76%</strong></div><div class="domain-row"><span>Attempt 3</span><div class="progress"><span style="--value:80%"></span></div><strong>80%</strong></div></div><table><caption>차트 대체 데이터 표</caption><thead><tr><th>응시</th><th>제출 시각</th><th>정답률</th></tr></thead><tbody><tr><th scope="row">1</th><td>2025-01-10</td><td>72%</td></tr><tr><th scope="row">2</th><td>2025-01-12</td><td>76%</td></tr><tr><th scope="row">3</th><td>2025-01-15</td><td>80%</td></tr></tbody></table></section>`;
  }
  if (screen === "S9") {
    if (variant === "empty") return statePanel("empty", "공개된 점수가 없습니다", "이 certification에 공개된 모의고사 최고 성과가 없습니다.");
    if (variant === "private") return `<div class="banner warning"><strong>내 점수는 비공개입니다</strong><p>현재 사용자는 순위 후보에 포함되지 않습니다. 아래 공개 순위는 계속 볼 수 있습니다.</p></div>${leaderboardTable(false)}`;
    if (variant === "error") return statePanel("error", "리더보드를 불러오지 못했습니다", "다른 사용자의 정보 없이 재시도 가능한 오류를 표시합니다.", '<span class="btn">다시 시도</span>');
    return leaderboardTable(true);
  }
  if (screen === "ADMIN") {
    if (variant === "empty") return statePanel("empty", "승인을 기다리는 사용자가 없습니다", "새 사용자가 최초 로그인하면 이 목록에서 검토할 수 있습니다.");
    if (variant === "error") return statePanel("error", "사용자 목록을 불러오지 못했습니다", "보호 데이터 없이 재시도 가능한 오류를 표시합니다.", '<span class="btn">다시 시도</span>');
    return `<section class="card flat"><table><caption>승인 대기 사용자 2명</caption><thead><tr><th>사용자</th><th>이메일</th><th>최초 로그인</th><th>상태</th></tr></thead><tbody><tr><th scope="row">Pending One</th><td>pending.one@example.test</td><td>2025-01-15 07:00 UTC</td><td><span class="badge warning">대기</span></td></tr><tr><th scope="row">Pending Two</th><td>pending.two@example.test</td><td>2025-01-15 08:00 UTC</td><td><span class="badge warning">대기</span></td></tr></tbody></table></section>`;
  }
  if (screen === "S10") return importScreen(variant);
  return statePanel("error", "지원하지 않는 화면", "Manifest를 확인하세요.");
}

function leaderboardTable(includeCurrent) {
  return `<section class="card flat"><div class="card-head"><div><h2>DOP-C02 공개 순위</h2><p class="muted small">정답률의 exact value로 공동 순위를 계산합니다.</p></div><span class="badge">Standard competition rank</span></div><table><caption>공개 사용자의 최고 모의고사 성과</caption><thead><tr><th>순위</th><th>사용자</th><th>원점수</th><th>정답률</th></tr></thead><tbody><tr><th scope="row">1</th><td>First Place</td><td>68 / 75</td><td>90.6666666666666667%</td></tr><tr class="${includeCurrent ? "current-row" : ""}"><th scope="row">2</th><td>Approved Learner ${includeCurrent ? '<span class="badge">나</span>' : ""}</td><td>60 / 75</td><td>80%</td></tr><tr><th scope="row">2</th><td>Tie Breaker</td><td>60 / 75</td><td>80%</td></tr><tr><th scope="row">4</th><td>Fourth Place</td><td>45 / 75</td><td>60%</td></tr></tbody></table></section>`;
}

function importScreen(variant) {
  const drop = `<section class="dropzone" aria-labelledby="drop-title"><div><span class="drop-icon" aria-hidden="true">{ }</span><h2 id="drop-title">Certification JSON 파일</h2><p class="muted">최대 10 MiB · JSON · 파일은 이 정적 artifact에서 읽지 않습니다.</p><span class="btn secondary">파일 선택</span></div></section>`;
  if (variant === "empty") return drop;
  if (variant === "validating") return `${drop}${statePanel("loading", "JSON 구조를 검증하는 중", "고정 fixture의 validating 표현이며 실제 파일 parsing이나 요청은 없습니다.")}`;
  const summary = `<div class="grid four"><div class="metric"><span>전체 문항</span><strong>${variant === "invalid" || variant === "error" ? "계산 불가" : "75"}</strong></div><div class="metric"><span>번역 완료</span><strong>60</strong></div><div class="metric"><span>영어 전용</span><strong>15</strong></div><div class="metric"><span>오류</span><strong>${variant === "invalid" || variant === "error" ? "2" : "0"}</strong></div></div>`;
  if (variant === "valid") return `${summary}${statePanel("success", "검증이 완료되었습니다", "6개 도메인과 75개 문항을 교체 전 검토할 수 있습니다.", '<span class="btn">교체 검토</span>')}`;
  if (variant === "commit") return `${summary}<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="commit-title" aria-describedby="commit-description"><h2 id="commit-title">문제 은행을 교체할까요?</h2><p id="commit-description" class="muted">검증된 동일 JSON을 사용한 교체 확인 표현입니다. 이 artifact는 commit을 실행하지 않습니다.</p><div class="actions"><span class="btn">교체 확인</span><span class="btn secondary">취소</span></div></div>`;
  const title = variant === "error" ? "검증 결과가 만료되었습니다" : "2개의 validation 오류가 있습니다";
  return `${summary}<section class="state error" role="alert" aria-labelledby="validation-title"><h2 id="validation-title">${title}</h2><ul class="error-list"><li><code>questions</code> 배열이 없어 전체 문항 수를 계산할 수 없습니다.</li><li><code>domains[2].weight</code> 합계가 정확히 100%가 아닙니다.</li></ul><div class="actions"><span class="btn secondary">수정 후 재검증</span></div></section>`;
}

function renderPage(item, index) {
  const previous = previewManifest[(index - 1 + previewManifest.length) % previewManifest.length];
  const next = previewManifest[(index + 1) % previewManifest.length];
  const cssHref = relativeHref(item.outputPath, "assets/preview.css");
  const galleryHref = relativeHref(item.outputPath, "index.html");
  const primary = ["s2-home-success", "s8-history-success", "s9-leaderboard-success", "admin-users-success"].map((id) => findEntry(id));
  const side = ["s3-mode-success", "s4-practice-unsubmitted", "s5-exam-active", "s6-practice-result-success", "s7-exam-result-success", "s10-import-empty"].map((id) => findEntry(id));
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="CertQuiz deterministic static UI review"><title>${escapeHtml(item.screen)} · ${escapeHtml(item.title)} · CertQuiz</title><link rel="stylesheet" href="${cssHref}"></head>
<body><a class="skip" href="#main-content">본문으로 건너뛰기</a><header class="topbar"><a class="brand" href="${galleryHref}"><span class="brand-mark">CQ</span><span class="brand-copy">CertQuiz<small>Static UI review</small></span></a><nav class="topnav" aria-label="주요 정적 화면">${primary.map((target) => `<a href="${relativeHref(item.outputPath, target.outputPath)}">${target.title}</a>`).join("")}</nav><span class="badge">${item.screen} · ${item.variant}</span></header>
<div class="shell"><aside class="sidebar"><p class="side-label">Learning flow</p><nav class="side-nav" aria-label="화면 바로가기">${side.map((target) => `<a href="${relativeHref(item.outputPath, target.outputPath)}"${target.screen === item.screen ? ' class="current" aria-current="page"' : ""}>${target.screen} · ${target.title}</a>`).join("")}</nav><div class="side-meta"><strong>정적 검토 전용</strong><br>API · auth · timer · mutation 없음<br>Fixture timestamp<br>${fixture.serverNow}</div></aside><main class="main" id="main-content" tabindex="-1"><div class="content"><header class="page-head"><div><p class="eyebrow">${item.screen} · ${item.variant}</p><h1>${escapeHtml(item.title)}</h1><p class="lead">${fixture.code} 고정 fixture를 사용하는 props-only 정적 표현입니다.</p></div><span class="badge ${item.variant === "error" || item.variant === "invalid" ? "danger" : item.variant === "success" || item.variant === "valid" ? "success" : ""}">${item.variant}</span></header>${renderScreenBody(item)}<footer class="footer-nav"><a href="${relativeHref(item.outputPath, previous.outputPath)}">← 이전 · ${previous.screen}</a><a href="${galleryHref}">전체 gallery</a><a href="${relativeHref(item.outputPath, next.outputPath)}">다음 · ${next.screen} →</a></footer></div></main></div></body></html>\n`;
}

const galleryGroups = [
  ["S1", "로그인 · callback · 승인 대기", "인증 흐름의 공개 및 제한 layout"], ["S2", "학습 홈", "Provider grouping과 certification metadata"],
  ["S3", "학습 모드 선택", "연습 재개와 시험 시작 확인"], ["S4", "연습 모드", "선택, navigator와 제출 후 해설"],
  ["S5", "모의고사", "고정 timer face와 제출 preview"], ["S6", "연습 결과", "168시간 복습과 도메인 성과"],
  ["S7", "모의고사 결과", "원점수·정답률 중심 결과"], ["S8", "모의고사 이력", "Attempt-only 이력과 추이 표"],
  ["S9", "리더보드", "공개 설정, 공동 순위와 현재 사용자"], ["ADMIN", "승인 대기 사용자", "관리자 pending user table"],
  ["S10", "문제 은행 임포트", "10 MiB dropzone과 validation states"],
];

function renderMiniVisual(screen) {
  const boxes = screen === "S6" || screen === "S7" ? 4 : screen === "S4" || screen === "S5" ? 3 : 2;
  return `<div class="preview-visual" aria-hidden="true"><div class="mini-window"><div class="mini-bar"></div><div class="mini-layout"><div class="mini-side"></div><div class="mini-body"><div class="mini-line accent"></div><div class="mini-line"></div><div class="mini-line short"></div><div class="mini-cards">${Array.from({ length: boxes }, () => '<span class="mini-box"></span>').join("")}</div></div></div></div></div>`;
}

function renderGallery() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="CertQuiz S1-S10 deterministic static design review gallery"><title>CertQuiz · Static UI Review</title><link rel="stylesheet" href="assets/preview.css"></head><body><a class="skip" href="#gallery-main">본문으로 건너뛰기</a><header class="gallery-hero"><a class="brand" href="index.html"><span class="brand-mark">CQ</span><span class="brand-copy">CertQuiz<small>Static UI review</small></span></a><p class="eyebrow">DETERMINISTIC · OFFLINE · MULTIPAGE</p><h1>S1–S10 사용자 흐름을 한눈에 검토하세요.</h1><p class="lead">라이트 데스크톱 shell, 상태 피드백, 점수 정보 계층과 관리자 화면을 실제 HTML 문서로 제공합니다. 각 화면은 file://에서 바로 열립니다.</p><div class="review-meta"><span>Entry · artifacts/ui-preview/index.html</span><span>Regenerate · pnpm ui:preview:export</span><span>${previewManifest.length} direct HTML variants</span><span>No runtime network</span></div></header><main class="gallery-main" id="gallery-main"><section class="gallery-section" aria-labelledby="flow-title"><div class="section-head"><div><p class="eyebrow">REVIEW FLOW</p><h2 id="flow-title">화면 gallery</h2><p>카드를 선택해 직접 주소 지정 가능한 대표 상태를 엽니다.</p></div><span class="badge success">Review ready</span></div><div class="gallery-grid">${galleryGroups.map(([screen, title, description]) => { const entries = previewManifest.filter((item) => item.screen === screen); return `<article class="preview-card">${renderMiniVisual(screen)}<div class="preview-copy"><span class="badge">${screen}</span><h3>${title}</h3><p>${description}</p><div class="variant-links">${entries.map((item) => `<a href="${item.outputPath}">${item.variant}</a>`).join("")}</div></div></article>`; }).join("")}</div></section><section class="gallery-section" aria-labelledby="tokens-title"><div class="section-head"><div><p class="eyebrow">FOUNDATION</p><h2 id="tokens-title">Design tokens &amp; review boundary</h2></div></div><div class="grid three"><div class="card flat"><h3>정보 계층</h3><p class="muted small">Raw Score와 Accuracy Rate를 우선하고 Reference 1000은 참고 정보로 분리합니다.</p></div><div class="card flat"><h3>접근성 기본</h3><p class="muted small">landmark, heading, label, table caption, dialog semantics와 <span class="kbd">Tab</span> focus를 포함합니다.</p></div><div class="card flat"><h3>정적 경계</h3><p class="muted small">API, MSW, Cognito, 진행 timer, mutation, persistence, DB와 backend를 포함하지 않습니다.</p></div></div><p class="note"><strong>Review metadata.</strong> 고정 데이터: AWS ${fixture.code}, ${fixture.questions}문항, ${fixture.minutes}분, 합격 기준 ${fixture.threshold}, fixture 시각 ${fixture.serverNow}. 모든 CSS와 HTML navigation은 artifact 내부 상대 경로입니다.</p></section></main></body></html>\n`;
}

export async function exportUiPreview(outputRoot = defaultOutputRoot) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, "assets"), { recursive: true });
  await writeFile(path.join(outputRoot, "assets/preview.css"), css, "utf8");
  await writeFile(path.join(outputRoot, "index.html"), renderGallery(), "utf8");
  for (const [index, item] of previewManifest.entries()) {
    const target = path.join(outputRoot, ...item.outputPath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, renderPage(item, index), "utf8");
  }
  return { outputRoot, documentCount: previewManifest.length + 1, assetCount: 1 };
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  const result = await exportUiPreview();
  console.log(`CertQuiz static UI review exported deterministically.`);
  console.log(`Entry: ${path.relative(repositoryRoot, path.join(result.outputRoot, "index.html"))}`);
  console.log(`Documents: ${result.documentCount} · Assets: ${result.assetCount}`);
}

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultOutputRoot = path.join(repositoryRoot, "artifacts/ui-preview");

export const previewSections = Object.freeze([
  ["s1-login", "S1", "로그인 · callback · 승인 대기"],
  ["s2-home", "S2", "학습 홈 · catalog"],
  ["s3-mode-select", "S3", "학습 모드 선택"],
  ["s4-practice", "S4", "연습 모드"],
  ["s5-exam", "S5", "모의고사"],
  ["s6-practice-result", "S6", "연습 결과"],
  ["s7-exam-result", "S7", "모의고사 결과"],
  ["s8-history", "S8", "모의고사 이력"],
  ["s9-leaderboard", "S9", "리더보드"],
  ["admin-users", "ADMIN", "승인 대기 사용자"],
  ["s10-admin-import", "S10", "문제 은행 임포트"],
]);

const fixture = Object.freeze({
  certification: "AWS Certified DevOps Engineer – Professional",
  code: "DOP-C02",
  questions: 75,
  minutes: 180,
  threshold: "75%",
  rawScore: "60 / 75",
  accuracy: "80.00%",
  reference: "800",
  timestamp: "2025-01-15 09:00 UTC",
  domains: [
    ["SDLC Automation", 88],
    ["Configuration Management and IaC", 76],
    ["Security and Compliance", 82],
    ["Resilient Cloud Solutions", 73],
    ["Monitoring and Logging", 80],
    ["Incident and Event Response", 78],
  ],
});

const css = String.raw`
:root {
  color-scheme: light;
  --bg: #f4f7fb;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --ink: #172033;
  --muted: #5b677a;
  --line: #d8e0eb;
  --primary: #4338ca;
  --primary-dark: #312e81;
  --primary-soft: #eef2ff;
  --success: #047857;
  --success-soft: #ecfdf5;
  --warning: #92400e;
  --warning-soft: #fffbeb;
  --danger: #b91c1c;
  --danger-soft: #fef2f2;
  --info: #1d4ed8;
  --info-soft: #eff6ff;
  --shadow: 0 16px 42px rgba(35, 48, 75, .09);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--bg);
  font-synthesis: none;
}
* { box-sizing: border-box; }
html { min-width: 1024px; scroll-behavior: smooth; }
body { margin: 0; min-height: 100vh; background: var(--bg); }
a { color: inherit; }
a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid rgba(67, 56, 202, .38); outline-offset: 3px; }
.skip-link { position: fixed; z-index: 100; top: -64px; left: 18px; padding: 10px 14px; border-radius: 8px; color: white; background: var(--primary); }
.skip-link:focus { top: 18px; }
.hero { padding: 58px max(48px, calc((100vw - 1440px) / 2)); color: white; background: radial-gradient(circle at 84% 18%, rgba(129, 140, 248, .4), transparent 27%), linear-gradient(135deg, #172033, #27245d 62%, #4338ca); }
.brand { display: inline-flex; align-items: center; gap: 12px; font-weight: 900; letter-spacing: -.03em; }
.brand-mark { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; background: linear-gradient(145deg, #6366f1, #312e81); box-shadow: 0 9px 22px rgba(0, 0, 0, .2); font-size: 13px; }
.eyebrow { margin: 0 0 8px; color: var(--primary); font-size: 11px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; }
.hero .eyebrow { margin-top: 42px; color: #c7d2fe; }
h1, h2, h3, p { overflow-wrap: break-word; }
h1 { max-width: 900px; margin: 0; font-size: 50px; line-height: 1.08; letter-spacing: -.045em; }
h2 { margin: 0; font-size: 28px; letter-spacing: -.03em; }
h3 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
.lead { max-width: 820px; margin: 14px 0 0; color: var(--muted); font-size: 16px; line-height: 1.7; }
.hero .lead { color: #d9def0; font-size: 18px; }
.meta-strip { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }
.meta-strip span { padding: 8px 11px; border: 1px solid rgba(255, 255, 255, .2); border-radius: 9px; background: rgba(255, 255, 255, .09); font-size: 12px; }
.jumpbar { position: sticky; z-index: 20; top: 0; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .97); box-shadow: 0 5px 18px rgba(23, 32, 51, .06); }
.jumpbar nav { display: flex; max-width: 1440px; margin: auto; padding: 11px 32px; gap: 5px; overflow-x: auto; }
.jumpbar a { flex: 0 0 auto; padding: 8px 10px; border-radius: 8px; color: var(--muted); font-size: 12px; font-weight: 850; text-decoration: none; }
.jumpbar a:hover { color: var(--primary); background: var(--primary-soft); }
main { max-width: 1440px; margin: auto; padding: 40px 48px 72px; }
.overview { scroll-margin-top: 76px; }
.overview-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 20px; }
.overview-card { min-height: 122px; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: white; box-shadow: var(--shadow); text-decoration: none; }
.overview-card:hover { border-color: #a5b4fc; transform: translateY(-1px); }
.overview-card span { display: inline-flex; margin-bottom: 12px; color: var(--primary); font-size: 11px; font-weight: 900; letter-spacing: .1em; }
.overview-card p { margin: 7px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.screen { scroll-margin-top: 76px; margin-top: 54px; padding-top: 34px; border-top: 1px solid var(--line); }
.screen-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.screen-head .lead { margin-top: 8px; font-size: 14px; }
.variant-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; align-items: start; }
.span-12 { grid-column: span 12; }
.span-8 { grid-column: span 8; }
.span-7 { grid-column: span 7; }
.span-6 { grid-column: span 6; }
.span-5 { grid-column: span 5; }
.span-4 { grid-column: span 4; }
.span-3 { grid-column: span 3; }
.card { min-width: 0; padding: 23px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow); }
.card.flat { box-shadow: none; }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 17px; }
.card p:last-child { margin-bottom: 0; }
.muted { color: var(--muted); }
.small { font-size: 12px; line-height: 1.55; }
.badge { display: inline-flex; align-items: center; width: max-content; padding: 5px 9px; border-radius: 999px; color: #3730a3; background: var(--primary-soft); font-size: 10px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
.badge.success { color: var(--success); background: var(--success-soft); }
.badge.warning { color: var(--warning); background: var(--warning-soft); }
.badge.danger { color: var(--danger); background: var(--danger-soft); }
.actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
.button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; padding: 9px 15px; border: 1px solid transparent; border-radius: 9px; color: white; background: var(--primary); font-size: 13px; font-weight: 850; }
.button.secondary { border-color: var(--line); color: var(--ink); background: white; }
.button.ghost { color: var(--primary); background: var(--primary-soft); }
.state { min-height: 152px; padding: 20px; border: 1px solid #bfdbfe; border-radius: 14px; color: #1e3a8a; background: var(--info-soft); }
.state.success { border-color: #a7f3d0; color: #065f46; background: var(--success-soft); }
.state.loading { border-color: #c7d2fe; color: #3730a3; background: var(--primary-soft); }
.state.empty { border-color: #fde68a; color: #78350f; background: var(--warning-soft); }
.state.error { border-color: #fecaca; color: #991b1b; background: var(--danger-soft); }
.state h3 { margin-bottom: 8px; }
.state p { margin: 0; font-size: 13px; line-height: 1.6; }
.state .actions { margin-top: 14px; }
.banner { padding: 16px 18px; border: 1px solid #bfdbfe; border-radius: 12px; color: #1e3a8a; background: var(--info-soft); }
.banner.success { border-color: #a7f3d0; color: #065f46; background: var(--success-soft); }
.banner.warning { border-color: #fde68a; color: #78350f; background: var(--warning-soft); }
.banner.danger { border-color: #fecaca; color: #991b1b; background: var(--danger-soft); }
.banner p { margin: 5px 0 0; font-size: 13px; line-height: 1.55; }
.stack { display: grid; gap: 14px; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metric { padding: 18px; border: 1px solid var(--line); border-radius: 13px; background: white; }
.metric span { color: var(--muted); font-size: 11px; font-weight: 800; }
.metric strong { display: block; margin-top: 7px; font-size: 25px; letter-spacing: -.04em; }
.chips { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 0; }
.chip { padding: 6px 9px; border-radius: 8px; color: #475569; background: #f1f5f9; font-size: 11px; font-weight: 750; }
.cert-title { margin: 10px 0 7px; font-size: 21px; line-height: 1.35; }
.skeleton { position: relative; overflow: hidden; height: 13px; border-radius: 6px; background: #dfe5ef; }
.skeleton + .skeleton { margin-top: 11px; }
.skeleton.short { width: 56%; }
.question-layout { display: grid; grid-template-columns: minmax(0, 1fr) 255px; gap: 16px; }
.question-text { margin: 13px 0 18px; font-size: 19px; font-weight: 780; line-height: 1.52; }
.choices { display: grid; gap: 9px; margin: 0; padding: 0; border: 0; }
.choices legend { margin-bottom: 10px; color: var(--muted); font-size: 12px; }
.choice { display: flex; align-items: flex-start; gap: 10px; padding: 13px; border: 1px solid var(--line); border-radius: 10px; background: white; font-size: 13px; line-height: 1.5; }
.choice.selected { border-color: #818cf8; background: var(--primary-soft); }
.choice.correct { border-color: #6ee7b7; background: var(--success-soft); }
.choice input { margin-top: 3px; accent-color: var(--primary); }
.navigator { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 13px; }
.qnum { display: grid; aspect-ratio: 1; place-items: center; border: 1px solid var(--line); border-radius: 7px; color: #475569; background: white; font-size: 11px; font-weight: 850; }
.qnum.current { border-color: var(--primary); color: white; background: var(--primary); }
.qnum.answered { color: var(--success); background: var(--success-soft); }
.qnum.flagged::after { color: #f59e0b; content: "•"; }
.timer { display: grid; min-height: 128px; place-items: center; padding: 20px; border-radius: 14px; color: white; background: #172033; text-align: center; }
.timer strong { display: block; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 29px; letter-spacing: .06em; }
.timer span { display: block; margin-top: 5px; color: #cbd5e1; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
.dialog { padding: 22px; border: 2px solid #a5b4fc; border-radius: 16px; background: white; box-shadow: 0 22px 58px rgba(15, 23, 42, .18); }
.dialog h3 { font-size: 19px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
caption { padding: 0 0 11px; color: var(--muted); text-align: left; }
th, td { padding: 12px 13px; border-bottom: 1px solid var(--line); text-align: left; }
thead th { color: var(--muted); background: var(--surface-2); font-size: 10px; letter-spacing: .07em; text-transform: uppercase; }
tbody th { font-weight: 850; }
.current-row { background: var(--primary-soft); }
.domain-list { display: grid; gap: 12px; }
.domain-row { display: grid; grid-template-columns: minmax(210px, 1fr) 2fr 50px; gap: 14px; align-items: center; font-size: 12px; }
.progress { overflow: hidden; height: 8px; border-radius: 999px; background: #e8edf5; }
.progress span { display: block; width: var(--value); height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--primary), #818cf8); }
.domain-row strong { text-align: right; }
.dropzone { display: grid; min-height: 190px; place-items: center; padding: 28px; border: 2px dashed #aab5c5; border-radius: 15px; text-align: center; background: var(--surface-2); }
.drop-icon { display: grid; width: 50px; height: 50px; place-items: center; margin: 0 auto 11px; border-radius: 13px; color: var(--primary); background: var(--primary-soft); font-weight: 900; }
.error-list { margin: 12px 0 0; padding-left: 20px; color: var(--danger); font-size: 13px; }
.error-list li + li { margin-top: 7px; }
.review-item { padding: 15px; border-left: 4px solid #818cf8; border-radius: 0 10px 10px 0; background: var(--surface-2); }
.review-item strong { display: block; margin-bottom: 4px; }
.safe-code { padding: 2px 6px; border: 1px solid var(--line); border-radius: 5px; background: white; font-family: ui-monospace, monospace; font-size: 11px; }
.footer { margin-top: 60px; padding: 28px; border-radius: 16px; color: #dbe3f2; background: #172033; }
.footer strong { color: white; }
.back-top { display: inline-flex; margin-top: 14px; color: #c7d2fe; font-weight: 800; text-decoration: none; }
@media (max-width: 1200px) {
  .overview-grid { grid-template-columns: repeat(3, 1fr); }
  .span-3 { grid-column: span 6; }
  .metrics { grid-template-columns: repeat(2, 1fr); }
}
`;

function state(kind, label, title, message, action = "") {
  const busy = kind === "loading" ? ' aria-busy="true"' : "";
  const role = kind === "error" ? ' role="alert"' : "";
  return `<article class="state ${kind}"${busy}${role}><span class="badge ${kind === "error" ? "danger" : kind === "empty" ? "warning" : kind === "success" ? "success" : ""}">${label}</span><h3>${title}</h3><p>${message}</p>${action ? `<div class="actions"><span class="button secondary">${action}</span></div>` : ""}</article>`;
}

function screenHeader(id, code, title, description) {
  return `<header class="screen-head"><div><p class="eyebrow">${code} · STATIC REVIEW</p><h2 id="${id}-title">${title}</h2><p class="lead">${description}</p></div><a class="badge" href="#gallery">Gallery</a></header>`;
}

function navigator() {
  return `<div class="navigator" aria-label="문항 탐색기">${Array.from({ length: 20 }, (_, index) => `<span class="qnum ${index === 17 ? "current flagged" : index < 12 ? "answered" : ""}">${index + 1}</span>`).join("")}</div>`;
}

function questionCard(submitted = false) {
  return `<article class="card flat"><div class="card-head"><div><span class="badge warning">QUESTION 18 / 75</span><p class="question-text">여러 AWS 계정에서 보안 이벤트를 중앙 수집하기 위한 가장 적합한 구성을 선택하세요.</p></div><span class="badge warning">Flag</span></div><fieldset class="choices"><legend>Security and Compliance · 정답 2개 · 선택 2 / 2</legend><label class="choice selected ${submitted ? "correct" : ""}"><input type="checkbox" checked disabled> AWS Organizations와 delegated administrator를 구성합니다.</label><label class="choice"><input type="checkbox" disabled> 각 계정에서 독립된 로컬 알림만 사용합니다.</label><label class="choice selected ${submitted ? "correct" : ""}"><input type="checkbox" checked disabled> Security Hub findings를 중앙 계정으로 집계합니다.</label><label class="choice"><input type="checkbox" disabled> 모든 CloudTrail 로깅을 비활성화합니다.</label></fieldset>${submitted ? `<div class="banner success"><strong>정답입니다 · 1.00점</strong><p>조직 단위의 delegated administrator와 중앙 findings 집계로 운영 경계를 유지합니다.</p><p>안전한 Markdown: <span class="safe-code">&lt;script&gt;alert(1)&lt;/script&gt;</span>는 텍스트이며, 허용되지 않은 URL은 <span class="muted">비활성 텍스트</span>입니다.</p></div>` : `<div class="actions"><span class="button">답안 제출</span><span class="button secondary">임시 선택 상태</span></div>`}</article>`;
}

function scoreMetrics(passLabel = "합격 기준") {
  return `<div class="metrics" aria-label="점수 요약"><div class="metric"><span>원점수</span><strong>${fixture.rawScore}</strong></div><div class="metric"><span>정답률</span><strong>${fixture.accuracy}</strong></div><div class="metric"><span>${passLabel}</span><strong>${fixture.threshold}</strong></div><div class="metric"><span>참고 환산값</span><strong>${fixture.reference}</strong></div></div>`;
}

function domainBreakdown() {
  return `<div class="domain-list">${fixture.domains.map(([name, score]) => `<div class="domain-row"><span>${name}</span><div class="progress" aria-hidden="true"><span style="--value:${score}%"></span></div><strong>${score}%</strong></div>`).join("")}</div><table><caption>도메인별 성과 차트 대체 데이터 표</caption><thead><tr><th scope="col">도메인</th><th scope="col">정답률</th></tr></thead><tbody>${fixture.domains.map(([name, score]) => `<tr><th scope="row">${name}</th><td>${score}%</td></tr>`).join("")}</tbody></table>`;
}

function renderOverview() {
  return `<section class="overview" id="gallery" aria-labelledby="gallery-title"><p class="eyebrow">SCREEN INDEX</p><h2 id="gallery-title">S1–S10 design review gallery</h2><p class="lead">각 카드는 같은 문서 안의 완성된 화면과 대표 상태로 이동합니다. 모든 내용은 고정 fixture이며 화면 동작을 실행하지 않습니다.</p><div class="overview-grid">${previewSections.map(([id, code, title]) => `<a class="overview-card" href="#${id}"><span>${code}</span><h3>${title}</h3><p>Success와 적용 가능한 loading · empty · error · dialog 상태</p></a>`).join("")}</div></section>`;
}

function renderS1() {
  return `<section class="screen" id="s1-login" aria-labelledby="s1-login-title">${screenHeader("s1-login", "S1", "로그인 · callback · 승인 대기", "공개 로그인, 안전한 callback 오류, 승인 전 제한 화면을 함께 검토합니다.")}<div class="variant-grid"><article class="card span-6"><span class="badge success">SUCCESS</span><p class="eyebrow">PRIVATE LEARNING WORKSPACE</p><h3 class="cert-title">클라우드 자격증 학습을 한 곳에서</h3><p class="muted">연습, 모의고사, 이력과 리더보드를 일관된 흐름으로 관리합니다.</p><div class="actions"><span class="button">Google로 계속하기</span></div><p class="muted small">별도 비밀번호를 저장하지 않는 정적 표현입니다.</p></article><article class="card flat span-6"><h3>학습 흐름</h3><div class="stack"><div class="banner">01 · 자격증과 모드를 선택합니다.</div><div class="banner">02 · 문제별 피드백 또는 실전 시간을 경험합니다.</div><div class="banner">03 · 도메인별 결과를 검토합니다.</div></div></article><div class="span-6">${state("error", "CALLBACK ERROR", "로그인을 완료할 수 없습니다", "인증 정보나 token을 노출하지 않는 안전한 오류 안내입니다.", "로그인 화면으로")}</div><article class="card span-6"><span class="badge warning">PENDING</span><h3 class="cert-title">관리자 승인을 기다리고 있어요</h3><p class="muted">현재 계정은 승인 상태만 확인할 수 있습니다. 보호된 학습 데이터는 표시하지 않습니다.</p><div class="banner warning"><strong>마지막 확인</strong><p>${fixture.timestamp}</p></div><div class="actions"><span class="button">승인 상태 새로고침</span><span class="button secondary">로그아웃</span></div></article></div></section>`;
}

function renderS2() {
  return `<section class="screen" id="s2-home" aria-labelledby="s2-home-title">${screenHeader("s2-home", "S2", "학습 홈 · catalog", "Provider grouping, certification metadata, active practice와 조회 상태를 표시합니다.")}<div class="variant-grid"><article class="card span-8"><div class="banner"><strong>이어 풀 수 있는 연습이 있습니다</strong><p>DOP-C02 · 18 / 75번 · 마지막 저장 ${fixture.timestamp}</p></div><p class="eyebrow">PROVIDER · AMAZON WEB SERVICES</p><span class="badge success">학습 가능</span><h3 class="cert-title">${fixture.certification}</h3><p class="muted">실전 도메인 비율을 반영한 연습과 모의고사를 제공합니다.</p><div class="chips"><span class="chip">${fixture.code}</span><span class="chip">${fixture.questions}문항</span><span class="chip">${fixture.minutes}분</span><span class="chip">합격 ${fixture.threshold}</span><span class="chip">all or nothing</span></div><div class="actions"><span class="button">학습 모드 선택</span><span class="button secondary">시험 정보</span></div></article><article class="card span-4" aria-busy="true"><span class="badge">LOADING</span><h3 class="cert-title">카탈로그 불러오는 중</h3>${'<div class="skeleton"></div>'.repeat(4)}<div class="skeleton short"></div></article><div class="span-6">${state("empty", "EMPTY", "이용 가능한 자격증이 없습니다", "현재 조건에서 학습 가능한 자격증이 없습니다. 나중에 catalog를 다시 확인하세요.", "나중에 다시 확인")}</div><div class="span-6">${state("error", "ERROR", "카탈로그를 표시할 수 없습니다", "보호 정보 없이 잘못된 certification 데이터를 안내합니다.", "관리자에게 문의")}</div></div></section>`;
}

function renderS3() {
  return `<section class="screen" id="s3-mode-select" aria-labelledby="s3-mode-select-title">${screenHeader("s3-mode-select", "S3", "학습 모드 선택", "연습 재개·교체와 모의고사 시작 확인 전 상태가 바뀌지 않는 구조입니다.")}<article class="card flat"><p class="eyebrow">AWS · ${fixture.code}</p><h3>${fixture.certification}</h3><div class="chips"><span class="chip">${fixture.questions}문항</span><span class="chip">${fixture.minutes}분</span><span class="chip">합격 ${fixture.threshold}</span></div></article><div class="variant-grid"><article class="card span-6"><span class="badge success">시간 제한 없음</span><h3 class="cert-title">연습 모드</h3><p class="muted">문항 제출 직후 답이 잠기고 정답과 해설을 확인합니다.</p><div class="actions"><span class="button">연습 시작</span></div></article><article class="card span-6"><span class="badge warning">${fixture.minutes}분</span><h3 class="cert-title">모의고사</h3><p class="muted">75문항을 제한 시간 안에 풀고 제출 후 전체 결과를 검토합니다.</p><div class="actions"><span class="button">모의고사 시작</span></div></article><div class="dialog span-6" role="dialog" aria-modal="false" aria-labelledby="resume-title" aria-describedby="resume-copy"><span class="badge">RESUME DIALOG</span><h3 id="resume-title">진행 중인 연습이 있습니다</h3><p id="resume-copy" class="muted">18번 문항부터 이어 풀거나 기존 세션을 명시적으로 교체하세요.</p><div class="actions"><span class="button">이어 풀기</span><span class="button secondary">새로 시작</span></div></div><div class="dialog span-6" role="dialog" aria-modal="false" aria-labelledby="exam-confirm-title" aria-describedby="exam-confirm-copy"><span class="badge warning">CONFIRM DIALOG</span><h3 id="exam-confirm-title">모의고사를 시작할까요?</h3><p id="exam-confirm-copy" class="muted">확인 시점부터 서버 기준 180분이 시작된다는 고정 설명입니다.</p><div class="actions"><span class="button">확인하고 시작</span><span class="button secondary">취소</span></div></div></div></section>`;
}

function renderS4() {
  return `<section class="screen" id="s4-practice" aria-labelledby="s4-practice-title">${screenHeader("s4-practice", "S4", "연습 모드 · 제출 전/후", "필수 선택 수, 언어, navigator, Flag와 안전한 해설 표현을 비교합니다.")}<div class="variant-grid"><div class="span-6"><span class="badge">UNSUBMITTED</span>${questionCard(false)}</div><div class="span-6"><span class="badge success">SUBMITTED</span>${questionCard(true)}</div><aside class="card flat span-6" aria-label="연습 문항 탐색"><div class="card-head"><h3>문항 탐색</h3><span class="badge warning">Flag 3</span></div>${navigator()}<p class="muted small">응답 12 · 미응답 63 · 현재 18번</p><div class="actions"><span class="button ghost">한국어</span><span class="button secondary">English</span></div></aside><div class="span-6">${state("error", "SAVE ERROR", "연습 세션을 불러오지 못했습니다", "입력은 유지되며 같은 요청으로 성공할 수 있는 오류 표현입니다.", "다시 시도")}</div></div></section>`;
}

function renderS5() {
  return `<section class="screen" id="s5-exam" aria-labelledby="s5-exam-title">${screenHeader("s5-exam", "S5", "모의고사 · active/preview/expired", "고정 timer face와 저장된 미응답·Flag 개수, 만료 안내를 정적으로 보여 줍니다.")}<div class="question-layout"><div>${questionCard(false)}</div><aside class="stack" aria-label="모의고사 상태"><span class="badge success">ACTIVE</span><div class="timer"><div><strong>02:14:36</strong><span>고정 서버 타이머 표현</span></div></div><div class="card flat"><h3>진행 현황</h3><p class="muted small">응답 42 · 미응답 33 · Flag 6</p>${navigator()}</div></aside></div><div class="variant-grid"><div class="dialog span-6" role="dialog" aria-modal="false" aria-labelledby="submit-preview-title" aria-describedby="submit-preview-copy"><span class="badge warning">PREVIEW DIALOG</span><h3 id="submit-preview-title">모의고사를 제출할까요?</h3><p id="submit-preview-copy" class="muted">저장된 상태 기준 미응답 33개, Flag 6개가 있습니다.</p><div class="actions"><span class="button">제출 확정</span><span class="button secondary">계속 풀기</span></div></div><div class="span-6">${state("empty", "EXPIRED", "시험 시간이 만료되었습니다", "저장된 상태로 결과가 확정되었는지 확인한 뒤 결과 화면으로 이동합니다.", "결과 확인")}</div></div></section>`;
}

function renderS6() {
  return `<section class="screen" id="s6-practice-result" aria-labelledby="s6-practice-result-title">${screenHeader("s6-practice-result", "S6", "연습 결과", "원점수와 정답률을 우선하고 168시간 복습 기한과 문항 review를 표시합니다.")}<div class="stack">${scoreMetrics()}<div class="banner warning"><strong>복습 가능 기간</strong><p>2025-01-22 09:00 UTC까지 · 완료 후 168시간</p></div><article class="card flat"><div class="card-head"><h3>도메인별 성과</h3><span class="badge">PRACTICE ONLY</span></div>${domainBreakdown()}</article><article class="card flat"><h3>문항 review</h3><div class="stack"><div class="review-item"><strong>18 · Security and Compliance · 정답</strong><span class="muted small">선택한 답, 정답 Choice와 안전한 해설을 함께 표시합니다.</span></div><div class="review-item"><strong>19 · Monitoring and Logging · 오답</strong><span class="muted small">획득 0.00점 · 원본 순서를 유지한 snapshot 표현입니다.</span></div></div></article>${state("empty", "EXPIRED", "연습 결과가 만료되었습니다", "완료 시점부터 168시간이 지나 더 이상 볼 수 없습니다.", "새 연습 시작")}</div></section>`;
}

function renderS7() {
  return `<section class="screen" id="s7-exam-result" aria-labelledby="s7-exam-result-title">${screenHeader("s7-exam-result", "S7", "모의고사 결과", "합격 여부와 대표 점수, 참고 환산값, 도메인 성과를 분리합니다.")}<div class="stack"><div class="banner success"><strong>합격</strong><p>합격 기준 ${fixture.threshold}를 충족했습니다. Reference 1000은 참고값입니다.</p></div>${scoreMetrics("합격 기준 · PASS")}<article class="card flat"><div class="card-head"><h3>도메인별 성과</h3><span class="badge success">ATTEMPT COMPLETE</span></div>${domainBreakdown()}</article>${state("error", "ERROR", "모의고사 결과를 불러오지 못했습니다", "안전한 오류 메시지만 표시하고 현재 화면 컨텍스트를 유지합니다.", "다시 시도")}</div></section>`;
}

function renderS8() {
  return `<section class="screen" id="s8-history" aria-labelledby="s8-history-title">${screenHeader("s8-history", "S8", "모의고사 이력 · trend", "Attempt-only 이력, 공개 설정, 추이와 동일 데이터의 대체 표를 제공합니다.")}<div class="variant-grid"><article class="card span-12"><div class="card-head"><div><h3>점수 공개 설정</h3><p class="muted small">저장 성공 전에는 완료 상태로 간주하지 않는 UI 모양입니다.</p></div><label class="choice"><input type="checkbox" disabled> 리더보드에 최고 성과 공개</label></div>${scoreMetrics("최고 정답률")}<h3 class="cert-title">정답률 추이</h3><div class="domain-list"><div class="domain-row"><span>Attempt 1</span><div class="progress"><span style="--value:72%"></span></div><strong>72%</strong></div><div class="domain-row"><span>Attempt 2</span><div class="progress"><span style="--value:76%"></span></div><strong>76%</strong></div><div class="domain-row"><span>Attempt 3</span><div class="progress"><span style="--value:80%"></span></div><strong>80%</strong></div></div><table><caption>정답률 추이 차트 대체 데이터 표</caption><thead><tr><th scope="col">응시</th><th scope="col">제출 시각</th><th scope="col">원점수</th><th scope="col">정답률</th></tr></thead><tbody><tr><th scope="row">1</th><td>2025-01-10</td><td>54 / 75</td><td>72%</td></tr><tr><th scope="row">2</th><td>2025-01-12</td><td>57 / 75</td><td>76%</td></tr><tr><th scope="row">3</th><td>2025-01-15</td><td>60 / 75</td><td>80%</td></tr></tbody></table></article><div class="span-6">${state("empty", "EMPTY", "아직 모의고사 이력이 없습니다", "연습 결과는 이력과 추이에 포함되지 않습니다.", "모의고사 시작")}</div><div class="span-6">${state("error", "ERROR", "이력을 불러오지 못했습니다", "현재 조회 조건과 공개 설정 입력은 유지됩니다.", "다시 시도")}</div></div></section>`;
}

function renderS9() {
  return `<section class="screen" id="s9-leaderboard" aria-labelledby="s9-leaderboard-title">${screenHeader("s9-leaderboard", "S9", "리더보드", "공개 사용자의 최고 exact accuracy, 공동 순위와 현재 사용자 marker를 표시합니다.")}<div class="variant-grid"><article class="card span-8"><div class="card-head"><div><h3>${fixture.code} 공개 순위</h3><p class="muted small">Standard competition rank · 1, 2, 2, 4</p></div><span class="badge success">PUBLIC</span></div><table><caption>공개 사용자의 최고 모의고사 성과</caption><thead><tr><th scope="col">순위</th><th scope="col">사용자</th><th scope="col">원점수</th><th scope="col">정답률</th></tr></thead><tbody><tr><th scope="row">1</th><td>First Place</td><td>68 / 75</td><td>90.6666666666666667%</td></tr><tr class="current-row"><th scope="row">2</th><td>Approved Learner <span class="badge">나</span></td><td>60 / 75</td><td>80%</td></tr><tr><th scope="row">2</th><td>Tie Breaker</td><td>60 / 75</td><td>80%</td></tr><tr><th scope="row">4</th><td>Fourth Place</td><td>45 / 75</td><td>60%</td></tr></tbody></table></article><div class="stack span-4"><div class="banner warning"><strong>내 점수는 비공개입니다</strong><p>현재 사용자는 순위 후보에 포함되지 않지만 공개 순위는 볼 수 있습니다.</p></div>${state("empty", "EMPTY", "공개된 점수가 없습니다", "이 certification에 공개된 최고 성과가 없습니다.")}${state("error", "ERROR", "리더보드를 불러오지 못했습니다", "다른 사용자의 정보 없이 재시도 가능한 오류를 표시합니다.", "다시 시도")}</div></div></section>`;
}

function renderAdminUsers() {
  return `<section class="screen" id="admin-users" aria-labelledby="admin-users-title">${screenHeader("admin-users", "ADMIN", "승인 대기 사용자", "관리자용 pending 목록, 개별 승인 모양, 빈 목록과 안전한 오류를 검토합니다.")}<div class="variant-grid"><article class="card span-8"><div class="card-head"><div><h3>승인 대기 사용자</h3><p class="muted small">최초 로그인 순서 · 2명</p></div><span class="badge warning">ADMIN VIEW</span></div><table><caption>승인을 기다리는 사용자 2명</caption><thead><tr><th scope="col">사용자</th><th scope="col">이메일</th><th scope="col">최초 로그인</th><th scope="col">상태</th><th scope="col">Action</th></tr></thead><tbody><tr><th scope="row">Pending One</th><td>pending.one@example.test</td><td>2025-01-15 07:00 UTC</td><td><span class="badge warning">대기</span></td><td><span class="button">승인</span></td></tr><tr><th scope="row">Pending Two</th><td>pending.two@example.test</td><td>2025-01-15 08:00 UTC</td><td><span class="badge warning">대기</span></td><td><span class="button">승인</span></td></tr></tbody></table></article><div class="stack span-4">${state("empty", "EMPTY", "승인을 기다리는 사용자가 없습니다", "새 사용자가 최초 로그인하면 이 목록에서 검토할 수 있습니다.")}${state("error", "ERROR", "사용자 목록을 불러오지 못했습니다", "보호 데이터 없이 재시도 가능한 오류를 표시합니다.", "다시 시도")}</div></div></section>`;
}

function renderS10() {
  return `<section class="screen" id="s10-admin-import" aria-labelledby="s10-admin-import-title">${screenHeader("s10-admin-import", "S10", "문제 은행 임포트", "10 MiB dropzone, dry-run summary, 계산 불가, validation, commit 확인과 완료·만료 상태입니다.")}<div class="variant-grid"><article class="card span-6"><span class="badge">EMPTY</span><div class="dropzone"><div><span class="drop-icon" aria-hidden="true">{ }</span><h3>Certification JSON 파일</h3><p class="muted small">최대 10 MiB · JSON · 이 정적 문서는 파일을 읽지 않습니다.</p><span class="button secondary">파일 선택</span></div></div></article><article class="card span-6" aria-busy="true"><span class="badge">VALIDATING</span><h3 class="cert-title">JSON 구조를 검증하는 중</h3>${'<div class="skeleton"></div>'.repeat(5)}<p class="muted small">고정 fixture의 loading 표현입니다.</p></article><article class="card span-6"><span class="badge success">VALID</span><h3 class="cert-title">검증이 완료되었습니다</h3><div class="metrics"><div class="metric"><span>전체 문항</span><strong>75</strong></div><div class="metric"><span>번역 완료</span><strong>60</strong></div><div class="metric"><span>영어 전용</span><strong>15</strong></div><div class="metric"><span>오류</span><strong>0</strong></div></div><div class="actions"><span class="button">교체 검토</span></div></article><article class="card span-6" role="alert"><span class="badge danger">INVALID</span><h3 class="cert-title">2개의 validation 오류가 있습니다</h3><div class="metrics"><div class="metric"><span>전체 문항</span><strong>계산 불가</strong></div><div class="metric"><span>번역 완료</span><strong>60</strong></div><div class="metric"><span>영어 전용</span><strong>15</strong></div><div class="metric"><span>오류</span><strong>2</strong></div></div><ul class="error-list"><li><span class="safe-code">questions</span> 배열이 없어 전체 문항 수를 계산할 수 없습니다.</li><li><span class="safe-code">domains[2].weight</span> 합계가 정확히 100%가 아닙니다.</li></ul></article><div class="dialog span-6" role="dialog" aria-modal="false" aria-labelledby="commit-title" aria-describedby="commit-copy"><span class="badge warning">COMMIT DIALOG</span><h3 id="commit-title">문제 은행을 교체할까요?</h3><p id="commit-copy" class="muted">검증된 동일 JSON을 사용하는 교체 확인 모양입니다. 이 문서는 교체를 실행하지 않습니다.</p><div class="actions"><span class="button">교체 확인</span><span class="button secondary">취소</span></div></div><div class="stack span-6">${state("success", "COMPLETE", "문제 은행 교체가 완료되었습니다", "DOP-C02 revision이 2025-01-15 09:00 UTC 기준으로 준비된 완료 표현입니다.")}${state("error", "EXPIRED", "검증 결과가 만료되었습니다", "파일 입력은 유지됩니다. 같은 내용으로 다시 검증한 뒤 교체를 확인하세요.", "다시 검증")}</div></div></section>`;
}

export function renderStandalonePreview() {
  const jumpLinks = previewSections.map(([id, code]) => `<a href="#${id}">${code}</a>`).join("");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="CertQuiz deterministic standalone static UI design review">
<title>CertQuiz · Standalone Static UI Review</title>
<link rel="stylesheet" href="./assets/ui-preview.css">
</head>
<body>
<a class="skip-link" href="#gallery">본문으로 건너뛰기</a>
<header class="hero"><div class="brand"><span class="brand-mark">CQ</span><span>CertQuiz · Static UI Review</span></div><p class="eyebrow">DETERMINISTIC · OFFLINE · SINGLE FILE</p><h1>S1–S10 사용자 흐름을 하나의 문서에서 검토하세요.</h1><p class="lead">라이트 데스크톱 shell, 상태 피드백, 점수 정보 계층과 관리자 화면을 고정 데이터로 제공합니다. 파일을 더블클릭해 바로 열 수 있는 read-only design artifact입니다.</p><div class="meta-strip"><span>Entry · artifacts/ui-preview/index.html</span><span>Regenerate · pnpm ui:preview:export</span><span>Fragment navigation only</span><span>No runtime network</span><span>Fixture · ${fixture.timestamp}</span></div></header>
<div class="jumpbar"><nav aria-label="화면 바로가기"><a href="#gallery">Gallery</a>${jumpLinks}</nav></div>
<main id="main-content">${renderOverview()}${renderS1()}${renderS2()}${renderS3()}${renderS4()}${renderS5()}${renderS6()}${renderS7()}${renderS8()}${renderS9()}${renderAdminUsers()}${renderS10()}<footer class="footer"><strong>Static review boundary</strong><p>이 문서는 고정 fixture와 inline style만 포함합니다. 로그인, 저장, 제출, 파일 처리, 타이머 진행 또는 데이터 변경을 수행하지 않습니다.</p><a class="back-top" href="#gallery">↑ Gallery로 돌아가기</a></footer></main>
</body>
</html>
`;
}

const fixedFixtureKeys = Object.freeze([
  "actors.unauthenticated", "actors.callbackError", "actors.pending",
  "catalog.success", "catalog.empty", "catalog.error",
  "practice.success", "practice.submittedFeedback", "practice.error",
  "exam.success", "exam.expired", "presentation.examPreview", "presentation.examFinalized",
  "results.success", "results.empty", "results.error",
  "history.success", "history.empty", "history.error",
  "leaderboard.success", "leaderboard.empty", "leaderboard.error", "presentation.leaderboardPrivate",
  "admin.users.success", "admin.users.empty", "admin.users.error",
  "admin.import.empty", "admin.import.success", "admin.import.error",
  "presentation.loading", "presentation.importValidating", "presentation.importCommit",
  "presentation.importCompleted", "presentation.importTokenExpired",
]);

/**
 * Export-only mirror of the TypeScript static route manifest. Every item names a
 * Task 1.5 read-only fixture key, which is validated before files are written.
 */
export const staticPreviewManifest = Object.freeze([
  ["s1-login", "success", "S1", "로그인", "actors.unauthenticated"], ["s1-login", "error", "S1", "로그인 callback 오류", "actors.callbackError"], ["s1-login", "pending", "S1", "승인 대기", "actors.pending"],
  ["s2-home", "success", "S2", "학습 홈", "catalog.success"], ["s2-home", "loading", "S2", "학습 홈", "presentation.loading"], ["s2-home", "empty", "S2", "학습 홈", "catalog.empty"], ["s2-home", "error", "S2", "학습 홈", "catalog.error"],
  ["s3-mode-select", "success", "S3", "학습 모드 선택", "catalog.success"], ["s3-mode-select", "loading", "S3", "학습 모드 선택", "presentation.loading"], ["s3-mode-select", "empty", "S3", "학습 모드 선택", "catalog.empty"], ["s3-mode-select", "error", "S3", "학습 모드 선택", "catalog.error"], ["s3-mode-select", "resume", "S3", "학습 모드 선택", "practice.success"], ["s3-mode-select", "confirm", "S3", "학습 모드 선택", "exam.success"],
  ["s4-practice", "unsubmitted", "S4", "연습 모드", "practice.success"], ["s4-practice", "submitted", "S4", "연습 모드", "practice.submittedFeedback"], ["s4-practice", "error", "S4", "연습 모드", "practice.error"],
  ["s5-exam", "active", "S5", "모의고사", "exam.success"], ["s5-exam", "preview", "S5", "모의고사", "presentation.examPreview"], ["s5-exam", "expired", "S5", "모의고사", "exam.expired"], ["s5-exam", "finalized", "S5", "모의고사", "presentation.examFinalized"],
  ["s6-practice-result", "success", "S6", "연습 결과", "results.success"], ["s6-practice-result", "empty", "S6", "연습 결과", "results.empty"], ["s6-practice-result", "expired", "S6", "연습 결과", "results.error"],
  ["s7-exam-result", "success", "S7", "모의고사 결과", "results.success"], ["s7-exam-result", "empty", "S7", "모의고사 결과", "results.empty"], ["s7-exam-result", "error", "S7", "모의고사 결과", "results.error"],
  ["s8-history", "success", "S8", "모의고사 이력", "history.success"], ["s8-history", "empty", "S8", "모의고사 이력", "history.empty"], ["s8-history", "error", "S8", "모의고사 이력", "history.error"],
  ["s9-leaderboard", "success", "S9", "리더보드", "leaderboard.success"], ["s9-leaderboard", "empty", "S9", "리더보드", "leaderboard.empty"], ["s9-leaderboard", "private", "S9", "리더보드", "presentation.leaderboardPrivate"], ["s9-leaderboard", "error", "S9", "리더보드", "leaderboard.error"],
  ["admin-users", "success", "ADMIN-USERS", "승인 대기 사용자", "admin.users.success"], ["admin-users", "empty", "ADMIN-USERS", "승인 대기 사용자", "admin.users.empty"], ["admin-users", "error", "ADMIN-USERS", "승인 대기 사용자", "admin.users.error"],
  ["s10-admin-import", "empty", "S10", "문제 은행 임포트", "admin.import.empty"], ["s10-admin-import", "validating", "S10", "문제 은행 임포트", "presentation.importValidating"], ["s10-admin-import", "valid", "S10", "문제 은행 임포트", "admin.import.success"], ["s10-admin-import", "invalid", "S10", "문제 은행 임포트", "admin.import.error"], ["s10-admin-import", "commit", "S10", "문제 은행 임포트", "presentation.importCommit"], ["s10-admin-import", "completed", "S10", "문제 은행 임포트", "presentation.importCompleted"], ["s10-admin-import", "token-expired", "S10", "문제 은행 임포트", "presentation.importTokenExpired"],
].map(([section, variant, screen, title, fixtureKey]) => Object.freeze({
  section,
  variant,
  screen,
  title,
  fixtureKey,
  outputPath: `screens/${section}/${variant}.html`,
})));

function relativeHref(fromFile, toFile) {
  const from = fromFile.split("/").slice(0, -1);
  const to = toFile.split("/");
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1;
  return [...Array(from.length - common).fill(".."), ...to.slice(common)].join("/");
}

function documentShell({ title, stylesheetHref, body }) {
  return `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="description" content="CertQuiz deterministic static UI review">\n<title>${title} · CertQuiz UI review</title>\n<link rel="stylesheet" href="${stylesheetHref}">\n</head>\n<body>\n<a class="skip-link" href="#main-content">본문으로 건너뛰기</a>\n${body}\n</body>\n</html>\n`;
}

function renderGalleryDocument() {
  const cards = staticPreviewManifest.map((entry) => `<a class="overview-card" href="${entry.outputPath}"><span>${entry.screen} · ${entry.variant.toUpperCase()}</span><h3>${entry.title}</h3><p>고정 Task 1.5 fixture 기반 정적 화면</p></a>`).join("");
  return documentShell({
    title: "S1–S10 gallery",
    stylesheetHref: "assets/ui-preview.css",
    body: `<header class="hero"><div class="brand"><span class="brand-mark">CQ</span><span>CertQuiz · Static UI Review</span></div><p class="eyebrow">DETERMINISTIC · OFFLINE · MULTIPAGE</p><h1>S1–S10 정적 화면 갤러리</h1><p class="lead">Task 1.5의 고정 read-only fixture와 presentational markup만으로 만든 검토 artifact입니다.</p><div class="meta-strip"><span>Command · pnpm ui:preview:export</span><span>Entry · artifacts/ui-preview/index.html</span><span>Output · artifacts/ui-preview/screens/.../*.html</span><span>Assets · artifacts/ui-preview/assets/</span></div></header><main id="main-content"><section class="overview" aria-labelledby="gallery-title"><p class="eyebrow">GALLERY METADATA</p><h2 id="gallery-title">CertQuiz S1–S10 UI gallery</h2><p class="lead">API, MSW, auth, timer progression, mutation, DB, backend 및 외부 network 없이 제공됩니다.</p><div class="overview-grid">${cards}</div></section><footer class="footer"><strong>Static review boundary</strong><p>반복 export는 동일한 경로, 문서 내용, navigation과 local asset reference를 생성합니다.</p></footer></main>`,
  });
}

function renderScreenDocument(entry, index) {
  const previous = staticPreviewManifest[(index - 1 + staticPreviewManifest.length) % staticPreviewManifest.length];
  const next = staticPreviewManifest[(index + 1) % staticPreviewManifest.length];
  const current = entry.outputPath;
  const nav = `<nav aria-label="정적 화면 순서"><a href="${relativeHref(current, previous.outputPath)}">이전 화면</a><a href="${relativeHref(current, "index.html")}">Gallery</a><a href="${relativeHref(current, next.outputPath)}">다음 화면</a></nav>`;
  const stateKind = entry.variant === "error" || entry.variant === "invalid" ? "error" : entry.variant === "loading" || entry.variant === "validating" ? "loading" : entry.variant === "empty" || entry.variant === "expired" ? "empty" : "success";
  const details = entry.screen === "S3" ? `<article class="card flat"><p class="eyebrow">AWS · ${fixture.code}</p><h3>${fixture.certification}</h3><div class="chips"><span class="chip">${fixture.questions}문항</span><span class="chip">${fixture.minutes}분</span><span class="chip">합격 ${fixture.threshold}</span></div></article><div class="variant-grid"><article class="card span-6"><span class="badge success">시간 제한 없음</span><h3 class="cert-title">연습 모드</h3><p class="muted">문항 제출 직후 답이 잠기고 정답과 해설을 확인합니다.</p><div class="actions"><span class="button">연습 시작</span></div></article><article class="card span-6"><span class="badge warning">${fixture.minutes}분</span><h3 class="cert-title">모의고사</h3><p class="muted">제한 시간 안에 전체 문항을 풀고 결과를 검토합니다.</p><div class="actions"><span class="button">모의고사 시작</span></div></article>${entry.variant === "resume" ? `<div class="dialog span-12" role="dialog" aria-modal="false" aria-labelledby="resume-title" aria-describedby="resume-copy"><h3 id="resume-title">진행 중인 연습이 있습니다</h3><p id="resume-copy" class="muted">18번 문항부터 이어 풀거나 기존 세션을 명시적으로 교체하세요. 선택 전에는 상태가 바뀌지 않습니다.</p><div class="actions"><span class="button">이어 풀기</span><span class="button secondary">기존 세션 교체</span></div></div>` : ""}${entry.variant === "confirm" ? `<div class="dialog span-12" role="dialog" aria-modal="false" aria-labelledby="confirm-title" aria-describedby="confirm-copy"><h3 id="confirm-title">모의고사를 시작할까요?</h3><p id="confirm-copy" class="muted">확인 시점부터 서버 기준 ${fixture.minutes}분이 시작된다는 고정 안내입니다.</p><div class="actions"><span class="button">확인하고 시작</span><span class="button secondary">취소</span></div></div>` : ""}</div>` : entry.screen === "S4" || entry.screen === "S5" ? questionCard(entry.variant === "submitted") : entry.screen === "S6" || entry.screen === "S7" ? `${scoreMetrics()}<article class="card flat"><h3>도메인별 성과</h3>${domainBreakdown()}</article>` : entry.screen === "S8" || entry.screen === "S9" || entry.screen === "ADMIN" ? `<article class="card flat"><h3>${fixture.code} 고정 데이터</h3><table><caption>정적 fixture 요약</caption><thead><tr><th scope="col">자격증</th><th scope="col">문항</th><th scope="col">제한 시간</th><th scope="col">정답률</th></tr></thead><tbody><tr><th scope="row">${fixture.code}</th><td>${fixture.questions}</td><td>${fixture.minutes}분</td><td>${fixture.accuracy}</td></tr></tbody></table></article>` : `<article class="card flat"><p class="eyebrow">${fixture.code}</p><h3>${fixture.certification}</h3><p class="muted">${fixture.timestamp}에 고정된 read-only preview data입니다.</p></article>`;
  return documentShell({
    title: `${entry.screen} ${entry.title} ${entry.variant}`,
    stylesheetHref: "../../assets/ui-preview.css",
    body: `<header class="hero" data-static-fixture="${entry.fixtureKey}"><div class="brand"><span class="brand-mark">CQ</span><span>CertQuiz · Static UI Review</span></div><p class="eyebrow">${entry.screen} · ${entry.variant.toUpperCase()}</p><h1>${entry.title}</h1><p class="lead">고정 fixture와 presentational component markup만 사용한 static review screen입니다.</p></header><div class="jumpbar">${nav}</div><main id="main-content"><section class="screen" aria-labelledby="screen-title"><header class="screen-head"><div><p class="eyebrow">STATIC ARTIFACT · ${entry.fixtureKey}</p><h2 id="screen-title">${entry.title} · ${entry.variant}</h2><p class="lead">Command: <code>pnpm ui:preview:export</code> · entry: <code>artifacts/ui-preview/index.html</code></p></div></header><div class="stack">${state(stateKind, entry.variant.toUpperCase(), `${entry.title} ${entry.variant} fixture`, "이 화면은 동작을 실행하지 않는 결정적 read-only 표현입니다.")}${details}</div></section><footer class="footer">${nav}</footer></main>`,
  });
}

function validateExportManifest() {
  const outputPaths = new Set();
  const screens = new Set();
  for (const entry of staticPreviewManifest) {
    if (!fixedFixtureKeys.includes(entry.fixtureKey)) {
      throw new Error(`Preview export includes a non-Task-1.5 fixture: ${entry.fixtureKey}`);
    }
    if (!/^screens\/[a-z0-9-]+\/[a-z0-9-]+\.html$/.test(entry.outputPath)) {
      throw new Error(`Preview export output path must be artifact-relative HTML: ${entry.outputPath}`);
    }
    if (outputPaths.has(entry.outputPath)) {
      throw new Error(`Preview export output path is duplicated: ${entry.outputPath}`);
    }
    outputPaths.add(entry.outputPath);
    screens.add(entry.screen);
  }
  for (const screen of ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]) {
    if (!screens.has(screen)) throw new Error(`Preview export is missing ${screen}.`);
  }
}

function validateArtifactDocuments(documents) {
  const knownPaths = new Set(["assets/ui-preview.css", ...documents.map(([file]) => file)]);
  const forbiddenRuntimeDependency = /<(?:script|iframe|form)\b|\bon\w+\s*=|\b(?:fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon)\s*\(/i;
  const externalOrAbsoluteReference = /\b(?:src|href)=["'](?:https?:|\/\/|\/|data:)/i;

  for (const [file, html] of documents) {
    if (forbiddenRuntimeDependency.test(html)) {
      throw new Error(`Preview artifact emits a runtime dependency: ${file}`);
    }
    if (externalOrAbsoluteReference.test(html)) {
      throw new Error(`Preview artifact emits an external or absolute reference: ${file}`);
    }
    for (const [, reference] of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
      if (reference.startsWith("#") || reference.startsWith("mailto:")) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
      if (resolved.startsWith("../") || !knownPaths.has(resolved)) {
        throw new Error(`Preview artifact reference escapes or misses an artifact file: ${file} -> ${reference}`);
      }
    }
  }
}

export async function exportUiPreview(outputRoot = defaultOutputRoot) {
  validateExportManifest();
  await rm(outputRoot, { recursive: true, force: true });
  const assetsDirectory = path.join(outputRoot, "assets");
  await mkdir(assetsDirectory, { recursive: true });

  const documents = [
    ["index.html", renderGalleryDocument()],
    ...staticPreviewManifest.map((entry, index) => [entry.outputPath, renderScreenDocument(entry, index)]),
  ];
  validateArtifactDocuments(documents);
  await Promise.all([
    writeFile(path.join(assetsDirectory, "ui-preview.css"), css, "utf8"),
    ...documents.map(async ([relativePath, html]) => {
      const destination = path.join(outputRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, html, "utf8");
    }),
  ]);

  const byteSize = documents.reduce((sum, [, html]) => sum + Buffer.byteLength(html), 0);
  return { outputRoot, outputPath: path.join(outputRoot, "index.html"), byteSize, documentCount: documents.length, assetCount: 1 };
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  const result = await exportUiPreview();
  console.log("CertQuiz deterministic multipage static UI review exported.");
  console.log("Command: pnpm ui:preview:export");
  console.log(`Entry: ${path.relative(repositoryRoot, result.outputPath)}`);
  console.log(`Documents: ${result.documentCount} · Assets: ${result.assetCount} · Bytes: ${result.byteSize}`);
}

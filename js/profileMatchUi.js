/** 学员/管理员共用的画像匹配明细表 UI */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function profileMatchCell(hit) {
  return hit
    ? '<span class="profile-hit" aria-label="已匹配">✓</span>'
    : '<span class="profile-miss" aria-label="未匹配">✗</span>';
}

/**
 * @param {{ script: { name: boolean; age: boolean; city: boolean }; qna: { name: boolean; age: boolean } }} pm
 * @param {number} score
 * @param {string} tier
 */
export function profileMatchCardHtml(pm, score, tier) {
  const scoreStr = Number(score).toFixed(2);
  return `
    <div class="fb-card profile-match-card" style="grid-column:1/-1;">
      <h3>学员画像匹配明细 · ${escapeHtml(scoreStr)} 分</h3>
      <span class="tier">${escapeHtml(tier || "")}</span>
      <p class="muted" style="margin:0 0 10px;">系统检测逐字稿与答疑是否绑定步骤 1 填写的姓名（全名/简称）、年龄、城市。</p>
      <table class="profile-match-table" aria-label="画像匹配明细">
        <thead>
          <tr><th>范围</th><th>姓名</th><th>年龄</th><th>城市</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>逐字稿</td>
            <td>${profileMatchCell(pm.script.name)}</td>
            <td>${profileMatchCell(pm.script.age)}</td>
            <td>${profileMatchCell(pm.script.city)}</td>
          </tr>
          <tr>
            <td>答疑</td>
            <td>${profileMatchCell(pm.qna.name)}</td>
            <td>${profileMatchCell(pm.qna.age)}</td>
            <td class="muted">—</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

/**
 * 家长追问：先挂钩逐字稿，再引用《编程规划》问题文档中的典型家长问法。
 * 共 2 题；每次从文档池中随机抽取（与逐字稿有命中的题会进入随机池前列，但仍非固定）。
 */

const MAX_HOOK = 76;

/** 文档条目：matchers 仅用于把题目分进「相关池」，选题顺序仍随机 */
const DOC_QUESTIONS = [
  {
    id: "pol-1",
    matchers: [/科技特长生/u, /太远|短期|来不及|早做打算|初升高/u],
    docAsk:
      "考虑科技特长生太远了，不是短时间能够实现的——那到底是不是值得现在就开始准备？如果要准备，您建议我们把大目标拆成哪些小里程碑？",
  },
  {
    id: "pol-2",
    matchers: [/小升初/u, /简历|摇号|开放日|面谈|初中/u],
    docAsk:
      "小升初有没有政策？编程如何助力小升初？要求赛事要达到什么水平？",
  },
  {
    id: "pol-3",
    matchers: [/科技特长生|科特/u, /认定|证书|参赛|比赛|考级/u],
    docAsk: "不参加竞赛就不能申请科技特长生吗？怎么认定科技特长生？",
  },
  {
    id: "pol-4",
    matchers: [/证书|认定|招生简章/u],
    docAsk: "拿到了老师说的这些证书就一定可以认定科技特长生吗？",
  },
  {
    id: "pol-5",
    matchers: [/地区|政策|省份|本市|招生|学校/u],
    docAsk: "我们地区有什么政策嘛？有哪些学校可以参考？",
  },
  {
    id: "exam-1",
    matchers: [/一年|YCL|图形化|Python|Sc|Py|赛考|考级/u, /个月|阶段|什么时候/u],
    docAsk: "学习一年图形化/Python，都能参与什么赛考？分别是什么时候？",
  },
  {
    id: "exam-2",
    matchers: [/收费|报名费|辅导|训练营|冲刺|赛事课/u],
    docAsk: "赛事要不要额外收费、有没有辅导？",
  },
  {
    id: "exam-3",
    matchers: [/难度|获奖率|通过率|学到什么|选拔/u],
    docAsk: "赛考难度怎么样，获奖率如何？要学到什么？",
  },
  {
    id: "exam-4",
    matchers: [/信奥|CSP|含金量|只有.*信奥/u],
    docAsk: "只有信奥赛含金量高/有用吗？",
  },
  {
    id: "exam-6",
    matchers: [/包过|一定过|百分百|肯定能考/u],
    docAsk: "考试包过吗？",
  },
  {
    id: "exam-7",
    matchers: [/本阶段|现阶段|YCL|图灵杯|白名单/u, /小升初/u],
    docAsk: "本阶段能参加哪些赛考？对小升初有什么用？",
  },
  {
    id: "exam-9",
    matchers: [/考级|YCL|必须|要不要考/u],
    docAsk: "考级有什么帮助吗？必须要参加吗？",
  },
  {
    id: "course-1",
    matchers: [/C\+\+|信奥|最快|几年|规划/u],
    docAsk: "最快什么时候可以开始学 C++？如何规划？",
  },
  {
    id: "course-2",
    matchers: [/直接.*Python|跳.*Python|跳过图形/u],
    docAsk: "我们能不能直接学 Python？",
  },
];

/**
 * @param {object} ctx
 * @param {string} ctx.script
 * @param {object} ctx.student
 */
export function pickParentQuestions(ctx) {
  const script = (ctx.script || "").trim();
  const student = ctx.student || {};
  const name = student.name || "孩子";
  const hooks = shuffleArray(extractScriptHooks(script, 8)).slice(0, 2);
  while (hooks.length < 2) hooks.push(hooks[0] || "");

  const scored = DOC_QUESTIONS.map((item) => ({
    item,
    score: item.matchers.reduce((acc, re) => acc + (re.test(script) ? 1 : 0), 0),
  }));

  const matched = scored.filter((x) => x.score > 0);
  const unmatched = scored.filter((x) => x.score === 0);
  const pool = [...shuffleArray(matched), ...shuffleArray(unmatched)];
  const picks = pool.slice(0, 2).map((x, i) => ({
    item: x.item,
    hook: hooks[i] || hooks[0] || "",
  }));
  const ordered = shuffleArray(picks);

  return ordered.map((p, idx) => ({
    id: p.item.id,
    text: formatQuestion(name, p.hook, p.item.docAsk, idx + 1),
  }));
}

/** Fisher–Yates，每次调用独立随机 */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatQuestion(name, hook, docAsk, num) {
  const hookLine = hook
    ? `结合您刚才的逐字稿，其中约这样表述：「${hook}」。`
    : `结合您刚才的逐字稿整体内容（${name}的学习与赛考规划）。`;

  return (
    `${hookLine}\n\n` +
    `下面是《编程规划》问题文档中的典型家长追问（第 ${num} 题），请您书面作答：\n` +
    `「${docAsk}」`
  );
}

/** 从逐字稿中截取 1～2 句与考核相关的「挂钩」短句，便于与文档问题衔接 */
function extractScriptHooks(script, count) {
  const patterns = [
    /[^。\n]{6,90}?(科技特长生|科特|认定|招生简章)[^。\n]{0,50}?[。\n]?/u,
    /[^。\n]{6,90}?(小升初|简历|摇号|开放日|面谈|初中|科创班|实验班)[^。\n]{0,50}?[。\n]?/u,
    /[^。\n]{6,90}?(YCL|考级|图灵杯|白名单|蓝桥|信奥|CSP|强基)[^。\n]{0,50}?[。\n]?/u,
    /[^。\n]{6,90}?(图形化|Scratch|Python|C\+\+|算法|思维)[^。\n]{0,50}?[。\n]?/u,
    /[^。\n]{6,90}?(核桃|通过率|工信部|电子教育学会|双章|光华)[^。\n]{0,50}?[。\n]?/u,
    /[^。\n]{6,90}?(省重点|市重点|降分|招生|人)[^。\n]{0,30}?[。\n]?/u,
  ];

  const hooks = [];
  for (const re of patterns) {
    const m = script.match(re);
    if (!m) continue;
    let s = m[0].replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (s.length > MAX_HOOK) s = s.slice(0, MAX_HOOK - 1) + "…";
    if (s && !hooks.includes(s)) hooks.push(s);
    if (hooks.length >= count) return hooks;
  }

  if (hooks.length === 0 && script.length) {
    let head = script.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_HOOK);
    if (script.length > MAX_HOOK) head += "…";
    hooks.push(head || "（逐字稿内容）");
  }

  while (hooks.length < count && hooks[0]) hooks.push(hooks[0]);
  return hooks.slice(0, count);
}

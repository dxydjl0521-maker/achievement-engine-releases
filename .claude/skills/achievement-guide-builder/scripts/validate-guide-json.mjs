#!/usr/bin/env node
/**
 * 检查一份攻略 JSON 能不能被本工具导入。
 *
 * 用法：
 *   node validate-guide-json.mjs <攻略.json> [成就清单.json]
 *
 * 给第二个参数时会额外核对每个 achievement_id 是否真的在成就清单里 ——
 * 这是最要命也最难靠肉眼发现的一类错误，写错不会让导入失败，只会让那一行
 * 从此关联不上 Steam 数据。
 *
 * 退出码 0 = 可以导入；1 = 有问题。
 */

import { readFileSync } from 'node:fs';

const GUIDE_FORMAT = 'achievement-engine-guide';
const GUIDE_VERSION = 1;
const PRESETS = ['main', 'side', 'collect', 'combat', 'condition', 'difficulty', 'misc'];

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const [, , guidePath, listPath] = process.argv;
if (!guidePath) {
  console.error('用法：node validate-guide-json.mjs <攻略.json> [成就清单.json]');
  process.exit(2);
}

const readJson = (path, what) => {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    console.error(`读不到${what}：${path}\n${e.message}`);
    process.exit(2);
  }
  try {
    // 和工具一样容忍 BOM —— 经保存对话框写出的文件常常带一个。
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    console.error(`${what}不是合法 JSON：${e.message}`);
    process.exit(1);
  }
};

const file = readJson(guidePath, '攻略文件');

// ── 顶层，逐个字段复刻工具解析器 parseGuideJson 的判断 ──
if (!file || typeof file !== 'object') {
  console.error('顶层不是一个对象。');
  process.exit(1);
}
if (file.format !== GUIDE_FORMAT) {
  fail(`format 必须是 "${GUIDE_FORMAT}"，实际是 ${JSON.stringify(file.format)}。工具会直接提示「无法识别该文件」。`);
}
if (typeof file.formatVersion !== 'number') fail('formatVersion 缺失或不是数字。');
else if (file.formatVersion > GUIDE_VERSION) fail(`formatVersion 是 ${file.formatVersion}，超出本工具支持的 ${GUIDE_VERSION}，会被拒绝。`);
if (typeof file.game !== 'string' || !file.game) warn('game 为空，导入后不影响功能，但记录里看不出是哪个游戏。');
if (typeof file.guideName !== 'string' || !file.guideName) warn('guideName 为空，建议写「全成就攻略」之类。');

const guide = file.guide;
if (!guide || typeof guide !== 'object') {
  console.error('缺少 guide 字段。');
  process.exit(1);
}
if (!Array.isArray(guide.timeline)) {
  console.error('guide.timeline 必须是数组。');
  process.exit(1);
}

// ── 分类声明 ──
const customCats = new Map();
const cats = file.categories;
if (cats !== undefined) {
  if (!cats || typeof cats !== 'object') fail('categories 存在但不是对象。');
  else {
    for (const c of cats.custom ?? []) {
      if (!c?.key) { fail('categories.custom 里有一项没有 key。'); continue; }
      customCats.set(c.key, c);
      if (!c.label) warn(`自建分类 "${c.key}" 没有 label，界面上标签会显示成 key 本身。`);
      if (!c.color) warn(`自建分类 "${c.key}" 没有 color，色点会退化成灰色。`);
    }
    for (const key of Object.keys(cats.presets ?? {})) {
      if (!PRESETS.includes(key)) fail(`categories.presets 里的 "${key}" 不是内置分类，覆盖不了。自建分类要放 categories.custom。`);
    }
  }
}
// 用到的分类未必都被声明，声明过的也可能没被用 —— 两个方向都要报。
const usedTypes = new Map();

// ── 正文 ──
const seenIds = new Map();
let subCount = 0;

guide.timeline.forEach((node, i) => {
  const at = `timeline[${i}]`;
  if (!node || typeof node !== 'object') { fail(`${at} 不是对象。`); return; }
  if (node.type !== 'main_anchor') fail(`${at}.type 必须是字符串 "main_anchor"，实际是 ${JSON.stringify(node.type)}。`);
  if (typeof node.chapter !== 'string' || !node.chapter) fail(`${at}.chapter 为空，章节没有标题。`);
  if (!Array.isArray(node.sub_achievements)) {
    fail(`${at}.sub_achievements 必须是数组（没有成就就写 []）。`);
    return;
  }
  if (node._uid !== undefined) warn(`${at} 带了 _uid，导入时会被重新分配，写了没用。`);

  const noteId = (id, where, { required = true } = {}) => {
    if (!id) {
      if (required) fail(`${where} 没有填 achievement_id。`);
      return;
    }
    if (seenIds.has(id)) warn(`成就 ${id} 在 ${seenIds.get(id)} 和 ${where} 各出现了一次。工具不会报错，但同一成就会列两行。`);
    else seenIds.set(id, where);
  };

  // 章节自己的成就是可选的 —— 编辑器里的下拉框写的就是「可不填」。
  noteId(node.achievement_id, `${at}.achievement_id`, { required: false });
  // 有的话，工具在统计里一律算作 main。
  if (node.achievement_id) usedTypes.set('main', (usedTypes.get('main') ?? 0) + 1);

  node.sub_achievements.forEach((sub, j) => {
    const sat = `${at}.sub_achievements[${j}]`;
    subCount++;
    if (!sub || typeof sub !== 'object') { fail(`${sat} 不是对象。`); return; }
    noteId(sub.achievement_id, sat);
    if (sub._uid !== undefined) warn(`${sat} 带了 _uid，导入时会被重新分配。`);
    if (!sub.type) { fail(`${sat}.type 为空，成就没有分类。`); return; }
    usedTypes.set(sub.type, (usedTypes.get(sub.type) ?? 0) + 1);
    if (PRESETS.includes(sub.type) || customCats.has(sub.type)) return;
    fail(`${sat}.type 是 "${sub.type}"，既不是内置分类，也没在 categories.custom 里声明 —— 标签会显示成 "${sub.type}"，颜色会退化成灰色。`);
  });
});

for (const [key, c] of customCats) {
  if (!usedTypes.has(key)) warn(`自建分类 "${key}"（${c.label ?? key}）声明了但没有任何成就用它，导入后会空占一个分类。`);
}

// ── 可选：拿成就清单核对 apiName ──
if (listPath) {
  const list = readJson(listPath, '成就清单');
  const known = new Set((list.achievements ?? []).map((a) => a.apiName));
  if (known.size === 0) warn('成就清单里没有 achievements 数组，跳过核对。');
  else {
    for (const [id, where] of seenIds) {
      if (!known.has(id)) {
        fail(`${where} 用的 "${id}" 不在成就清单里。这多半是把展示名写进了 achievement_id —— 导入不会报错，但那一行不会有图标，也永远统计不到解锁进度。`);
      }
    }
    const covered = [...known].filter((id) => seenIds.has(id));
    const missed = [...known].filter((id) => !seenIds.has(id));
    console.log(`成就覆盖：${covered.length}/${known.size}`);
    if (missed.length > 0) {
      console.log(`清单里有、攻略没提到的 ${missed.length} 个：`);
      const nameOf = new Map((list.achievements ?? []).map((a) => [a.apiName, a.name]));
      console.log(missed.map((id) => `  ${id}  ${nameOf.get(id) ?? ''}`).join('\n'));
    }
  }
}

// ── 结论 ──
console.log(`\n章节 ${guide.timeline.length} 个，成就条目 ${subCount} 个，自建分类 ${customCats.size} 个。`);

if (warnings.length > 0) {
  console.log(`\n提醒（不影响导入）：`);
  warnings.forEach((w) => console.log('  · ' + w));
}
if (errors.length > 0) {
  console.log(`\n错误（会导致导入失败或显示异常）：`);
  errors.forEach((e) => console.log('  × ' + e));
  console.log('');
  process.exit(1);
}
console.log('\n可以导入。\n');

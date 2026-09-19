# 攻略 JSON 格式规范

本工具「导入攻略」接受的唯一格式。字段名和取值都要精确匹配，多一个空格都会让导入失败或者显示错位。

---

## 顶层

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `format` | string | 是 | 必须是 `achievement-engine-guide`，一个字符都不能差 |
| `formatVersion` | number | 是 | 当前写 `1`。写成大于 1 的数会被直接拒绝 |
| `exportedAt` | string | 是 | ISO 时间戳。工具不校验，写生成时刻即可 |
| `game` | string | 是 | 游戏名。工具不校验，只作记录 |
| `guideName` | string | 是 | 攻略版本名，如「默认攻略」 |
| `categories` | object | 否 | 分类声明，见下 |
| `guide` | object | 是 | 攻略正文，见下 |

## categories

```jsonc
"categories": {
  "custom":  [{ "key": "story", "label": "剧情", "color": "#4dabf7" }],
  "presets": { "collect": "#39ff14" }
}
```

- `custom` —— 自建分类。`key` 就是要写进 `sub_achievements[].type` 的那个值。
- `presets` —— 对七个内置分类的配色覆盖，**只写你确实改过色的那些**。没改过的内置分类不用列，工具自己有默认色。

导入时只做新增合并：本游戏已经有同 `key` 的分类，保留原有配色不动。

## guide.game_notes

| 字段 | 类型 | 说明 |
|---|---|---|
| `new_game_plus` | string | 二周目 / 存档继承相关说明 |
| `missable` | array | 易错过成就，每项 `{ achievement_id, chapter, reason }` |
| `tips` | string | 通用技巧 |

`achievement_id` 同样必须用 apiName。

## guide.timeline[] —— 章节

一个元素就是一个章节。

| 字段 | 类型 | 必填 | 渲染位置 |
|---|---|---|---|
| `type` | `'main_anchor'` | 是 | 固定字面量，照抄 |
| `chapter` | string | 是 | 章节标题 |
| `achievement_id` | string | 否 | 本章的「主线成就」apiName，没有就写 `""` |
| `description` | string | 否 | 标题下方常驻的一行小字，适合放本章要点 |
| `sub_achievements` | array | 是 | 本章成就，可以是 `[]` |
| `content` | string | 否 | HTML，章节详情弹窗的正文 |

## sub_achievements[] —— 成就条目

| 字段 | 类型 | 必填 | 渲染位置 |
|---|---|---|---|
| `achievement_id` | string | 是 | 成就 apiName |
| `type` | string | 是 | 分类 key |
| `note` | string | 否 | 成就名下方常驻显示，**纯文本**，不要放标签。可以多行（按 `pre-wrap` 渲染，`\n` 会换行） |
| `content` | string | 否 | HTML，成就详情弹窗的正文 |
| `items` | array | —— | 类型里还留着，但工具任何地方都不渲染也不编辑它。**不要写** |

带 `content` 的条目在界面上会多一个文档图标，点开是弹窗。`note` 是常驻可见的那行，所以一句话能说清的就放 `note`，长步骤才放 `content`。

## 七个内置分类

`type` 优先用这些；确实不够用时才自建并写进 `categories.custom`。

| key | 名称 | 默认色 |
|---|---|---|
| `main` | 主线 | `#ffd700` |
| `side` | 支线 | `#00f5ff` |
| `collect` | 收集 | `#39ff14` |
| `combat` | 战斗 | `#ff4d4f` |
| `condition` | 条件 | `#b347ea` |
| `difficulty` | 难度 | `#fa8c16` |
| `misc` | 杂项 | `#666` |

---

## 完整示例

一份三章、可原样导入的文件：

```json
{
  "format": "achievement-engine-guide",
  "formatVersion": 1,
  "exportedAt": "2026-09-19T08:00:00.000Z",
  "game": "示例游戏",
  "guideName": "全成就攻略",
  "categories": {
    "custom": [],
    "presets": {}
  },
  "guide": {
    "game_notes": {
      "new_game_plus": "二周目继承全部装备，难度成就建议二周目再补。",
      "missable": [
        {
          "achievement_id": "ACH_MISS_01",
          "chapter": "第三章 落雪城",
          "reason": "离开落雪城后该 NPC 不再出现，必须在进城时对话。"
        }
      ],
      "tips": "通关前记得手动存档到独立槽位。"
    },
    "timeline": [
      {
        "type": "main_anchor",
        "achievement_id": "ACH_01",
        "chapter": "第一章 序章",
        "description": "本章共 3 个成就，全部为剧情自动解锁。",
        "sub_achievements": [
          {
            "achievement_id": "ACH_02",
            "type": "side",
            "note": "在酒馆和老板娘对话三次。"
          }
        ],
        "content": "<p>本章没有易错过内容，顺着剧情走完即可。</p>"
      },
      {
        "type": "main_anchor",
        "achievement_id": "",
        "chapter": "全收集品",
        "description": "全游戏 20 个收集品的位置，按区域排列。",
        "sub_achievements": [
          {
            "achievement_id": "ACH_40",
            "type": "collect",
            "note": "集齐全部 20 个收集品。",
            "content": "<p>1-5 在序章地图，拿到 3 号后往北走能一次拿齐。</p><p>6-12 分布在第二章的两个岔路。</p>"
          }
        ],
        "content": ""
      }
    ]
  }
}
```

---

## 常见错误

| 写法 | 后果 |
|---|---|
| `format` 拼错一个字符 | 导入直接提示「无法识别该文件」。解析器返回空，不会半解析 |
| `formatVersion` 写成 `2` | 同样被拒。解析器拒绝高于自身版本的号 |
| `achievement_id` 写成成就的展示名 | **导入不报错**，但那一行没有图标，显示的仍是那串文字，看起来像成功了。实际上工具从此关联不上 Steam 数据 —— 解锁状态、图标、章节统计全部失效。这是最难发现的一类错误 |
| `type` 用了没在 `categories.custom` 里声明的 key | 标签文字变成 key 本身，颜色退化成灰色 |
| `timeline` 不是数组 | 被拒 |
| 写进了 `_uid` | 无害但没用。导入时会全部重新分配 |
| `guide` 里少了 `game_notes` | 无害，工具会补一份空的 |

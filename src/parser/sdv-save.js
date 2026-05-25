// =============================================================
// src/parser/sdv-save.js
// -------------------------------------------------------------
// Stardew Valley 1.6 存档 XML 解析器（ES module）。
//
// 抽离自 index.html，配合 ROADMAP.md "第 1 期 A 任务"：
//   - 单文件 index.html 不拆，只把这一坨抽出来便于做 e2e 测试 / 社区 PR
//   - 通过 <script type="module"> import 回 index.html
//
// 对外 API
//   - parseStardewSave(xmlText): Object   ←  解析 SaveGame XML 文本
//   - CROP_NAMES / FISH_CATEGORY / LEGENDARY_FISH / PERFECTION_FRIENDS /
//     MONSTER_SLAYER_GOALS / DATEABLE_NPCS / LEGENDARY_FISH_TOTAL
//     ←  顺带导出，给 index.html 里的格式化函数 / 完美度卡复用
//
// 注意：保持纯逻辑，不依赖 DOM 全局以外的任何 index.html 内常量；
//       i18n / 渲染交给主 script。
// =============================================================

// ---------- NPC 关系常量 ----------
export const DATEABLE_NPCS = new Set([
  'Alex', 'Elliott', 'Harvey', 'Sam', 'Sebastian', 'Shane',
  'Abigail', 'Emily', 'Haley', 'Leah', 'Maru', 'Penny'
]);

export const PERFECTION_FRIENDS = [
  'Alex', 'Elliott', 'Harvey', 'Sam', 'Sebastian', 'Shane',
  'Abigail', 'Emily', 'Haley', 'Leah', 'Maru', 'Penny',
  'Caroline', 'Clint', 'Demetrius', 'Dwarf', 'Evelyn', 'George',
  'Gus', 'Jas', 'Jodi', 'Kent', 'Krobus', 'Leo', 'Lewis',
  'Linus', 'Marnie', 'Pam', 'Pierre', 'Robin', 'Sandy',
  'Vincent', 'Willy', 'Wizard'
];

export const MONSTER_SLAYER_GOALS = [
  { key: 'slimes', zh: '史莱姆', en: 'Slimes', need: 1000, fields: ['slimesKilled'], match: /slime/ },
  { key: 'voidSpirits', zh: '虚空幽灵', en: 'Void Spirits', need: 150, fields: ['voidSpiritsKilled'], match: /shadow(brute|shaman|sniper)|voidspirit/ },
  { key: 'bats', zh: '蝙蝠', en: 'Bats', need: 200, fields: ['batsKilled'], match: /bat/ },
  { key: 'skeletons', zh: '骷髅', en: 'Skeletons', need: 50, fields: ['skeletonsKilled'], match: /skeleton/ },
  { key: 'caveInsects', zh: '洞穴昆虫', en: 'Cave Insects', need: 125, fields: ['caveInsectsKilled'], match: /(bug|grub|fly|larva)/ },
  { key: 'duggies', zh: '掘地虫', en: 'Duggies', need: 30, fields: ['duggiesKilled'], match: /duggy/ },
  { key: 'dustSprites', zh: '灰尘精灵', en: 'Dust Sprites', need: 500, fields: ['dustSpritesKilled'], match: /dustsprite/ },
  { key: 'rockCrabs', zh: '岩石蟹', en: 'Rock Crabs', need: 60, fields: ['rockCrabsKilled'], match: /(rockcrab|lavacrab|iridiumcrab)/ },
  { key: 'mummies', zh: '木乃伊', en: 'Mummies', need: 100, fields: ['mummiesKilled'], match: /mummy/ },
  { key: 'pepperRex', zh: '霸王喷火龙', en: 'Pepper Rex', need: 50, fields: ['pepperRexKilled'], match: /pepperrex/ },
  { key: 'serpents', zh: '飞蛇', en: 'Serpents', need: 250, fields: ['serpentsKilled'], match: /(serpent|royalserpent)/ },
  { key: 'magmaSprites', zh: '岩浆精灵', en: 'Magma Sprites', need: 150, fields: ['magmaSpritesKilled'], match: /magmasprite|magmasparker/ }
];

// ---------- 作物 / 鱼 / 物品名表 ----------
export const CROP_NAMES = {
  // ----- 资源 / 矿物 -----
  60: "祖母绿", 62: "海蓝宝石", 64: "红宝石", 66: "紫水晶",
  68: "黄玉", 70: "翡翠", 72: "钻石", 74: "棱彩碎片",
  78: "洞穴胡萝卜", 80: "石英", 82: "火之石英", 84: "冰冻泪滴",
  86: "土之水晶", 92: "树液", 96: "矮人卷轴 I", 97: "矮人卷轴 II",
  98: "矮人卷轴 III", 99: "矮人卷轴 IV", 100: "贝壳化石",
  101: "三角石", 102: "矮人小工具", 103: "古代之笔",
  104: "矮人头盔", 105: "蝙蝠之翼", 106: "化石肋骨",
  107: "恐龙蛋", 108: "化石腿骨", 109: "化石脊柱",
  110: "化石头骨", 111: "古老饰品", 112: "罗马硬币",
  113: "破旧木屐", 114: "古老剑", 115: "茶杯",
  116: "胸骨", 117: "金币", 118: "古老投石器",
  119: "易碎尾椎", 120: "霸王龙头骨", 121: "原始头骨",
  122: "大象牙", 123: "鳞片大鱼骨",
  // 矿石/锭
  330: "黏土", 334: "铜锭", 335: "铁锭", 336: "金锭",
  337: "铱锭", 338: "精炼石英", 378: "铜矿", 380: "铁矿",
  382: "煤", 384: "金矿", 386: "铱矿", 388: "木材",
  390: "石头", 392: "海螺", 393: "珊瑚", 394: "彩虹贝壳",
  395: "咖啡", 396: "酸果", 397: "海胆", 398: "葡萄",
  399: "春洋葱", 400: "草莓", 401: "草莓种子",
  // ----- 觅食 -----
  16: "野韭菜", 18: "黄水仙", 20: "蒲公英", 22: "三叶草",
  88: "椰子", 90: "仙人掌果", 257: "羊肚菌", 259: "蕨菜",
  281: "鸡油菌", 282: "蔓越莓", 283: "圣诞莓", 296: "三文鱼莓",
  402: "甜豌豆", 404: "蘑菇", 406: "野梅", 408: "榛果",
  410: "黑莓", 411: "野李", 414: "水晶果", 418: "番红花",
  420: "红蘑菇", 422: "紫蘑菇", 851: "魔法石榴",
  // ----- 春季作物 -----
  24: "防风草", 188: "豆角", 190: "花椰菜", 192: "马铃薯",
  248: "大蒜", 250: "羽衣甘蓝", 252: "大黄", 474: "番红花",
  591: "郁金香", 597: "蓝色火爆球", 433: "咖啡豆",
  // ----- 夏季作物 -----
  254: "甜瓜", 256: "番茄", 258: "蓝莓", 260: "辣椒",
  262: "小麦", 264: "萝卜", 266: "红甘蓝", 268: "星之果实",
  270: "玉米", 271: "未碾米", 272: "茄子", 304: "啤酒花",
  421: "向日葵", 593: "夏日穗",
  // ----- 秋季作物 -----
  274: "朝鲜蓟", 276: "南瓜", 278: "白菜", 280: "山药",
  284: "甜菜", 300: "苋菜", 376: "罂粟", 595: "仙女玫瑰",
  // ----- 冬季/特殊作物 -----
  412: "冬根", 416: "雪山药", 417: "甜浆果",
  // ----- 树果 -----
  613: "苹果", 634: "杏子", 635: "橙子", 636: "桃子",
  637: "石榴", 638: "樱桃", 829: "姜根", 830: "茶叶",
  831: "茶包",
  // ----- 1.5+ 新内容 -----
  289: "鸵鸟蛋", 833: "菠萝", 832: "凤梨叶", 834: "羊角面包芒果",
  835: "芒果", 829: "姜根",
  // ----- 动物产品 -----
  174: "大鸡蛋", 176: "鸡蛋", 180: "棕鸡蛋", 182: "大棕鸡蛋",
  184: "牛奶", 186: "大牛奶", 305: "虚空蛋", 442: "鸭蛋",
  444: "鸭羽毛", 446: "兔脚", 436: "山羊奶", 438: "大山羊奶",
  440: "羊毛", 928: "金色蛋",
  // ----- 工匠制品 -----
  303: "淡啤酒", 306: "蛋黄酱", 307: "鸭蛋黄酱", 308: "虚空蛋黄酱",
  340: "蜂蜜", 342: "腌菜", 344: "果冻", 346: "啤酒",
  348: "酒", 350: "果汁", 354: "焦糖", 424: "奶酪",
  426: "山羊奶酪", 428: "布料", 430: "松露", 432: "松露油",
  459: "蜂蜜酒", 614: "绿茶", 815: "咖啡豆罐",
  // ----- 烹饪 -----
  194: "炒蛋", 195: "煎蛋", 196: "煎蛋卷", 197: "沙拉",
  198: "奶酪花椰菜", 199: "烤鱼", 200: "意大利面",
  201: "干酪松饼", 202: "薯片", 203: "粉色蛋糕",
  204: "巧克力蛋糕", 205: "甜玉米", 206: "披萨", 207: "豆汤",
  208: "玻璃凝胶", 209: "三文鱼晚餐", 210: "鱼肉派",
  211: "面包", 213: "薄煎饼", 214: "三文鱼", 215: "墨鱼汁",
  216: "牛奶", 218: "炸鸡蛋", 219: "土豆沙拉",
  220: "巧克力浆果蛋糕", 221: "苹果挞", 222: "墨鱼饭",
  223: "饼干", 224: "意大利面", 225: "蔬菜披萨",
  226: "螺旋汤", 227: "生鱼片", 228: "寿司",
  229: "墨鱼", 230: "蘑菇配饭", 231: "煎蛋糕",
  232: "披萨配菌", 233: "冰淇淋", 234: "果酱",
  235: "果酒", 236: "南瓜派", 237: "蘑菇汤",
  238: "胡萝卜松饼", 239: "蜗牛", 240: "玉米杯",
  241: "土豆", 242: "可可饼干", 243: "矿洞餐",
  244: "梅子布丁", 245: "麦芽糖", 246: "麦片",
  247: "油", 248: "蒜", 251: "番茄苗",
  // ----- 鱼类 -----
  128: "河豚", 129: "凤尾鱼", 130: "金枪鱼", 131: "沙丁鱼",
  132: "鲷鱼", 136: "大嘴鲈鱼", 137: "小嘴鲈鱼", 138: "彩虹鳟鱼",
  139: "鲑鱼", 140: "金眼鲈", 141: "白鲈", 142: "鲤鱼",
  143: "鲶鱼", 144: "梭鱼", 145: "太阳鱼", 146: "红鲻",
  147: "鲱鱼", 148: "鳗鱼", 149: "章鱼", 150: "红鲷鱼",
  151: "鱿鱼", 154: "海参", 155: "极品海参", 156: "幽灵鱼",
  158: "石鱼", 159: "深红鱼", 160: "鮟鱇", 161: "冰柱鱼",
  162: "熔岩鳗", 163: "传说", 164: "沙鱼", 165: "甲壳鲤",
  167: "Joja可乐", 698: "鲟鱼", 699: "虎鳟", 700: "牛鱼",
  701: "罗非鱼", 702: "鲦鱼", 704: "鲯鳅", 705: "长鳍金枪鱼",
  706: "鲥鱼", 707: "蓝鳕", 708: "比目鱼", 715: "龙虾",
  716: "小龙虾", 717: "螃蟹", 718: "海扇贝", 719: "贻贝",
  720: "虾", 721: "蜗牛", 722: "海螺", 723: "牡蛎",
  728: "灯笼鱼", 730: "蓝鲷鱼", 732: "鲱鲨鱼", 734: "树鱼",
  775: "冰川鱼", 795: "虚空鲑", 796: "黏液跳跳鱼",
  798: "午夜鱿鱼", 799: "幽灵鱼", 800: "水滴鱼",
  836: "黄貂鱼", 837: "狮子鱼", 838: "蓝盘鱼",
  // ----- 怪物掉落 / 杂物 -----
  766: "粘液", 767: "蝙蝠之翼", 768: "太阳精华", 769: "虚空精华",
  // ----- 1.6 新增 -----
  885: "纤维", 886: "战争纪念品", 888: "夏南瓜", 889: "强力浆果",
  890: "宝藏盒"
};

export const LEGENDARY_FISH = {
  159: '深红鱼', 160: '鮟鱇', 163: '传说之鱼',
  682: '突变鲤鱼', 775: '冰川鱼',
  898: '深红鱼之子', 899: '鮟鱇夫人', 900: '传说之鱼 II',
  901: '放射性鲤鱼', 902: '冰川鱼Jr.'
};
export const LEGENDARY_FISH_TOTAL = 10;

// 鱼类型分布 (简化版)
export const FISH_CATEGORY = {
  // 湖
  136: 'lake', 137: 'lake', 140: 'lake', 141: 'lake', 142: 'lake', 144: 'lake', 145: 'lake', 698: 'lake',
  // 河
  138: 'river', 139: 'river', 143: 'river', 700: 'river', 702: 'river', 706: 'river',
  // 海
  128: 'ocean', 129: 'ocean', 130: 'ocean', 131: 'ocean', 132: 'ocean', 146: 'ocean', 147: 'ocean',
  148: 'ocean', 149: 'ocean', 150: 'ocean', 151: 'ocean', 154: 'ocean', 155: 'ocean', 701: 'ocean',
  705: 'ocean', 707: 'ocean', 708: 'ocean', 715: 'ocean', 716: 'ocean', 717: 'ocean', 720: 'ocean',
  // 特殊
  156: 'special', 158: 'special', 159: 'special', 160: 'special', 161: 'special',
  162: 'special', 163: 'special', 164: 'special', 165: 'special', 682: 'special',
  734: 'special', 775: 'special', 795: 'special', 796: 'special', 798: 'special', 800: 'special'
};

// ---------- 错误类型 ----------
// ROADMAP 1.1.A：5 条独立错误码，index.html 根据 code 渲染不同 UI
//   OLD_VERSION    1.5 旧档（gameVersion < 1.6）
//   FUTURE_VERSION 比 1.6 还高的未来版本
//   NOT_MAIN_SAVE  SaveGameInfo / _old / 没找到 <player> 节点
//   PARSE_FAILED   DOMParser 报错（坏 XML）
//   TOO_LARGE      文件 > 10MB（这条在调用方判断，但常量在这里统一定义）
export class SaveError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.name = 'SaveError';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}
export const MAX_SAVE_BYTES = 10 * 1024 * 1024;

// ---------- 内部辅助函数（不导出，纯解析器内部用）----------
function normalizedKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function childText(parent, tag) {
  if (!parent) return '';
  return parent.querySelector(`:scope > ${tag}`)?.textContent?.trim() || '';
}

function elementPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 9) {
    parts.push(node.tagName);
    node = node.parentElement;
  }
  return parts.reverse().join(' > ');
}

function findTimelineCandidates(xml, kind) {
  const moneyWords = /(money|earned|income|revenue|profit|sale|sales|shipping|shipped|gold)/;
  const weatherWords = /(weather|rain|raining|storm|snow|wind|fog|forecast|lightning)/;
  const dailyWords = /(daily|day|date|calendar|history|timeline|seasonday|dayofyear)/;
  const wanted = kind === 'wealth' ? moneyWords : weatherWords;
  const out = [];
  const seen = new Set();
  xml.querySelectorAll('*').forEach(el => {
    const text = el.children.length ? '' : (el.textContent || '').trim();
    const attrs = Array.from(el.attributes || []).map(a => `${a.name}=${a.value}`).join(' ');
    const hay = normalizedKey(`${el.tagName} ${attrs} ${text}`);
    if (!wanted.test(hay) || !dailyWords.test(hay)) return;
    const path = elementPath(el);
    const sample = text.slice(0, 80);
    const key = `${path}|${sample}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ path, tag: el.tagName, sample });
  });
  return out.slice(0, 24);
}

// Lightweight audit used before building roadmap cards that would require
// true per-day history. It deliberately reports capability, not generated data.
export function inspectSaveCapabilities(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');
  const parseError = xml.querySelector('parsererror');
  if (parseError) throw new SaveError('PARSE_FAILED', 'XML 解析失败');

  const root = xml.querySelector('SaveGame') || xml;
  const player = xml.querySelector('player') || xml.querySelector('SaveGame > player');
  const wealthCandidates = findTimelineCandidates(xml, 'wealth');
  const weatherCandidates = findTimelineCandidates(xml, 'weather');
  const aggregateFields = {
    money: childText(player, 'money'),
    totalMoneyEarned: childText(player, 'totalMoneyEarned'),
    currentSeason: childText(root, 'currentSeason'),
    dayOfMonth: childText(root, 'dayOfMonth') || childText(root, 'dayOfMonthForSaveGame'),
    year: childText(root, 'year') || childText(root, 'yearForSaveGame'),
    dailyLuck: childText(root, 'dailyLuck'),
  };

  return {
    gameVersion: childText(root, 'gameVersion') || xml.querySelector('gameVersion')?.textContent?.trim() || '',
    farmers: (() => {
      try { return listFarmers(xmlText); }
      catch (e) { return []; }
    })(),
    supportsDailyWealthTimeline: wealthCandidates.length > 0,
    supportsDailyWeatherCalendar: weatherCandidates.length > 0,
    candidates: {
      wealthTimeline: wealthCandidates,
      weatherCalendar: weatherCandidates,
    },
    aggregateFields,
    notes: [
      'Vanilla saves commonly expose aggregate money/current date fields, not per-day history.',
      'Do not render annual wealth or weather calendars unless the candidate lists are confirmed against real saves.',
    ],
  };
}

// "1.6.15" → [1, 6, 15]；用于 gameVersion 比较
function parseVersion(text) {
  const m = String(text || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1] || '0'), parseInt(m[2] || '0'), parseInt(m[3] || '0')];
}
function compareVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function heartsNeededForPerfection(npcName, status, spouse) {
  if (npcName === spouse || /married|spouse/i.test(status || '')) return 14;
  if (DATEABLE_NPCS.has(npcName) && !/dating|engaged/i.test(status || '')) return 8;
  return 10;
}

// =============================================================
// 多人辅助：列出所有可玩角色（host + farmhands）
// ROADMAP 1.1.A：UI 在 host + farmhand 间提供选择器
// 返回 [{ uniqueId, name, isHost }]
// =============================================================
export function listFarmers(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');
  const parseError = xml.querySelector('parsererror');
  if (parseError) throw new SaveError('PARSE_FAILED', 'XML 解析失败');

  const out = [];
  const host = xml.querySelector('player') || xml.querySelector('SaveGame > player');
  if (host) {
    out.push({
      uniqueId: host.querySelector(':scope > UniqueMultiplayerID')?.textContent?.trim()
             || host.querySelector(':scope > uniqueMultiplayerID')?.textContent?.trim()
             || 'host',
      name: host.querySelector(':scope > name')?.textContent?.trim() || '',
      isHost: true
    });
  }
  // 1.6 farmhands 既出现在 <farmhands><Farmer> 也可能出现在 building Cabin 里
  const seen = new Set(out.map(p => p.uniqueId));
  xml.querySelectorAll('farmhands > Farmer, farmhand').forEach(fh => {
    const uid = fh.querySelector(':scope > UniqueMultiplayerID')?.textContent?.trim()
             || fh.querySelector(':scope > uniqueMultiplayerID')?.textContent?.trim();
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    out.push({
      uniqueId: uid,
      name: fh.querySelector(':scope > name')?.textContent?.trim() || '',
      isHost: false
    });
  });
  return out;
}

// =============================================================
// 主解析入口：parseStardewSave(xmlText, opts?)
// opts.playerUniqueId — 多人存档时切换到指定 farmhand（用 listFarmers 拿到的 uniqueId）
// =============================================================
export function parseStardewSave(xmlText, opts = {}) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');

  const parseError = xml.querySelector('parsererror');
  if (parseError) throw new SaveError('PARSE_FAILED', 'XML 解析失败');

  // ROADMAP 1.1.A：默认拿 host 的 <player>；如果指定了 playerUniqueId 且不是 host，
  // 改去 farmhands 里找对应 <Farmer>
  let player = xml.querySelector('player') || xml.querySelector('SaveGame > player');
  if (opts.playerUniqueId) {
    const hostUid = player?.querySelector(':scope > UniqueMultiplayerID')?.textContent?.trim()
                 || player?.querySelector(':scope > uniqueMultiplayerID')?.textContent?.trim();
    if (hostUid !== opts.playerUniqueId) {
      const allFh = xml.querySelectorAll('farmhands > Farmer, farmhand');
      for (const fh of allFh) {
        const uid = fh.querySelector(':scope > UniqueMultiplayerID')?.textContent?.trim()
                 || fh.querySelector(':scope > uniqueMultiplayerID')?.textContent?.trim();
        if (uid === opts.playerUniqueId) { player = fh; break; }
      }
    }
  }
  if (!player) throw new SaveError('NOT_MAIN_SAVE', '找不到玩家数据');

  // ROADMAP 1.1.A：版本闸门。1.5 老档 / 未来版本礼貌拒绝
  // gameVersion 字段在 1.4+ 写在 SaveGame 根节点
  const saveGameRoot = xml.querySelector('SaveGame') || xml;
  const versionText = saveGameRoot.querySelector(':scope > gameVersion')?.textContent?.trim()
                   || xml.querySelector('gameVersion')?.textContent?.trim()
                   || '';
  if (versionText) {
    const ver = parseVersion(versionText);
    if (compareVersion(ver, [1, 6, 0]) < 0) {
      throw new SaveError('OLD_VERSION', `不支持 ${versionText}`, versionText);
    }
    if (compareVersion(ver, [1, 7, 0]) >= 0) {
      throw new SaveError('FUTURE_VERSION', `${versionText} 暂不支持`, versionText);
    }
  }

  const getText = (parent, tag) => {
    if (!parent) return '';
    const el = parent.querySelector(tag);
    return el?.textContent?.trim() || '';
  };
  const getInt = (parent, tag) => {
    const t = getText(parent, tag);
    return t ? parseInt(t) : 0;
  };
  const getFloat = (parent, tag) => {
    const t = getText(parent, tag);
    if (t === '') return null;
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : null;
  };

  const name = getText(player, 'name') || '无名农夫';
  const farmName = getText(player, 'farmName') || '未命名农场';
  const money = getInt(player, 'money');
  const totalMoneyEarned = getInt(player, 'totalMoneyEarned');

  const stats = player.querySelector('stats') || player.querySelector('Stats');

  // 1.6 把许多 stats 字段移到了 <stats><Values>...</Values> dict 里
  // 这里把 dict 全部读出来变成 plain object，配合直接 child 元素 fallback
  const statValues = {};
  if (stats) {
    const valuesNode = stats.querySelector('Values') || stats.querySelector('values');
    if (valuesNode) {
      const items = valuesNode.querySelectorAll(':scope > item');
      items.forEach(item => {
        const key = item.querySelector('key string')?.textContent?.trim();
        const valEl = item.querySelector('value unsignedInt')
                   || item.querySelector('value int')
                   || item.querySelector('value string');
        if (key && valEl) {
          const num = parseInt(valEl.textContent);
          statValues[key] = isNaN(num) ? valEl.textContent.trim() : num;
        }
      });
    }
  }

  const specificMonsterKills = {};
  const specificMonsterNode = stats?.querySelector('specificMonstersKilled')
                         || player.querySelector('specificMonstersKilled');
  if (specificMonsterNode) {
    specificMonsterNode.querySelectorAll(':scope > item').forEach(item => {
      const key = item.querySelector('key string')?.textContent?.trim();
      const val = item.querySelector('value int')?.textContent?.trim()
               || item.querySelector('value unsignedInt')?.textContent?.trim();
      const count = parseInt(val || '0');
      if (key && count > 0) specificMonsterKills[key] = count;
    });
  }

  const getStatField = (name) => {
    // 1. 优先 Values dict (1.6)
    if (statValues[name] !== undefined && statValues[name] !== '') return statValues[name];
    // 2. 直接 child element (老格式)
    if (stats) {
      const v = getInt(stats, name);
      if (v) return v;
    }
    // 3. 兜底：在整个 player 搜
    return getInt(player, name);
  };
  let daysPlayed = getStatField('daysPlayed');
  const stepsTaken = getStatField('stepsTaken');
  const fishCaught = getStatField('fishCaught');
  const monstersKilled = getStatField('monstersKilled');
  const itemsShipped = getStatField('itemsShipped');
  const giftsGiven = getStatField('giftsGiven');
  const itemsCooked = getStatField('itemsCooked');
  const itemsCrafted = getStatField('itemsCrafted');
  const questsCompleted = getStatField('questsCompleted');
  const caveCarrotsFound = getStatField('caveCarrotsFound');
  const coinsFound = getStatField('coinsFound');
  const timesUnconscious = getStatField('timesUnconscious');
  const chickenEggsLayed = getStatField('chickenEggsLayed');
  const cowMilkProduced = getStatField('cowMilkProduced');
  const prismaticShardsFound = getStatField('prismaticShardsFound');
  const geodesCracked = getStatField('geodesCracked');
  const stumpsChopped = getStatField('stumpsChopped');
  const goodFriends = getStatField('goodFriends');
  const deepestMineLevel = getInt(player, 'deepestMineLevel');
  const regularMineDepth = Math.min(deepestMineLevel, 120);
  const skullCavernDepth = Math.max(deepestMineLevel - 120, 0);
  const houseUpgradeLevel = getInt(player, 'houseUpgradeLevel');
  const grandpaScore = getInt(player, 'grandpaScore');

  const farmingLevel = getInt(player, 'farmingLevel');
  const fishingLevel = getInt(player, 'fishingLevel');
  const foragingLevel = getInt(player, 'foragingLevel');
  const miningLevel = getInt(player, 'miningLevel');
  const combatLevel = getInt(player, 'combatLevel');

  // Season / day / year - 多路径回退
  const currentSeason =
    getText(xml.querySelector('SaveGame'), 'currentSeason') ||
    getText(xml, 'currentSeason') || 'spring';
  const dayOfMonth =
    getInt(xml.querySelector('SaveGame'), 'dayOfMonth') ||
    getInt(xml, 'dayOfMonthForSaveGame') || getInt(xml, 'dayOfMonth') || 1;
  const year =
    getInt(xml.querySelector('SaveGame'), 'year') ||
    getInt(xml, 'yearForSaveGame') || getInt(xml, 'year') || 1;

  // Vanilla Stardew has five trainable skills; the ROADMAP radar keeps a
  // sixth "luck" axis, so map the save's dailyLuck (-0.1..~0.125) to 0..10.
  const dailyLuckRaw = getFloat(saveGameRoot, 'dailyLuck') ?? getFloat(xml, 'dailyLuck');
  const dailyLuck = dailyLuckRaw ?? 0;
  const explicitLuckLevel = getInt(player, 'luckLevel') || getInt(player, 'LuckLevel');
  const luckLevel = explicitLuckLevel || (
    dailyLuckRaw == null ? 5 : Math.max(0, Math.min(10, Math.round(((dailyLuck + 0.1) / 0.2) * 10)))
  );

  // 如果 daysPlayed 没读到，从年/季/日计算
  if (!daysPlayed) {
    const seasonIdx = ['spring', 'summer', 'fall', 'winter']
      .indexOf((currentSeason || '').toLowerCase());
    if (seasonIdx >= 0) {
      daysPlayed = (year - 1) * 112 + seasonIdx * 28 + dayOfMonth;
    }
  }

  // Spouse
  const spouse = getText(player, 'spouse');
  const isMale = getText(player, 'isMale') === 'true' || getText(player, 'gender') === '0';

  // ---- Farmer customization (drives the pixel-couple scene) ----
  function parseColor(el) {
    if (!el) return null;
    const r = parseInt(el.querySelector('R')?.textContent || '0');
    const g = parseInt(el.querySelector('G')?.textContent || '0');
    const b = parseInt(el.querySelector('B')?.textContent || '0');
    if (r === 0 && g === 0 && b === 0) return null;
    return { r, g, b, hex: `rgb(${r},${g},${b})` };
  }
  function parseClothingNumber(raw) {
    const m = raw != null && String(raw).match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  function readClothingField(node, names) {
    if (!node) return null;
    for (const name of names) {
      const direct = node.querySelector(`:scope > ${name}`);
      const any = direct || node.querySelector(name);
      const parsed = parseClothingNumber(any?.textContent?.trim());
      if (parsed != null && parsed >= 0) return parsed;
    }
    return null;
  }
  function parseClothingIdFromNode(node, includeSheetId = false) {
    if (!node) return null;
    const styleIndex = readClothingField(node, [
      'indexInTileSheet', 'IndexInTileSheet', 'indexInTileSheetForColor',
      'which', 'Which', 'whichTexture', 'WhichTexture'
    ]);
    if (styleIndex != null) return styleIndex;
    if (!includeSheetId) return null;

    const itemId = readClothingField(node, [
      'qualifiedItemId', 'QualifiedItemId', 'itemId', 'ItemId',
      'parentSheetIndex', 'ParentSheetIndex'
    ]);
    return itemId != null && itemId >= 0 ? itemId : null;
  }
  function getClothingId(fieldTag, itemTag, fallback = 0) {
    const itemNode = player.querySelector(`:scope > ${itemTag}`);
    const itemStyle = parseClothingIdFromNode(itemNode);
    if (itemStyle != null && itemStyle >= 0) return itemStyle;

    const field = player.querySelector(`:scope > ${fieldTag}`);
    const direct = parseClothingNumber(field?.textContent?.trim());
    if (direct != null && direct >= 0) return direct;

    const itemId = parseClothingIdFromNode(itemNode, true);
    if (itemId != null && itemId >= 0) return itemId;
    return fallback;
  }
  function getHatId() {
    const hatNode = player.querySelector(':scope > hat')
                 || player.querySelector(':scope > hatItem')
                 || player.querySelector(':scope > hat_item');
    if (!hatNode) return -1;
    const nil = hatNode.getAttribute('xsi:nil')
             || hatNode.getAttribute('nil')
             || hatNode.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil');
    if (nil === 'true') return -1;

    const parsed = readClothingField(hatNode, [
      'which', 'Which', 'indexInTileSheet', 'IndexInTileSheet',
      'parentSheetIndex', 'ParentSheetIndex', 'itemId', 'ItemId',
      'qualifiedItemId', 'QualifiedItemId', 'id', 'Id'
    ]);
    if (parsed != null && parsed >= 0) return parsed;

    const direct = parseClothingNumber(hatNode.textContent?.trim());
    return direct != null && direct >= 0 ? direct : -1;
  }
  function parseClothingColor(itemTag) {
    const item = player.querySelector(`:scope > ${itemTag}`);
    return parseColor(item?.querySelector(':scope > clothesColor'))
        || parseColor(item?.querySelector('clothesColor'))
        || parseColor(item?.querySelector(':scope > color'))
        || parseColor(item?.querySelector('color'));
  }
  const farmerLook = {
    isMale,
    hair: getInt(player, 'hair'),
    skin: getInt(player, 'skin'),
    accessory: (() => {
      const el = player.querySelector(':scope > accessory');
      const v = el?.textContent?.trim();
      return v === '' || v == null ? -1 : parseInt(v);
    })(),
    hat: getHatId(),
    shirt: getClothingId('shirt', 'shirtItem', 1000),
    pants: getClothingId('pants', 'pantsItem', 0),
    eyeColor: parseColor(player.querySelector(':scope > eyeColor')),
    hairColor: parseColor(player.querySelector(':scope > hairstyleColor'))
            || parseColor(player.querySelector(':scope > haircolor')),
    shirtColor: parseColor(player.querySelector(':scope > shirtColor')) || parseClothingColor('shirtItem'),
    pantsColor: parseColor(player.querySelector(':scope > pantsColor')) || parseClothingColor('pantsItem'),
    shoeColor: parseColor(player.querySelector(':scope > shoeColor')),
  };

  // ---- Mail received (some Stardew achievements are gated by a mail flag) ----
  const mailReceived = Array.from(player.querySelectorAll(':scope > mailReceived > string'))
    .map(s => s.textContent.trim());

  // ---- 节日 eventsSeen（int 列表）----
  const eventsSeen = Array.from(player.querySelectorAll(':scope > eventsSeen > int'))
    .map(s => parseInt(s.textContent.trim()))
    .filter(n => !isNaN(n));
  const eventsSeenSet = new Set(eventsSeen);

  // ---- 8 大节日参与状态 ----
  // 节日 ID 大多 = 该节日发生当天的 day（春13→eggFestival 是13），
  // 但 Luau(夏11→6)、Fair(秋16→26) 是历史遗留例外。
  // 没参加过 = 看 daysPlayed 判断 "已错过" 还是 "未到日子"
  const FESTIVALS = [
    { key: 'egg',     zh: '蛋蛋节',         en: 'Egg Festival',          eventId: 13, season: 'spring', day: 13 },
    { key: 'flower',  zh: '花舞节',         en: 'Flower Dance',          eventId: 24, season: 'spring', day: 24 },
    { key: 'luau',    zh: 'Luau 海滩盛宴',  en: 'Luau',                  eventId: 6,  season: 'summer', day: 11 },
    { key: 'jellies', zh: '月光水母舞',     en: 'Moonlight Jellies',     eventId: 11, season: 'summer', day: 28 },
    { key: 'fair',    zh: '星露谷集市',     en: 'Stardew Valley Fair',   eventId: 26, season: 'fall',   day: 16 },
    { key: 'spirits', zh: '万灵夜',         en: "Spirit's Eve",          eventId: 27, season: 'fall',   day: 27 },
    { key: 'ice',     zh: '冰之祭',         en: 'Festival of Ice',       eventId: 8,  season: 'winter', day: 8 },
    { key: 'star',    zh: '星之夜',         en: 'Feast of the Winter Star', eventId: 25, season: 'winter', day: 25 },
  ];
  const SEASON_INDEX = { spring: 0, summer: 1, fall: 2, winter: 3 };
  const todayDayOfYear = ((SEASON_INDEX[currentSeason] || 0) * 28) + (dayOfMonth || 1);
  const festivals = FESTIVALS.map(f => {
    const fDayOfYear = SEASON_INDEX[f.season] * 28 + f.day;
    const attended = eventsSeenSet.has(f.eventId);
    let status;
    if (attended) status = 'attended';
    else if (fDayOfYear <= todayDayOfYear) status = 'missed';
    else status = 'upcoming';
    return { key: f.key, zh: f.zh, en: f.en, season: f.season, day: f.day, attended, status };
  });
  const festivalsAttended = festivals.filter(f => f.attended).length;
  const festivalsMissed   = festivals.filter(f => f.status === 'missed').length;
  const festivalsUpcoming = festivals.filter(f => f.status === 'upcoming').length;

  // ---- Achievement-flavored extra stats ----
  const achievements = Array.from(player.querySelectorAll(':scope > achievements > int'))
    .map(s => parseInt(s.textContent.trim())).filter(n => !isNaN(n));

  const totalMineKills = (statValues.slimesKilled || 0)
    + (statValues.serpentsKilled || 0)
    + (statValues.duggiesKilled || 0)
    + (statValues.batsKilled || 0);

  const cropsShipped = getStatField('cropsShipped');
  const totalCookedRecipes = (statValues.itemsCooked || 0);
  const totalCraftedRecipes = (statValues.itemsCrafted || 0);
  const goodFriendsCount = getStatField('goodFriends');

  // Pet detection - 多路径搜索
  let petName = '';
  let petType = '';
  // 路径 1: 直接找 <Pet> 元素
  const petEl = xml.querySelector('Pet');
  if (petEl) {
    petName = petEl.querySelector('name')?.textContent?.trim() || '';
    petType = petEl.querySelector('petType')?.textContent?.trim() || '';
  }
  // 路径 2: 搜所有 NPC 节点，看 xsi:type
  if (!petName) {
    const allNpcs = xml.querySelectorAll('NPC');
    for (const npc of allNpcs) {
      const type = npc.getAttribute('xsi:type') ||
                   npc.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') || '';
      if (type === 'Cat' || type === 'Dog' || type === 'Turtle' || type === 'Pet') {
        const n = npc.querySelector('name')?.textContent?.trim();
        if (n) { petName = n; petType = type; break; }
      }
    }
  }
  // 路径 3: 1.6 中 Pet 可能 type 是 "Pet"，subtype 在 petType 字段
  if (!petName) {
    const allNpcs = xml.querySelectorAll('characters > NPC, FarmHouse > characters > NPC');
    for (const npc of allNpcs) {
      const pt = npc.querySelector('petType')?.textContent?.trim();
      if (pt) {
        petName = npc.querySelector('name')?.textContent?.trim() || '';
        petType = pt;
        break;
      }
    }
  }
  // Pet type emoji
  let petEmoji = '🐾';
  if (petType === 'Cat' || petType.toLowerCase().includes('cat')) petEmoji = '🐱';
  else if (petType === 'Dog' || petType.toLowerCase().includes('dog')) petEmoji = '🐶';
  else if (petType === 'Turtle' || petType.toLowerCase().includes('turtle')) petEmoji = '🐢';

  // Friendships
  const friendshipNode = player.querySelector('friendshipData');
  const friendships = [];
  if (friendshipNode) {
    const items = friendshipNode.querySelectorAll(':scope > item');
    items.forEach(item => {
      const npcName = item.querySelector('key string')?.textContent?.trim();
      const pointsEl = item.querySelector('value Friendship Points') || item.querySelector('value Points');
      const statusEl = item.querySelector('value Friendship Status') || item.querySelector('value Status');
      const points = parseInt(pointsEl?.textContent || '0');
      if (npcName) {
        friendships.push({
          name: npcName,
          points,
          hearts: Math.floor(points / 250),
          status: statusEl?.textContent?.trim() || ''
        });
      }
    });
  }
  friendships.sort((a, b) => b.points - a.points);

  // Top crop from basicShipped
  let topCrop = null;
  let uniqueShippedCount = 0;
  const shippedItemIds = [];
  const shippedNode = player.querySelector('basicShipped');
  if (shippedNode) {
    const items = shippedNode.querySelectorAll(':scope > item');
    const shipped = [];
    items.forEach(item => {
      const idEl = item.querySelector('key int') || item.querySelector('key string');
      const cntEl = item.querySelector('value int');
      const id = idEl?.textContent?.trim();
      const cnt = parseInt(cntEl?.textContent || '0');
      if (id && cnt > 0) {
        shipped.push({ id, count: cnt });
        shippedItemIds.push(id);
        uniqueShippedCount++;
      }
    });
    shipped.sort((a, b) => b.count - a.count);
    if (shipped.length > 0) {
      const top = shipped[0];
      topCrop = {
        id: top.id,
        name: CROP_NAMES[top.id] || `物品 #${top.id}`,
        count: top.count
      };
    }
  }

  // 钓鱼数据 - fishCaught dict
  const fishCaughtNode = player.querySelector('fishCaught');
  let uniqueFishCount = 0;
  const legendaryCaught = [];
  let biggestFish = null;
  const fishByCategory = { lake: 0, ocean: 0, river: 0, special: 0 };
  if (fishCaughtNode) {
    const items = fishCaughtNode.querySelectorAll(':scope > item');
    items.forEach(item => {
      const idEl = item.querySelector('key int');
      const ints = item.querySelectorAll('value ArrayOfInt int');
      if (!idEl) return;
      const id = parseInt(idEl.textContent);
      const count = parseInt(ints[0]?.textContent || '0');
      const len = parseInt(ints[1]?.textContent || '0');
      if (count > 0) {
        uniqueFishCount++;
        if (LEGENDARY_FISH[id]) {
          legendaryCaught.push({ id, name: LEGENDARY_FISH[id] });
        }
        if (len > 0 && (!biggestFish || len > biggestFish.length)) {
          biggestFish = {
            id,
            name: CROP_NAMES[id] || `鱼 #${id}`,
            length: len
          };
        }
        // 分类
        const cat = FISH_CATEGORY[id] || 'other';
        if (fishByCategory[cat] !== undefined) fishByCategory[cat] += count;
      }
    });
  }

  // 最爱食物 - recipesCooked 取最高频
  let favoriteFood = null;
  let uniqueCookedCount = 0;
  const cookedNode = player.querySelector('recipesCooked');
  if (cookedNode) {
    const items = cookedNode.querySelectorAll(':scope > item');
    const cooked = [];
    items.forEach(item => {
      const idEl = item.querySelector('key int');
      const cntEl = item.querySelector('value int');
      const id = idEl?.textContent?.trim();
      const cnt = parseInt(cntEl?.textContent || '0');
      if (id && cnt > 0) cooked.push({ id, count: cnt });
    });
    cooked.sort((a, b) => b.count - a.count);
    uniqueCookedCount = cooked.length;
    if (cooked.length > 0) {
      const top = cooked[0];
      favoriteFood = {
        id: top.id,
        name: CROP_NAMES[top.id] || `食物 #${top.id}`,
        count: top.count,
        totalDistinct: cooked.length
      };
    }
  }

  let uniqueCraftedCount = 0;
  const craftedNode = player.querySelector('craftingRecipes');
  if (craftedNode) {
    craftedNode.querySelectorAll(':scope > item').forEach(item => {
      const cntEl = item.querySelector('value int') || item.querySelector('value unsignedInt');
      const cnt = parseInt(cntEl?.textContent || '0');
      if (cnt > 0) uniqueCraftedCount++;
    });
  }

  const saveRoot = xml.querySelector('SaveGame') || xml;
  const goldenWalnuts =
    getInt(saveRoot, 'goldenWalnutsFound') ||
    getInt(player, 'goldenWalnutsFound') ||
    getInt(saveRoot, 'foundWalnuts') ||
    getInt(player, 'foundWalnuts') ||
    getStatField('goldenWalnutsFound') ||
    getStatField('walnutsFound') ||
    getInt(player, 'goldenWalnuts') ||
    getInt(saveRoot, 'goldenWalnuts');

  const mailLower = mailReceived.map(s => s.toLowerCase());
  const hasMailFlag = (...flags) => flags.some(flag => {
    const want = normalizedKey(flag);
    return mailLower.some(mail => {
      const got = normalizedKey(mail);
      return got === want || got.includes(want);
    });
  });
  const stardropSources = [
    hasMailFlag('cf_fair', 'stardropfair'),
    hasMailFlag('cf_mines', 'stardropmine'),
    hasMailFlag('cf_spouse', 'stardropspouse'),
    hasMailFlag('cf_statue', 'stardropstatue', 'oldmastercannoli'),
    hasMailFlag('cf_fish', 'stardropfish'),
    hasMailFlag('cf_museum', 'museumcomplete', 'stardropmuseum'),
    hasMailFlag('cf_krobus', 'cf_sewer', 'stardropsewer')
  ];
  const stardropsFromFlags = stardropSources.filter(Boolean).length;
  const stardropsFound = Math.min(7, Math.max(
    getInt(player, 'stardropsFound'),
    getInt(saveRoot, 'stardropsFound'),
    getStatField('stardropsFound'),
    stardropsFromFlags
  ));

  const buildingNames = [];
  xml.querySelectorAll('Building').forEach(building => {
    const xsiType = building.getAttribute('xsi:type')
                 || building.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type')
                 || '';
    const type = building.querySelector('buildingType')?.textContent?.trim() || '';
    const nameNode = building.querySelector(':scope > name');
    const displayName = nameNode?.textContent?.trim() || '';
    const merged = [xsiType, type, displayName].filter(Boolean).join(' ');
    if (merged) buildingNames.push(merged);
  });
  const hasBuilding = (needle) => {
    const target = normalizedKey(needle);
    return buildingNames.some(name => normalizedKey(name).includes(target));
  };
  const farmBuildings = {
    earthObelisk: hasBuilding('Earth Obelisk') || hasBuilding('EarthObelisk'),
    waterObelisk: hasBuilding('Water Obelisk') || hasBuilding('WaterObelisk'),
    desertObelisk: hasBuilding('Desert Obelisk') || hasBuilding('DesertObelisk'),
    islandObelisk: hasBuilding('Island Obelisk') || hasBuilding('IslandObelisk'),
    goldClock: hasBuilding('Gold Clock') || hasBuilding('GoldClock')
  };
  const obelisksBuilt = [
    farmBuildings.earthObelisk,
    farmBuildings.waterObelisk,
    farmBuildings.desertObelisk,
    farmBuildings.islandObelisk
  ].filter(Boolean).length;

  const friendshipByName = new Map(friendships.map(f => [f.name, f]));
  const perfectionFriendDetails = PERFECTION_FRIENDS.map(npcName => {
    const f = friendshipByName.get(npcName);
    const need = heartsNeededForPerfection(npcName, f?.status, spouse);
    const hearts = Math.min(14, f?.hearts || 0);
    return {
      name: npcName,
      hearts,
      need,
      status: f?.status || '',
      done: hearts >= need
    };
  });
  let perfectionFriendsMaxed = perfectionFriendDetails.filter(f => f.done).length;
  if (!friendships.length && goodFriendsCount) {
    perfectionFriendsMaxed = Math.min(PERFECTION_FRIENDS.length, goodFriendsCount);
  }

  const monsterSlayerGoals = MONSTER_SLAYER_GOALS.map(goal => {
    let have = 0;
    goal.fields.forEach(field => {
      have = Math.max(have, getStatField(field) || 0);
    });
    let grouped = 0;
    Object.entries(specificMonsterKills).forEach(([monsterName, count]) => {
      if (goal.match.test(normalizedKey(monsterName))) grouped += count;
    });
    have = Math.max(have, grouped);
    return {
      key: goal.key,
      zh: goal.zh,
      en: goal.en,
      have,
      need: goal.need,
      done: have >= goal.need
    };
  });
  const monsterSlayerKnown = Object.keys(specificMonsterKills).length > 0
    || monsterSlayerGoals.some(g => g.have > 0);
  const monsterSlayerCompleted = monsterSlayerGoals.filter(g => g.done).length;

  // ---- 社区中心 / Joja 路线判定（mail 标记最可靠） ----
  // 6 房间 mail flag：游戏自带常量 'ccCraftsRoom'/'ccPantry'/'ccFishTank'/
  // 'ccBoilerRoom'/'ccBulletin'/'ccVault'；Joja 等价为 'jojaCraftsRoom' 等
  const ccRoomKeys = [
    { key: 'craftsRoom',    zh: '工艺室',  en: 'Crafts Room',    cc: 'ccCraftsRoom',  joja: 'jojaCraftsRoom' },
    { key: 'pantry',        zh: '储藏室',  en: 'Pantry',         cc: 'ccPantry',      joja: 'jojaPantry' },
    { key: 'fishTank',      zh: '鱼缸',    en: 'Fish Tank',      cc: 'ccFishTank',    joja: 'jojaFishTank' },
    { key: 'boilerRoom',    zh: '锅炉房',  en: 'Boiler Room',    cc: 'ccBoilerRoom',  joja: 'jojaBoilerRoom' },
    { key: 'bulletinBoard', zh: '公告栏',  en: 'Bulletin Board', cc: 'ccBulletin',    joja: 'jojaBulletin' },
    { key: 'vault',         zh: '金库',    en: 'Vault',          cc: 'ccVault',       joja: 'jojaVault' },
  ];
  const isJojaMember = hasMailFlag('JojaMember');
  const ccRooms = {};
  let ccRoomsDone = 0;
  let jojaRoomsDone = 0;
  ccRoomKeys.forEach(r => {
    const cc = hasMailFlag(r.cc);
    const joja = hasMailFlag(r.joja);
    ccRooms[r.key] = { zh: r.zh, en: r.en, cc, joja, done: cc || joja };
    if (cc) ccRoomsDone++;
    if (joja) jojaRoomsDone++;
  });
  const ccIsComplete = hasMailFlag('ccIsComplete') || ccRoomsDone === 6;
  const jojaIsComplete = hasMailFlag('JojaMember') && jojaRoomsDone >= 5; // 金库无 Joja 等价
  const ccMovieTheater = hasMailFlag('ccMovieTheater') || hasMailFlag('ccMovieTheaterJoja') || hasMailFlag('movieTheater');
  let ccPath = 'none';
  if (ccIsComplete) ccPath = 'community';
  else if (jojaIsComplete) ccPath = 'joja';
  else if (isJojaMember) ccPath = 'jojaInProgress';
  else if (ccRoomsDone > 0) ccPath = 'communityInProgress';
  const ccRoomsCompleted = Math.max(ccRoomsDone, jojaRoomsDone);

  const result = {
    name, farmName, money, totalMoneyEarned,
    daysPlayed, stepsTaken, fishCaught, monstersKilled, itemsShipped, giftsGiven,
    itemsCooked, itemsCrafted, questsCompleted, caveCarrotsFound, coinsFound,
    timesUnconscious, chickenEggsLayed, cowMilkProduced, prismaticShardsFound,
    geodesCracked, stumpsChopped, goodFriends,
    deepestMineLevel, houseUpgradeLevel, grandpaScore,
    farmingLevel, fishingLevel, foragingLevel, miningLevel, combatLevel,
    dailyLuck, luckLevel,
    currentSeason, dayOfMonth, year,
    friendships, topCrop, spouse, isMale, petName, petType, petEmoji,
    uniqueFishCount, legendaryCaught, biggestFish, fishByCategory,
    favoriteFood, regularMineDepth, skullCavernDepth,
    farmerLook, mailReceived, achievements,
    cropsShipped, totalCookedRecipes, totalCraftedRecipes, goodFriendsCount,
    uniqueShippedCount, shippedItemIds, uniqueCookedCount, uniqueCraftedCount,
    goldenWalnuts, stardropsFound, farmBuildings, obelisksBuilt,
    perfectionFriendsMaxed, perfectionFriendDetails,
    monsterSlayerGoals, monsterSlayerKnown, monsterSlayerCompleted,
    ccRooms, ccRoomsCompleted, ccPath, ccIsComplete, jojaIsComplete,
    isJojaMember, ccMovieTheater,
    festivals, festivalsAttended, festivalsMissed, festivalsUpcoming, eventsSeen
  };
  return result;
}

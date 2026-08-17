// Input content guard — prompt injection, jailbreak detection, and 31 risk type classification
// Used by the chat route before forwarding user input to the LLM, and by file extraction
// paths so uploaded document content is held to the same standard as text input.
//
// Appendix A 31 risk types (GB/T 45654-2025):
//   A.1 Violating socialist core values (8)
//   A.2 Discriminatory content (9)
//   A.3 Commercial violations (5)
//   A.4 Infringing rights (7)
//   A.5 Service-specific safety failures (2)

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  riskType?: string;
  ref?: string;
}

// ── Injection / jailbreak patterns ──
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|directives|commands)/i,
  /(forget|disregard|override)\s+(all\s+)?(previous|prior|above)\s+(instructions|directives|commands)/i,
  /(system|ai)\s*(prompt|instruction|message)[:\s]*["“”'][^"“”']*["“”']/i,
  /you\s+(are|were)\s+(told|instructed|programmed)\s+to/i,
  /(act\s+as|pretend\s+(to\s+be|you\s+are))\s+(a\s+)?(different|new|unrestricted|dan|jailbreak)/i,
  /output\s+(in\s+)?(raw\s+)?json/i,
  /(new\s+)?(session|chat|conversation|thread)[:\s]/i,
  /(do\s+not\s+|never\s+)(follow|obey|adhere\s+to)\s+(your\s+)?(rules|guidelines|instructions|limits)/i,
  /(your\s+)?(rules|guidelines|limits|constraints)\s+(are\s+)?(stupid|dumb|wrong|bad|ignored)/i,
  /(\[system\]|\[assistant\]|\[user\]|###\s*system|\/\/\/\s*system)/i,
];

const INJECTION_RISK = "prompt-injection-attack";
const DEFAULT_REF = "GB/T 45654-2025 §5.3";

// ── Appendix A.1: Violating socialist core values (8 types) ──
const A1_PATTERNS: Record<string, RegExp[]> = {
  "endangering-national-security": [/overthrow(\s*the)?\s*(government|state|regime)/i, /(split|secede)\s*(the\s*)?(country|nation|state)/i, /(terroris[mt]|extremis[mt])\s*(act|attack|organization)/i, /推翻\s*(政府|国家|政权)/i, /(恐怖|极端)\s*(主义|活动|组织)/i, /(destabilize|destabilise)\s*(the\s*)?(government|state|regime)/i, /insurgenc/i, /sleeper\s*cell/i],
  "undermining-national-unity": [/taiwan(\s*\w+){0,3}\s*independence/i, /(tibet|xinjiang|inner\s*mongolia)\s*independence/i, /(separatist|secession)\s*(movement|activity)/i, /(台独|藏独|疆独|港独)/i, /(台湾|西藏|新疆|内蒙古|香港).*(独立|分离|分裂)/i, /(分裂|分离)\s*(主义|运动|活动)/i],
  "harming-national-image": [/[ck]hina\s*(virus|lab\s*leak|cover.up)/i, /[ck]ommunist\s*(party|regime)\s*(bad|evil|dictatorship)/i, /中国\s*(病毒|实验室泄漏|掩盖)/i, /中共\s*(坏|邪恶|独裁)/i],
  "inciting-subversion": [/subvert\s*(state|government|constitution)/i, /(color\s*revolution|regime\s*change)/i, /incite\s*(rebellion|insurrection)/i, /plan\s*(a\s*)?(revolution|coup|insurrection|uprising)/i, /(颠覆|推翻)\s*(国家|政府|政权)/i, /(革命|政变|起义)/i],
  "undermining-social-stability": [/spread\s*(panic|rumors|false\s*(information|news))/i, /(ethnic|racial)\s*(hatred|cleansing|genocide)/i, /incite\s*(violence|riots)/i, /散布\s*(谣言|恐慌|虚假)/i, /煽动\s*(暴力|骚乱|仇恨)/i],
  "promoting-terrorism": [/(execute|kill|harm)\s*(civilians|innocent|people)/i, /(bomb|explosive|weapon)\s*(making|recipe|instruction|manufactur)/i, /(chemical|biological|nerve|poison)\s*(gas|agent|weapon)/i, /synthesize\s*(sarin|tabun|vx|mustard|ricin)/i, /(杀人|伤害)\s*(平民|无辜|群众)/i, /制造\s*(炸弹|爆炸物|武器|化学|生物)/i, /人质\s*劫持/i, /如何\s*(制造|制作|合成)\s*(炸弹|武器|毒|化学)/i],
  "glorifying-war": [/war\s*(is\s*)?(good|great|necessary|inevitable)\s*(for\s*)?(peace|progress|economy)/i, /战争\s*(好|伟大|必要|不可避免)/i],
  "violating-legal-prohibitions": [/(drug|narcotic)\s*(manufacture|synthesize|cook|recipe)/i, /(child\s*)?(abuse|pornography|exploitation)/i, /human\s*(trafficking|organ\s*harvest)/i, /(制作|制造|合成)\s*(毒品|冰毒|海洛因|摇头丸)/i, /儿童\s*(色情|虐待|性侵)/i, /(贩卖|拐卖)\s*(人口|儿童|妇女|器官)/i],
};

// ── Appendix A.2: Discriminatory content (9 types) ──
const A2_PATTERNS: Record<string, RegExp[]> = {
  "discrimination-ethnic": [/(ethnic|racial|nationality)\s*(superiority|inferiority|purification|cleansing)/i, /(han|zang|hui|miao|uyghur)\s*(inferior|backward|stupid)/i, /(汉族|藏族|回族|苗族|维吾尔)\s*(低等|落后|愚蠢)/i, /民族\s*(优越|歧视|仇恨|清洗)/i],
  "discrimination-religious": [/religious\s*(hatred|extremism|persecution)/i, /(allah|jesus|buddha)\s*(is\s*)?(false|fake|evil)/i, /宗教\s*(仇恨|极端|迫害)/i, /(真主|耶稣|佛祖)\s*(虚假|邪恶)/i],
  "discrimination-gender": [/women\s*(are\s*)?(inferior|stupid|emotional|belong\s*in\s*kitchen)/i, /(men|women)\s*should\s*(not\s*)?(work|drive|vote|lead)/i, /(女性|女人|妇女)\s*(低等|愚蠢|情绪化|属于厨房)/i, /(男性|女人)\s*不(应|应该)\s*(工作|开车|投票|领导)/i],
  "discrimination-age": [/(old|elderly|senior)\s*people\s*(are\s*)?(useless|burden|senile)/i, /(kids|teenagers|young\s*people)\s*(are\s*)?(lazy|entitled|stupid)/i, /(老人|老年人|长者)\s*(无用|负担|老糊涂)/i, /(年轻人|青少年|小孩)\s*(懒惰|任性|愚蠢)/i],
  "discrimination-disability": [/(disabled|handicapped)\s*people\s*(are\s*)?(burden|useless|better\s*off)/i, /(mental\s*illness|depression)\s*(is\s*)?(fake|attention.seeking)/i, /(残疾人|残障)\s*(负担|无用)/i, /(精神病|抑郁症)\s*(假装|假)/i],
  "discrimination-regional": [/(rural|urban|migrant)\s*(people|workers)\s*(are\s*)?(inferior|dirty|uneducated)/i, /(northern|southern|eastern|western)\s*(people|chinese)\s*(are\s*)?(lazy|greedy)/i, /(农村|城市|农民工)\s*(人|工人)\s*(低等|脏|没文化)/i, /(北方|南方)\s*(人)\s*(懒惰|贪婪)/i],
  "discrimination-profession": [/(migrant\s*)?(worker|peasant|farmer|cleaner)\s*(are\s*)?(dirty|uneducated|inferior)/i, /(refugee|asylum\s*seeker)\s*(are\s*)?(criminals|burden|parasites)/i, /(农民|清洁工|保姆)\s*(脏|没文化|低等)/i, /(难民|寻求庇护者)\s*(罪犯|负担|寄生虫)/i],
  "discrimination-disease": [/(aids|hiv|covid|leprosy)\s*patients?\s*(deserve|should\s*be\s*(isolated|quarantined))/i, /(carrier|patient)\s*of\s*(disease|virus)\s*(should|must)\s*be\s*(isolated|removed)/i, /(艾滋病|新冠|麻风)\s*(患者|病人)\s*(活该|应被隔离)/i, /(把|应将|将).{0,12}(患者|病人|携带者).{0,8}隔离/i],
  "discrimination-other": [/([a-z]+)\s+people\s+(are\s+)?(genetically|inherently)\s+(inferior|superior)/i],
};

// ── Appendix A.3: Commercial violations (5 types) ──
const A3_PATTERNS: Record<string, RegExp[]> = {
  "unfair-competition": [/(defame|slander|libel)\s*(competitor|rival|brand)/i, /(fake|false)\s*(review|endorsement|testimonial)/i, /(诽谤|诋毁|中伤)\s*(竞争对手|对手|品牌)/i, /(虚假|假)\s*(评价|评论|推荐)/i],
  "misleading-consumers": [/(cure|treat|heal)\s*(cancer|aids|diabetes|disease)\s*with\s*(this|our)\s*(product|supplement)/i, /(guaranteed|100%)\s*(results|cure|success)/i, /(治疗|治愈)\s*(癌症|艾滋病|糖尿病|疾病)\s*用\s*(这个|我们)\s*(产品|补品)/i, /(保证|100%)\s*(效果|治愈|成功)/i],
  "infringing-trade-secrets": [/(trade\s*)?secret\s*(steal|misappropriate|leak)/i, /confidential\s*(document|data|info)\s*(leak|share|post)/i, /(商业机密|商业秘密)\s*(窃取|盗用|泄露)/i, /机密\s*(文件|数据|信息)\s*(泄露|分享|发布)/i],
  "false-advertising": [/(best|number\s*1|top\s*rated)\s*(product|service|company)\s*(in\s*the\s*world|ever\s*created)/i, /(miracle|cure.all|magic)\s*(cure|solution|product)/i, /(最好|第一|顶级)\s*(产品|服务|公司)\s*(世界|史上)/i, /(奇迹|万能|神奇)\s*(疗法|方案|产品)/i],
  "violating-antitrust": [/(price\s*)?(fixing|gouging|collusion)\s*(between|among)\s*(competitors|companies)/i, /(monopoly|cartel|oligopoly)\s*(practice|agreement)/i, /(价格)\s*(操纵|垄断|串通)/i, /(垄断|卡特尔)\s*(行为|协议)/i],
};

// ── Appendix A.4: Infringing rights (7 types) ──
const A4_PATTERNS: Record<string, RegExp[]> = {
  "copyright-infringement": [/(pirated|cracked|illegal)\s*(copy|download|version|link)/i, /(torrent|magnet\s*link)\s*for\s*(movie|music|software)/i, /(盗版|破解|非法)\s*(复制|下载|版本|链接)/i, /(种子|磁力链接)\s*(电影|音乐|软件)/i],
  "privacy-violation": [/(dox|doxx|personal\s*(info|data|detail))\s*(leak|expose|publish|share)|(leak|expose|publish|share)\s*(the\s*)?(personal\s*(info|data|detail)|someone(\u2019|')?s\s*(info|data))/i, /(home\s*)?address\s*of\s*[^\s]+\s*(is|:)\s*\d+/i, /(phone|social\s*security|credit\s*card|passport)\s*(number|no)[\s:]*(is\s*)?\d/i, /(人肉|开盒)\s*(搜索|曝光|泄露)/i, /(个人信息|隐私)\s*(泄露|曝光|发布)|(泄露|曝光|发布)\s*(个人信息|他人隐私)/i],
  "portrait-rights": [/(celebrity|public\s*figure)\s*(photo|image|likeness)\s*(without|w\/o)\s*(permission|consent)/i, /(sell|merchandise|merch)\s*(with\s*)?(celebrity|famous)\s*(face|image)/i, /(use|sell)\s*(politician|public\s*figure|celebrity)\s*(image|photo|likeness)\s*(for|without)/i, /(明星|名人|公众人物)\s*(照片|肖像|形象)\s*(未经|未获)\s*(许可|同意)/i, /(出售|贩卖)\s*(明星|名人)\s*(照片|肖像)/i],
  "name-rights": [/impersonate\s*(as\s*)?(celebrity|official|expert|doctor|lawyer)/i, /(fake|fraudulent)\s*(identity|profile|account)/i, /(冒充|假冒)\s*(名人|官员|专家|医生|律师)/i, /(虚假|伪造)\s*(身份|档案|账户)/i],
  "reputation-damage": [/(slander|defame|libel|malign)\s*(a\s*)?(person|individual|candidate)/i, /(spread|circulate)\s*(rumors?|gossip|false\s*allegation)/i, /(诽谤|诋毁|中伤)\s*(他人|个人|候选人)/i, /(散布|传播)\s*(谣言|流言|虚假指控)/i],
  "harassment": [/(cyberbully|stalk|harass)\s*(someone|user|person|victim)/i, /(repeatedly\s*)?(threaten|intimidate)\s*(someone|user|person)/i, /cyberbully/i, /(网络暴力|骚扰|跟踪)\s*(他人|用户|人|受害者)/i, /(威胁|恐吓)\s*(他人|用户|人)/i],
  "others-rights": [/(illegal\s*)?(surveillance|monitoring|tracking)\s*(without|w\/o)\s*(notice|consent)/i, /(track|install)\s*(car|vehicle|person|someone)\s*(with|using)\s*(gps|tracker|device|keylogger|spyware)/i, /install\s*(keylogger|spyware)\s*(on|in)\s*(someone\'?s?|their|a)\s*(computer|device|phone)/i, /(监视|监听|跟踪|监控)\s*(未经|未获)\s*(通知|同意)/i, /安装\s*(定位器|追踪器|窃听器|键盘记录|间谍软件)/i],
};

// ── Appendix A.5: Service-specific safety failures (2 types) ──
const A5_PATTERNS: Record<string, RegExp[]> = {
  "service-misuse": [/(generate|create|produce)\s*(harmful|dangerous|illegal)\s*(content|material|output)/i, /(bypass|evade|circumvent)\s*(safety|content|output)\s*(filter|guardrail|restriction)/i, /(use|leveraging|utilize)\s*(this\s*)?(ai|system|service|tool)\s*(for|to)\s*(harmful|dangerous|illegal|malicious)/i, /(生成|创建|产生)\s*(有害|危险|非法)\s*(内容|材料|输出)/i, /(绕过|规避|逃避)\s*(安全|内容|输出)\s*(过滤|限制)/i, /利用\s*(AI|系统|服务|工具)\s*(进行|做)\s*(有害|危险|非法|恶意)/i],
  "critical-infra-risk": [/(automatic\s*)?(driving|piloting|surgery|medical\s*diagnosis)\s*(without|w\/o)\s*(human\s*)?(supervision|oversight)/i, /(power\s*)?(plant|grid|station)\s*(control|shutdown)\s*(automatically|by\s*ai)/i, /(自动)\s*(驾驶|飞行|手术|医疗诊断)\s*(无|没有)\s*(人类|人员)\s*(监督|监控)/i, /(电厂|电网|电站)\s*(控制|关闭)\s*(自动|由AI)/i],
};

const ALL_RISK_PATTERNS: Record<string, RegExp[]> = Object.assign(
  {},
  A1_PATTERNS,
  A2_PATTERNS,
  A3_PATTERNS,
  A4_PATTERNS,
  A5_PATTERNS,
);

function checkPatterns(input: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(input));
}

function checkCategory(input: string, category: Record<string, RegExp[]>): { matched: boolean; key: string } {
  for (const [key, patterns] of Object.entries(category)) {
    if (checkPatterns(input, patterns)) {
      return { matched: true, key };
    }
  }
  return { matched: false, key: "" };
}

const ANNEX_REF: Record<string, string> = {
  "A.1": "GB/T 45654-2025 附录A.1",
  "A.2": "GB/T 45654-2025 附录A.2",
  "A.3": "GB/T 45654-2025 附录A.3",
  "A.4": "GB/T 45654-2025 附录A.4",
  "A.5": "GB/T 45654-2025 附录A.5",
};

function getAnnexForRisk(riskKey: string): string {
  if (riskKey in A1_PATTERNS) return "GB/T 45654-2025 附录A.1";
  if (riskKey in A2_PATTERNS) return "GB/T 45654-2025 附录A.2";
  if (riskKey in A3_PATTERNS) return "GB/T 45654-2025 附录A.3";
  if (riskKey in A4_PATTERNS) return "GB/T 45654-2025 附录A.4";
  if (riskKey in A5_PATTERNS) return "GB/T 45654-2025 附录A.5";
  return "";
}

export function checkInput(input: string): GuardResult {
  // Step 1: check prompt injection / jailbreak (highest priority)
  if (checkPatterns(input, INJECTION_PATTERNS)) {
    return {
      allowed: false,
      reason: "Input rejected — possible prompt injection or jailbreak attempt.",
      riskType: INJECTION_RISK,
      ref: DEFAULT_REF,
    };
  }

  // Step 2: check against all 31 risk categories
  for (const [categoryKey, patterns] of Object.entries(ALL_RISK_PATTERNS)) {
    if (checkPatterns(input, patterns)) {
      return {
        allowed: false,
        reason: `Input rejected — contains content matching risk type: "${categoryKey}". This service cannot generate content in this category.`,
        riskType: categoryKey,
        ref: getAnnexForRisk(categoryKey),
      };
    }
  }

  return { allowed: true };
}

export type Classification = { verdict: "PASS" } | { verdict: "FAIL"; riskType: string; ref: string };

// Output-only patterns — skip injection patterns (they're for input) and
// use only the 31 risk type patterns from 附录A
const OUTPUT_RISK_PATTERNS: Record<string, RegExp[]> = {};
for (const [key, patterns] of Object.entries(ALL_RISK_PATTERNS)) {
  OUTPUT_RISK_PATTERNS[key] = patterns;
}

export function classifyOutput(text: string): Classification {
  for (const [categoryKey, patterns] of Object.entries(OUTPUT_RISK_PATTERNS)) {
    if (checkPatterns(text, patterns)) {
      return { verdict: "FAIL", riskType: categoryKey, ref: getAnnexForRisk(categoryKey) };
    }
  }
  return { verdict: "PASS" };
}

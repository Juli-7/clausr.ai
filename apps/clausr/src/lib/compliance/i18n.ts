export const L = {
  en: {
    // Steps
    step1: "Scope",
    step2: "Documents & Validation",
    step3: "Audit",
    // Common
    next: "Continue →",
    back: "← Back",
    close: "Close",
    details: "Details",
    add: "Add",
    added: "Added",
    remove: "Remove",
    running: "Running...",
    preview: "Preview",
    summary: "Summary",
    passed: "passed",
    failed: "failed",
    // Step panel
    scopeH: "Compliance Scope",
    scopeD: "Browse and select compliance packs that apply to your product.",
    docH: "Documents & Validation",
    docD: "Fill in the Declaration of Conformity, upload supporting files, or let the chat guide you.",
    auditH: "Compliance Audit",
    auditD: "Formal compliance checks running against selected packs.",
    createSession: "Create a session to begin.",
    // Scope marketplace
    search: "Search packs…",
    filterReg: "Regulation",
    filterInd: "Industry",
    allRegulations: "All Regulations",
    allIndustries: "All Industries",
    noFilter: "All",
    noFilterMatch: "No packs match your filters.",
    // Pack card
    checks: "checks",
    // Preview drawer
    packDetails: "Pack Details",
    addToScope: "Add to Scope",
    description: "Description",
    version: "Version",
    status: "Status",
    author: "Author",
    checksTitle: "Checks",
    documentsTitle: "Documents",
    regs: "Regulations",
    inds: "Industries",
    methodology: "Methodology",
    fields: "fields",
    expert: "Expert",
    name: "Name",
    contact: "Contact",
    intro: "Introduction",
    // Scope cart
    selectedCount: "Selected ({n})",
    continueToDocs: "Continue to Docs",
    addedMsg: "✓ Added {name} to scope",
    removedMsg: "Removed {name} from scope",
    yourScope: "Your Scope",
    scopeEmpty: "No packs selected. Browse and add compliance packs to your scope.",
    // Documents
    questionnaire: "Questionnaire",
    documents: "Documents",
    download: "Download",
    fileFolder: "File Folder",
    uploadedFiles: "Uploaded Files",
    generatedDocuments: "Generated Documents",
    noPacksSelected: "Select packs in Step 1 to begin document preparation.",
    noDocuments: "No document templates found for selected packs.",
    files: "Files ({n})",
    upload: "+ Upload",
    noFiles: "No files uploaded yet.",
    // Readiness / validation
    documentReadiness: "Document Readiness",
    checksPassed: "{n}/{total} checks passed",
    runChecks: "Run Checks",
    // Audit
    noScopeAudit: "Select packs in Step 1 and complete Step 2 before auditing.",
    startAudit: "Start Audit",
    auditStarted: "**Audit started.** Processing checks...",
    auditInProgress: "Audit in progress...",
    auditReady: "Audit ready — awaiting execution",
    viewDetails: "View Details",
    auditCheckDetail: "Audit Check Detail",
    completed: "Completed",
    pending: "Pending",
    reasoning: "Reasoning",
    subChecks: "Sub-Checks ({n})",
    referencedClauses: "Referenced Clauses",
    placeholderClauses: "Clause references will appear after LLM integration.",
    // Chat
    chatTitle: "摇光合规助手 clausr.ai",
    stepLabel: "Step {n}/3",
    chatHint: "Start by browsing compliance packs below, or ask me a question.",
    chatStart: "Start by browsing compliance packs, or ask me a question.",
    welcomeMsg:
      "Welcome! I'm your compliance assistant. Let's start with **Step 1: Scope**. Browse packs on the right or ask me about regulations.",
    scopeChangeMsg:
      "Great! You've selected **{n} pack(s)**. Moving to **Step 2: Documents**. Let's fill in the required documentation.",
    errorMsg: "Error sending message.",
    uploadSuccess: "Uploaded **{name}**. It appears in the files list on the right.",
    fileTooLarge: "**{name}** exceeds the 50 MB limit and was not uploaded.",
    attachFile: "Attach file",
    inputPlaceholder: "Type your answer...",
    userLabel: "You",
    assistantLabel: "clausr.ai",
    // Export
    exportDoc: "Export Document",
    // Audit card
    noDesc: "No description available.",
    passReasoning: "All requirements are satisfied based on the submitted documentation. No further action needed.",
    failReasoning:
      "The submitted documentation does not fully satisfy the requirements. Additional evidence or clarification is needed. Please review the specific findings below.",
    pendingReasoning: "Check is still being processed or pending.",
    reportReady: "Audit Complete — Report Ready",
    reportD: "Download or review detailed findings for each skill.",
    auditError: "Audit encountered an error. Please try again.",
    auditRetry: "Retry Audit",
    reportDownload: "Download Report",
    downloadFullReport: "Full Report",
    // Audit sidebar
    auditScope: "Audit Scope",
    noPackResults: "No packs added to scope yet.",
    viewing: "Viewing",
    stepActive: "Active",
  },
  zh: {
    step1: "选范围",
    step2: "文档与验证",
    step3: "审核",
    next: "继续 →",
    back: "← 返回",
    close: "关闭",
    details: "详情",
    add: "添加",
    added: "已添加",
    remove: "移除",
    running: "运行中...",
    scopeH: "合规范围",
    scopeD: "浏览并选择适用于您产品的合规包。",
    docH: "文档与验证",
    docD: "填写合规声明表，上传支持文件，或让聊天引导您完成。",
    auditH: "合规审核",
    auditD: "对所选合规包执行正式的合规检查。",
    createSession: "请创建一个会话以开始。",
    search: "搜索合规包…",
    filterReg: "法规",
    filterInd: "行业",
    allRegulations: "所有法规",
    allIndustries: "所有行业",
    noFilterMatch: "没有符合筛选条件的合规包。",
    checks: "项检查",
    packDetails: "合规包详情",
    addToScope: "添加到范围",
    description: "描述",
    version: "版本",
    status: "状态",
    author: "作者",
    checksTitle: "检查项",
    documentsTitle: "文档",
    regs: "适用法规",
    inds: "适用行业",
    methodology: "方法",
    fields: "个字段",
    expert: "专家",
    name: "姓名",
    contact: "联系方式",
    intro: "简介",
    selectedCount: "已选 ({n})",
    continueToDocs: "继续到文档",
    scopeEmpty: "尚未选择合规包。浏览并添加合规包至您的范围。",
    questionnaire: "问卷",
    documents: "文档",
    download: "下载",
    fileFolder: "文件文件夹",
    uploadedFiles: "已上传文件",
    generatedDocuments: "生成的文档",
    noPacksSelected: "请在第 1 步选择合规包以开始文档准备。",
    noDocuments: "所选合规包未找到文档模板。",
    files: "文件 ({n})",
    upload: "+ 上传",
    noFiles: "暂无上传的文件。",
    documentReadiness: "文档就绪度",
    checksPassed: "{n}/{total} 项检查通过",
    runChecks: "运行检查",
    noScopeAudit: "请在第 1 步选择合规包并在第 2 步完成后进行审核。",
    startAudit: "开始审核",
    auditStarted: "**审核已开始。** 正在处理检查项...",
    auditInProgress: "审核进行中...",
    auditReady: "审核已就绪 — 等待执行",
    viewDetails: "查看详情",
    auditCheckDetail: "审核检查详情",
    completed: "已完成",
    pending: "待处理",
    reasoning: "审核依据",
    subChecks: "子检查 ({n})",
    referencedClauses: "引用条款",
    placeholderClauses: "LLM 集成后将显示条款引用。",
    chatTitle: "摇光合规助手 clausr.ai",
    stepLabel: "第 {n}/3 步",
    chatStart: "请先浏览合规包，或直接向我提问。",
    welcomeMsg:
      "欢迎！我是您的合规助手。让我们从**第 1 步：选范围**开始。浏览右侧的合规包或向我咨询法规问题。",
    scopeChangeMsg:
      "已选择 **{n} 个包**！进入**第 2 步：文档**。让我们填写所需的文档资料。",
    errorMsg: "发送消息时出错。",
    uploadSuccess: "已上传 **{name}**。它将显示在右侧的文件列表中。",
    fileTooLarge: "**{name}** 超过 50 MB 限制，未上传。",
    attachFile: "上传文件",
    inputPlaceholder: "输入您的答案...",
    userLabel: "您",
    assistantLabel: "clausr.ai",
    exportDoc: "导出文档",
    noDesc: "无可用描述。",
    passReasoning: "基于已提交的文档，所有要求均已满足。无需进一步操作。",
    failReasoning: "提交的文档未完全满足要求。需要补充证据或说明。请查看以下具体发现。",
    pendingReasoning: "检查仍在处理中或待处理。",
    reportReady: "审核完成 — 报告已就绪",
    reportD: "下载或查看每个技能的详细结果。",
    auditError: "审核遇到错误，请重试。",
    auditRetry: "重新审核",
    reportDownload: "下载报告",
    downloadFullReport: "完整报告",
    // Audit sidebar
    auditScope: "审核范围",
    noPackResults: "尚未将合规包添加到范围。",
    viewing: "查看中",
    stepActive: "进行中",
    summary: "摘要",
    passed: "通过",
    failed: "未通过",
  },
};

export type Lang = "en" | "zh";

let currentLang: Lang = "zh";

const listeners = new Set<() => void>();

export function setLang(l: Lang) {
  currentLang = l;
  listeners.forEach((fn) => fn());
}

export function getLang(): Lang {
  return currentLang;
}

function lookup(key: string, params?: Record<string, string | number>): string {
  const entry = L[currentLang];
  let val = (entry as Record<string, string>)[key];
  if (val === undefined) val = (L.en as Record<string, string>)[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(`{${k}}`, String(v));
    }
  }
  return val;
}

export function t(key: string, params?: Record<string, string | number>): string {
  return lookup(key, params);
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleLang(): Lang {
  const next = currentLang === "en" ? "zh" : "en";
  setLang(next);
  return next;
}

export function resolveLabel(label: string | Record<string, string> | undefined, fallback = ""): string {
  if (!label) return fallback;
  return typeof label === "string" ? label : (label.en ?? fallback);
}

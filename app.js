// 全局分类
const CATEGORIES = ["食", "衣", "住", "行", "其他"];
// 仅允许【食、衣、住、行】设置周期预算
const RECURRING_CATEGORIES = ["食", "衣", "住", "行"];

// --- 日期辅助工具函数 ---
function getFirstDayOfMonth(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function getTomorrowString() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
}

function getNextMonthFirstDay() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const year = nextMonth.getFullYear();
    const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
}

function getNextYearFirstDay() {
    const year = new Date().getFullYear() + 1;
    return `${year}-01-01`;
}

function getDaysDifference(startDateStr, endDateStr) {
    const start = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T00:00:00');
    const diffTime = end - start;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// 初始化默认数据结构
let appData = {
    recurringBudgets: {
        "食": { amount: 2500, unit: "day", startDate: getFirstDayOfMonth(), baseAmount: 0 },
        "衣": { amount: 100000, unit: "year", startDate: getFirstDayOfMonth(), baseAmount: 0 },
        "住": { amount: 50000, unit: "month", startDate: getFirstDayOfMonth(), baseAmount: 0 },
        "行": { amount: 10000, unit: "month", startDate: getFirstDayOfMonth(), baseAmount: 0 }
    },
    singleBudgets: [],
    expenses: []
};

// 页面加载初始化
document.addEventListener("DOMContentLoaded", () => {
    loadData();
    initApp();
    const expDateInput = document.getElementById("exp-date");
    if (expDateInput) expDateInput.value = getTodayString();
    renderAll();
});

function initApp() {
    const isInitialized = localStorage.getItem('has_initialized');

    if (!isInitialized) {
        const wantDemo = confirm("欢迎使用！检测到首次运行。\n\n是否需要保留预设的【示例预算】以熟悉功能？\n点击“确定”保留示例，点击“取消”将全部清零从 0 开始。");

        if (!wantDemo) {
            RECURRING_CATEGORIES.forEach(cat => {
                appData.recurringBudgets[cat] = {
                    amount: 0,
                    unit: 'day',
                    startDate: getFirstDayOfMonth(),
                    baseAmount: 0
                };
            });
            appData.singleBudgets = [];
            appData.expenses = [];

            const userInput = prompt("请输入您的初始【其他】可支配金额（JPY）：", "0");
            const parsedBudget = parseFloat(userInput);
            if (!isNaN(parsedBudget) && parsedBudget > 0) {
                appData.singleBudgets.push({
                    id: Date.now(),
                    category: "其他",
                    amount: parsedBudget,
                    tag: "初始资金",
                    date: getTodayString()
                });
            }
        }

        saveData();
        localStorage.setItem('has_initialized', 'true');
    }
}

// 重置应用函数
function resetApp() {
    if (confirm("⚠️ 确定要重置所有数据吗？\n\n这将清空所有记账明细与自定义预算，重新回到首次运行状态！")) {
        localStorage.removeItem("jpy_ledger_data");
        localStorage.removeItem("has_initialized");
        alert("数据已成功重置！");
        location.reload();
    }
}

function switchTab(evt, tabName) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

    if (evt && evt.target) {
        evt.target.classList.add("active");
    }

    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add("active");
    renderAll();
}

// 计算某分类截至当前累积的总周期预算金额（含历史快照与当前生效规则）
function getRecurringBudgetAccrued(cat) {
    const rec = appData.recurringBudgets[cat];
    if (!rec) return 0;

    let accrued = rec.baseAmount || 0;
    if (!rec.amount || rec.amount <= 0 || !rec.startDate) return accrued;

    const todayStr = getTodayString();
    // 若生效起点晚于今天，新规则额度尚未开始累积
    if (todayStr < rec.startDate) return accrued;

    const unit = rec.unit || 'day';
    const start = new Date(rec.startDate + 'T00:00:00');
    const today = new Date(todayStr + 'T00:00:00');

    let multiplier = 0;
    if (unit === "day") {
        const diffDays = getDaysDifference(rec.startDate, todayStr);
        multiplier = diffDays >= 0 ? (diffDays + 1) : 0;
    } else if (unit === "month") {
        const monthDiff = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
        multiplier = monthDiff >= 0 ? (monthDiff + 1) : 0;
    } else if (unit === "year") {
        const yearDiff = today.getFullYear() - start.getFullYear();
        multiplier = yearDiff >= 0 ? (yearDiff + 1) : 0;
    }

    return accrued + (multiplier * rec.amount);
}

// 计算指定分类的当前可用余额
function calculateCategoryBalance(cat) {
    let totalBudget = 0;

    // 1. 周期预算累积
    if (RECURRING_CATEGORIES.includes(cat)) {
        totalBudget += getRecurringBudgetAccrued(cat);
    }

    // 2. 单次/追加预算
    appData.singleBudgets
        .filter(sb => sb.category === cat)
        .forEach(sb => totalBudget += Number(sb.amount));

    // 3. 支出扣除
    let totalExpense = 0;
    appData.expenses
        .filter(e => e.category === cat)
        .forEach(e => totalExpense += Number(e.amount));

    return totalBudget - totalExpense;
}

// 看板与全局渲染逻辑
function renderAll() {
    let grandTotal = 0;
    const cardsContainer = document.getElementById("category-cards");
    if (cardsContainer) {
        cardsContainer.innerHTML = "";
        CATEGORIES.forEach(cat => {
            const balance = calculateCategoryBalance(cat);
            grandTotal += balance;

            // 状态样式计算 (正数 positive / 负数 negative)
            let statusClass = '';
            if (balance > 0) {
                statusClass = 'positive';
            } else if (balance < 0) {
                statusClass = 'negative';
            }

            const rec = appData.recurringBudgets[cat];
            let metaText = "单次注资/零用";
            if (rec) {
                const unitText = rec.unit === 'day' ? '日' : (rec.unit === 'month' ? '月' : '年');
                metaText = `预设: ${rec.amount.toLocaleString()} JPY / ${unitText}`;
                if (rec.startDate && rec.startDate > getTodayString()) {
                    metaText += ` (新规则生效于: ${rec.startDate})`;
                }
            }

            cardsContainer.innerHTML += `
                <div class="card ${statusClass}">
                    <div class="card-header">
                        <span class="card-title">${cat}</span>
                        <span class="card-balance ${statusClass}">${balance.toLocaleString()} JPY</span>
                    </div>
                    <div class="card-meta">${metaText}</div>
                </div>
            `;
        });
    }

    const totalElem = document.getElementById("total-balance");
    if (totalElem) totalElem.innerText = `${grandTotal.toLocaleString()} JPY`;

    renderBudgetSettingsForm();
    renderHistory();
}

function handleAddExpense(e) {
    if (e) e.preventDefault();
    const newExp = {
        id: Date.now(),
        category: document.getElementById("exp-category").value,
        amount: Number(document.getElementById("exp-amount").value),
        date: document.getElementById("exp-date").value,
        note: document.getElementById("exp-note").value
    };
    appData.expenses.unshift(newExp);
    saveData();
    document.getElementById("expense-form").reset();
    document.getElementById("exp-date").value = getTodayString();
    alert("记账成功！");
    switchTab(null, "dashboard");
}

function handleAddSingleBudget(e) {
    if (e) e.preventDefault();
    const newSb = {
        id: Date.now(),
        category: "其他",
        amount: Number(document.getElementById("sb-amount").value),
        tag: document.getElementById("sb-tag").value,
        date: getTodayString()
    };
    appData.singleBudgets.unshift(newSb);
    saveData();
    document.getElementById("single-budget-form").reset();
    renderAll();
}

function deleteSingleBudget(id) {
    appData.singleBudgets = appData.singleBudgets.filter(sb => sb.id !== id);
    saveData();
    renderAll();
}

function deleteExpense(id) {
    appData.expenses = appData.expenses.filter(e => e.id !== id);
    saveData();
    renderAll();
}

// 渲染周期预算配置表单
function renderBudgetSettingsForm() {
    const list = document.getElementById("recurring-settings-list");
    if (list) {
        list.innerHTML = "";
        RECURRING_CATEGORIES.forEach(cat => {
            const rec = appData.recurringBudgets[cat] || { amount: 0, unit: 'day', startDate: getFirstDayOfMonth() };
            const currentUnit = rec.unit || 'day';
            const currentDate = rec.startDate || getFirstDayOfMonth();

            list.innerHTML += `
                <div class="rec-row">
                    <span class="rec-label">${cat}:</span>
                    <input type="number" id="rec-amt-${cat}" class="rec-input" value="${rec.amount}" placeholder="预算金额">
                    <select id="rec-unit-${cat}" class="rec-unit">
                        <option value="day" ${currentUnit === 'day' ? 'selected' : ''}>/ 日</option>
                        <option value="month" ${currentUnit === 'month' ? 'selected' : ''}>/ 月</option>
                        <option value="year" ${currentUnit === 'year' ? 'selected' : ''}>/ 年</option>
                    </select>
                    <input type="date" id="rec-startdate-${cat}" class="rec-date" value="${currentDate}">
                </div>
            `;
        });
    }

    const sbList = document.getElementById("single-budgets-list");
    if (sbList) {
        sbList.innerHTML = "<h3>已生效的[其他]临时/追加预算</h3>";
        appData.singleBudgets.forEach(sb => {
            sbList.innerHTML += `
                <div class="list-item">
                    <div>
                        <div class="list-item-title">[${sb.category}] ${sb.tag}</div>
                        <div class="list-item-sub">${sb.date}</div>
                    </div>
                    <div>
                        <span class="list-item-amount">+${sb.amount.toLocaleString()} JPY</span>
                        <button class="btn-danger" onclick="deleteSingleBudget(${sb.id})">删除</button>
                    </div>
                </div>
            `;
        });
    }
}

// 保存周期预算设置（快照当前历史并设置下一周期生效起点）
function saveRecurringBudgets(e) {
    if (e && e.preventDefault) e.preventDefault();

    RECURRING_CATEGORIES.forEach(cat => {
        const amtInput = document.getElementById(`rec-amt-${cat}`);
        const unitSelect = document.getElementById(`rec-unit-${cat}`);
        const dateInput = document.getElementById(`rec-startdate-${cat}`);

        if (amtInput && unitSelect && dateInput) {
            const newAmt = Number(amtInput.value);
            const newUnit = unitSelect.value;
            const newStartDate = dateInput.value || getFirstDayOfMonth();

            const rec = appData.recurringBudgets[cat] || { amount: 0, unit: 'day', startDate: getFirstDayOfMonth(), baseAmount: 0 };

            // 当金额、周期单位或手动选择的起算日期发生改变时更新
            if (rec.amount !== newAmt || rec.unit !== newUnit || rec.startDate !== newStartDate) {
                rec.amount = newAmt;
                rec.unit = newUnit;
                rec.startDate = newStartDate;
            }
        }
    });

    saveData();
    alert("周期预算与起算日期保存成功！");
    renderAll();
}

function renderHistory() {
    const list = document.getElementById("expense-history-list");
    if (list) {
        list.innerHTML = "";
        appData.expenses.forEach(e => {
            list.innerHTML += `
                <div class="list-item">
                    <div>
                        <div class="list-item-title">[${e.category}] ${e.note || '无备注'}</div>
                        <div class="list-item-sub">${e.date}</div>
                    </div>
                    <div>
                        <span class="list-item-amount" style="color:#dc2626;">-${e.amount.toLocaleString()} JPY</span>
                        <button class="btn-danger" onclick="deleteExpense(${e.id})">删除</button>
                    </div>
                </div>
            `;
        });
    }
}

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `jpy_ledger_backup_${getTodayString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importData() {
    const fileInput = document.getElementById("import-file");
    if (!fileInput || !fileInput.files.length) {
        alert("请先选择要导入的 JSON 备份文件！");
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.recurringBudgets && imported.expenses) {
                appData = imported;
                saveData();
                alert("数据导入成功！");
                renderAll();
            } else {
                alert("文件格式不正确！");
            }
        } catch (err) {
            alert("无法解析该文件，请确认是正确的 JSON 备份文件。");
        }
    };
    reader.readAsText(file);
}

function saveData() {
    localStorage.setItem("jpy_ledger_data", JSON.stringify(appData));
}

function loadData() {
    const local = localStorage.getItem("jpy_ledger_data");
    if (local) {
        try {
            appData = JSON.parse(local);
        } catch (err) {
            console.error("解析本地数据失败", err);
        }
    }
}
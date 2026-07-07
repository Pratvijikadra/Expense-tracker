//button disabled logic start

// GLOBAL FETCH(Double-Click Lock)
const originalFetch = window.fetch;

window.fetch = async function (...args) {
  // check if any button is active
  const activeBtn = document.activeElement;
  let isSubmitBtn = false;
  let originalHtml = "";

  if (activeBtn && (activeBtn.tagName === "BUTTON" || activeBtn.type === "submit")) {
    isSubmitBtn = true;
    originalHtml = activeBtn.innerHTML;

    activeBtn.disabled = true; // freeze! on click

    if (!originalHtml.includes("spinner-border")) {
      activeBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${activeBtn.innerText}`;
    }
  }

  try {
    // continue running real fetch request
    const response = await originalFetch(...args);
    return response;
  } catch (error) {
    throw error;
  } finally {
    // request end (success or fail both )
    if (isSubmitBtn && activeBtn) {
      activeBtn.disabled = false;
      activeBtn.innerHTML = originalHtml;
    }
  }
};

//button disabled logic end

// const API_URL = "http://127.0.0.1:8002/expense";
const API_URL = "/expense";

let categoryChartInstance = null;
let allRawExpenses = []; // Global temporary dump for filtering inside frontend

document.addEventListener("DOMContentLoaded", () => {
  // set icon to all required input field start

  const requiredInputs = document.querySelectorAll("input[required], select[required], textarea[required]");

  requiredInputs.forEach((input) => {
    // Input ko wrap karne ke liye wrapper banayein
    const wrapper = document.createElement("div");
    wrapper.className = "has-validation-icon w-100";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // Font Awesome ka Initial Icon banayein
    const icon = document.createElement("i");
    wrapper.appendChild(icon);

    // SMART VALIDATION LOGIC
    const validateField = () => {
      const hasValue = input.value !== undefined && input.value !== null && input.value.toString().trim() !== "";
      const isValid = input.checkValidity();

      if (hasValue && isValid) {
        icon.className = "fa-solid fa-circle-check text-success";
        return true; // Value mil gayi aur valid hai
      } else {
        icon.className = "fa-solid fa-circle-exclamation text-danger";
        return false; // Abhi bhi khali hai
      }
    };

    let checkAttempts = 0;
    const storagePoller = setInterval(() => {
      const isFilled = validateField();
      checkAttempts++;

      // Agar data mil gaya YA 2 second tak data nahi aaya (unfilled new form), toh check karna band karo
      if (isFilled || checkAttempts > 20) {
        clearInterval(storagePoller);
      }
    }, 100); // Har 100 milliseconds mein check karega

    // Real-time listeners: Jab user khud se type kare ya change kare
    input.addEventListener("input", validateField);
    input.addEventListener("change", validateField);
    input.addEventListener("keyup", validateField);
    input.addEventListener("focus", validateField);
  });
  // set icon to all required input field end

  const pdfFromDate = document.getElementById("pdfFromDate");
  if (pdfFromDate) {
    pdfFromDate.max = new Date().toISOString().split("T")[0];
  }

  const pdfToDate = document.getElementById("pdfToDate");
  if (pdfToDate) {
    pdfToDate.max = new Date().toISOString().split("T")[0];
  }

  const savedName = localStorage.getItem("tracker_username") || "User";

  const navUsername = document.getElementById("navUsername");
  if (navUsername) {
    navUsername.innerText = savedName;
  }

  const welcomeUserEl = document.getElementById("welcomeUsername");
  if (welcomeUserEl) {
    welcomeUserEl.innerText = savedName;
  }

  // Autofill profile modal input field
  const profileInput = document.getElementById("profileName");
  if (profileInput) {
    profileInput.value = savedName;
  }
  // Check elements to run specific logic per page
  if (document.getElementById("expenseTableBody")) {
    loadDashboardData();
  }
  if (document.getElementById("categoryChart")) {
    loadAnalyticsData();
  }

  if (document.getElementById("goalCard")) {
    triggerAutoTransfer();
    loadGoal();
    loadTransactions();
  }

  // Check if redirect contains data for editing
  checkRedirectForEdit();
  const piggyToast = sessionStorage.getItem("piggy_transfer_toast");

  if (piggyToast) {
    showToast(piggyToast, "success");
    sessionStorage.removeItem("piggy_transfer_toast");
  }
});

// ==========================================
// DASHBOARD PAGE LOGIC (WITH AUTO-RECURRING ENGINE)
// ==========================================

let currentMonthLineChart = null;
let yoyLineChartInstance = null;

function loadDashboardData() {
  fetch(`${API_URL}/`)
    .then((res) => res.json())
    .then((data) => {
      allRawExpenses = data;
      const tableBody = document.getElementById("expenseTableBody");
      tableBody.innerHTML = "";

      // 1.obtain Current Month and Year  (e.g., "2026-06")
      const today = new Date();
      const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

      // ==================== 🔥 FRONTEND AUTO-RECURRING ENGINE ====================
      const recurringTemplates = data.filter((e) => e.is_recurring === true && e.expense_date && !e.expense_date.startsWith(currentYearMonth));

      recurringTemplates.forEach((template) => {
        const dayPart = template.expense_date.split("-")[2] || "01";
        const expectedTargetDate = `${currentYearMonth}-${dayPart}`;

        // Check if expected date, category and amount expense added in June already?
        const alreadyExists = data.some((e) => e.category === template.category && e.amount === template.amount && e.expense_date === expectedTargetDate);

        // if no entry in june, then create in real-time and sent to database
        if (!alreadyExists) {
          const autoExpensePayload = {
            amount: template.amount,
            category: template.category,
            payment_mode: template.payment_mode || "UPI",
            description: template.description || "",
            expense_date: expectedTargetDate,
            is_recurring: false,
          };

          // 1.  save silently in database on backend
          fetch(`${API_URL}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(autoExpensePayload),
          }).then((res) => {
            if (res.ok) console.log(`🎯 Successfully Auto-Added: ${template.category}`);
          });

          // 2. add temporary data on array to visible in table without reload.
          data.push(autoExpensePayload);
        }
      });
      // =========================================================================

      //change part

      let overallTotal = 0;
      let currentMonthTotal = 0;

      // ⚙️ if no any expense so show no data available.
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No data available.</td></tr>`;
        document.getElementById("totalSpent").innerText = "₹0.00";
        document.getElementById("dailyAvg").innerText = "₹0.00";
        document.getElementById("monthlyAvg").innerText = "₹0.00";
        document.getElementById("yearlyAvg").innerText = "₹0.00";
      } else {
        const uniqueDates = new Set();
        const uniqueMonths = new Set();
        const uniqueYears = new Set();
        const groupedExpenses = {};

        data.forEach((expense) => {
          overallTotal += expense.amount;
          const dateStr = expense.expense_date;

          if (dateStr) {
            uniqueDates.add(dateStr);
            uniqueMonths.add(dateStr.substring(0, 7));
            uniqueYears.add(dateStr.substring(0, 4));

            const monthKey = dateStr.substring(0, 7);
            if (!groupedExpenses[monthKey]) {
              groupedExpenses[monthKey] = [];
            }
            groupedExpenses[monthKey].push(expense);

            if (monthKey === currentYearMonth) {
              currentMonthTotal += expense.amount;
            }
          }
        });

        const sortedMonthKeys = Object.keys(groupedExpenses).sort().reverse();
        const getMonthName = (yearMonthStr) => {
          const [year, month] = yearMonthStr.split("-");
          const date = new Date(year, parseInt(month) - 1, 1);
          return date.toLocaleString("default", { month: "long", year: "numeric" });
        };

        let globalIndex = 1;
        sortedMonthKeys.forEach((monthKey) => {
          const monthExpenses = groupedExpenses[monthKey];
          const monthName = getMonthName(monthKey);

          const headerRow = document.createElement("tr");
          headerRow.innerHTML = `<td colspan="7" class="bg-light fw-bold text-dark ps-3 py-2 border-bottom border-top">📅 ${monthName} Expenses</td>`;
          tableBody.appendChild(headerRow);

          let monthTotal = 0;

          monthExpenses.forEach((expense) => {
            monthTotal += Number(expense.amount);
            const row = document.createElement("tr");
            row.innerHTML = `
              <td class="ps-4 text-muted small">${globalIndex++}</td>
              <td>${expense.expense_date}</td>
              <td>${expense.category}</td>
              <td>${expense.payment_mode}</td>
              <td class="fw-bold">₹${expense.amount.toFixed(2)}</td>
              <td class="text-truncate" style="max-width: 150px;" title="${expense.description || ""}">
    ${expense.description || "-"}
</td>
              <td class="text-center pe-4">
                  <button class="btn btn-sm btn-outline-primary me-1" onclick="redirectToEdit('${expense.id}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="deleteExpense('${expense.id}')"><i class="fa-solid fa-trash"></i></button>
              </td>`;
            tableBody.appendChild(row);
          });
          const totalRow = document.createElement("tr");
          totalRow.className = "table-primary fw-bold text-dark";
          totalRow.innerHTML = `
    <td colspan="7" class="text-center">Total Expense for ${monthName}: ₹${monthTotal.toFixed(2)}</td> `;
          tableBody.appendChild(totalRow);
        });

        // Average fields set
        const dailyAvg = overallTotal / (uniqueDates.size || 1);
        const monthlyAvg = overallTotal / (uniqueMonths.size || 1);
        const yearlyAvg = overallTotal / (uniqueYears.size || 1);
        document.getElementById("totalSpent").innerText = `₹${overallTotal.toFixed(2)}`;
        document.getElementById("dailyAvg").innerText = `₹${dailyAvg.toFixed(2)}`;
        document.getElementById("monthlyAvg").innerText = `₹${monthlyAvg.toFixed(2)}`;
        document.getElementById("yearlyAvg").innerText = `₹${yearlyAvg.toFixed(2)}`;
      }

      // ==================== BUDGET CODE ====================
      const currentLoggedInUser = localStorage.getItem("tracker_username") || "guest";
      const userBudget = parseFloat(localStorage.getItem(`tracker_budget_${currentLoggedInUser}`)) || 0;

      const budgetTotalTextEl = document.getElementById("budgetTotalText");
      const budgetSpentTextEl = document.getElementById("budgetSpentText");
      const progressBarEl = document.getElementById("budgetProgressBar");
      const alertBadgeEl = document.getElementById("budgetAlertBadge");
      const messageTextEl = document.getElementById("budgetTextMessage");

      if (budgetTotalTextEl) {
        budgetTotalTextEl.innerText = `₹${userBudget.toFixed(2)}`;
        budgetSpentTextEl.innerText = `₹${currentMonthTotal.toFixed(2)}`;

        let percentageUsed = userBudget > 0 ? (currentMonthTotal / userBudget) * 100 : 0;
        let percentageLeft = 100 - percentageUsed;
        let progressWidth = percentageUsed > 100 ? 100 : percentageUsed;

        if (progressBarEl) progressBarEl.style.width = `${progressWidth}%`;

        if (userBudget === 0) {
          if (progressBarEl) progressBarEl.className = "progress-bar bg-secondary";
          if (alertBadgeEl) {
            alertBadgeEl.className = "badge bg-secondary ms-2 py-1 px-2";
            alertBadgeEl.innerText = "⚠️ Not Set";
            alertBadgeEl.classList.remove("d-none");
          }
          if (messageTextEl) messageTextEl.innerHTML = "ℹ️ Your monthly budget is 0. Click <b>Update Profile</b> to set your budget!";
        } else if (percentageLeft <= 0) {
          if (progressBarEl) progressBarEl.className = "progress-bar bg-danger text-dark progress-bar-striped progress-bar-animated";
          if (alertBadgeEl) {
            alertBadgeEl.className = "badge text-dark ms-2 py-1 px-2";
            alertBadgeEl.innerText = "❌ Budget Overspent!";
            alertBadgeEl.classList.remove("d-none");
          }
          if (messageTextEl) messageTextEl.innerHTML = "⚠️ <b>Critical Warning:</b> You have exceeded your monthly budget! Stop extra spending immediately.";
        } else if (percentageUsed >= 90) {
          if (progressBarEl) progressBarEl.className = "progress-bar bg-danger progress-bar-striped progress-bar-animated";
          if (alertBadgeEl) {
            alertBadgeEl.className = "badge text-dark ms-2 py-1 px-2";
            alertBadgeEl.innerText = "🚨 Budget is Low!";
            alertBadgeEl.classList.remove("d-none");
          }
          if (messageTextEl) messageTextEl.innerHTML = `🚨 <b>Your budget is extremely low!</b> Only <b>${percentageLeft.toFixed(1)}%</b> remains for this month!`;
        } else if (percentageUsed >= 70 && percentageUsed < 90) {
          if (progressBarEl) progressBarEl.className = "progress-bar bg-warning text-dark progress-bar-striped progress-bar-animated";
          if (alertBadgeEl) {
            alertBadgeEl.className = "badge  text-dark ms-2 py-1 px-2";
            alertBadgeEl.innerText = "⚠️ Warning!";
            alertBadgeEl.classList.remove("d-none");
          }
          if (messageTextEl) messageTextEl.innerHTML = `⚠️ <b>Warning:</b> You have used <b>${percentageUsed.toFixed(1)}%</b> of your budget!`;
        } else {
          if (progressBarEl) progressBarEl.className = "progress-bar bg-success progress-bar-striped progress-bar-animated";
          if (alertBadgeEl) {
            alertBadgeEl.className = "badge text-dark ms-2 py-1 px-2";
            alertBadgeEl.innerText = "✅ Stable";
            alertBadgeEl.classList.remove("d-none");
          }

          // auto transferd to piggy bank

          if (messageTextEl) messageTextEl.innerHTML = `🎉 Great job! You still have <b>${percentageLeft.toFixed(1)}%</b> budget left.`;
        }
      } else if (budgetTotalTextEl) {
        budgetTotalTextEl.innerText = "Not Configured";
        progressBarEl.style.width = "0%";
        if (alertBadgeEl) alertBadgeEl.classList.add("d-none");
      }

      fetch("/savings/auto-transfer", {
        method: "POST",
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.transferred) {
            showToast(`🎉 ₹${data.amount.toFixed(2)} transferred to Piggy Bank!`, "success");

            if (typeof loadGoal === "function") {
              loadGoal();
            }
          }
        });
    });
}

function redirectToEdit(id, amount, category, mode, date, desc) {
  let editObj;
  // If only ID is passed (e.g. from the dashboard's edit button)
  if (amount === undefined) {
    const expense = allRawExpenses.find((e) => e.id === id);
    if (expense) {
      editObj = {
        id: expense.id,
        amount: expense.amount,
        category: expense.category,
        mode: expense.payment_mode,
        date: expense.expense_date,
        desc: expense.description || "",
        is_recurring: expense.is_recurring || false,
      };
    } else {
      editObj = { id };
    }
  } else {
    // Fallback if details are passed directly
    editObj = { id, amount, category, mode, date, desc, is_recurring: false };
  }
  sessionStorage.setItem("edit_expense", JSON.stringify(editObj));
  window.location.href = "/manage";
}

let deleteExpenseId = null;

function deleteExpense(id) {
  deleteExpenseId = id;

  const modal = new bootstrap.Modal(document.getElementById("deleteModal"));
  modal.show();
}

const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener("click", () => {
    if (!deleteExpenseId) return;

    fetch(`${API_URL}/${deleteExpenseId}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) throw new Error();

        bootstrap.Modal.getInstance(document.getElementById("deleteModal")).hide();

        loadDashboardData();

        showToast("Expense deleted successfully!", "success");

        deleteExpenseId = null;
      })
      .catch(() => {
        showToast("Failed to delete expense!", "danger");
      });
  });
}

// ==========================================
// ADD / EDIT FORM LOGIC
// ==========================================
function checkRedirectForEdit() {
  const form = document.getElementById("expenseForm");
  if (!form) return;

  const savedData = sessionStorage.getItem("edit_expense");
  if (savedData) {
    const item = JSON.parse(savedData);
    document.getElementById("editExpenseId").value = item.id;
    document.getElementById("amount").value = item.amount;
    document.getElementById("category").value = item.category;
    document.getElementById("payment_mode").value = item.mode;
    document.getElementById("expense_date").value = item.date;
    document.getElementById("description").value = item.desc;

    const isRecurringEl = document.getElementById("is_recurring");
    if (isRecurringEl) {
      isRecurringEl.checked = item.is_recurring || false;
    }

    document.getElementById("formHeader").innerHTML = `<i class="fa-solid fa-pen-to-square text-warning me-2"></i>Edit Existing Expense`;
    document.getElementById("submitBtn").innerText = "Update Changes";
    document.getElementById("cancelBtn").innerText = "Cancel";
    document.getElementById("submitBtn").className = "btn btn-warning btn-lg w-100";

    sessionStorage.removeItem("edit_expense"); // clean up cache
  }
}

const expenseDate = document.getElementById("expense_date");

if (expenseDate) {
  const today = new Date().toISOString().split("T")[0];
  expenseDate.max = today;

  // set todays date only in add form
  if (!expenseDate.value) {
    expenseDate.value = today;
  }
}

if (document.getElementById("expenseForm")) {
  document.getElementById("expenseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const editId = document.getElementById("editExpenseId").value;
    const payload = {
      amount: parseFloat(document.getElementById("amount").value),
      category: document.getElementById("category").value,
      payment_mode: document.getElementById("payment_mode").value,
      expense_date: document.getElementById("expense_date").value,
      description: document.getElementById("description").value || null,
      is_recurring: document.getElementById("is_recurring") ? document.getElementById("is_recurring").checked : false,
    };

    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API_URL}/${editId}` : `${API_URL}/`;

    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((res) => {
      if (res.ok) {
        const successMessage = editId ? "Expense updated successfully!" : "Expense added successfully!";
        showToast(successMessage, "success");
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      }
    });
  });
}

// ==========================================
// ANALYTICS & FILTERING LOGIC
// ==========================================

function loadAnalyticsData() {
  fetch(`${API_URL}/`)
    .then((res) => res.json())
    .then((data) => {
      const contentEl = document.getElementById("analyticsContent");
      const placeholderEl = document.getElementById("noExpensesPlaceholder");

      // CRITICAL CONDITION CHECK: if array is empty or no data exists
      if (!data || data.length === 0) {
        // 1.hide Dashboard content
        if (contentEl) contentEl.classList.add("d-none");

        // 2. 'No expenses found'
        if (placeholderEl) placeholderEl.classList.remove("d-none");

        return; // stop chart rendering
      }

      // -------------------------------------------------------------
      // 🟢 if expense availabe
      // -------------------------------------------------------------
      if (contentEl) contentEl.classList.remove("d-none");
      if (placeholderEl) placeholderEl.classList.add("d-none");

      allRawExpenses = data;

      // DYNAMICALLY FILL YEARS DROPDOWNS
      populateYearDropdowns(data);

      buildFilteredChart("ALL");
      buildCurrentMonthLineChart();
      updateLineChart();
    });

  // Fetch summary logic continues exactly as it is below...
  fetch(`${API_URL}/analytics/summary`)
    .then((res) => res.json())
    .then((data) => {
      document.getElementById("prevMonthTotal").innerText = `₹${data.prev_month_total.toFixed(2)}`;
      document.getElementById("thisMonthTotal").innerText = `₹${data.current_month_total.toFixed(2)}`;
      const growthEl = document.getElementById("growthPercentage");
      let displayGrowth = data.percentage_growth;
      let isMaxed = false;
      if (displayGrowth > 100) {
        displayGrowth = 100;
        isMaxed = true;
      }
      if (data.percentage_growth > 0) {
        growthEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up text-danger"></i> ${isMaxed ? "" : "+"}${displayGrowth}%`;
        growthEl.className = "fs-5 fw-bold text-danger m-0";
      } else if (data.percentage_growth < 0) {
        growthEl.innerHTML = `<i class="fa-solid fa-arrow-trend-down text-success"></i> ${data.percentage_growth}%`;
        growthEl.className = "fs-5 fw-bold text-success m-0";
      } else {
        growthEl.innerHTML = `<i class="fa-solid fa-minus text-muted"></i> 0%`;
        growthEl.className = "fs-5 fw-bold text-muted m-0";
      }
    });
}

// New helper function to dynamically render all available tracking years
function populateYearDropdowns(data) {
  const baseSelect = document.getElementById("compareBaseYear");
  const targetSelect = document.getElementById("compareTargetYear");

  if (!baseSelect || !targetSelect) return; // Guard clause in case we are on another page

  // Extracting all unique years across all tracked documents
  const yearsSet = new Set();
  data.forEach((item) => {
    if (item.expense_date) {
      const year = item.expense_date.substring(0, 4);
      yearsSet.add(year);
    }
  });

  // Fallback default current year if database is completely empty
  if (yearsSet.size === 0) {
    yearsSet.add(new Date().getFullYear().toString());
  }

  // Converting set into a sorted array (Descending order latest year first)
  const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

  // Dynamic innerHTML compilation template injection
  let baseOptionsHtml = "";
  let targetOptionsHtml = "";

  sortedYears.forEach((year, index) => {
    baseOptionsHtml += `<option value="${year}">${year}</option>`;
    // Target dropdown presets the secondary item to make comparison instantly visible
    let isSelected = index === 1 || sortedYears.length === 1 ? "selected" : "";
    targetOptionsHtml += `<option value="${year}" ${isSelected}>${year}</option>`;
  });

  // Overwriting HTML components fly-on-the-wall
  baseSelect.innerHTML = baseOptionsHtml;
  targetSelect.innerHTML = targetOptionsHtml;
}

function applyChartFilter() {
  const selectedMode = document.getElementById("filterPaymentMode").value;
  buildFilteredChart(selectedMode);
}

function buildFilteredChart(mode) {
  let filtered = allRawExpenses;
  if (mode !== "ALL") {
    filtered = allRawExpenses.filter((item) => item.payment_mode === mode);
  }

  // Category breakdown calculate in clientside for custom filter support
  const breakdown = {};
  filtered.forEach((item) => {
    breakdown[item.category] = (breakdown[item.category] || 0) + item.amount;
  });

  const ctx = document.getElementById("categoryChart").getContext("2d");
  if (categoryChartInstance) categoryChartInstance.destroy();

  const labels = Object.keys(breakdown);
  const values = Object.values(breakdown);

  const canvas = document.getElementById("categoryChart");
  const noData = document.getElementById("noChartData");

  if (labels.length === 0) {
    if (categoryChartInstance) {
      categoryChartInstance.destroy();
      categoryChartInstance = null;
    }

    canvas.style.display = "none";
    noData.style.display = "block";
    return;
  }

  // Data is available
  canvas.style.display = "block";
  noData.style.display = "none";

  categoryChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: ["#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#4BB8FA", "#A98B76", "#6F8F72"],
        },
      ],
    },
    options: { responsive: true },
  });
}

// maintain Line chart state

// call on load analytics
function initYoYComparison() {
  updateLineChart();
}

function updateLineChart() {
  const baseYear = document.getElementById("compareBaseYear").value; // e.g. 2026
  const targetYear = document.getElementById("compareTargetYear").value; // e.g. 2025
  const selectedMonth = document.getElementById("compareMonth").value; // e.g. "05" (May)

  const basePrefix = `${baseYear}-${selectedMonth}`; // "2026-05"
  const targetPrefix = `${targetYear}-${selectedMonth}`; // "2025-05"

  // 1. Data Filter for both years
  const baseMonthData = allRawExpenses.filter((item) => item.expense_date.startsWith(basePrefix));
  const targetMonthData = allRawExpenses.filter((item) => item.expense_date.startsWith(targetPrefix));

  // 2. Category-wise mapping for years
  const categoriesSet = new Set();
  const baseBreakdown = {};
  const targetBreakdown = {};

  baseMonthData.forEach((item) => {
    categoriesSet.add(item.category);
    baseBreakdown[item.category] = (baseBreakdown[item.category] || 0) + item.amount;
  });

  targetMonthData.forEach((item) => {
    categoriesSet.add(item.category);
    targetBreakdown[item.category] = (targetBreakdown[item.category] || 0) + item.amount;
  });

  //  (Unique categories across both months)
  const chartLabels = Array.from(categoriesSet);
  const baseDatasetValues = chartLabels.map((cat) => baseBreakdown[cat] || 0);
  const targetDatasetValues = chartLabels.map((cat) => targetBreakdown[cat] || 0);

  // 3. Mathematical Insights Calculate
  const baseTotal = baseMonthData.reduce((sum, item) => sum + item.amount, 0);
  const targetTotal = targetMonthData.reduce((sum, item) => sum + item.amount, 0);

  const diff = baseTotal - targetTotal;
  const insightTextEl = document.getElementById("comparisonInsightText");

  if (diff > 0) {
    insightTextEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-danger me-1"></i> In ${baseYear}, you spent <strong>₹${diff.toFixed(2)} MORE</strong> compared to ${targetYear} for the selected month.`;
    insightTextEl.className = "alert alert-danger py-2 small text-start";
  } else if (diff < 0) {
    insightTextEl.innerHTML = `<i class="fa-solid fa-circle-check text-success me-1"></i> In ${baseYear}, you saved <strong>₹${Math.abs(diff).toFixed(2)} MORE</strong> compared to ${targetYear} for the selected month.`;
    insightTextEl.className = "alert alert-success py-2 small text-start";
  } else {
    insightTextEl.innerHTML = `<i class="fa-solid fa-scale-balanced text-muted me-1"></i> Expenses for both periods are identical (₹${baseTotal.toFixed(2)}).`;
    insightTextEl.className = "alert alert-light border py-2 small text-start";
  }

  // 4. Line Chart dynamically Render
  const ctx = document.getElementById("yoyLineChart").getContext("2d");
  if (yoyLineChartInstance) yoyLineChartInstance.destroy();

  yoyLineChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartLabels.length > 0 ? chartLabels : ["No Data"],
      datasets: [
        {
          label: `Year ${baseYear}`,
          data: baseDatasetValues,
          borderColor: "#3b82f6", // Blue Line
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          tension: 0.3,
          fill: true,
        },
        {
          label: `Year ${targetYear}`,
          data: targetDatasetValues,
          borderColor: "#ef4444", // Red Line
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top" },
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Amount (₹)" } },
        x: { title: { display: true, text: "Categories" } },
      },
    },
  });
}

// ==========================================
// USER AUTHENTICATION LOGIC
// ==========================================

// Handle Signup Form
const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const username = document.getElementById("signupUser").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;

    // Email Validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@(gmail|yahoo|outlook|hotmail|icloud)\.(com|net|org)$/i;

    if (!emailRegex.test(email)) {
      showToast("Please enter a valid email", "danger");
      return;
    }

    const payload = {
      username: username,
      email: email,
      password: password,
    };

    fetch("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const data = await res.json();
      if (res.ok) {
        showToast("Account created successfully! Please log in.", "success");

        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else {
        let errorMessage = "Signup failed.";

        if (data && data.detail) {
          if (Array.isArray(data.detail)) {
            // Pydantic validation error array ke andar check karenge
            const firstError = data.detail[0];
            const fieldName = firstError.loc ? firstError.loc[firstError.loc.length - 1] : "";

            if (fieldName === "password") {
              errorMessage = "Password should be at least 6 characters long.";
            } else if (fieldName === "username") {
              errorMessage = "Username should be at least 3 characters long."; // Agar username par bhi lagaya ho
            } else {
              errorMessage = firstError.msg || "Validation error occurred.";
            }
          } else if (typeof data.detail === "string") {
            errorMessage = data.detail;
          }
        }
        showToast(errorMessage, "danger");
      }
    });
  });
}

// Handle Login Form
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      email: document.getElementById("loginEmail").value,
      password: document.getElementById("loginPassword").value,
    };

    fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("tracker_username", data.username);
        localStorage.setItem("tracker_role", data.role);
        showToast("login successfully!", "success");

        // Auto Transfer Check
        fetch("/savings/auto-transfer", {
          method: "POST",
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.transferred) {
              sessionStorage.setItem("piggy_transfer_toast", `🎉 ₹${result.amount.toFixed(2)} automatically transferred to your Piggy Bank!`);
            }

            setTimeout(() => {
              if (data.role === "admin") {
                window.location.href = "/admin";
              } else {
                window.location.href = "/";
              }
            }, 1500);
          });
      } else {
        const alertEl = document.getElementById("loginAlert");
        alertEl.innerText = data.detail || "Invalid credentials.";
        alertEl.classList.remove("d-none");
      }
    });
  });
}

// Global Logout Trigger Helper (Can be bound to a logout icon inside header if needed)
function handleUserLogout() {
  fetch("/auth/logout", { method: "POST" }).then(() => {
    localStorage.removeItem("tracker_username");
    window.location.href = "/login";
  });
}

// Sync logged in user name on navbar initial load
document.addEventListener("DOMContentLoaded", () => {
  const savedName = localStorage.getItem("tracker_username") || "Account";
  const navUserEl = document.getElementById("navUsername");
  if (navUserEl) navUserEl.innerText = savedName;

  const profileInput = document.getElementById("profileName");
  if (profileInput) profileInput.value = savedName;
});

let profileModalBootstrapInstance = null;

// 1. Trigger Modal Window when Clicking 'Update Profile' from user avatar dropdown
function showProfileModal() {
  const modalEl = document.getElementById("profileModal");
  if (!modalEl) return;

  if (!profileModalBootstrapInstance) {
    profileModalBootstrapInstance = new bootstrap.Modal(modalEl);
  }

  // Clear old errors
  document.getElementById("profileAlert").classList.add("d-none");
  document.getElementById("profileErrorAlert").classList.add("d-none");
  document.getElementById("profilePassword").value = "";

  //  1. obtain Current logged in user name for make a key
  const currentLoggedInUser = localStorage.getItem("tracker_username") || "guest";

  // Autofill values from persistent browser storage cache
  document.getElementById("profileName").value = localStorage.getItem("tracker_username") || "";
  const storedEmail = localStorage.getItem(`tracker_email_${currentLoggedInUser}`);
  document.getElementById("profileEmail").value = storedEmail && storedEmail !== "null" ? storedEmail : "";

  const storedBudget = localStorage.getItem(`tracker_budget_${currentLoggedInUser}`);
  document.getElementById("profileBudget").value = storedBudget && storedBudget !== "null" ? storedBudget : "0";

  profileModalBootstrapInstance.show();
  window.dispatchEvent(new Event("storageDataLoaded"));
}

// 2. Submit pipeline wire-up handling all 4 parameters simultaneously
const profileFormSubmitElement = document.getElementById("profileUpdateForm");
if (profileFormSubmitElement) {
  profileFormSubmitElement.addEventListener("submit", (e) => {
    e.preventDefault();

    const usernameVal = document.getElementById("profileName").value.trim();
    const emailVal = document.getElementById("profileEmail").value.trim();
    const budgetVal = parseFloat(document.getElementById("profileBudget").value) || 0;
    const passwordVal = document.getElementById("profilePassword").value.trim();

    const successAlert = document.getElementById("profileAlert");
    const errorAlert = document.getElementById("profileErrorAlert");
    const submitBtn = document.getElementById("saveProfileBtn");

    errorAlert.classList.add("d-none");
    successAlert.classList.add("d-none");

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving context...`;

    const payloadData = {
      username: usernameVal,
      email: emailVal,
      budget: budgetVal,
      password: passwordVal || null,
    };

    const oldUsername = localStorage.getItem("tracker_username") || "guest";

    fetch("/auth/update-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadData),
    })
      .then(async (res) => {
        const serverRes = await res.json();
        if (res.ok) {
          // 2. Cleanup old keys if username is changed
          if (oldUsername !== usernameVal) {
            localStorage.removeItem(`tracker_budget_${oldUsername}`);
          }

          // Sync persistent updates local variables cache
          localStorage.setItem("tracker_username", usernameVal);
          localStorage.setItem("tracker_email", emailVal);

          //  FIX: now unique dynamic key save (`tracker_budget_username`)
          localStorage.setItem(`tracker_budget_${usernameVal}`, budgetVal.toString());

          // Real-time layout dynamic changes shift mapping instantly
          if (document.getElementById("navUsername")) document.getElementById("navUsername").innerText = usernameVal;
          if (document.getElementById("welcomeUsername")) document.getElementById("welcomeUsername").innerText = usernameVal;

          successAlert.innerText = "Settings updated successfully!";
          successAlert.classList.remove("d-none");

          setTimeout(() => {
            profileModalBootstrapInstance.hide();
            if (passwordVal) {
              alert("Password updated! Logging out for security.");
              handleUserLogout();
            } else {
              window.location.reload();
            }
          }, 1500);
        } else {
          throw new Error(serverRes.detail || "Error syncing profiles.");
        }
      })
      .catch((err) => {
        errorAlert.innerText = err.message;
        errorAlert.classList.remove("d-none");
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-check me-2"></i>Save Configurations`;
      });
  });
}

// Global Direct Action Execution Pipeline (Bypasses DOM binding issues)
function executeProfileUpdateWorkflow(event) {
  if (event) event.preventDefault();
  console.log("🎯 Direct onClick Handler Triggered!");

  const usernameInput = document.getElementById("profileName");
  const emailInput = document.getElementById("profileEmail");
  const budgetInput = document.getElementById("profileBudget");
  const passwordInput = document.getElementById("profilePassword");

  const successAlert = document.getElementById("profileAlert");
  const errorAlert = document.getElementById("profileErrorAlert");
  const submitBtn = document.getElementById("saveProfileBtn");

  if (!usernameInput || !emailInput || !budgetInput) {
    alert("Inputs are missing!");
    return;
  }

  const usernameVal = usernameInput.value.trim();
  const emailVal = emailInput.value.trim();
  const budgetVal = parseFloat(budgetInput.value) || 0;
  const passwordVal = passwordInput ? passwordInput.value.trim() : "";

  // Basic client validation
  if (usernameVal.length < 3) {
    errorAlert.innerText = "Username must be at least 3 characters long.";
    errorAlert.classList.remove("d-none");
    return;
  }
  if (!emailVal.includes("@")) {
    errorAlert.innerText = "Please enter a valid email address.";
    errorAlert.classList.remove("d-none");
    return;
  }

  errorAlert.classList.add("d-none");
  successAlert.classList.add("d-none");

  // Loading State
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Syncing Profile...`;

  const payloadData = {
    username: usernameVal,
    email: emailVal,
    budget: budgetVal,
    password: passwordVal || null,
  };

  fetch("/auth/update-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadData),
  })
    .then(async (response) => {
      // 🔥 UPDATE HERE: first check response is ok or not
      if (!response.ok) {
        // if status is 500  (Server Crash)
        throw new Error("Server encountered an issue configuration. Please ensure all inputs are correct.");
      }

      // Json parse if everything is ok
      const serverRes = await response.json();

      const oldLoggedInUser = localStorage.getItem("tracker_username") || "guest";

      localStorage.setItem("tracker_username", usernameVal);

      localStorage.setItem(`tracker_budget_${usernameVal}`, budgetVal.toString());
      localStorage.setItem(`tracker_email_${usernameVal}`, emailVal);
      localStorage.setItem(`tracker_username_${usernameVal}`, usernameVal);

      showToast("Profile updated successfully!", "success");

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    })
    .catch((err) => {
      errorAlert.innerText = err.message;
      errorAlert.classList.remove("d-none");
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-circle-check me-2"></i>Save Configurations`;
    });
}

document.addEventListener("DOMContentLoaded", () => {
  // Check if we are currently looking at the admin dashboard panel template view
  if (document.getElementById("adminUserTableBody")) {
    loadAdminDashboardData();
  }
});

function loadAdminDashboardData() {
  fetch("/admin-api/metrics")
    .then((res) => {
      if (!res.ok) throw new Error("Unauthorized Access");
      return res.json();
    })
    .then((data) => {
      document.getElementById("adminTotalUsers").innerText = data.total_users;
      document.getElementById("adminTotalExpenses").innerText = `₹${data.total_system_expenses.toFixed(2)}`;

      const tbody = document.getElementById("adminUserTableBody");
      tbody.innerHTML = "";

      data.users.forEach((user, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
                    <td class="ps-4 text-muted fw-bold">${index + 1}</td>
                    <td class="fw-semibold text-dark">${user.username} ${user.role === "admin" ? '<span class="badge bg-danger ms-1 small">Admin</span>' : ""}</td>
                    <td>${user.email}</td>
                    <td>₹${parseFloat(user.budget).toFixed(2)}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-danger" ${user.role === "admin" ? "disabled" : ""} onclick="adminDeleteUser('${user.id}')">
                            <i class="fa-solid fa-user-minus me-1"></i>Delete Account
                        </button>
                    </td>
                `;
        tbody.appendChild(row);
      });
    })
    .catch(() => {
      window.location.href = "/login";
    });
}

function adminDeleteUser(userId) {
  if (confirm("Are you absolutely sure you want to completely erase this user account along with all their linked expense sheets?")) {
    fetch(`/admin-api/delete-user/${userId}`, { method: "DELETE" }).then(() => loadAdminDashboardData());
  }
}

function buildCurrentMonthLineChart() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11

  // only current month expenses
  const currentMonthExpenses = allRawExpenses.filter((expense) => {
    const d = new Date(expense.expense_date);

    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });

  // Category wise total
  const categoryTotals = {};

  currentMonthExpenses.forEach((expense) => {
    const category = expense.category || "Other";
    const amount = Number(expense.amount);

    categoryTotals[category] = (categoryTotals[category] || 0) + amount;
  });

  const labels = Object.keys(categoryTotals);
  const values = Object.values(categoryTotals);

  const ctx = document.getElementById("currentMonthLineChart").getContext("2d");

  if (currentMonthLineChart) {
    currentMonthLineChart.destroy();
  }

  currentMonthLineChart = new Chart(ctx, {
    type: "line",

    data: {
      labels: labels,
      datasets: [
        {
          label: "Current Month Expenses (₹)",
          data: values,
          borderColor: "#0d6efd",
          backgroundColor: "rgba(13,110,253,0.15)",
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },

    options: {
      responsive: true,

      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 500,
            autoSkip: false,
          },
        },
      },

      legend: {
        display: true,
      },

      title: {
        display: true,
        text: "Current Month Category-wise Expense Analysis",
      },
    },
  });
}

function showToast(message, type = "success") {
  const toastEl = document.getElementById("liveToast");
  if (!toastEl) return;

  toastEl.classList.remove("text-bg-success", "text-bg-danger");
  toastEl.classList.add(type === "success" ? "text-bg-success" : "text-bg-danger");

  const toastMsgEl = document.getElementById("toastMessage");
  if (toastMsgEl) {
    toastMsgEl.innerText = message;
  }

  const toast = new bootstrap.Toast(toastEl, {
    delay: 2500,
  });

  toast.show();
}

function generateDynamicPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // 1. Get Selected Dates

  const fromDateVal = document.getElementById("pdfFromDate").value;
  const toDateVal = document.getElementById("pdfToDate").value;

  if (!fromDateVal || !toDateVal) {
    alert("Please select both Start Date and End Date!");
    return;
  }

  if (fromDateVal > toDateVal) {
    alert("Start Date cannot be greater than End Date!");
    return;
  }

  // 2. Fetch live data from backend
  fetch("/expense")
    .then((res) => {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    })
    .then((data) => {
      let expenses = Array.isArray(data) ? data : data.expenses || [];

      if (expenses.length === 0) {
        alert("No data available to generate report!");
        return;
      }

      // 3. Filter data strictly between Start Date and End Date
      expenses = expenses.filter((exp) => {
        return exp.expense_date >= fromDateVal && exp.expense_date <= toDateVal;
      });

      if (expenses.length === 0) {
        alert("No expenses found in this date range!");
        return;
      }

      // Sort: Newest to Oldest
      expenses.sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));

      // 4. Fixed Standard Columns
      const headers = [["Date", "Category", "Payment Mode", "Amount (₹)"]];

      let pdfTotalSum = 0;
      const bodyData = expenses.map((exp, index) => {
        const amt = parseFloat(exp.amount) || 0;
        pdfTotalSum += amt;

        return [exp.expense_date || "N/A", exp.category || "N/A", exp.payment_mode || "N/A", `Rs. ${amt.toFixed(2)}`];
      });

      // 5. PDF Header Styling
      const currentLoggedUser = localStorage.getItem("tracker_username") || "User";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(40, 116, 101); // Teal Green theme
      doc.text("EXPENSE TRACKER FINANCIAL REPORT", 14, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated By: ${currentLoggedUser}`, 14, 28);
      doc.text(`Report Period: ${fromDateVal} to ${toDateVal}`, 14, 34);
      doc.text(`Date of Export: ${new Date().toLocaleDateString()}`, 14, 40);

      doc.line(14, 44, 196, 44); // Top border line

      // 6. Render Table
      doc.autoTable({
        startY: 48,
        head: headers,
        body: bodyData,
        theme: "striped",
        headStyles: { fillColor: [40, 116, 101], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 248] },
        margin: { left: 14, right: 14 },
      });

      // 7. Total Summary Card below table
      const finalY = doc.lastAutoTable.finalY + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total Spending in Period: Rs. ${pdfTotalSum.toFixed(2)}`, 14, finalY);

      // 8. Save and Close Modal
      doc.save(`Expense_Report_${fromDateVal}_to_${toDateVal}.pdf`);

      const modalEl = document.getElementById("downloadPdfModal");
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      // Optional Form Reset
      document.getElementById("pdfExportForm").reset();
    })
    .catch((err) => {
      console.error("PDF Export Error:", err);
      alert("Failed to download PDF report. Check console logs.");
    });
}

// 📢 Helper Function: customer alert show inside modal
function showModalAlert(message, type = "danger") {
  const alertEl = document.getElementById("modalAlert");
  if (alertEl) {
    alertEl.innerHTML = message;
    // Bootstrap alert classes
    alertEl.className = `alert alert-${type} py-2 px-3 small mb-3`;
    alertEl.classList.remove("d-none"); // Alert ko screen par dikhayein

    setTimeout(() => {
      alertEl.classList.add("d-none");
    }, 4000);
  }
}

function generateDynamicPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const fromDateVal = document.getElementById("pdfFromDate").value;
  const toDateVal = document.getElementById("pdfToDate").value;

  document.getElementById("modalAlert").classList.add("d-none");

  if (!fromDateVal || !toDateVal) {
    showModalAlert("⚠️ <b>Validation Error:</b> Please select both Start Date and End Date!", "warning");
    return;
  }

  if (fromDateVal > toDateVal) {
    showModalAlert("❌ <b>Date Error:</b> Start Date cannot be further ahead than End Date!", "danger");
    return;
  }

  fetch("/expense")
    .then((res) => {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    })
    .then((data) => {
      let expenses = Array.isArray(data) ? data : data.expenses || [];

      if (expenses.length === 0) {
        showModalAlert("ℹ️ <b>No Data:</b> You don't have any expense entries registered yet.", "info");
        return;
      }

      expenses = expenses.filter((exp) => exp.expense_date >= fromDateVal && exp.expense_date <= toDateVal);

      if (expenses.length === 0) {
        showModalAlert("🔍 <b>Empty Result:</b> No expenses found in this selected date range.", "warning");
        return;
      }

      // --- PDF render ---
      expenses.sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
      const headers = [["Date", "Category", "Description", "Payment Mode", "Amount (₹)"]];
      let pdfTotalSum = 0;
      const bodyData = expenses.map((exp) => {
        const amt = parseFloat(exp.amount) || 0;
        pdfTotalSum += amt;
        return [exp.expense_date || "N/A", exp.category || "N/A", exp.description || "N/A", exp.payment_mode || "N/A", `Rs. ${amt.toFixed(2)}`];
      });

      const currentLoggedUser = localStorage.getItem("tracker_username") || "User";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(40, 116, 101);
      doc.text("EXPENSE TRACKER FINANCIAL REPORT", 14, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated By: ${currentLoggedUser}`, 14, 28);
      doc.text(`Report Period: ${fromDateVal} to ${toDateVal}`, 14, 34);
      doc.text(`Date of Export: ${new Date().toLocaleDateString()}`, 14, 40);
      doc.line(14, 44, 196, 44);

      doc.autoTable({ startY: 48, head: headers, body: bodyData, theme: "striped", headStyles: { fillColor: [40, 116, 101] } });
      const finalY = doc.lastAutoTable.finalY + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total Spending in Period: Rs. ${pdfTotalSum.toFixed(2)}`, 14, finalY);

      doc.save(`Expense_Report_${fromDateVal}_to_${toDateVal}.pdf`);

      // on success modal automatically close
      const modalEl = document.getElementById("downloadPdfModal");
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      document.getElementById("pdfExportForm").reset();
    })
    .catch((err) => {
      console.error("PDF Export Error:", err);
      showModalAlert(" <b>System Failure:</b> Failed to download PDF report. Connection lost.", "danger");
    });
}

const SAVINGS_API = "/savings";
const username = localStorage.getItem("tracker_username");

const goalForm = document.getElementById("goalForm");

if (goalForm) {
  goalForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const payload = {
      username: localStorage.getItem("tracker_username"),
      goal_name: document.getElementById("goal_name").value,
      target_amount: parseFloat(document.getElementById("target_amount").value),
      current_amount: 0,
      target_date: document.getElementById("target_date").value,
    };

    fetch("/savings/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        showToast(data.message, "success");

        goalForm.reset();

        loadGoal();
      });
  });
}

// Auto Transfer: privious month remaining budget auto add on piggy bank
async function triggerAutoTransfer() {
  try {
    const res = await fetch("/savings/auto-transfer", {
      method: "POST",
      credentials: "include", // required for sent Cookie
    });
    const data = await res.json();

    if (data.transferred === true && data.amount > 0) {
      const amount = data.amount ? `₹${parseFloat(data.amount).toFixed(2)}` : "";
      showToast(`Auto Savings! ${amount} added to piggy bank successfully!`, "success");
      // refresh goal card for set new goal data
      loadGoal();
      loadTransactions();
    }
  } catch (err) {
    console.error("Auto-transfer check failed:", err);
  }
}

//  goal data store on  global for pre-fill in edit modal
let currentGoalData = null;

// Load Goal
function loadGoal() {
  const username = localStorage.getItem("tracker_username");

  fetch(`/savings/${username}`)
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((goal) => {
      currentGoalData = goal; // Global mein save karo
      const extra = goal.current_amount - goal.target_amount;
      const remaining = goal.target_amount - goal.current_amount;

      document.getElementById("goalCard").style.display = "block";
      document.getElementById("goalFormContainer").style.display = "none";
      document.getElementById("goalTitle").innerText = goal.goal_name;
      document.getElementById("savedAmount").innerText = goal.current_amount;
      document.getElementById("targetAmount").innerText = goal.target_amount;

      const percent = (goal.current_amount / goal.target_amount) * 100;
      document.getElementById("goalProgress").style.width = percent + "%";
      document.getElementById("goalProgress").innerText = percent.toFixed(1) + "%";
      document.getElementById("remainingAmount").innerText = remaining > 0 ? `${remaining.toFixed(2)}` : "0.00";
      document.getElementById("goalStartedOn").innerText = goal.created_at.split("T")[0];
      document.getElementById("goalTargetDate").innerText = goal.target_date;
      document.getElementById("goalSavedAmount").innerText = "₹" + goal.current_amount.toFixed(2) || "₹0.00";
      document.getElementById("extraSavedAmount").innerText = extra > 0 ? `₹${extra.toFixed(2)}` : "₹0.00";

      // Goal Completed Check
      if (goal.current_amount >= goal.target_amount) {
        document.getElementById("goalCard").classList.add("border-success");

        document.getElementById("goalProgress").classList.remove("bg-primary");
        document.getElementById("goalProgress").classList.add("bg-success");

        document.getElementById("goalCompletedBox").classList.remove("d-none");

        // New goal form show
        // document.getElementById("goalFormContainer").style.display = "block";
      } else {
        document.getElementById("goalCard").classList.remove("border-success");

        document.getElementById("goalProgress").classList.remove("bg-success");
        document.getElementById("goalProgress").classList.add("bg-primary");

        document.getElementById("goalCompletedBox").classList.add("d-none");
      }
    })
    .catch(() => {});
}
// open deposite button modal
const depositBtn = document.getElementById("depositBtn");

if (depositBtn) {
  depositBtn.addEventListener("click", () => {
    new bootstrap.Modal(document.getElementById("depositModal")).show();
  });
}

// Withdraw button

const withdrawBtn = document.getElementById("withdrawBtn");

if (withdrawBtn) {
  withdrawBtn.addEventListener("click", () => {
    new bootstrap.Modal(document.getElementById("withdrawModal")).show();
  });
}

// deposite confirm
const confirmDeposit = document.getElementById("confirmDeposit");

if (confirmDeposit) {
  confirmDeposit.addEventListener("click", () => {
    const amount = parseFloat(document.getElementById("depositAmount").value);

    if (!amount || amount <= 0) {
      showToast("Enter valid amount.", "danger");

      return;
    }

    fetch(`/savings/deposit/${localStorage.getItem("tracker_username")}`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        amount,
      }),
    })
      .then((r) => r.json())

      .then((data) => {
        showToast(data.message, "success");

        bootstrap.Modal.getInstance(document.getElementById("depositModal")).hide();

        document.getElementById("depositAmount").value = "";

        loadGoal();
        loadTransactions();
      });
  });
}

// #withdrawl confirm
const confirmWithdraw = document.getElementById("confirmWithdraw");

if (confirmWithdraw) {
  confirmWithdraw.addEventListener("click", () => {
    const amount = parseFloat(document.getElementById("withdrawAmount").value);

    if (!amount || amount <= 0) {
      showToast("Enter valid amount.", "danger");

      return;
    }

    fetch(`/savings/withdraw/${localStorage.getItem("tracker_username")}`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        amount,
      }),
    }).then(async (r) => {
      const data = await r.json();

      if (!r.ok) {
        showToast(data.detail, "danger");

        return;
      }

      showToast(data.message, "success");

      bootstrap.Modal.getInstance(document.getElementById("withdrawModal")).hide();

      document.getElementById("withdrawAmount").value = "";

      loadGoal();
      loadTransactions();
    });
  });
}

// delete and edit goal

let editGoalUsername = "";

// open edit goal modal —  pre-fill data using stored goal
function openEditGoalModal() {
  if (!currentGoalData) {
    showToast("Something went wrong!", "danger");
    return;
  }

  editGoalUsername = currentGoalData.username || localStorage.getItem("tracker_username");

  // Pre-fill all fields from stored goal data
  document.getElementById("editGoalName").value = currentGoalData.goal_name || "";
  document.getElementById("editTargetAmount").value = currentGoalData.target_amount || 0;
  document.getElementById("editTargetDate").value = currentGoalData.target_date || "";

  new bootstrap.Modal(document.getElementById("editGoalModal")).show();
}

// update goal —
function updateGoal() {
  const payload = {
    goal_name: document.getElementById("editGoalName").value,
    target_amount: Number(document.getElementById("editTargetAmount").value),
    target_date: document.getElementById("editTargetDate").value,
  };

  fetch(`/savings/${editGoalUsername}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  }).then(async (res) => {
    const data = await res.json();

    if (res.ok) {
      bootstrap.Modal.getInstance(document.getElementById("editGoalModal")).hide();
      showToast("Goal updated successfully!", "success");
      loadGoal(); // Reload without full page refresh
    } else {
      showToast(data.detail || "Update failed.", "danger");
    }
  });
}

// delete goal

let deleteGoalUsername = "";

function confirmDeleteGoal() {
  if (!currentGoalData) {
    showToast("Something went wrong!", "danger");
    return;
  }
  deleteGoalUsername = currentGoalData.username || localStorage.getItem("tracker_username");

  new bootstrap.Modal(document.getElementById("deleteGoalModal")).show();
}

function deleteGoal() {
  fetch(`/savings/${deleteGoalUsername}`, {
    method: "DELETE",
    credentials: "include",
  }).then(async (res) => {
    const data = await res.json();

    if (res.ok) {
      bootstrap.Modal.getInstance(document.getElementById("deleteGoalModal")).hide();

      showToast("Goal deleted successfully!", "success");

      setTimeout(() => {
        window.location.href = "/saving-page";
      }, 1200);
    } else {
      showToast(data.detail || "Delete failed.", "danger");
    }
  });
}

function openNewGoalModal() {
  new bootstrap.Modal(document.getElementById("newGoalModal")).show();
}

const confirmNewGoalBtn = document.getElementById("confirmNewGoalBtn");

if (confirmNewGoalBtn) {
  confirmNewGoalBtn.addEventListener("click", () => {
    createNewGoal();
  });
}

function createNewGoal() {
  bootstrap.Modal.getInstance(document.getElementById("newGoalModal")).hide();

  const username = localStorage.getItem("tracker_username");

  fetch(`/savings/${username}`, {
    method: "DELETE",
  }).then(async (res) => {
    const data = await res.json();

    if (res.ok) {
      showToast("Previous goal removed and archived successfully.", "success");

      document.getElementById("goalCard").style.display = "none";

      document.getElementById("goalFormContainer").style.display = "block";
    } else {
      showToast(data.detail, "danger");
    }
  });
}

// save goal transactin history withdrawl and deposite
function loadTransactions() {
  const username = localStorage.getItem("tracker_username");

  fetch(`/savings/transactions/${username}`)
    .then((res) => res.json())
    .then((data) => {
      const body = document.getElementById("transactionTableBody");

      body.innerHTML = "";
      let sign = "";
      let color = "";

      data.forEach((t) => {
        if (t.type === "Deposit") {
          sign = "+";
          color = "text-success";
        } else if (t.type === "Withdraw") {
          sign = "-";
          color = "text-danger";
        } else if (t.type === "Auto Transfer") {
          sign = "+";
          color = "text-primary";
        }
        body.innerHTML += `
            <tr>

                   <td>${t.date}</td>

    <td class="${color}">
        ${t.type}
    </td>

    <td class="${color}">
        ${sign} ₹${t.amount}
    </td>

            </tr>`;
      });
    });
}

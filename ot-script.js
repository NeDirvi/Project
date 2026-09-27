// ==================== ЛОГИКА ВКЛАДКИ "ОХРАНА ТРУДА" ====================
(function() {
    var ot_currentUserRole = "user";
    var ot_isAdminMode = false;
    var ot_questionBank = [];
    var ot_currentExamQuestions = [];
    var ot_userAnswers = {};
    var ot_currentUser = null;
    var ot_examResults = [];
    var ot_testQuestions = [];
    var ot_testUserAnswers = {};
    var ot_passRate = 70;
    var ot_nextEmployeeId = parseInt(localStorage.getItem("ot_nextEmployeeId") || "1");
    var ot_fontSize = 16;

    var ot_systemUsers = [
        { login:"superadmin", password:"super123", role:"superadmin" },
        { login:"admin", password:"163163", role:"admin" }
    ];

    var ot_instructions = [
        { id:1, category:"general", title:"Основные правила охраны труда", content:"Соблюдайте технику безопасности. Используйте СИЗ. Проходите медосмотры." },
        { id:2, category:"first_aid", title:"Первая помощь", content:"При кровотечении: жгут выше раны. При ожоге: охлаждение водой." }
    ];

    var ot_categoriesMap = { general:"Организация охраны труда", first_aid:"Первая помощь", electric:"Электробезопасность", fire:"Пожарная безопасность", height:"Работа на высоте", work:"Безопасность работ", all:"Общие" };

    // ---------- Утилиты ----------
    function ot_capitalizeFirst(str) { if (!str) return ""; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); }
    function ot_escapeHtml(s) { if (!s) return ""; return s.replace(/[&<>]/g, function(m) { if (m==="&") return "&amp;"; if (m==="<") return "&lt;"; if (m===">") return "&gt;"; return m; }); }
    function ot_showNotification(msg) { var d = document.createElement("div"); d.className = "ot-notification"; d.innerText = msg; document.body.appendChild(d); setTimeout(function() { d.remove(); }, 3000); }

    function ot_saveToLocal() {
        localStorage.setItem("ot_bank", JSON.stringify(ot_questionBank));
        localStorage.setItem("ot_exam", JSON.stringify(ot_currentExamQuestions));
        localStorage.setItem("ot_results", JSON.stringify(ot_examResults));
        localStorage.setItem("ot_passRate", ot_passRate);
        localStorage.setItem("ot_instructions", JSON.stringify(ot_instructions));
        localStorage.setItem("ot_systemUsers", JSON.stringify(ot_systemUsers));
        localStorage.setItem("ot_nextEmployeeId", ot_nextEmployeeId);
    }

    window.otCloseImageViewer = function() { document.getElementById("ot-imageViewer").style.display = "none"; };
    window.otTogglePasswordVisibility = function(fieldId) { var f = document.getElementById(fieldId); if (f) { f.type = f.type === "password" ? "text" : "password"; } };

    // ---------- Вопросы по умолчанию ----------
    function ot_getDefaultQuestions() {
        var q = [];
        var titles = { general:"организации охраны труда", first_aid:"первой помощи", electric:"электробезопасности", fire:"пожарной безопасности", height:"работе на высоте", work:"безопасности работ" };
        var cats = ["general","first_aid","electric","fire","height","work"];
        for (var ci = 0; ci < cats.length; ci++) {
            var cat = cats[ci];
            for (var i = 1; i <= 5; i++) {
                q.push({ id: Date.now() + Math.random() * i + ci * 100, category: cat, type: "single", text: "Вопрос " + i + " по " + titles[cat], explanation: "См. инструкцию", image: "", answers: [ { text:"Да, верно", isCorrect:true }, { text:"Нет, неверно", isCorrect:false } ] });
            }
        }
        return q;
    }

    // ---------- Экзамен ----------
    function ot_generateRandomExam() {
        if (!ot_questionBank.length) ot_questionBank = ot_getDefaultQuestions();
        var shuffled = ot_questionBank.slice();
        for (var i = shuffled.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t; }
        ot_currentExamQuestions = shuffled.slice(0, Math.min(20, shuffled.length));
        ot_userAnswers = {};
        ot_saveToLocal();
    }

    function ot_renderExam() {
        var container = document.getElementById("ot-examContainer");
        if (!container) return;
        if (!ot_currentExamQuestions.length) { container.innerHTML = "<div>Нет вопросов</div>"; return; }
        var html = "";
        for (var idx = 0; idx < ot_currentExamQuestions.length; idx++) {
            var q = ot_currentExamQuestions[idx];
            var opts = "";
            var mw = (q.type === "multiple") ? "<div class='ot-multiple-warning'>Вопрос с множественным выбором</div>" : "";
            for (var a = 0; a < q.answers.length; a++) {
                var inputType = q.type === "multiple" ? "checkbox" : "radio";
                opts += "<label><input type='" + inputType + "' name='otq" + idx + "' value='" + ot_escapeHtml(q.answers[a].text) + "'> " + ot_escapeHtml(q.answers[a].text) + "</label>";
            }
            html += "<div class='ot-exam-question'><b>" + (idx+1) + ". " + ot_categoriesMap[q.category] + " - " + ot_escapeHtml(q.text) + "</b>" + mw + "<div class='ot-options'>" + opts + "</div></div>";
        }
        container.innerHTML = html;

        for (var i = 0; i < ot_currentExamQuestions.length; i++) {
            var inputs = document.querySelectorAll("input[name='otq" + i + "']");
            for (var inp = 0; inp < inputs.length; inp++) {
                inputs[inp].addEventListener("change", (function(idx) {
                    return function() {
                        var q = ot_currentExamQuestions[idx];
                        if (q.type === "multiple") {
                            var checked = [];
                            var chkd = document.querySelectorAll("input[name='otq" + idx + "']:checked");
                            for (var ci = 0; ci < chkd.length; ci++) checked.push(chkd[ci].value);
                            ot_userAnswers[idx] = checked;
                        } else {
                            var sel = document.querySelector("input[name='otq" + idx + "']:checked");
                            ot_userAnswers[idx] = sel ? sel.value : "";
                        }
                        ot_updateExamStats();
                    };
                })(i));
            }
        }
        ot_updateExamStats();
    }

    function ot_updateExamStats() {
        var total = ot_currentExamQuestions.length, answered = 0;
        for (var i = 0; i < total; i++) {
            var a = ot_userAnswers[i];
            if (a !== undefined && a !== null && ((a instanceof Array) ? a.length > 0 : a !== "")) answered++;
        }
        var p = total ? Math.round(answered / total * 100) : 0;
        var el1 = document.getElementById("ot-answeredCount"); if (el1) el1.innerText = answered;
        var el2 = document.getElementById("ot-totalExamQuestions"); if (el2) el2.innerText = total;
        var el3 = document.getElementById("ot-progressPercent"); if (el3) el3.innerText = p;
        var el4 = document.getElementById("ot-examProgressBar"); if (el4) el4.style.width = p + "%";
    }

    function ot_checkUnanswered() {
        var un = [];
        for (var i = 0; i < ot_currentExamQuestions.length; i++) {
            var a = ot_userAnswers[i];
            var ok = (a !== undefined && a !== null && ((a instanceof Array) ? a.length > 0 : a !== ""));
            if (!ok) un.push(i);
        }
        if (un.length > 0) { alert("Вы пропустили " + un.length + " вопросов!"); return false; }
        return true;
    }

    function ot_showExamResult() {
        var correct = 0, details = [];
        for (var i = 0; i < ot_currentExamQuestions.length; i++) {
            var q = ot_currentExamQuestions[i]; var ua = ot_userAnswers[i]; var ca = [];
            for (var ai = 0; ai < q.answers.length; ai++) if (q.answers[ai].isCorrect) ca.push(q.answers[ai].text);
            var ok = false;
            if (q.type === "multiple") {
                var u = (ua instanceof Array) ? ua.slice().sort() : [];
                var c = ca.slice().sort();
                ok = (u.length === c.length);
                if (ok) for (var ui = 0; ui < u.length; ui++) if (u[ui] !== c[ui]) { ok = false; break; }
            } else { ok = (ua && ca.indexOf(ua) !== -1); }
            if (ok) correct++;
            details.push({ questionText: q.text, userAnswer: (ua instanceof Array) ? ua.join(", ") : (ua || "(нет)"), correctAnswer: ca.join(", "), isCorrect: ok, explanation: q.explanation || "" });
        }
        var p = Math.round(correct / ot_currentExamQuestions.length * 100);

        if (ot_currentUser) {
            ot_examResults.push({
                employeeId: ot_nextEmployeeId++, surname: ot_currentUser.surname, name: ot_currentUser.name,
                patronymic: ot_currentUser.patronymic || "", branch: ot_currentUser.branch || "",
                region: ot_currentUser.region || "", position: ot_currentUser.position,
                date: new Date().toLocaleString(), percent: p, correct: correct, total: ot_currentExamQuestions.length,
                passed: p >= ot_passRate, answersDetails: details
            });
            ot_saveToLocal();
        }

        var btn = document.getElementById("ot-submitExamBtn"); if (btn) btn.style.display = "none";
        var rh = "<h3>Результат экзамена</h3>";
        rh += "<div class='ot-result-percent'>" + p + "%</div>";
        rh += "<p>Правильно: " + correct + " из " + ot_currentExamQuestions.length + "</p>";
        rh += "<p>" + (p >= ot_passRate ? "ЭКЗАМЕН СДАН!" : "ЭКЗАМЕН НЕ СДАН") + "</p><hr><h4>Разбор:</h4>";
        for (var idx = 0; idx < details.length; idx++) {
            var item = details[idx];
            rh += "<div style='margin:15px 0;padding:15px;background:#f8fafc;border-radius:16px;border-left:4px solid " + (item.isCorrect ? "#16a34a" : "#dc2626") + ";'><b>" + (idx+1) + ". " + ot_escapeHtml(item.questionText) + "</b>";
            rh += "<div>Ваш ответ: " + ot_escapeHtml(item.userAnswer) + "</div>";
            rh += "<div>Правильный: " + ot_escapeHtml(item.correctAnswer) + "</div>";
            rh += "<div>" + (item.isCorrect ? "Верно" : "Неверно") + "</div></div>";
        }
        var resultDiv = document.getElementById("ot-examResult");
        if (resultDiv) { resultDiv.innerHTML = rh; resultDiv.style.display = "block"; }
    }

    // ---------- ТЕСТ (Обучение) ----------
    function ot_renderTest() {
        var container = document.getElementById("ot-testContainer");
        if (!container) return;
        if (!ot_testQuestions.length) { container.innerHTML = "<div>Нет вопросов</div>"; return; }
        var html = "";
        for (var idx = 0; idx < ot_testQuestions.length; idx++) {
            var q = ot_testQuestions[idx];
            var opts = "";
            var mw = (q.type === "multiple") ? "<div class='ot-multiple-warning'>Вопрос с множественным выбором</div>" : "";
            for (var a = 0; a < q.answers.length; a++) {
                var inputType = q.type === "multiple" ? "checkbox" : "radio";
                opts += "<label><input type='" + inputType + "' name='ott" + idx + "' value='" + ot_escapeHtml(q.answers[a].text) + "'> " + ot_escapeHtml(q.answers[a].text) + "</label>";
            }
            html += "<div class='ot-exam-question'><b>" + (idx+1) + ". " + ot_categoriesMap[q.category] + " - " + ot_escapeHtml(q.text) + "</b>" + mw + "<div class='ot-options'>" + opts + "</div></div>";
        }
        container.innerHTML = html;

        for (var i = 0; i < ot_testQuestions.length; i++) {
            var inputs = document.querySelectorAll("input[name='ott" + i + "']");
            for (var inp = 0; inp < inputs.length; inp++) {
                inputs[inp].addEventListener("change", (function(idx) {
                    return function() {
                        var q = ot_testQuestions[idx];
                        if (q.type === "multiple") {
                            var checked = [];
                            var chkd = document.querySelectorAll("input[name='ott" + idx + "']:checked");
                            for (var ci = 0; ci < chkd.length; ci++) checked.push(chkd[ci].value);
                            ot_testUserAnswers[idx] = checked;
                        } else {
                            var sel = document.querySelector("input[name='ott" + idx + "']:checked");
                            ot_testUserAnswers[idx] = sel ? sel.value : "";
                        }
                        ot_updateTestStats();
                    };
                })(i));
            }
        }
        ot_updateTestStats();
    }

    function ot_updateTestStats() {
        var total = ot_testQuestions.length, answered = 0;
        for (var i = 0; i < total; i++) {
            var a = ot_testUserAnswers[i];
            if (a !== undefined && a !== null && ((a instanceof Array) ? a.length > 0 : a !== "")) answered++;
        }
        var p = total ? Math.round(answered / total * 100) : 0;
        var el1 = document.getElementById("ot-testAnsweredCount"); if (el1) el1.innerText = answered;
        var el2 = document.getElementById("ot-testTotalCount"); if (el2) el2.innerText = total;
        var el3 = document.getElementById("ot-testProgressPercent"); if (el3) el3.innerText = p;
        var el4 = document.getElementById("ot-testProgressBar"); if (el4) el4.style.width = p + "%";
    }

    function ot_showTestResult() {
        var correct = 0, details = [];
        for (var i = 0; i < ot_testQuestions.length; i++) {
            var q = ot_testQuestions[i]; var ua = ot_testUserAnswers[i]; var ca = [];
            for (var ai = 0; ai < q.answers.length; ai++) if (q.answers[ai].isCorrect) ca.push(q.answers[ai].text);
            var ok = false;
            if (q.type === "multiple") {
                var u = (ua instanceof Array) ? ua.slice().sort() : [];
                var c = ca.slice().sort();
                ok = (u.length === c.length);
                if (ok) for (var ui = 0; ui < u.length; ui++) if (u[ui] !== c[ui]) { ok = false; break; }
            } else { ok = (ua && ca.indexOf(ua) !== -1); }
            if (ok) correct++;
            details.push({
                questionText: q.text,
                userAnswer: (ua instanceof Array) ? (ua.join(", ") || "(нет)") : (ua || "(нет)"),
                correctAnswer: ca.join(", "),
                isCorrect: ok,
                explanation: q.explanation || ""
            });
        }
        var p = Math.round(correct / ot_testQuestions.length * 100);
        var wrong = ot_testQuestions.length - correct;

        var rh = "<h3>Результат теста</h3>";
        rh += "<div class='ot-result-percent'>" + p + "%</div>";
        rh += "<p>Правильно: " + correct + " из " + ot_testQuestions.length + " &nbsp;·&nbsp; Ошибок: " + wrong + "</p>";

        rh += "<hr><h4>Разбор всех ответов:</h4>";
        for (var idx = 0; idx < details.length; idx++) {
            var item = details[idx];
            var color = item.isCorrect ? "#16a34a" : "#dc2626";
            var icon = item.isCorrect ? "✅" : "❌";
            rh += "<div style='margin:15px 0;padding:15px;background:#f8fafc;border-radius:16px;border-left:4px solid " + color + ";'>";
            rh += "<b>" + (idx+1) + ". " + ot_escapeHtml(item.questionText) + "</b>";
            rh += "<div><b>Ваш ответ:</b> " + ot_escapeHtml(item.userAnswer) + " " + icon + "</div>";
            rh += "<div><b>Правильный ответ:</b> " + ot_escapeHtml(item.correctAnswer) + "</div>";
            if (item.explanation) {
                rh += "<div style='margin-top:8px;background:#e0e7ff;padding:8px;border-radius:12px;'>📘 " + ot_escapeHtml(item.explanation) + "</div>";
            }
            rh += "</div>";
        }

        var resultDiv = document.getElementById("ot-testResult");
        if (resultDiv) { resultDiv.innerHTML = rh; resultDiv.style.display = "block"; }
        var subBtn = document.getElementById("ot-submitTestBtn"); if (subBtn) subBtn.style.display = "none";
        var refBtn = document.getElementById("ot-refreshTestBtn"); if (refBtn) refBtn.style.display = "inline-flex";
    }

    // ---------- Админка ----------
    function ot_renderAdminUI() {
        var container = document.getElementById("ot-questionsListAdmin");
        if (container) {
            var countEl = document.getElementById("ot-totalBankCount");
            if (countEl) countEl.innerHTML = ot_questionBank.length;
            var html = "";
            for (var idx = 0; idx < ot_questionBank.length; idx++) {
                var q = ot_questionBank[idx];
                html += "<div class='ot-question-item'><b>" + ot_categoriesMap[q.category] + " - " + ot_escapeHtml(q.text) + "</b><ul>";
                for (var a = 0; a < q.answers.length; a++) {
                    html += "<li>" + ot_escapeHtml(q.answers[a].text) + (q.answers[a].isCorrect ? " ✅" : "") + "</li>";
                }
                html += "</ul></div>";
            }
            container.innerHTML = html || "<div>Вопросов нет</div>";
        }
        ot_renderInstructionsAdmin();
    }

    function ot_renderSystemUsers() {
        var container = document.getElementById("ot-systemUsersContainer");
        if (!container) return;
        var html = "<table class='employee-table'><thead><tr><th>Логин</th><th>Роль</th></tr></thead><tbody>";
        for (var i = 0; i < ot_systemUsers.length; i++) {
            var u = ot_systemUsers[i];
            html += "<tr><td>" + ot_escapeHtml(u.login) + "</td><td>" +
                (u.role === "superadmin" ? "Супер-админ" : (u.role === "admin" ? "Руководитель" : "Специалист")) + "</td></tr>";
        }
        html += "</tbody></table>";
        container.innerHTML = html;
    }

    function ot_renderInstructionsAdmin() {
        var container = document.getElementById("ot-instructionsAdminList");
        if (!container) return;
        var html = "<h4>Существующие инструкции</h4>";
        if (!ot_instructions.length) {
            html += "<p>Нет инструкций</p>";
        } else {
            for (var i = 0; i < ot_instructions.length; i++) {
                var inst = ot_instructions[i];
                html += "<div style='border:1px solid #ddd;border-radius:16px;padding:12px;margin-bottom:12px;'>";
                html += "<b>" + ot_escapeHtml(inst.title) + "</b> <span style='background:#fef3c7;padding:2px 8px;border-radius:20px;font-size:12px;'>" + ot_categoriesMap[inst.category] + "</span>";
                html += "<div style='font-size:13px;color:#666;margin-top:6px;'>" + ot_escapeHtml(inst.content) + "</div>";
                html += "</div>";
            }
        }
        container.innerHTML = html;
    }

    // ---------- Инициализация ----------
    function ot_init() {
        // Начать экзамен
        var startExamBtn = document.getElementById("ot-startExamBtn");
        if (startExamBtn) startExamBtn.onclick = function() {
            var s = ot_capitalizeFirst((document.getElementById("ot-userSurname")||{}).value || "");
            var n = ot_capitalizeFirst((document.getElementById("ot-userName")||{}).value || "");
            var p = ot_capitalizeFirst((document.getElementById("ot-userPatronymic")||{}).value || "");
            var branch = (document.getElementById("ot-userBranch")||{}).value || "";
            var region = (document.getElementById("ot-userRegion")||{}).value || "";
            var pos = (document.getElementById("ot-userPosition")||{}).value || "";
            if (!s || !n || !pos) { alert("Заполните Фамилию, Имя и Должность"); return; }
            ot_currentUser = { surname:s, name:n, patronymic:p, branch:branch, region:region, position:pos };
            document.getElementById("ot-displayFullName").innerHTML = s + " " + n + " " + p;
            document.getElementById("ot-displayPosition").innerHTML = pos;
            document.getElementById("ot-displayBranchRegion").innerHTML = (branch ? "Филиал: " + branch : "") + (region ? " | Район: " + region : "");
            document.getElementById("ot-loginForm").style.display = "none";
            document.getElementById("ot-examArea").style.display = "block";
            var savedExam = localStorage.getItem("ot_exam");
            if (savedExam && JSON.parse(savedExam).length > 0) {
                ot_currentExamQuestions = JSON.parse(savedExam);
                ot_userAnswers = {};
            } else {
                ot_generateRandomExam();
            }
            ot_renderExam();
        };

        // Выйти
        var logoutBtn = document.getElementById("ot-logoutBtn");
        if (logoutBtn) logoutBtn.onclick = function() {
            ot_currentUser = null;
            ot_userAnswers = {};
            document.getElementById("ot-loginForm").style.display = "block";
            document.getElementById("ot-examArea").style.display = "none";
            document.getElementById("ot-examResult").style.display = "none";
            document.getElementById("ot-submitExamBtn").style.display = "inline-flex";
            document.getElementById("ot-examContainer").innerHTML = "";
        };

        // Завершить экзамен
        var submitExamBtn = document.getElementById("ot-submitExamBtn");
        if (submitExamBtn) submitExamBtn.onclick = function() {
            if (!ot_checkUnanswered()) return;
            ot_showExamResult();
        };

        // Вкладки Экзамен/Тест
        var modeTabs = document.querySelectorAll(".ot-mode-tab");
        for (var mt = 0; mt < modeTabs.length; mt++) {
            modeTabs[mt].onclick = function() {
                var mode = this.dataset.mode;
                for (var i = 0; i < modeTabs.length; i++) modeTabs[i].classList.remove("active");
                this.classList.add("active");
                document.getElementById("ot-examMode").style.display = mode === "exam" ? "block" : "none";
                document.getElementById("ot-testMode").style.display = mode === "test" ? "block" : "none";
            };
        }

        // Админ-панель
        var showAdminBtn = document.getElementById("showAdminBtn");
        if (showAdminBtn) showAdminBtn.onclick = function() {
            document.getElementById("ot-passwordScreen").style.display = "flex";
            document.getElementById("ot-adminLoginInput").value = "";
            document.getElementById("ot-adminPasswordInput").value = "";
        };
        var backBtn = document.getElementById("ot-backToUserBtn");
        if (backBtn) backBtn.onclick = function() {
            document.getElementById("ot-passwordScreen").style.display = "none";
        };
        var submitPwd = document.getElementById("ot-submitAdminPassword");
        if (submitPwd) submitPwd.onclick = function() {
            var l = document.getElementById("ot-adminLoginInput").value.toLowerCase();
            var p = document.getElementById("ot-adminPasswordInput").value;
            var user = null;
            for (var i = 0; i < ot_systemUsers.length; i++) {
                if (ot_systemUsers[i].login.toLowerCase() === l && ot_systemUsers[i].password === p) { user = ot_systemUsers[i]; break; }
            }
            if (user) {
                ot_currentUserRole = user.role;
                ot_isAdminMode = true;
                document.getElementById("ot-passwordScreen").style.display = "none";
                document.getElementById("ot-userPanel").style.display = "none";
                document.getElementById("ot-adminPanel").style.display = "block";
                document.getElementById("ot-userRoleDisplay").innerHTML = user.role === "superadmin" ? "Супер-админ" : "Руководитель";
                ot_renderAdminUI();
                ot_showNotification("Вход выполнен: " + user.login);
            } else {
                alert("Неверный логин или пароль");
            }
        };
        var exitAdminBtn = document.getElementById("ot-exitAdminBtn");
        if (exitAdminBtn) exitAdminBtn.onclick = function() {
            ot_isAdminMode = false;
            ot_currentUserRole = "user";
            document.getElementById("ot-adminPanel").style.display = "none";
            document.getElementById("ot-userPanel").style.display = "block";
        };

        // Кнопки шрифта и инструкций
        var fontPlus = document.getElementById("fontPlusBtn");
        if (fontPlus) fontPlus.onclick = function() {
            if (ot_fontSize < 24) { ot_fontSize += 2; document.body.style.fontSize = ot_fontSize + "px"; document.getElementById("fontSizeDisplay").innerText = ot_fontSize + "px"; }
        };
        var fontMinus = document.getElementById("fontMinusBtn");
        if (fontMinus) fontMinus.onclick = function() {
            if (ot_fontSize > 12) { ot_fontSize -= 2; document.body.style.fontSize = ot_fontSize + "px"; document.getElementById("fontSizeDisplay").innerText = ot_fontSize + "px"; }
        };

        var showInstBtn = document.getElementById("showInstructionsBtn");
        if (showInstBtn) showInstBtn.onclick = function() {
            var container = document.getElementById("ot-instructionsList");
            if (container) {
                var html = "";
                for (var i = 0; i < ot_instructions.length; i++) {
                    var inst = ot_instructions[i];
                    html += "<div style='border:1px solid #ddd;border-radius:16px;padding:12px;margin-bottom:12px;'><b>" + ot_escapeHtml(inst.title) + "</b><div style='color:#666;margin-top:6px;'>" + ot_escapeHtml(inst.content) + "</div></div>";
                }
                container.innerHTML = html || "<p>Инструкций нет</p>";
            }
            document.getElementById("ot-instructionsModal").style.display = "flex";
        };
        var closeInstBtn = document.getElementById("ot-closeInstructionsModalBtn");
        if (closeInstBtn) closeInstBtn.onclick = function() {
            document.getElementById("ot-instructionsModal").style.display = "none";
        };

        // ТЕСТ
        var startTestBtn = document.getElementById("ot-startTestBtn");
        if (startTestBtn) startTestBtn.onclick = function() {
            var cat = document.getElementById("ot-testCategorySelect").value;
            var count = parseInt(document.getElementById("ot-testCountSelect").value) || 10;
            var filtered = [];
            for (var qi = 0; qi < ot_questionBank.length; qi++) {
                if (cat === "all" || ot_questionBank[qi].category === cat) filtered.push(ot_questionBank[qi]);
            }
            if (!filtered.length) { alert("Нет вопросов в этой категории"); return; }
            var shuffled = filtered.slice();
            for (var i = shuffled.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
            }
            ot_testQuestions = shuffled.slice(0, Math.min(count, filtered.length));
            ot_testUserAnswers = {};
            document.getElementById("ot-testArea").style.display = "block";
            document.getElementById("ot-testResult").style.display = "none";
            document.getElementById("ot-submitTestBtn").style.display = "inline-flex";
            document.getElementById("ot-refreshTestBtn").style.display = "inline-flex";
            ot_renderTest();
        };
        var submitTestBtn = document.getElementById("ot-submitTestBtn");
        if (submitTestBtn) submitTestBtn.onclick = ot_showTestResult;
        var refreshTestBtn = document.getElementById("ot-refreshTestBtn");
        if (refreshTestBtn) refreshTestBtn.onclick = function() {
            var shuffled = ot_testQuestions.slice();
            for (var i = shuffled.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
            }
            ot_testQuestions = shuffled;
            ot_testUserAnswers = {};
            ot_renderTest();
            document.getElementById("ot-testResult").style.display = "none";
            document.getElementById("ot-submitTestBtn").style.display = "inline-flex";
            ot_showNotification("Вопросы обновлены");
        };

        // АККОРДЕОНЫ
        var ot_headers = document.querySelectorAll("#ohrana-truda-tab .ot-collapsible-header");
        for (var h = 0; h < ot_headers.length; h++) {
            ot_headers[h].onclick = function(e) {
                e.stopPropagation();
                var content = this.nextElementSibling;
                var arrow = this.querySelector("span:last-child");
                if (!content) return;
                if (content.style.display === "block") {
                    content.style.display = "none";
                    if (arrow) arrow.innerText = "▼";
                } else {
                    content.style.display = "block";
                    if (arrow) arrow.innerText = "▲";
                }
            };
        }

        // ПОЛЗУНОК
        var slider = document.getElementById("ot-passRateSlider");
        if (slider) {
            slider.oninput = function(e) {
                ot_passRate = parseInt(e.target.value);
                document.getElementById("ot-passRateValue").innerText = ot_passRate + "%";
                localStorage.setItem("ot_passRate", ot_passRate);
            };
        }

        // КАТЕГОРИИ
        function ot_updateCategoryTotal() {
            var g = parseInt((document.getElementById("ot-catGeneral")||{}).value) || 0;
            var f = parseInt((document.getElementById("ot-catFirstAid")||{}).value) || 0;
            var e = parseInt((document.getElementById("ot-catElectric")||{}).value) || 0;
            var fi = parseInt((document.getElementById("ot-catFire")||{}).value) || 0;
            var hh = parseInt((document.getElementById("ot-catHeight")||{}).value) || 0;
            var w = parseInt((document.getElementById("ot-catWork")||{}).value) || 0;
            var total = g + f + e + fi + hh + w;
            var el = document.getElementById("ot-categoryTotal");
            if (el) el.innerText = "Сумма: " + total;
        }
        ["ot-catGeneral","ot-catFirstAid","ot-catElectric","ot-catFire","ot-catHeight","ot-catWork"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener("input", ot_updateCategoryTotal);
        });
        ot_updateCategoryTotal();

        var randBtn = document.getElementById("ot-randomCategoriesBtn");
        if (randBtn) randBtn.onclick = function() {
            var nums = []; var sum = 0;
            for (var i = 0; i < 5; i++) { nums.push(Math.floor(Math.random() * 6) + 1); sum += nums[i]; }
            var last = 20 - sum;
            if (last < 1) { nums.push(1); } else { nums.push(last); }
            document.getElementById("ot-catGeneral").value = nums[0];
            document.getElementById("ot-catFirstAid").value = nums[1];
            document.getElementById("ot-catElectric").value = nums[2];
            document.getElementById("ot-catFire").value = nums[3];
            document.getElementById("ot-catHeight").value = nums[4];
            document.getElementById("ot-catWork").value = nums[5];
            ot_updateCategoryTotal();
            ot_showNotification("Случайные числа применены");
        };

        var applyBtn = document.getElementById("ot-applyCategoryConfigBtn");
        if (applyBtn) applyBtn.onclick = function() {
            var g = parseInt(document.getElementById("ot-catGeneral").value) || 0;
            var f = parseInt(document.getElementById("ot-catFirstAid").value) || 0;
            var e = parseInt(document.getElementById("ot-catElectric").value) || 0;
            var fi = parseInt(document.getElementById("ot-catFire").value) || 0;
            var hh = parseInt(document.getElementById("ot-catHeight").value) || 0;
            var w = parseInt(document.getElementById("ot-catWork").value) || 0;
            var byCat = { general:[], first_aid:[], electric:[], fire:[], height:[], work:[] };
            for (var qi = 0; qi < ot_questionBank.length; qi++) {
                var q = ot_questionBank[qi];
                if (byCat[q.category]) byCat[q.category].push(q);
            }
            function getRand(arr, n) {
                var s = arr.slice();
                for (var i = s.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var t = s[i]; s[i] = s[j]; s[j] = t;
                }
                return s.slice(0, Math.min(n, s.length));
            }
            var sel = [];
            sel = sel.concat(getRand(byCat.general, g));
            sel = sel.concat(getRand(byCat.first_aid, f));
            sel = sel.concat(getRand(byCat.electric, e));
            sel = sel.concat(getRand(byCat.fire, fi));
            sel = sel.concat(getRand(byCat.height, hh));
            sel = sel.concat(getRand(byCat.work, w));
            if (sel.length === 0) { alert("Нет вопросов в выбранных категориях"); return; }
            ot_currentExamQuestions = sel;
            ot_userAnswers = {};
            localStorage.setItem("ot_exam", JSON.stringify(ot_currentExamQuestions));
            ot_saveToLocal();
            ot_showNotification("Экзамен сформирован: " + sel.length + " вопросов");
        };

        // ПОИСК
        var searchInput = document.getElementById("ot-searchQuestionsInput");
        if (searchInput) searchInput.oninput = function() {
            var val = this.value.toLowerCase();
            var container = document.getElementById("ot-questionsListAdmin");
            if (!container) return;
            var html = "";
            for (var idx = 0; idx < ot_questionBank.length; idx++) {
                var q = ot_questionBank[idx];
                if (q.text.toLowerCase().indexOf(val) === -1) continue;
                html += "<div class='ot-question-item'><b>" + ot_categoriesMap[q.category] + " - " + ot_escapeHtml(q.text) + "</b><ul>";
                for (var a = 0; a < q.answers.length; a++) {
                    html += "<li>" + ot_escapeHtml(q.answers[a].text) + (q.answers[a].isCorrect ? " ✅" : "") + "</li>";
                }
                html += "</ul></div>";
            }
            container.innerHTML = html || "<div>Ничего не найдено</div>";
        };

        // ПОЛЬЗОВАТЕЛИ / СОТРУДНИКИ
        var showSysBtn = document.getElementById("ot-showSystemUsersBtn");
        if (showSysBtn) showSysBtn.onclick = function() { ot_renderSystemUsers(); };
        var showEmpBtn = document.getElementById("ot-showEmployeesDataBtn");
        if (showEmpBtn) showEmpBtn.onclick = function() {
            document.getElementById("ot-employeesDataContainer").style.display = "block";
            document.getElementById("ot-systemUsersContainer").innerHTML = "";
        };

        // ПОИСК СОТРУДНИКОВ
        var searchEmp = document.getElementById("ot-searchEmployeeInput");
        if (searchEmp) searchEmp.oninput = function() { ot_showNotification("Поиск: " + this.value); };

        // ИНСТРУКЦИИ (админка)
        var adminSearch = document.getElementById("ot-adminInstructionsSearch");
        if (adminSearch) adminSearch.oninput = function() { ot_renderInstructionsAdmin(); };

        var addInstBtn = document.getElementById("ot-addInstructionBtn");
        if (addInstBtn) addInstBtn.onclick = function() {
            var title = document.getElementById("ot-instructionTitle").value.trim();
            var content = document.getElementById("ot-instructionContent").value.trim();
            var cat = document.getElementById("ot-instructionCategorySelect").value;
            if (!title || !content) { alert("Заполните заголовок и текст"); return; }
            var newId = 1;
            for (var i = 0; i < ot_instructions.length; i++) if (ot_instructions[i].id >= newId) newId = ot_instructions[i].id + 1;
            ot_instructions.push({ id: newId, category: cat, title: title, content: content });
            ot_saveToLocal();
            document.getElementById("ot-instructionTitle").value = "";
            document.getElementById("ot-instructionContent").value = "";
            ot_renderInstructionsAdmin();
            ot_showNotification("Инструкция добавлена");
        };

        // Загрузка данных
        var bank = localStorage.getItem("ot_bank");
        ot_questionBank = bank && JSON.parse(bank).length ? JSON.parse(bank) : ot_getDefaultQuestions();
        var res = localStorage.getItem("ot_results");
        if (res) ot_examResults = JSON.parse(res);
        var pr = localStorage.getItem("ot_passRate");
        if (pr) ot_passRate = parseInt(pr);
        var inst = localStorage.getItem("ot_instructions");
        if (inst) ot_instructions = JSON.parse(inst);

        ot_generateRandomExam();
        ot_renderInstructionsAdmin();
        console.log("OT script loaded OK");
    }

    // ---- ЗАПУСК ----
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ot_init);
    } else {
        ot_init();
    }
})();
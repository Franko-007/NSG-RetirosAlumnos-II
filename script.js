/**
LBSNG - Sistema de Control de Retiros Escolares
Version 2.1.0 - Nuestra Señora de Guadalupe
Liceo Bicentenario Nuestra Señora de Guadalupe
*/
// ============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ============================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwBfentrgc_VCIdNuCgYPpFJGGxL-Z01ovt-FBL9HCDvdnwppPzQMPUnXNL9pqaOqx8/exec";
let students = [];
let history = [];
let isPaused = false;
let lastDataHash = "";
let historyExpanded = false;
let withdrawnExpanded = true;
let lastNotificationCheck = 0;
let syncInterval = null;
let notificationInterval = null;
let currentUser = null; // Usuario actual
let monthlyChart = null; // Gráfico mensual

// Configuración
const CONFIG = {
    syncIntervalTime: 5000, // 5 segundos
    notificationCheckTime: 10000, // 10 segundos
    maxTimeWarning: 30, // 30 minutos
    autoSaveDelay: 500 // 0.5 segundos
};

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎒 LBSNG Control de Retiros v2.1.0 iniciando...');
    initTheme();
    initDateTime();
    initUser(); // Inicializar usuario
    initEventListeners();
    initServiceWorker();
    requestNotificationPermission();

    // Carga inicial
    sync();
    updateRanking();

    // Iniciar sincronización periódica
    syncInterval = setInterval(sync, CONFIG.syncIntervalTime);
    notificationInterval = setInterval(checkNotifications, CONFIG.notificationCheckTime);

    // Actualizar ranking cada 5 minutos
    setInterval(updateRanking, 300000);

    console.log('✅ Sistema iniciado correctamente');
});

// ============================================
// SERVICE WORKER
// ============================================
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado:', reg))
            .catch(err => console.error('Error registrando Service Worker:', err));
    }
}

// ============================================
// TEMA OSCURO / CLARO
// ============================================
function initTheme() {
    const savedTheme = localStorage.getItem('lbsng-theme') || 'dark';
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        document.querySelector('.sun-icon').style.display = 'none';
        document.querySelector('.moon-icon').style.display = 'block';
    } else {
        document.body.classList.remove('light-theme');
        document.querySelector('.sun-icon').style.display = 'block';
        document.querySelector('.moon-icon').style.display = 'none';
    }
    localStorage.setItem('lbsng-theme', theme);
    
    // Actualizar gráfico con nuevo tema
    if (monthlyChart) {
        setTimeout(() => updateMonthlyChart(), 300);
    }
}

// ============================================
// GESTIÓN DE USUARIO
// ============================================
let availableUsers = []; // Lista de usuarios desde Sheets

async function initUser() {
    // Cargar usuarios desde Sheets
    await loadUsersFromSheets();
    
    const savedUser = localStorage.getItem('lbsng-user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            // Verificar si el usuario aún existe en Sheets
            const userExists = availableUsers.some(u => u.nombre === currentUser.name);
            if (userExists) {
                updateUserDisplay();
            } else {
                // El usuario fue eliminado, pedir identificación nuevamente
                localStorage.removeItem('lbsng-user');
                showUserModal();
            }
        } catch (e) {
            console.error('Error al cargar usuario:', e);
            showUserModal();
        }
    } else {
        showUserModal();
    }
}

async function loadUsersFromSheets() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getUsuarios`);
        const data = await response.json();
        if (Array.isArray(data)) {
            availableUsers = data;
            populateUserSelect();
        }
    } catch (e) {
        console.error('Error al cargar usuarios:', e);
        availableUsers = [];
    }
}

function populateUserSelect() {
    const select = document.getElementById('userSelectInput');
    if (!select) return;
    
    // Limpiar opciones excepto la primera
    select.innerHTML = '<option value="">-- Seleccionar usuario existente --</option>';
    
    // Agregar usuarios
    availableUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = JSON.stringify(user);
        option.textContent = `${user.nombre} - ${user.cargo}`;
        select.appendChild(option);
    });
}

function showUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.classList.remove('hidden');
        loadUsersFromSheets(); // Recargar usuarios al abrir modal
    }
}

function hideUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function saveUser() {
    const selectInput = document.getElementById('userSelectInput');
    const nameInput = document.getElementById('userNameInput');
    const roleInput = document.getElementById('userRoleInput');
    
    // Verificar si seleccionó un usuario existente
    if (selectInput.value) {
        try {
            const selectedUser = JSON.parse(selectInput.value);
            currentUser = { 
                name: selectedUser.nombre, 
                role: selectedUser.cargo 
            };
            localStorage.setItem('lbsng-user', JSON.stringify(currentUser));
            updateUserDisplay();
            hideUserModal();
            showToast(`Bienvenido/a ${currentUser.name}`, 'success');
            return;
        } catch (e) {
            console.error('Error al seleccionar usuario:', e);
        }
    }
    
    // Si no seleccionó, verificar si está registrando uno nuevo
    const name = nameInput.value.trim();
    const role = roleInput.value;

    if (!name || name.length < 3) {
        showToast('Por favor ingresa un nombre válido (mínimo 3 caracteres)', 'error');
        return;
    }

    if (!role) {
        showToast('Por favor selecciona tu cargo', 'error');
        return;
    }

    // Guardar en Sheets
    showLoading(true);
    try {
        const fd = new FormData();
        fd.append('action', 'saveUser');
        fd.append('nombre', name);
        fd.append('cargo', role);
        
        await fetch(SCRIPT_URL, { method: 'POST', body: fd });

        currentUser = { name, role };
        localStorage.setItem('lbsng-user', JSON.stringify(currentUser));
        updateUserDisplay();
        hideUserModal();
        showToast(`Usuario ${name} registrado exitosamente`, 'success');
        
        // Recargar lista de usuarios
        await loadUsersFromSheets();
        
    } catch (e) {
        console.error('Error al guardar usuario:', e);
        showToast('Error al registrar usuario', 'error');
    } finally {
        showLoading(false);
    }
}

function updateUserDisplay() {
    const userBadge = document.getElementById('userBadge');
    const userName = document.getElementById('userName');
    if (currentUser && userBadge && userName) {
        userName.textContent = currentUser.name;
        userBadge.classList.remove('hidden');
    }
}

function changeUser() {
    showUserModal();
}

// ============================================
// FECHA Y HORA
// ============================================
function initDateTime() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
}

function updateDateTime() {
    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-CL', dateOptions);
    const timeStr = now.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const dateElement = document.getElementById('currentDate');
    const timeElement = document.getElementById('currentTime');
    if (dateElement) dateElement.textContent = dateStr;
    if (timeElement) timeElement.textContent = timeStr;
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light-theme');
            applyTheme(isLight ? 'dark' : 'light');
        });
    }
    
    const btnUser = document.getElementById('btnUser');
    if (btnUser) btnUser.addEventListener('click', changeUser);

    const btnSaveUser = document.getElementById('btnSaveUser');
    if (btnSaveUser) btnSaveUser.addEventListener('click', saveUser);

    // Listener para selector de usuarios
    const userSelectInput = document.getElementById('userSelectInput');
    if (userSelectInput) {
        userSelectInput.addEventListener('change', function() {
            if (this.value) {
                // Si seleccionó un usuario, limpiar campos de nuevo usuario
                document.getElementById('userNameInput').value = '';
                document.getElementById('userRoleInput').value = '';
            }
        });
    }

    // Listeners para inputs de nuevo usuario
    const userNameInput = document.getElementById('userNameInput');
    const userRoleInput = document.getElementById('userRoleInput');
    if (userNameInput) {
        userNameInput.addEventListener('input', function() {
            if (this.value.trim()) {
                // Si está escribiendo, limpiar selector
                const selectInput = document.getElementById('userSelectInput');
                if (selectInput) selectInput.value = '';
            }
        });
    }
    if (userRoleInput) {
        userRoleInput.addEventListener('change', function() {
            if (this.value) {
                // Si seleccionó cargo, limpiar selector
                const selectInput = document.getElementById('userSelectInput');
                if (selectInput) selectInput.value = '';
            }
        });
    }

    const addForm = document.getElementById('addForm');
    if (addForm) addForm.addEventListener('submit', handleSubmit);

    const toggleWithdrawn = document.getElementById('toggleWithdrawn');
    if (toggleWithdrawn) {
        toggleWithdrawn.addEventListener('click', function() {
            withdrawnExpanded = !withdrawnExpanded;
            const grid = document.getElementById('withdrawnToday');
            if (grid) grid.classList.toggle('collapsed', !withdrawnExpanded);
            this.classList.toggle('active', withdrawnExpanded);
            this.querySelector('span').textContent = withdrawnExpanded ? 'Ocultar' : 'Mostrar';
        });
    }

    const toggleHistory = document.getElementById('toggleHistory');
    if (toggleHistory) {
        toggleHistory.addEventListener('click', function() {
            historyExpanded = !historyExpanded;
            const list = document.getElementById('historyList');
            if (list) list.classList.toggle('expanded', historyExpanded);
            this.classList.toggle('active', historyExpanded);
            this.querySelector('span').textContent = historyExpanded ? 'Ocultar historial' : 'Ver historial';
        });
    }

    // Validaciones en tiempo real
    const nameInput = document.getElementById('nameInput');
    const courseInput = document.getElementById('courseInput');
    const reasonInput = document.getElementById('reasonInput');

    if (nameInput) nameInput.addEventListener('input', () => validateField(nameInput, 'name'));
    if (courseInput) courseInput.addEventListener('change', () => validateField(courseInput, 'course'));
    if (reasonInput) reasonInput.addEventListener('change', () => validateField(reasonInput, 'reason'));
}

/**
 * VALIDACIÓN DE CAMPOS
 */
function validateField(input, type) {
    const wrapper = input.closest('.input-wrapper');
    const errorSpan = wrapper ? wrapper.querySelector('.input-error') : null;
    let isValid = true;
    let message = "";

    if (type === 'name') {
        if (input.value.trim().length < 3) {
            isValid = false;
            message = "El nombre debe tener al menos 3 caracteres";
        }
    } else if (!input.value) {
        isValid = false;
        message = "Este campo es obligatorio";
    }

    if (wrapper) {
        if (!isValid) {
            wrapper.classList.add('error');
            if (errorSpan) errorSpan.textContent = message;
        } else {
            wrapper.classList.remove('error');
            if (errorSpan) errorSpan.textContent = "";
        }
    }
    return isValid;
}

function validateForm() {
    const nameInput = document.getElementById('nameInput');
    const courseInput = document.getElementById('courseInput');
    const reasonInput = document.getElementById('reasonInput');
    const isNameValid = validateField(nameInput, 'name');
    const isCourseValid = validateField(courseInput, 'course');
    const isReasonValid = validateField(reasonInput, 'reason');

    return isNameValid && isCourseValid && isReasonValid;
}

/**
 * ENVÍO DE DATOS (POST)
 */
async function handleSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showToast('Debes identificarte antes de registrar un retiro', 'error');
        showUserModal();
        return;
    }
    
    if (!validateForm()) {
        showToast('Por favor, corrige los errores en el formulario', 'error');
        return;
    }
    
    const name = document.getElementById('nameInput').value.trim();
    const course = document.getElementById('courseInput').value;
    const reason = document.getElementById('reasonInput').value;
    
    showLoading(true);
    
    try {
        const timestamp = Date.now().toString();
        const params = new URLSearchParams();
        params.append('action', 'add');
        params.append('name', name);
        params.append('course', course);
        params.append('reason', reason);
        params.append('status', 'ESPERA');
        params.append('timestamp', timestamp);
        params.append('responsable', currentUser.name);

        // Enviar datos al servidor
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        // Simular éxito por no-cors
        showToast(`Retiro de ${name} registrado correctamente`, 'success');
        playSound('sound-add');
        e.target.reset();

        // Sincronización local inmediata para UX
        const newStudent = {
            id: "",
            name,
            course,
            reason,
            status: 'ESPERA',
            stateKey: 'ESPERA',
            timestamp,
            exitTime: "",
            responsable: currentUser.name
        };
        
        students.unshift(newStudent);
        render();
        updateKPIs();

        // Sincronización real con el servidor
        setTimeout(sync, 2000);
        
    } catch (error) {
        console.error('Error al registrar retiro:', error);
        showToast('Error al conectar con el servidor', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * SINCRONIZACIÓN DE DATOS (GET)
 */
async function sync() {
    if (isPaused || !navigator.onLine) return;
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=read`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
            const dataString = JSON.stringify(data);
            const currentHash = generateHash(dataString);

            if (currentHash !== lastDataHash) {
                lastDataHash = currentHash;

                // Mapear datos y separar Activos de Historial
                const allData = data.map(item => ({
                    ...item,
                    stateKey: item.status || 'ESPERA'
                }));

                students = allData.filter(s => !s.exitTime || s.exitTime.trim() === "");
                history = allData.filter(s => s.exitTime && s.exitTime.trim() !== "");

                render();
                updateKPIs();
                updateTimeline();
                updateWithdrawnToday();
            }
        }
    } catch (error) {
        console.error('Error en sincronización:', error);
    }
}

function generateHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convertir a 32bit integer
    }
    return hash.toString();
}

/**
 * NOTIFICACIONES Y ALERTAS
 */
async function checkNotifications() {
    if (isPaused || !navigator.onLine) return;
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=checkNotifications&lastCheck=${lastNotificationCheck}`);
        const data = await response.json();
        
        if (data && data.hasNew) {
            data.notifications.forEach(notif => {
                showToast(`Nuevo retiro: ${notif.name} (${notif.course})`, 'info');
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("Nuevo Retiro LBSNG", {
                        body: `${notif.name} - ${notif.course}`,
                        icon: "https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png"
                    });
                }
            });
            lastNotificationCheck = Date.now();
            sync();
        }
    } catch (e) {
        // Silencioso para no molestar en consola cada 10s
    }
}

/**
 * RENDERIZADO DE LA LISTA DE ESTUDIANTES (ACTIVOS)
 */
function render() {
    const list = document.getElementById('studentList');
    const template = document.getElementById('itemTemplate');
    
    if (!list || !template) return;
    
    document.getElementById('activeBadge').textContent = students.length;
    list.innerHTML = '';
    
    // Ordenar por tiempo (más recientes arriba)
    students.sort((a, b) => b.timestamp - a.timestamp).forEach(student => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.card');
        const state = (student.stateKey || 'ESPERA').toUpperCase();
        
        // Asignar datos a la tarjeta
        clone.querySelector('.card-name').textContent = student.name;
        clone.querySelector('.card-details').textContent = `${student.course} • ${student.reason}`;
        clone.querySelector('.responsable-name').textContent = student.responsable || 'Sistema';

        const timeBadge = clone.querySelector('.time-badge');
        const minutes = Math.floor((Date.now() - parseInt(student.timestamp)) / 60000);
        timeBadge.textContent = `${minutes} min`;

        // Alerta visual si pasa de 30 minutos
        if (minutes >= CONFIG.maxTimeWarning && state !== 'AVISADO') {
            card.classList.add('time-warning');
        }

        // Configurar botón de estado con los colores correctos
        const stateBtn = clone.querySelector('.state-btn');
        stateBtn.textContent = state;
        stateBtn.className = `state-btn status-${state.toLowerCase().replace(" ", "-")}`;
        stateBtn.onclick = () => cycleState(student);

        // Configurar botones de acción
        clone.querySelector('.btn-done').onclick = () => finishRetiro(student);
        clone.querySelector('.btn-delete').onclick = () => deleteStudent(student);
        clone.querySelector('.btn-whatsapp').onclick = () => notifyWhatsApp(student);

        list.appendChild(clone);
    });
    
    renderHistory();
    updateStatusCounts();
}

/**
 * CICLO DE ESTADOS (ESPERA -> EN BUSCA -> AVISADO)
 */
async function cycleState(student) {
    if (!currentUser) { showUserModal(); return; }
    
    const states = ['ESPERA', 'EN BUSCA', 'AVISADO'];
    let currentIndex = states.indexOf(student.stateKey);
    const nextState = states[(currentIndex + 1) % 3];
    
    showLoading(true);
    
    try {
        const fd = new FormData();
        fd.append('action', 'updateState');
        fd.append('timestamp', student.timestamp);
        fd.append('newState', nextState);
        fd.append('responsable', currentUser.name);
        
        await fetch(SCRIPT_URL, { method: 'POST', body: fd });

        // Actualización optimista local
        student.stateKey = nextState;
        student.status = nextState;
        if (nextState === 'AVISADO') student.responsable = currentUser.name;

        render();
        playSound('sound-status');
        
    } catch (e) {
        showToast('Error al actualizar estado', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * FINALIZAR RETIRO
 */
async function finishRetiro(student) {
    if (!confirm(`¿Confirmar salida definitiva de ${student.name}?`)) return;
    
    showLoading(true);
    
    try {
        const exitTime = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        const fd = new FormData();
        fd.append('action', 'finish');
        fd.append('timestamp', student.timestamp);
        fd.append('exitTime', exitTime);
        fd.append('responsable', currentUser.name);
        
        await fetch(SCRIPT_URL, { method: 'POST', body: fd });

        showToast('Retiro finalizado', 'success');
        playSound('sound-finish');
        await sync();
        
    } catch (e) {
        showToast('Error al finalizar', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * ELIMINAR ESTUDIANTE
 */
async function deleteStudent(student) {
    if (!confirm(`¿Eliminar registro de ${student.name}?`)) return;
    
    showLoading(true);
    
    try {
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('timestamp', student.timestamp);
        
        await fetch(SCRIPT_URL, { method: 'POST', body: fd });
        
        showToast('Registro eliminado', 'success');
        await sync();
        
    } catch (e) {
        showToast('Error al eliminar', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * NOTIFICAR POR WHATSAPP
 */
function notifyWhatsApp(student) {
    const message = `Estimado/a apoderado/a, le informamos que ${student.name} de ${student.course} está en proceso de retiro por motivo: ${student.reason}. Favor acercarse al establecimiento.`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

/**
 * HISTORIAL Y RANKING
 */
function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    
    list.innerHTML = history.slice(0, 30).map(s => `
        <div class="history-item">
            <div class="history-info">
                <strong>${s.name}</strong>
                <span>${s.course} • Salida: ${s.exitTime}</span>
            </div>
            <div class="history-meta">Gestión: ${s.responsable || 'Sistema'}</div>
        </div>
    `).join('');
}

async function updateRanking() {
    try {
        const res = await fetch(`${SCRIPT_URL}?action=getRanking`);
        const data = await res.json();
        const display = document.getElementById("topAlumnoDisplay");
        
        if (!display || !data.rankingCompleto) return;
        
        const maxVal = data.rankingCompleto.length > 0 ? data.rankingCompleto[0][1] : 1;
        let html = '<div class="ranking-list">';
        
        data.rankingCompleto.slice(0, 8).forEach(item => {
            const porc = (item[1] / maxVal) * 100;
            html += `
                <div class="rank-row">
                    <span class="rank-label">${item[0]}</span>
                    <div class="rank-bar-container">
                        <div class="rank-bar" style="width:${porc}%"></div>
                    </div>
                    <span class="rank-value">${item[1]}</span>
                </div>`;
        });
        
        display.innerHTML = html + "</div>";
        
        // Actualizar gráfico mensual
        updateMonthlyChart();
        
    } catch (e) { 
        console.error("Ranking error: ", e); 
    }
}

/**
 * GRÁFICO DE RETIROS MENSUALES
 */
async function updateMonthlyChart() {
    try {
        const res = await fetch(`${SCRIPT_URL}?action=getMonthlyStats`);
        const data = await res.json();
        
        if (!data || !data.meses || !data.valores) return;
        
        const canvas = document.getElementById('monthlyChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Destruir gráfico anterior si existe
        if (monthlyChart) {
            monthlyChart.destroy();
        }
        
        // Formatear etiquetas de meses
        const mesesLabels = data.meses.map(m => {
            const [year, month] = m.split('-');
            const mesesES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return mesesES[parseInt(month) - 1] + ' ' + year.substring(2);
        });
        
        // Detectar tema
        const isDark = !document.body.classList.contains('light-theme');
        const textColor = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        
        monthlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: mesesLabels,
                datasets: [{
                    label: 'Retiros por Mes',
                    data: data.valores,
                    backgroundColor: 'rgba(0, 123, 255, 0.6)',
                    borderColor: 'rgba(0, 123, 255, 1)',
                    borderWidth: 2,
                    borderRadius: 6,
                    barThickness: 'flex',
                    maxBarThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Retiros Mensuales - Últimos 12 Meses',
                        color: textColor,
                        font: {
                            size: 14,
                            weight: '600'
                        },
                        padding: {
                            bottom: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                        titleColor: isDark ? '#fff' : '#000',
                        bodyColor: isDark ? '#fff' : '#000',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Retiros: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor,
                            stepSize: 1,
                            precision: 0
                        },
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        }
                    },
                    x: {
                        ticks: { 
                            color: textColor,
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            display: false,
                            drawBorder: false
                        }
                    }
                }
            }
        });
        
    } catch (e) {
        console.error("Error al cargar gráfico mensual: ", e);
    }
}

/**
 * GENERACIÓN DE REPORTE PDF (Nuestra Señora de Guadalupe)
 * MEJORADO: Logo institucional, filtrado por mes, detalles completos
 */
async function exportToPDF() {
    showLoading(true);
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const now = new Date();
        
        // Filtro mensual - SOLO retiros finalizados del mes actual
        const mesActual = now.getMonth();
        const anioActual = now.getFullYear();
        const dataMes = history.filter(s => {
            const d = new Date(parseInt(s.timestamp));
            return d.getMonth() === mesActual && d.getFullYear() === anioActual;
        }).sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

        const mesesES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        // FONDO DEL ENCABEZADO (PRIMERO)
        doc.setFillColor(0, 40, 85);
        doc.rect(0, 0, 210, 45, 'F');

        // LOGO INSTITUCIONAL (DESPUÉS, PARA QUE QUEDE ENCIMA)
        try {
            const imgData = await fetchImageAsBase64('https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png');
            if (imgData) {
                // Logo en la esquina superior izquierda sobre el fondo azul
                doc.addImage(imgData, 'PNG', 12, 6, 20, 26);
            }
        } catch (e) {
            console.error('Error al cargar logo:', e);
        }

        // Título principal
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text("REPORTE DE RETIROS ESCOLARES", 105, 16, { align: 'center' });

        // Mes del reporte
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.text(`MES DE: ${mesesES[mesActual].toUpperCase()} ${anioActual}`, 105, 26, { align: 'center' });

        // Nombre de la institución
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text("Liceo Bicentenario Nuestra Señora de Guadalupe", 105, 36, { align: 'center' });

        // Información del reporte
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(8);
        const fechaGeneracion = now.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const horaGeneracion = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        doc.text(`Generado el: ${fechaGeneracion} a las ${horaGeneracion}`, 15, 52);
        doc.text(`Total de retiros del mes: ${dataMes.length}`, 150, 52);

        // Línea separadora
        doc.setDrawColor(200, 200, 200);
        doc.line(15, 56, 195, 56);

        // TABLA DE RETIROS
        let y = 66;

        if (dataMes.length === 0) {
            doc.setTextColor(100, 100, 100);
            doc.setFontSize(11);
            doc.text("No hay retiros registrados en este mes", 105, y + 20, { align: 'center' });
        } else {
            // Encabezados de tabla
            doc.setFillColor(230, 240, 250);
            doc.rect(15, y - 6, 180, 9, 'F');
            doc.setTextColor(0, 40, 85); 
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text("#", 18, y);
            doc.text("Día", 28, y);
            doc.text("Hora", 45, y);
            doc.text("Alumno/a", 65, y);
            doc.text("Curso", 105, y);
            doc.text("Motivo", 130, y);
            doc.text("Responsable", 165, y);

            y += 8;
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0, 0, 0);

            // Datos de retiros
            dataMes.forEach((s, i) => {
                if (y > 275) {
                    doc.addPage();
                    y = 20;

                    // Repetir encabezado en nueva página
                    doc.setFillColor(230, 240, 250);
                    doc.rect(15, y - 6, 180, 9, 'F');
                    doc.setTextColor(0, 40, 85);
                    doc.setFont(undefined, 'bold');
                    doc.setFontSize(9);
                    doc.text("#", 18, y);
                    doc.text("Día", 28, y);
                    doc.text("Hora", 45, y);
                    doc.text("Alumno/a", 65, y);
                    doc.text("Curso", 105, y);
                    doc.text("Motivo", 130, y);
                    doc.text("Responsable", 165, y);
                    y += 8;
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(0, 0, 0);
                }

                const fecha = new Date(parseInt(s.timestamp));
                const diaStr = `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
                const horaStr = s.exitTime || fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

                doc.setFontSize(8);
                doc.text(`${i + 1}`, 18, y);
                doc.text(diaStr, 28, y);
                doc.text(horaStr, 45, y);
                doc.text(s.name.substring(0, 22), 65, y);
                doc.text(s.course.substring(0, 12), 105, y);
                doc.text(s.reason.substring(0, 18), 130, y);
                doc.text((s.responsable || 'No registrado').substring(0, 18), 165, y);

                y += 6.5;
            });
        }

        // PIE DE PÁGINA
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(120, 120, 120);
            doc.text(`Página ${i} de ${totalPages}`, 105, 290, { align: 'center' });
            doc.text("© Liceo Bicentenario Nuestra Señora de Guadalupe - Sistema de Control de Retiros", 15, 290);
        }

        // Abrir en nueva pestaña
        window.open(doc.output('bloburl'), '_blank');
        showToast(`Reporte PDF generado: ${dataMes.length} retiros de ${mesesES[mesActual]}`, 'success');
        playSound('sound-success');
        
    } catch (e) {
        console.error('Error al generar PDF:', e);
        showToast('Error al crear el reporte PDF', 'error');
    } finally {
        showLoading(false);
    }
}

// Función auxiliar para convertir imagen a base64
async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Error al convertir imagen:', e);
        return null;
    }
}

/**
 * TIMELINE Y RETIROS DE HOY
 */
function updateTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;
    
    const today = new Date();
    const todayStr = today.toLocaleDateString('es-CL');
    
    const todayEvents = students.filter(s => {
        const eventDate = new Date(parseInt(s.timestamp));
        return eventDate.toLocaleDateString('es-CL') === todayStr;
    }).sort((a, b) => a.timestamp - b.timestamp);
    
    if (todayEvents.length === 0) {
        container.innerHTML = `
            <div class="empty-msg">
                <span class="empty-text">No hay eventos registrados hoy</span>
            </div>
        `;
        return;
    }
    
    let html = '';
    todayEvents.forEach((event, index) => {
        const time = new Date(parseInt(event.timestamp)).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        const state = event.stateKey || 'ESPERA';
        const stateColor = state === 'ESPERA' ? 'status-red' : state === 'EN BUSCA' ? 'status-yellow' : 'status-green';
        
        html += `
            <div class="timeline-item">
                <div class="timeline-time">${time}</div>
                <div class="timeline-dot ${stateColor}"></div>
                <div class="timeline-content">
                    <div class="timeline-name">${event.name}</div>
                    <div class="timeline-action">${state} - ${event.reason}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function updateWithdrawnToday() {
    const container = document.getElementById('withdrawnToday');
    const countElement = document.getElementById('withdrawnCount');
    
    if (!container || !countElement) return;
    
    const today = new Date();
    const todayStr = today.toLocaleDateString('es-CL');
    
    const todayWithdrawn = history.filter(s => {
        const exitDate = new Date(parseInt(s.timestamp));
        return exitDate.toLocaleDateString('es-CL') === todayStr;
    }).sort((a, b) => b.timestamp - a.timestamp);
    
    countElement.textContent = todayWithdrawn.length;
    
    if (todayWithdrawn.length === 0) {
        container.innerHTML = `
            <div class="empty-msg">
                <div class="empty-icon">📭</div>
                <span class="empty-text">No hay alumnos retirados hoy</span>
                <span class="empty-subtext">Los retiros finalizados aparecerán en esta sección</span>
            </div>
        `;
        return;
    }
    
    let html = '';
    todayWithdrawn.forEach(withdrawn => {
        const fecha = new Date(parseInt(withdrawn.timestamp));
        const fechaStr = fecha.toLocaleDateString('es-CL');
        const horaStr = withdrawn.exitTime || fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        
        html += `
            <div class="withdrawn-card">
                <div class="withdrawn-header">
                    <div class="withdrawn-name">${withdrawn.name}</div>
                    <div class="withdrawn-status">
                        <span>✅ Retirado</span>
                    </div>
                </div>
                <div class="withdrawn-details">
                    <div class="withdrawn-detail">
                        <span class="detail-icon">📚</span>
                        <span class="detail-label">Curso:</span>
                        <span class="detail-value">${withdrawn.course}</span>
                    </div>
                    <div class="withdrawn-detail">
                        <span class="detail-icon">📝</span>
                        <span class="detail-label">Motivo:</span>
                        <span class="detail-value">${withdrawn.reason}</span>
                    </div>
                    <div class="withdrawn-detail">
                        <span class="detail-icon">👤</span>
                        <span class="detail-label">Responsable:</span>
                        <span class="detail-value">${withdrawn.responsable || 'N/A'}</span>
                    </div>
                    <div class="withdrawn-detail">
                        <span class="detail-icon">🕐</span>
                        <span class="detail-label">Entrada:</span>
                        <span class="detail-value">${fechaStr} ${horaStr}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * ACTUALIZACIÓN DE KPIs Y ESTADÍSTICAS
 */
function updateKPIs() {
    // Total activos
    document.getElementById('activeBadge').textContent = students.length;
    
    // Completados hoy
    const today = new Date().toLocaleDateString('es-CL');
    const completedToday = history.filter(s => {
        const exitDate = new Date(parseInt(s.timestamp));
        return exitDate.toLocaleDateString('es-CL') === today;
    }).length;
    document.getElementById('completedBadge').textContent = completedToday;
    
    // Tiempo promedio (solo de los finalizados hoy)
    const todayStudents = students.filter(s => {
        const entryDate = new Date(parseInt(s.timestamp));
        return entryDate.toLocaleDateString('es-CL') === today;
    });
    
    if (todayStudents.length > 0) {
        const avgMinutes = Math.round(todayStudents.reduce((sum, s) => sum + (Date.now() - parseInt(s.timestamp)) / 60000, 0) / todayStudents.length);
        document.getElementById('avgTimeBadge').textContent = `${avgMinutes} min`;
    } else {
        document.getElementById('avgTimeBadge').textContent = '0 min';
    }
    
    // Tiempo excedido
    const exceeded = students.filter(s => {
        const minutes = Math.floor((Date.now() - parseInt(s.timestamp)) / 60000);
        return minutes >= CONFIG.maxTimeWarning && s.stateKey !== 'AVISADO';
    }).length;
    document.getElementById('exceededBadge').textContent = exceeded;
}

function updateStatusCounts() {
    document.getElementById('countEspera').textContent = students.filter(s => s.stateKey === 'ESPERA').length;
    document.getElementById('countBusca').textContent = students.filter(s => s.stateKey === 'EN BUSCA').length;
    document.getElementById('countAvisado').textContent = students.filter(s => s.stateKey === 'AVISADO').length;
    document.getElementById('countFinalizados').textContent = history.length;
}

/**
 * UTILIDADES DE UI
 */
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-content">
            <div class="toast-title">${type.toUpperCase()}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('slide-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function playSound(id) {
    const audio = document.getElementById(id);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio play error:', e));
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

/**
 * FINALIZACIÓN Y CLEANUP
 */
window.addEventListener('beforeunload', () => {
    if (syncInterval) clearInterval(syncInterval);
    if (notificationInterval) clearInterval(notificationInterval);
});

console.log('✅ Sistema LBSNG v2.1.0 (NSG) cargado - Sistema de Control de Retiros Escolares');


/* ===== AUTO-COLOREO DE ESTADOS POR TEXTO (SIN CAMBIAR UI) ===== */
function aplicarColoresPorEstado() {
  const estados = document.querySelectorAll("button, span, div");
  estados.forEach(el => {
    const txt = el.textContent.trim();
    if (["AVISADO","ESPERA","EN BUSCA","FINALIZADO"].includes(txt)) {
      el.classList.add("estado-btn");
      el.classList.add("estado-" + txt.replace(" ", "_"));
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  aplicarColoresPorEstado();
  setInterval(aplicarColoresPorEstado, 500);
});

/**
 * LBSNG - Sistema de Control de Retiros Escolares
 * Version 2.0.0 - Mejorada y Robusta
 * Liceo Bicentenario San Gregorio NSG
 */

// ============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ============================================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzk7JOF5nR0X6o3fqu4YwQ_1P_iz3is5EXGP3QVKHmXGFtMC-kHJPO3N5ynTeGlfWVA/exec";

let students = [];
let history = [];
let isPaused = false;
let lastDataHash = "";
let historyExpanded = false;
let withdrawnExpanded = true;
let lastNotificationCheck = 0;
let syncInterval = null;
let notificationInterval = null;

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
    console.log('🎒 LBSNG Control de Retiros v2.0.0 iniciando...');
    
    initTheme();
    initDateTime();
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
    
    const dateOptions = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
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
    // Tema toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const isLight = document.body.classList.contains('light-theme');
            applyTheme(isLight ? 'dark' : 'light');
        });
    }
    
    // Formulario
    const form = document.getElementById('addForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
    
    // Toggles
    const toggleWithdrawn = document.getElementById('toggleWithdrawn');
    if (toggleWithdrawn) {
        toggleWithdrawn.addEventListener('click', function() {
            withdrawnExpanded = !withdrawnExpanded;
            const grid = document.getElementById('withdrawnToday');
            if (grid) {
                grid.classList.toggle('collapsed', !withdrawnExpanded);
            }
            this.classList.toggle('active', withdrawnExpanded);
            this.querySelector('span').textContent = withdrawnExpanded ? 'Ocultar' : 'Mostrar';
        });
    }
    
    const toggleHistory = document.getElementById('toggleHistory');
    if (toggleHistory) {
        toggleHistory.addEventListener('click', function() {
            historyExpanded = !historyExpanded;
            const list = document.getElementById('historyList');
            if (list) {
                list.classList.toggle('expanded', historyExpanded);
            }
            this.classList.toggle('active', historyExpanded);
            this.querySelector('span').textContent = historyExpanded ? 'Ocultar historial' : 'Ver historial';
        });
    }
    
    // Validación en tiempo real
    const nameInput = document.getElementById('nameInput');
    const courseInput = document.getElementById('courseInput');
    const reasonInput = document.getElementById('reasonInput');
    
    if (nameInput) nameInput.addEventListener('blur', () => validateInput(nameInput, 'name'));
    if (courseInput) courseInput.addEventListener('change', () => validateInput(courseInput, 'course'));
    if (reasonInput) reasonInput.addEventListener('change', () => validateInput(reasonInput, 'reason'));
}

// ============================================
// VALIDACIÓN DE FORMULARIO
// ============================================

function validateInput(input, type) {
    const wrapper = input.closest('.input-wrapper');
    const errorSpan = wrapper.querySelector('.input-error');
    
    let isValid = true;
    let errorMessage = '';
    
    switch(type) {
        case 'name':
            if (!input.value.trim()) {
                isValid = false;
                errorMessage = 'El nombre es obligatorio';
            } else if (input.value.trim().length < 3) {
                isValid = false;
                errorMessage = 'El nombre debe tener al menos 3 caracteres';
            }
            break;
        case 'course':
        case 'reason':
            if (!input.value) {
                isValid = false;
                errorMessage = 'Este campo es obligatorio';
            }
            break;
    }
    
    if (isValid) {
        wrapper.classList.remove('error');
        if (errorSpan) errorSpan.textContent = '';
    } else {
        wrapper.classList.add('error');
        if (errorSpan) errorSpan.textContent = errorMessage;
    }
    
    return isValid;
}

function validateForm() {
    const nameInput = document.getElementById('nameInput');
    const courseInput = document.getElementById('courseInput');
    const reasonInput = document.getElementById('reasonInput');
    
    const validName = validateInput(nameInput, 'name');
    const validCourse = validateInput(courseInput, 'course');
    const validReason = validateInput(reasonInput, 'reason');
    
    return validName && validCourse && validReason;
}

// ============================================
// MANEJO DE FORMULARIO
// ============================================

async function handleSubmit(e) {
    e.preventDefault();
    
    if (!validateForm()) {
        showToast('Por favor completa todos los campos correctamente', 'error', 'Error de validación');
        return;
    }
    
    const name = document.getElementById('nameInput').value.trim();
    const course = document.getElementById('courseInput').value;
    const reason = document.getElementById('reasonInput').value;
    
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('action', 'add');
        formData.append('name', name);
        formData.append('course', course);
        formData.append('reason', reason);
        formData.append('timestamp', Date.now().toString());
        formData.append('status', 'ESPERA');
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            playSound('sound-add');
            showToast(`Registro exitoso: ${name}`, 'success', 'Alumno registrado');
            
            // Limpiar formulario
            e.target.reset();
            
            // Remover errores de validación
            document.querySelectorAll('.input-wrapper').forEach(w => w.classList.remove('error'));
            
            // Sincronizar inmediatamente
            await sync();
        } else {
            throw new Error(result.message || 'Error desconocido');
        }
    } catch (error) {
        console.error('Error al agregar alumno:', error);
        showToast('Error al registrar el alumno. Por favor intenta nuevamente.', 'error', 'Error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// NOTIFICACIONES TOAST
// ============================================

function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };
    
    const titles = {
        success: title || 'Éxito',
        error: title || 'Error',
        info: title || 'Información',
        warning: title || 'Advertencia'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// LOADING OVERLAY
// ============================================

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

// ============================================
// NOTIFICACIONES WHATSAPP
// ============================================

function notifyWhatsApp(student) {
    let mensaje = "";
    const estado = (student.stateKey || "ESPERA").toUpperCase();
    
    if (estado === "ESPERA") {
        mensaje = `*LBSNG - Aviso de Retiro*%0AEl apoderado de *${student.name}* (${student.course}) está en portería esperando.%0AMotivo: ${student.reason}`;
    } else if (estado === "EN BUSCA") {
        mensaje = `*LBSNG - Actualización*%0AEstamos buscando a *${student.name}* (${student.course}) en su sala.`;
    } else if (estado === "AVISADO") {
        mensaje = `*LBSNG - Alumno Avisado*%0A*${student.name}* ya fue notificado y se dirige a la salida.`;
    }

    const url = `https://wa.me/?text=${mensaje}`;
    window.open(url, '_blank');
    showToast('Abriendo WhatsApp...', 'info', student.name);
}

// ============================================
// NOTIFICACIONES EN TIEMPO REAL
// ============================================

async function checkNotifications() {
    if (isPaused) return;
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=checkNotifications&lastCheck=${lastNotificationCheck}`);
        const data = await response.json();
        
        if (data.hasNew && data.notifications && data.notifications.length > 0) {
            data.notifications.forEach(notif => {
                if (notif.type === 'new') {
                    playSound('sound-add');
                    showToast(
                        `${notif.name} - ${notif.course}`, 
                        'info', 
                        '🆕 Nuevo Retiro Registrado'
                    );
                    
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("Nuevo Retiro - NSG", {
                            body: `${notif.name} (${notif.course}) - ${notif.reason}`,
                            tag: 'retiro-' + notif.timestamp
                        });
                    }
                } else if (notif.type === 'completed') {
                    playSound('sound-success');
                    showToast(
                        `${notif.name} completó su retiro a las ${notif.exitTime}`, 
                        'success', 
                        '✅ Retiro Finalizado'
                    );
                }
            });
            
            lastNotificationCheck = Date.now();
            sync();
        }
    } catch (e) {
        console.error("Error checking notifications:", e);
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                showToast('Notificaciones de escritorio activadas', 'success');
            }
        });
    }
}

// ============================================
// SINCRONIZACIÓN
// ============================================

async function sync() {
    if (isPaused) return;
    
    try {
        const response = await fetch(SCRIPT_URL);
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            console.error('Datos inválidos recibidos del servidor');
            return;
        }
        
        console.log('Datos recibidos desde Google Sheets:', data);

        const newHash = generateHash(data);
        if (newHash === lastDataHash) return;
        
        lastDataHash = newHash;

        // Mapear status a stateKey para compatibilidad
        const mappedData = data.map(item => ({
            ...item,
            stateKey: item.status || 'ESPERA'
        }));

        students = mappedData.filter(s => !s.exitTime || s.exitTime === "" || s.exitTime.trim() === "");
        history = mappedData.filter(s => s.exitTime && s.exitTime !== "" && s.exitTime.trim() !== "");
        
        console.log('Students cargados:', students);
        console.log('History cargados:', history);
        
        render();
        updateKPIs();
        updateTimeline();
        updateWithdrawnToday();
    } catch (e) { 
        console.error("Error sync:", e);
        showToast('Error al sincronizar con el servidor', 'error');
    }
}

function generateHash(data) {
    return JSON.stringify(data).length + '-' + data.length;
}

// ============================================
// SONIDOS
// ============================================

function playSound(id) {
    const audio = document.getElementById(id);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
}

// ============================================
// KPIs
// ============================================

function updateKPIs() {
    const total = students.length;
    document.getElementById('kpiTotal').textContent = total;
    
    // Tiempo promedio
    const now = Date.now();
    let totalTime = 0;
    let count = 0;
    
    students.forEach(s => {
        if (s.timestamp) {
            const elapsed = now - parseInt(s.timestamp);
            totalTime += elapsed;
            count++;
        }
    });
    
    const avgMinutes = count > 0 ? Math.round(totalTime / count / 60000) : 0;
    document.getElementById('kpiAvgTime').textContent = `${avgMinutes} min`;
    
    // Completados hoy
    const today = new Date().toDateString();
    const completedToday = history.filter(s => {
        if (s.timestamp) {
            const date = new Date(parseInt(s.timestamp));
            return date.toDateString() === today;
        }
        return false;
    }).length;
    document.getElementById('kpiCompleted').textContent = completedToday;
    
    // Tiempo excedido
    const exceeded = students.filter(s => {
        if (s.timestamp) {
            const elapsed = now - parseInt(s.timestamp);
            return elapsed > CONFIG.maxTimeWarning * 60000;
        }
        return false;
    }).length;
    document.getElementById('kpiExceeded').textContent = exceeded;
}

// ============================================
// RANKING
// ============================================

async function updateRanking() {
    try {
        const res = await fetch(`${SCRIPT_URL}?action=getRanking`);
        const data = await res.json();
        const display = document.getElementById("topAlumnoDisplay");

        if (!display) return;

        if (!data.rankingCompleto || data.rankingCompleto.length === 0) {
            display.innerHTML = `
                <div style='padding:30px; text-align:center; color: var(--text-muted);'>
                    <p style='font-size: 1.1rem; margin-bottom: 8px;'>📊 Sin registros este mes</p>
                    <p style='font-size: 0.9rem;'>Los datos aparecerán cuando se registren retiros</p>
                </div>
            `;
            return data;
        }

        const maxVal = data.rankingCompleto[0][1];
        let html = `<div style="display: grid; gap: 12px;">`;
        
        data.rankingCompleto.slice(0, 10).forEach((item, i) => {
            const porcentaje = (item[1] / maxVal) * 100;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            
            html += `
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; transition: all 0.3s ease;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 1.2rem; font-weight: 800; color: var(--text-muted); min-width: 30px;">${medal || (i + 1)}</span>
                            <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${item[0]}</span>
                        </div>
                        <span style="font-size: 1rem; font-weight: 700; color: var(--inst-blue-primary);">${item[1]} <small style="font-weight: 500; color: var(--text-muted);">retiros</small></span>
                    </div>
                    <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.1); border-radius: 999px; overflow: hidden;">
                        <div style="width: ${porcentaje}%; height: 100%; background: var(--gradient-primary); border-radius: 999px; transition: width 0.5s ease;"></div>
                    </div>
                </div>
            `;
        });
        
        display.innerHTML = html + "</div>";
        return data;
    } catch (e) {
        console.error('Error al actualizar ranking:', e);
        return null;
    }
}

// ============================================
// TIMELINE
// ============================================

function updateTimeline() {
    const container = document.getElementById('timelineContainer');
    const template = document.getElementById('timelineTemplate');
    const dateSpan = document.getElementById('timelineDate');
    
    if (dateSpan) {
        dateSpan.textContent = new Date().toLocaleDateString('es-CL', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    if (!container || !template) return;
    
    container.innerHTML = '';
    
    const today = new Date().toDateString();
    const todayEvents = [...students, ...history]
        .filter(s => {
            if (s.timestamp) {
                const date = new Date(parseInt(s.timestamp));
                return date.toDateString() === today;
            }
            return false;
        })
        .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));
    
    if (todayEvents.length === 0) {
        container.innerHTML = `
            <div class="empty-msg" style="padding: 40px 20px;">
                <span class="empty-text" style="display: block; margin-bottom: 8px;">No hay actividad registrada hoy</span>
                <p class="empty-subtext">Los eventos aparecerán aquí a medida que se registren</p>
            </div>
        `;
        return;
    }
    
    todayEvents.forEach(event => {
        const clone = template.content.cloneNode(true);
        const time = new Date(parseInt(event.timestamp)).toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        clone.querySelector('.timeline-time').textContent = time;
        clone.querySelector('.timeline-name').textContent = event.name;
        
        let action = 'Registrado en sistema';
        if (event.exitTime) {
            action = `Retirado a las ${event.exitTime}`;
        } else if (event.stateKey === 'AVISADO') {
            action = 'Alumno avisado';
        } else if (event.stateKey === 'EN BUSCA') {
            action = 'En búsqueda';
        }
        
        clone.querySelector('.timeline-action').textContent = `${event.course} - ${action}`;
        
        container.appendChild(clone);
    });
}

// ============================================
// ALUMNOS RETIRADOS HOY
// ============================================

function updateWithdrawnToday() {
    const container = document.getElementById('withdrawnToday');
    const emptyMsg = document.getElementById('emptyWithdrawn');
    const badge = document.getElementById('withdrawnTodayBadge');
    const template = document.getElementById('withdrawnTemplate');
    
    if (!container || !template) return;
    
    const today = new Date().toDateString();
    const withdrawnToday = history.filter(s => {
        if (s.timestamp) {
            const date = new Date(parseInt(s.timestamp));
            return date.toDateString() === today;
        }
        return false;
    });
    
    if (badge) badge.textContent = withdrawnToday.length;
    
    if (withdrawnToday.length === 0) {
        if (emptyMsg) emptyMsg.style.display = 'flex';
        container.innerHTML = '';
        return;
    }
    
    if (emptyMsg) emptyMsg.style.display = 'none';
    container.innerHTML = '';
    
    withdrawnToday.forEach(student => {
        const clone = template.content.cloneNode(true);
        
        clone.querySelector('.withdrawn-name').textContent = student.name;
        clone.querySelector('.withdrawn-course').textContent = student.course;
        clone.querySelector('.withdrawn-reason').textContent = student.reason;
        
        const entryTime = new Date(parseInt(student.timestamp)).toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit'
        });
        clone.querySelector('.withdrawn-entry').textContent = entryTime;
        clone.querySelector('.withdrawn-exit').textContent = student.exitTime || 'N/A';
        
        if (student.timestamp && student.exitTime) {
            const entry = new Date(parseInt(student.timestamp));
            const [hours, minutes] = student.exitTime.split(':');
            const exit = new Date(entry);
            exit.setHours(parseInt(hours), parseInt(minutes));
            
            const duration = Math.round((exit - entry) / 60000);
            clone.querySelector('.withdrawn-duration').textContent = `${duration} minutos`;
        } else {
            clone.querySelector('.withdrawn-duration').textContent = 'N/A';
        }
        
        container.appendChild(clone);
    });
}

// ============================================
// RENDERIZADO DE LISTA
// ============================================

function render() {
    const list = document.getElementById('studentList');
    const emptyState = document.getElementById('emptyState');
    const activeBadge = document.getElementById('activeBadge');
    const template = document.getElementById('itemTemplate');
    
    if (!list || !template) return;
    
    // Actualizar badge
    if (activeBadge) activeBadge.textContent = students.length;
    
    // Mostrar estado vacío
    if (students.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        list.innerHTML = '';
        updateStatusCounts();
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // Ordenar por tiempo (más reciente primero)
    const sortedStudents = [...students].sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));
    
    list.innerHTML = '';
    
    sortedStudents.forEach(student => {
        const clone = template.content.cloneNode(true);
        const li = clone.querySelector('.card');
        
        // Agregar clase de estado (reemplazar espacios por guiones para CSS)
        const state = (student.stateKey || 'ESPERA').toUpperCase();
        const stateClass = state.replace(/\s+/g, '-'); // Reemplazar espacios por guiones
        li.classList.add(`status-${stateClass}`);
        
        // Tiempo transcurrido
        const now = Date.now();
        const elapsed = student.timestamp ? now - parseInt(student.timestamp) : 0;
        const minutes = Math.floor(elapsed / 60000);
        const timeText = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
        
        const timeBadge = clone.querySelector('.card-time-badge');
        if (timeBadge) {
            timeBadge.textContent = timeText;
            if (minutes > CONFIG.maxTimeWarning) {
                timeBadge.style.background = 'rgba(239, 68, 68, 0.9)';
            }
        }
        
        // Botón de estado
        const stateBtn = clone.querySelector('.state-btn');
        if (stateBtn) {
            stateBtn.textContent = state.replace('-', ' ');
            stateBtn.classList.add(`status-${stateClass}`);
            stateBtn.onclick = () => cycleState(student);
        }
        
        // Información
        clone.querySelector('.card-name').textContent = student.name;
        clone.querySelector('.card-details').textContent = `${student.course} • ${student.reason}`;
        
        // Barra de progreso
        const progressBar = clone.querySelector('.progress-bar');
        if (progressBar) {
            let progress = 0;
            if (state === 'ESPERA') progress = 33;
            else if (state === 'EN BUSCA') progress = 66;
            else if (state === 'AVISADO') progress = 100;
            progressBar.style.width = `${progress}%`;
        }
        
        // Botón Finalizar
        const btnDone = clone.querySelector('.btn-done');
        if (btnDone) {
            btnDone.style.display = 'flex';
            btnDone.onclick = () => finishRetiro(student);
        }
        
        // Botón Eliminar
        const btnDelete = clone.querySelector('.btn-delete');
        if (btnDelete) {
            btnDelete.onclick = () => deleteStudent(student);
        }
        
        list.appendChild(clone);
    });
    
    updateStatusCounts();
    renderHistory();
}

// ============================================
// HISTORIAL
// ============================================

function renderHistory() {
    const list = document.getElementById('historyList');
    const template = document.getElementById('itemTemplate');
    
    if (!list || !template) return;
    
    list.innerHTML = '';
    
    const sortedHistory = [...history].sort((a, b) => {
        return parseInt(b.timestamp) - parseInt(a.timestamp);
    });
    
    sortedHistory.slice(0, 50).forEach(student => {
        const clone = template.content.cloneNode(true);
        const li = clone.querySelector('.card');
        
        // Tiempo de registro
        const date = new Date(parseInt(student.timestamp));
        const timeText = date.toLocaleDateString('es-CL') + ' ' + date.toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const timeBadge = clone.querySelector('.card-time-badge');
        if (timeBadge) timeBadge.textContent = timeText;
        
        // Estado finalizado
        const stateBtn = clone.querySelector('.state-btn');
        if (stateBtn) {
            stateBtn.textContent = 'FINALIZADO';
            stateBtn.style.cursor = 'default';
        }
        
        clone.querySelector('.card-name').textContent = student.name;
        clone.querySelector('.card-details').textContent = `${student.course} • ${student.reason} • Salida: ${student.exitTime || 'N/A'}`;
        
        // Barra de progreso
        const progressBar = clone.querySelector('.progress-bar');
        if (progressBar) progressBar.style.width = '100%';
        
        // Ocultar botones de acción
        const btnDone = clone.querySelector('.btn-done');
        if (btnDone) btnDone.remove();
        
        // Botón Eliminar
        const btnDelete = clone.querySelector('.btn-delete');
        if (btnDelete) {
            btnDelete.onclick = () => deleteStudent(student);
        }
        
        list.appendChild(clone);
    });
}

// ============================================
// CAMBIO DE ESTADO
// ============================================

async function cycleState(student) {
    const states = ['ESPERA', 'EN BUSCA', 'AVISADO'];
    const currentIndex = states.indexOf(student.stateKey || 'ESPERA');
    const nextIndex = (currentIndex + 1) % states.length;
    const nextState = states[nextIndex];
    
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('action', 'updateState');
        formData.append('timestamp', student.timestamp);
        formData.append('newState', nextState);
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            playSound('sound-status');
            showToast(`Estado actualizado: ${nextState.replace('-', ' ')}`, 'info', student.name);
            await sync();
        } else {
            throw new Error(result.message || 'Error al actualizar estado');
        }
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        showToast('Error al actualizar el estado', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// FINALIZAR RETIRO
// ============================================

async function finishRetiro(student) {
    const confirmMsg = `¿Confirmar salida de ${student.name}?`;
    if (!confirm(confirmMsg)) return;
    
    const now = new Date();
    const exitTime = now.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('action', 'finish');
        formData.append('timestamp', student.timestamp);
        formData.append('exitTime', exitTime);
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            playSound('sound-success');
            showToast(`Retiro finalizado: ${student.name}`, 'success', 'Completado');
            await sync();
        } else {
            throw new Error(result.message || 'Error al finalizar retiro');
        }
    } catch (error) {
        console.error('Error al finalizar retiro:', error);
        showToast('Error al finalizar el retiro', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// ELIMINAR ALUMNO
// ============================================

async function deleteStudent(student) {
    const confirmMsg = `¿Estás seguro de eliminar a ${student.name}?\nEsta acción no se puede deshacer.`;
    if (!confirm(confirmMsg)) return;
    
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('action', 'delete');
        formData.append('timestamp', student.timestamp);
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(`Registro eliminado: ${student.name}`, 'info', 'Eliminado');
            await sync();
        } else {
            throw new Error(result.message || 'Error al eliminar');
        }
    } catch (error) {
        console.error('Error al eliminar alumno:', error);
        showToast('Error al eliminar el registro', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// CONTADORES DE ESTADO
// ============================================

function updateStatusCounts() {
    const counts = {
        ESPERA: 0,
        'EN BUSCA': 0,
        AVISADO: 0,
        FINALIZADO: history.length
    };
    
    students.forEach(s => {
        const state = (s.stateKey || 'ESPERA').toUpperCase();
        if (counts[state] !== undefined) {
            counts[state]++;
        }
    });
    
    document.getElementById('countEspera').textContent = counts.ESPERA;
    document.getElementById('countBusca').textContent = counts['EN BUSCA'];
    document.getElementById('countAvisado').textContent = counts.AVISADO;
    document.getElementById('countFinalizado').textContent = counts.FINALIZADO;
}

// ============================================
// EXPORTACIÓN
// ============================================

async function exportToPDF() {
    showLoading(true);
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Configuración de colores institucionales
        const primaryColor = [0, 40, 85]; // #002855
        const accentColor = [0, 122, 204]; // #007ACC
        const lightGray = [240, 242, 245];
        const darkGray = [100, 116, 139];
        
        // === PÁGINA 1: PORTADA ===
        
        // Fondo decorativo superior
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 60, 'F');
        
        // Logo institucional (añadir imagen desde URL)
        try {
            const logoUrl = 'https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png';
            doc.addImage(logoUrl, 'PNG', 85, 15, 40, 30);
        } catch(e) {
            console.log('No se pudo cargar el logo');
        }
        
        // Título principal
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.text('REPORTE DE RETIROS ESCOLARES', 105, 55, { align: 'center' });
        
        // Línea decorativa
        doc.setDrawColor(...accentColor);
        doc.setLineWidth(1);
        doc.line(40, 65, 170, 65);
        
        // Información institucional
        doc.setTextColor(...primaryColor);
        doc.setFontSize(16);
        doc.text('Liceo Bicentenario Nuestra Señora de Guadalupe', 105, 80, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setTextColor(...darkGray);
        doc.text('Sistema de Control de Retiros v2.0', 105, 88, { align: 'center' });
        
        // Fecha y hora del reporte
        const now = new Date();
        const fechaReporte = now.toLocaleDateString('es-CL', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const horaReporte = now.toLocaleTimeString('es-CL');
        
        doc.setFontSize(11);
        doc.setTextColor(...darkGray);
        doc.text(`Fecha de generación: ${fechaReporte}`, 105, 105, { align: 'center' });
        doc.text(`Hora: ${horaReporte}`, 105, 112, { align: 'center' });
        
        // === RESUMEN EJECUTIVO ===
        let y = 130;
        
        doc.setFillColor(...lightGray);
        doc.roundedRect(20, y, 170, 50, 3, 3, 'F');
        
        y += 8;
        doc.setFontSize(14);
        doc.setTextColor(...primaryColor);
        doc.setFont(undefined, 'bold');
        doc.text('RESUMEN EJECUTIVO', 105, y, { align: 'center' });
        
        y += 12;
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);
        
        const totalActivos = students.length;
        const completadosHoy = document.getElementById('kpiCompleted').textContent;
        const tiempoPromedio = document.getElementById('kpiAvgTime').textContent;
        const tiempoExcedido = document.getElementById('kpiExceeded').textContent;
        
        // Grid de 2x2 para KPIs
        const kpiX1 = 35;
        const kpiX2 = 115;
        
        doc.setFont(undefined, 'bold');
        doc.text(`${totalActivos}`, kpiX1, y, { align: 'left' });
        doc.text(`${completadosHoy}`, kpiX2, y, { align: 'left' });
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...darkGray);
        doc.text('Alumnos activos', kpiX1, y + 5, { align: 'left' });
        doc.text('Completados hoy', kpiX2, y + 5, { align: 'left' });
        
        y += 15;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(`${tiempoPromedio}`, kpiX1, y, { align: 'left' });
        doc.text(`${tiempoExcedido}`, kpiX2, y, { align: 'left' });
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...darkGray);
        doc.text('Tiempo promedio', kpiX1, y + 5, { align: 'left' });
        doc.text('Tiempo excedido', kpiX2, y + 5, { align: 'left' });
        
        // === GRÁFICO DE ESTADOS ===
        y = 195;
        
        doc.setFontSize(13);
        doc.setTextColor(...primaryColor);
        doc.setFont(undefined, 'bold');
        doc.text('DISTRIBUCIÓN POR ESTADO', 20, y);
        
        y += 10;
        
        // Contar estados
        const countEspera = parseInt(document.getElementById('countEspera').textContent) || 0;
        const countBusca = parseInt(document.getElementById('countBusca').textContent) || 0;
        const countAvisado = parseInt(document.getElementById('countAvisado').textContent) || 0;
        const countFinalizado = parseInt(document.getElementById('countFinalizado').textContent) || 0;
        
        const total = countEspera + countBusca + countAvisado + countFinalizado;
        
        if (total > 0) {
            // Gráfico de barras horizontal simple
            const barWidth = 150;
            const barHeight = 8;
            const barSpacing = 18;
            
            const estados = [
                { nombre: 'En Espera', valor: countEspera, color: [239, 68, 68] },
                { nombre: 'En Búsqueda', valor: countBusca, color: [245, 158, 11] },
                { nombre: 'Avisado', valor: countAvisado, color: [16, 185, 129] },
                { nombre: 'Finalizado', valor: countFinalizado, color: [100, 116, 139] }
            ];
            
            estados.forEach((estado, i) => {
                const porcentaje = (estado.valor / total) * 100;
                const width = (porcentaje / 100) * barWidth;
                
                // Barra
                doc.setFillColor(...estado.color);
                doc.roundedRect(50, y + (i * barSpacing), width, barHeight, 2, 2, 'F');
                
                // Etiqueta
                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
                doc.setFont(undefined, 'normal');
                doc.text(estado.nombre, 20, y + (i * barSpacing) + 6);
                
                // Valor
                doc.setFont(undefined, 'bold');
                doc.text(`${estado.valor} (${porcentaje.toFixed(0)}%)`, 205, y + (i * barSpacing) + 6, { align: 'right' });
            });
        }
        
        // === PÁGINA 2: DETALLE DE ALUMNOS ===
        doc.addPage();
        y = 20;
        
        // Header
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('DETALLE DE ALUMNOS EN PROCESO', 105, 10, { align: 'center' });
        
        y = 30;
        
        if (students.length > 0) {
            students.forEach((s, index) => {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
                
                // Tarjeta para cada alumno
                doc.setDrawColor(...lightGray);
                doc.setLineWidth(0.5);
                doc.roundedRect(20, y, 170, 28, 2, 2, 'S');
                
                // Estado (badge)
                const estado = s.stateKey || 'ESPERA';
                let estadoColor = [239, 68, 68]; // Rojo por defecto
                if (estado === 'EN BUSCA') estadoColor = [245, 158, 11]; // Naranja
                if (estado === 'AVISADO') estadoColor = [16, 185, 129]; // Verde
                
                doc.setFillColor(...estadoColor);
                doc.roundedRect(25, y + 3, 30, 6, 1, 1, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(8);
                doc.setFont(undefined, 'bold');
                doc.text(estado, 40, y + 7, { align: 'center' });
                
                // Nombre
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.text(s.name, 25, y + 14);
                
                // Curso y motivo
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(...darkGray);
                doc.text(`${s.course} • ${s.reason}`, 25, y + 20);
                
                // Hora
                const time = new Date(parseInt(s.timestamp)).toLocaleTimeString('es-CL', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const elapsed = Date.now() - parseInt(s.timestamp);
                const minutes = Math.floor(elapsed / 60000);
                const timeText = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
                
                doc.setFontSize(8);
                doc.text(`Hora entrada: ${time}`, 25, y + 25);
                doc.text(`Transcurrido: ${timeText}`, 100, y + 25);
                
                y += 35;
            });
        } else {
            doc.setFontSize(11);
            doc.setTextColor(...darkGray);
            doc.text('No hay alumnos en proceso de retiro en este momento.', 105, y, { align: 'center' });
        }
        
        // === PÁGINA 3: ESTADÍSTICAS MENSUALES ===
        doc.addPage();
        y = 20;
        
        // Header
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('ESTADÍSTICAS MENSUALES', 105, 10, { align: 'center' });
        
        y = 35;
        
        // Calcular estadísticas mensuales
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        
        const monthlyData = history.filter(s => {
            if (s.timestamp) {
                const date = new Date(parseInt(s.timestamp));
                return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
            }
            return false;
        });
        
        doc.setFontSize(12);
        doc.setTextColor(...primaryColor);
        doc.setFont(undefined, 'bold');
        doc.text(`Mes: ${now.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}`, 20, y);
        
        y += 15;
        
        // Resumen mensual en tarjeta
        doc.setFillColor(...lightGray);
        doc.roundedRect(20, y, 170, 40, 3, 3, 'F');
        
        y += 12;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        
        doc.text(`Total de retiros en el mes:`, 30, y);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(16);
        doc.text(`${monthlyData.length}`, 160, y);
        
        y += 12;
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        
        // Calcular promedio diario
        const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
        const avgPerDay = (monthlyData.length / daysInMonth).toFixed(1);
        
        doc.text(`Promedio diario:`, 30, y);
        doc.setFont(undefined, 'bold');
        doc.text(`${avgPerDay} retiros/día`, 160, y);
        
        // Ranking de cursos del mes
        y += 25;
        doc.setFontSize(12);
        doc.setTextColor(...primaryColor);
        doc.setFont(undefined, 'bold');
        doc.text('TOP 5 CURSOS CON MÁS RETIROS', 20, y);
        
        y += 10;
        
        // Agrupar por curso
        const courseCounts = {};
        monthlyData.forEach(s => {
            if (s.course) {
                courseCounts[s.course] = (courseCounts[s.course] || 0) + 1;
            }
        });
        
        const topCourses = Object.entries(courseCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        if (topCourses.length > 0) {
            topCourses.forEach(([curso, cantidad], i) => {
                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
                doc.setFont(undefined, 'normal');
                
                // Número
                doc.setFont(undefined, 'bold');
                doc.text(`${i + 1}.`, 25, y);
                
                // Curso
                doc.setFont(undefined, 'normal');
                doc.text(curso, 35, y);
                
                // Barra proporcional
                const maxCount = topCourses[0][1];
                const barWidth = (cantidad / maxCount) * 80;
                doc.setFillColor(...accentColor);
                doc.roundedRect(110, y - 4, barWidth, 5, 1, 1, 'F');
                
                // Cantidad
                doc.setFont(undefined, 'bold');
                doc.text(`${cantidad}`, 195, y, { align: 'right' });
                
                y += 10;
            });
        } else {
            doc.setFontSize(10);
            doc.setTextColor(...darkGray);
            doc.text('No hay datos suficientes para este mes', 105, y, { align: 'center' });
        }
        
        // Footer en todas las páginas
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(...darkGray);
            doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
            doc.text('Sistema de Control de Retiros - LBSNG', 20, 290);
            doc.text(fechaReporte, 190, 290, { align: 'right' });
        }
        
        // Abrir en nueva ventana en lugar de descargar
        window.open(doc.output('bloburl'), '_blank');
        
        showToast('Reporte PDF generado correctamente', 'success');
    } catch (error) {
        console.error('Error al generar PDF:', error);
        showToast('Error al generar el PDF', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// UTILIDADES
// ============================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================

window.addEventListener('error', function(e) {
    console.error('Error global:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Promise rechazada:', e.reason);
});

// ============================================
// CLEANUP AL CERRAR
// ============================================

window.addEventListener('beforeunload', function() {
    if (syncInterval) clearInterval(syncInterval);
    if (notificationInterval) clearInterval(notificationInterval);
});

console.log('✅ Sistema LBSNG Control de Retiros v2.0.0 cargado completamente');
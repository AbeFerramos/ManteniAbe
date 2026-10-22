const STORAGE_KEY = 'aviso-mantenimiento-partes-v1';
const STATUSES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'aplazado', label: 'Aplazado' },
  { value: 'derivado', label: 'Derivado' },
  { value: 'hecho', label: 'Hecho' },
  { value: 'cerrado', label: 'Cerrado' }
];
const form = document.querySelector('#ticketForm');
const orderInput = document.querySelector('#workOrder');
const descriptionInput = document.querySelector('#description');
const list = document.querySelector('#ticketList');
const archiveList = document.querySelector('#archiveList');
const emptyState = document.querySelector('#emptyState');
const archiveEmpty = document.querySelector('#archiveEmpty');
const searchInput = document.querySelector('#searchInput');
const countLabel = document.querySelector('#ticketTotal');
const charCount = document.querySelector('#charCount');
const toast = document.querySelector('#toast');
const submitButton = document.querySelector('#submitButton');
const cancelEditButton = document.querySelector('#cancelEditButton');
const importFile = document.querySelector('#importFile');
let tickets = readTickets();
let activeFilter = 'todos';
let toastTimer;
let editingId = null;

function readTickets() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(saved) ? saved : []; }
  catch { return []; }
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets)); }
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function showToast(message) {
  toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function formatDate(value) {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
function statusLabel(value) { return STATUSES.find(status => status.value === value)?.label || value; }
function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}
function normalizeOrder(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es');
}
function parseCSV(text, delimiter) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  return rows;
}
function csvDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const isoDate = new Date(raw);
    if (!Number.isNaN(isoDate.getTime())) return isoDate.toISOString();
  }
  const match = raw.match(/^(\d{1,2})[\s/-]+([\p{L}.]+)[\s/-]+(\d{4})$/u);
  if (match) {
    const months = { ene:0, enero:0, feb:1, febrero:1, mar:2, marzo:2, abr:3, abril:3, may:4, mayo:4, jun:5, junio:5, jul:6, julio:6, ago:7, agosto:7, sep:8, sept:8, septiembre:8, oct:9, octubre:9, nov:10, noviembre:10, dic:11, diciembre:11 };
    const month = months[normalizeText(match[2]).replace(/\.$/, '')];
    if (month !== undefined) return new Date(Number(match[3]), month, Number(match[1]), 12).toISOString();
  }
  const numeric = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) return new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]), 12).toISOString();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}
function csvStatus(value) {
  if (!String(value ?? '').trim()) return 'pendiente';
  const normalized = normalizeText(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const match = STATUSES.find(status => normalizeText(status.label) === normalized || status.value === normalized.replace(/\s/g, '_'));
  return match?.value || null;
}
function csvBoolean(value) {
  return ['si', 'sí', 'true', '1', 'yes', 'archivado', 'archived'].includes(normalizeText(value));
}
async function importCSVFile(file) {
  try {
    const bytes = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(bytes);
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(bytes);
    text = text.replace(/^\uFEFF/, '');
    const commaRows = parseCSV(text, ','); const semicolonRows = parseCSV(text, ';');
    const rows = semicolonRows[0]?.length >= (commaRows[0]?.length || 0) ? semicolonRows : commaRows;
    if (rows.length < 2) { showToast('El CSV no contiene filas para importar.'); return; }
    const headers = rows[0].map(normalizeText);
    const findColumn = aliases => headers.findIndex(header => aliases.includes(header));
    const orderColumn = findColumn(['orden de trabajo', 'orden trabajo', 'orden', 'ot', 'work order', 'workorder', 'order']);
    const descriptionColumn = findColumn(['descripcion de la averia', 'descripcion averia', 'descripcion', 'averia', 'incidencia', 'description']);
    const statusColumn = findColumn(['estado', 'status']);
    const dateColumn = findColumn(['fecha de registro', 'fecha registro', 'fecha', 'created at', 'createdat']);
    const archivedColumn = findColumn(['archivado', 'archived']);
    if (orderColumn < 0 || descriptionColumn < 0) {
      showToast('El CSV debe incluir columnas Orden de trabajo y Descripción.'); return;
    }

    const knownOrders = new Set(tickets.map(ticket => normalizeOrder(ticket.workOrder)));
    const incomingOrders = new Set(); const additions = [];
    let duplicates = 0; let invalid = 0;
    for (const row of rows.slice(1)) {
      const workOrder = String(row[orderColumn] ?? '').trim();
      const description = String(row[descriptionColumn] ?? '').trim();
      if (!workOrder || !description) { invalid += 1; continue; }
      const orderKey = normalizeOrder(workOrder);
      if (knownOrders.has(orderKey) || incomingOrders.has(orderKey)) { duplicates += 1; continue; }
      const rawStatus = statusColumn >= 0 ? row[statusColumn] : '';
      const status = csvStatus(rawStatus);
      if (!status) { invalid += 1; continue; }
      incomingOrders.add(orderKey);
      additions.push({
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        workOrder, description, status,
        createdAt: csvDate(dateColumn >= 0 ? row[dateColumn] : ''),
        ...(archivedColumn >= 0 && csvBoolean(row[archivedColumn]) ? { archived: true, archivedAt: new Date().toISOString() } : {})
      });
    }
    if (!additions.length) {
      showToast(duplicates ? `No se añadieron partes; ${duplicates} OT ya existían.` : 'No se encontraron filas válidas para importar.');
      return;
    }
    const details = `${additions.length} parte${additions.length === 1 ? '' : 's'} nuevo${additions.length === 1 ? '' : 's'} se añadirán. ${duplicates} OT repetidas se omitirán${invalid ? ` y ${invalid} fila${invalid === 1 ? '' : 's'} no válida${invalid === 1 ? '' : 's'} también` : ''}. Los partes existentes no se modificarán. ¿Continuar?`;
    if (!window.confirm(details)) return;
    tickets.push(...additions); persist(); activeFilter = 'todos'; searchInput.value = '';
    document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'todos'));
    render(); showToast(`Importados ${additions.length}; omitidas ${duplicates} OT repetidas.`);
  } catch {
    showToast('No se pudo leer el archivo CSV.');
  }
}
function ticketMarkup(ticket, archived = false) {
  const actions = archived
    ? `<button class="archive-button" data-action="restore" type="button" aria-label="Restaurar parte ${escapeHTML(ticket.workOrder)}" title="Restaurar parte">Restaurar</button>`
    : `<label class="sr-only" for="status-${escapeHTML(ticket.id)}">Estado de ${escapeHTML(ticket.workOrder)}</label>
        <select class="status-select" id="status-${escapeHTML(ticket.id)}" data-action="status" aria-label="Cambiar estado de ${escapeHTML(ticket.workOrder)}">
          ${STATUSES.map(status => `<option value="${status.value}" ${ticket.status === status.value ? 'selected' : ''}>${status.label}</option>`).join('')}
        </select><button class="archive-button" data-action="archive" type="button" aria-label="Archivar parte ${escapeHTML(ticket.workOrder)}" title="Archivar parte">Archivar</button>`;
  return `
    <article class="ticket-card" data-id="${escapeHTML(ticket.id)}">
      <div><div class="ticket-topline"><span class="ticket-order">${escapeHTML(ticket.workOrder)}</span><span class="status status-${ticket.status}">${escapeHTML(statusLabel(ticket.status))}</span></div>
      <p class="ticket-description">${escapeHTML(ticket.description)}</p><div class="ticket-date">Registrado el ${formatDate(ticket.createdAt)}</div></div>
      <div class="ticket-actions">${actions}<button class="edit-button" data-action="edit" type="button" aria-label="Editar parte ${escapeHTML(ticket.workOrder)}" title="Editar parte">✎</button>${archived ? '' : `<button class="delete-button" data-action="delete" type="button" aria-label="Eliminar parte ${escapeHTML(ticket.workOrder)}" title="Eliminar parte">×</button>`}</div>
    </article>`;
}
function render() {
  const query = searchInput.value.trim().toLocaleLowerCase('es');
  const matchesQuery = ticket => `${ticket.workOrder} ${ticket.description}`.toLocaleLowerCase('es').includes(query);
  const active = tickets.filter(ticket => !ticket.archived);
  const archived = tickets.filter(ticket => ticket.archived).filter(matchesQuery)
    .sort((a, b) => new Date(b.archivedAt || b.createdAt) - new Date(a.archivedAt || a.createdAt));
  const shown = active.filter(ticket => (activeFilter === 'todos' || ticket.status === activeFilter) && matchesQuery(ticket))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  list.innerHTML = shown.map(ticket => ticketMarkup(ticket)).join('');
  archiveList.innerHTML = archived.map(ticket => ticketMarkup(ticket, true)).join('');
  document.querySelector('#archiveCount').textContent = tickets.filter(ticket => ticket.archived).length;
  archiveEmpty.hidden = archived.length > 0;
  emptyState.classList.toggle('hidden', shown.length > 0);
  if (active.length && !shown.length) { emptyState.classList.remove('hidden'); emptyState.querySelector('h3').textContent = 'No hay resultados'; emptyState.querySelector('p').textContent = 'Prueba con otra búsqueda o filtro.'; }
  else if (!active.length && tickets.length) { emptyState.querySelector('h3').textContent = 'Todos los partes están archivados'; emptyState.querySelector('p').textContent = 'Puedes restaurarlos desde la sección de archivados.'; }
  else { emptyState.querySelector('h3').textContent = 'Aún no hay partes'; emptyState.querySelector('p').textContent = 'Cuando registres una incidencia aparecerá aquí.'; }
  countLabel.textContent = active.length;
  document.querySelector('#pendingCount').textContent = active.filter(t => t.status === 'pendiente').length;
  document.querySelector('#progressCount').textContent = active.filter(t => t.status === 'en_proceso').length;
  document.querySelector('#postponedCount').textContent = active.filter(t => t.status === 'aplazado').length;
  document.querySelector('#referredCount').textContent = active.filter(t => t.status === 'derivado').length;
  document.querySelector('#doneCount').textContent = active.filter(t => t.status === 'hecho').length;
  document.querySelector('#closedCount').textContent = active.filter(t => t.status === 'cerrado').length;
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const workOrder = orderInput.value.trim(); const description = descriptionInput.value.trim();
  if (!workOrder || !description) return;
  if (tickets.some(ticket => ticket.id !== editingId && normalizeOrder(ticket.workOrder) === normalizeOrder(workOrder))) {
    orderInput.setCustomValidity('Ya existe un parte con esta orden de trabajo.'); orderInput.reportValidity(); orderInput.addEventListener('input', () => orderInput.setCustomValidity(''), { once: true }); return;
  }
  if (editingId) {
    const ticket = tickets.find(item => item.id === editingId);
    if (ticket) { ticket.workOrder = workOrder; ticket.description = description; }
    resetEditor(); persist(); render(); showToast('Parte actualizado.');
  } else {
    tickets.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, workOrder, description, status: 'pendiente', createdAt: new Date().toISOString() });
    persist(); form.reset(); charCount.textContent = '0 / 1200'; activeFilter = 'todos'; document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'todos')); render(); showToast('Parte guardado como pendiente.');
  }
});
function resetEditor() {
  editingId = null; form.reset(); charCount.textContent = '0 / 1200';
  submitButton.querySelector('span').textContent = 'Guardar parte'; cancelEditButton.hidden = true;
}
function startEditing(ticket) {
  editingId = ticket.id; orderInput.value = ticket.workOrder; descriptionInput.value = ticket.description;
  charCount.textContent = `${ticket.description.length} / 1200`;
  submitButton.querySelector('span').textContent = 'Guardar cambios'; cancelEditButton.hidden = false;
  document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); orderInput.focus({ preventScroll: true });
}
cancelEditButton.addEventListener('click', resetEditor);
descriptionInput.addEventListener('input', () => { charCount.textContent = `${descriptionInput.value.length} / 1200`; });
searchInput.addEventListener('input', render);
document.querySelectorAll('.filter-chip').forEach(chip => chip.addEventListener('click', () => {
  activeFilter = chip.dataset.filter; document.querySelectorAll('.filter-chip').forEach(item => item.classList.toggle('active', item === chip)); render();
}));
list.addEventListener('change', event => {
  if (event.target.dataset.action !== 'status') return;
  const ticket = tickets.find(item => item.id === event.target.closest('.ticket-card').dataset.id);
  if (!ticket) return; ticket.status = event.target.value; persist(); render(); showToast(`Estado actualizado: ${ticket.status}.`);
});
function handleTicketAction(event) {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const card = button.closest('.ticket-card'); const ticket = tickets.find(item => item.id === card.dataset.id); if (!ticket) return;
  if (button.dataset.action === 'edit') { startEditing(ticket); return; }
  if (button.dataset.action === 'archive') {
    ticket.archived = true; ticket.archivedAt = new Date().toISOString();
    if (editingId === ticket.id) resetEditor();
    persist(); render(); showToast(`Parte ${ticket.workOrder} archivado.`); return;
  }
  if (button.dataset.action === 'restore') {
    ticket.archived = false; delete ticket.archivedAt;
    persist(); render(); showToast(`Parte ${ticket.workOrder} restaurado.`); return;
  }
  if (button.dataset.action === 'delete' && ticket.archived) { showToast('Restaura el parte antes de eliminarlo.'); return; }
  if (button.dataset.action === 'delete' && window.confirm(`¿Seguro que quieres eliminar el parte ${ticket.workOrder}? Esta acción no se puede deshacer.`)) {
    if (editingId === ticket.id) resetEditor();
    tickets = tickets.filter(item => item.id !== ticket.id); persist(); render(); showToast('Parte eliminado.');
  }
}
list.addEventListener('click', handleTicketAction);
archiveList.addEventListener('click', handleTicketAction);
document.querySelector('#exportButton').addEventListener('click', () => {
  if (!tickets.length) { showToast('No hay partes para exportar.'); return; }
  const header = ['Orden de trabajo', 'Descripción', 'Estado', 'Fecha de registro', 'Archivado'];
  const rows = tickets.map(t => [t.workOrder, t.description, statusLabel(t.status), formatDate(t.createdAt), t.archived ? 'Sí' : 'No']);
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `partes-mantenimiento-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url); showToast('Archivo exportado.');
});
document.querySelector('#importButton').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (file) await importCSVFile(file);
  importFile.value = '';
});
render();

let installPrompt;
const installButton = document.querySelector('#installButton');
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
installButton.addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; installButton.hidden = true; });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

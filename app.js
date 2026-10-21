const STORAGE_KEY = 'aviso-mantenimiento-partes-v1';
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
function ticketMarkup(ticket, archived = false) {
  const actions = archived
    ? `<button class="archive-button" data-action="restore" type="button" aria-label="Restaurar parte ${escapeHTML(ticket.workOrder)}" title="Restaurar parte">Restaurar</button>`
    : `<label class="sr-only" for="status-${escapeHTML(ticket.id)}">Estado de ${escapeHTML(ticket.workOrder)}</label>
        <select class="status-select" id="status-${escapeHTML(ticket.id)}" data-action="status" aria-label="Cambiar estado de ${escapeHTML(ticket.workOrder)}">
          <option value="pendiente" ${ticket.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="hecho" ${ticket.status === 'hecho' ? 'selected' : ''}>Hecho</option>
          <option value="cerrado" ${ticket.status === 'cerrado' ? 'selected' : ''}>Cerrado</option>
        </select><button class="archive-button" data-action="archive" type="button" aria-label="Archivar parte ${escapeHTML(ticket.workOrder)}" title="Archivar parte">Archivar</button>`;
  return `
    <article class="ticket-card" data-id="${escapeHTML(ticket.id)}">
      <div><div class="ticket-topline"><span class="ticket-order">${escapeHTML(ticket.workOrder)}</span><span class="status status-${ticket.status}">${ticket.status}</span></div>
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
  document.querySelector('#doneCount').textContent = active.filter(t => t.status === 'hecho').length;
  document.querySelector('#closedCount').textContent = active.filter(t => t.status === 'cerrado').length;
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const workOrder = orderInput.value.trim(); const description = descriptionInput.value.trim();
  if (!workOrder || !description) return;
  if (tickets.some(ticket => ticket.id !== editingId && ticket.workOrder.toLocaleLowerCase('es') === workOrder.toLocaleLowerCase('es'))) {
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
  const rows = tickets.map(t => [t.workOrder, t.description, t.status, formatDate(t.createdAt), t.archived ? 'Sí' : 'No']);
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `partes-mantenimiento-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url); showToast('Archivo exportado.');
});
render();

let installPrompt;
const installButton = document.querySelector('#installButton');
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
installButton.addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; installButton.hidden = true; });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

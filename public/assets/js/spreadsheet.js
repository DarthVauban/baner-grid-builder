(function () {
  'use strict';

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const api = window.MTApi;
  const fileInput = document.getElementById('spreadsheet-file');
  const dropzone = document.getElementById('spreadsheet-dropzone');
  const resetButton = document.getElementById('spreadsheet-reset');
  const saveButton = document.getElementById('spreadsheet-save');
  const deleteButton = document.getElementById('spreadsheet-delete');
  const nameInput = document.getElementById('spreadsheet-name');
  const editingState = document.getElementById('spreadsheet-editing-state');
  const message = document.getElementById('spreadsheet-message');
  const content = document.getElementById('spreadsheet-content');
  const fileName = document.getElementById('spreadsheet-file-name');
  const summary = document.getElementById('spreadsheet-summary');
  const sheetField = document.getElementById('spreadsheet-sheet-field');
  const sheetSelect = document.getElementById('spreadsheet-sheet-select');
  const table = document.getElementById('spreadsheet-table');
  const viewButtons = Array.from(document.querySelectorAll('[data-sheet-view]'));
  const editorView = document.getElementById('spreadsheet-editor-view');
  const libraryView = document.getElementById('spreadsheet-library-view');
  const libraryCount = document.getElementById('spreadsheet-library-count');
  const librarySummary = document.getElementById('spreadsheet-library-summary');
  const librarySearch = document.getElementById('spreadsheet-library-search');
  const libraryList = document.getElementById('spreadsheet-library-list');
  let tableData = null;
  let currentFileName = '';
  let currentSavedId = null;
  let currentSheetName = '';
  let currentRows = [];
  let currentCharacteristicCount = 0;
  let savedTables = [];
  let savedTableTotal = 0;
  let dirty = false;
  let pending = false;
  let copyTimer;
  let searchTimer;

  function notify(text, error) {
    window.dispatchEvent(new CustomEvent('mt:notify', { detail: { message: text, error } }));
  }

  function showMessage(text, error) {
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('mt-sheet-tool__message--error', Boolean(error));
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function formatCount(count, one, few, many) {
    const lastTwo = Math.abs(count) % 100;
    const lastOne = Math.abs(count) % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return `${count} ${many}`;
    if (lastOne === 1) return `${count} ${one}`;
    if (lastOne >= 2 && lastOne <= 4) return `${count} ${few}`;
    return `${count} ${many}`;
  }

  function normalizeSheet(name, matrix) {
    const columnCount = Math.max(1, ...matrix.map((row) => row.length));
    const firstRow = matrix[0] || [];
    const headers = Array.from({ length: columnCount }, (_, index) => {
      const header = normalizeText(firstRow[index]);
      if (header) return header;
      return index === 0 ? 'Назва товару' : `Характеристика ${index}`;
    });
    const rows = matrix.slice(1)
      .map((row, index) => ({
        sourceIndex: index + 1,
        values: Array.from({ length: columnCount }, (_, columnIndex) => normalizeText(row[columnIndex])),
        completed: false
      }))
      .filter((row) => row.values.some(Boolean));

    return { name, headers, rows };
  }

  function normalizeWorkbook(workbook) {
    const sheets = workbook.SheetNames.map((sheetName) => {
      const matrix = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false
      });
      return normalizeSheet(sheetName, matrix);
    });
    return { activeSheet: sheets[0]?.name || '', sheets };
  }

  function normalizeSavedData(data) {
    const sheets = Array.isArray(data?.sheets) ? data.sheets.map((sheet) => ({
      name: normalizeText(sheet.name),
      headers: Array.isArray(sheet.headers) ? sheet.headers.map(normalizeText) : ['Назва товару'],
      rows: Array.isArray(sheet.rows) ? sheet.rows.map((row) => ({
        sourceIndex: Number(row.sourceIndex) || 0,
        values: Array.isArray(row.values) ? row.values.map(normalizeText) : [''],
        completed: Boolean(row.completed)
      })) : []
    })) : [];
    return {
      activeSheet: normalizeText(data?.activeSheet) || sheets[0]?.name || '',
      sheets
    };
  }

  function switchView(view) {
    const isLibrary = view === 'library';
    editorView.hidden = isLibrary;
    libraryView.hidden = !isLibrary;
    viewButtons.forEach((button) => {
      button.classList.toggle('mt-sheet-view-tabs__button--active', button.dataset.sheetView === view);
    });
    if (isLibrary) loadSavedTables();
  }

  function setPending(value) {
    pending = value;
    saveButton.disabled = value;
    deleteButton.disabled = value;
    resetButton.disabled = value;
    nameInput.disabled = value;
  }

  function setDirty(value) {
    dirty = Boolean(value);
    if (!tableData) {
      editingState.hidden = true;
      return;
    }

    editingState.hidden = false;
    editingState.className = 'mt-sheet-workspace__state';
    if (!currentSavedId) {
      editingState.textContent = 'Ще не збережено';
      editingState.classList.add('mt-sheet-workspace__state--dirty');
    } else if (dirty) {
      editingState.textContent = 'Є незбережені зміни';
      editingState.classList.add('mt-sheet-workspace__state--dirty');
    } else {
      editingState.textContent = 'Збережено';
      editingState.classList.add('mt-sheet-workspace__state--saved');
    }
    saveButton.textContent = currentSavedId ? 'Зберегти зміни' : 'Зберегти таблицю';
    deleteButton.hidden = !currentSavedId;
  }

  function createCopyButton(text, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mt-sheet-copy';
    button.dataset.copyText = text;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.disabled = !text;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
    return button;
  }

  function createHeaderCell(text, index) {
    const th = document.createElement('th');
    th.scope = 'col';
    if (index === -1) {
      const hidden = document.createElement('span');
      hidden.className = 'mt-banner-builder__visually-hidden';
      hidden.textContent = 'Готово';
      th.appendChild(hidden);
      return th;
    }
    const line = document.createElement('div');
    const value = document.createElement('span');
    line.className = 'mt-sheet-table__head-copy';
    value.textContent = text;
    line.append(value, createCopyButton(text, `Копіювати назву колонки: ${text}`));
    th.appendChild(line);
    return th;
  }

  function createProductCell(productName) {
    const td = document.createElement('td');
    const line = document.createElement('div');
    const value = document.createElement('span');
    const displayValue = productName || '—';
    line.className = 'mt-sheet-table__product';
    value.textContent = displayValue;
    if (!productName) value.classList.add('mt-sheet-table__empty-value');
    line.append(value, createCopyButton(productName, `Копіювати назву товару: ${displayValue}`));
    td.appendChild(line);
    return td;
  }

  function createCharacteristicCell(characteristicName, characteristicValue) {
    const td = document.createElement('td');
    const labelLine = document.createElement('div');
    const label = document.createElement('span');
    const valueLine = document.createElement('div');
    const value = document.createElement('span');
    const displayValue = characteristicValue || '—';
    labelLine.className = 'mt-sheet-table__cell-line mt-sheet-table__cell-label';
    label.textContent = characteristicName;
    labelLine.append(label, createCopyButton(
      characteristicName,
      `Копіювати назву характеристики: ${characteristicName}`
    ));
    valueLine.className = 'mt-sheet-table__cell-line mt-sheet-table__cell-value';
    value.textContent = displayValue;
    if (!characteristicValue) value.classList.add('mt-sheet-table__empty-value');
    valueLine.append(value, createCopyButton(
      characteristicValue,
      `Копіювати значення характеристики: ${displayValue}`
    ));
    td.append(labelLine, valueLine);
    return td;
  }

  function createStatusCell(rowData) {
    const td = document.createElement('td');
    const checkbox = document.createElement('input');
    const productName = rowData.values[0] || `рядок ${rowData.sourceIndex + 1}`;
    checkbox.type = 'checkbox';
    checkbox.className = 'mt-sheet-table__checkbox';
    checkbox.dataset.rowComplete = String(rowData.sourceIndex);
    checkbox.checked = rowData.completed;
    checkbox.setAttribute('aria-label', `Позначити як готовий: ${productName}`);
    td.appendChild(checkbox);
    return td;
  }

  function getCurrentSheet() {
    return tableData?.sheets.find((sheet) => sheet.name === currentSheetName) || null;
  }

  function updateSummary() {
    const completed = currentRows.filter((row) => row.completed).length;
    summary.textContent = `${formatCount(currentRows.length, 'рядок', 'рядки', 'рядків')} · ${formatCount(
      currentCharacteristicCount,
      'характеристика',
      'характеристики',
      'характеристик'
    )} · Готово: ${completed}`;
  }

  function renderSheet(sheetName) {
    const sheet = tableData?.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) return;
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const tbody = document.createElement('tbody');
    const fragment = document.createDocumentFragment();
    headerRow.appendChild(createHeaderCell('', -1));
    sheet.headers.forEach((header, index) => headerRow.appendChild(createHeaderCell(header, index)));
    thead.appendChild(headerRow);

    sheet.rows.forEach((rowData) => {
      const tr = document.createElement('tr');
      tr.dataset.rowIndex = String(rowData.sourceIndex);
      tr.classList.toggle('mt-sheet-table__row--done', rowData.completed);
      tr.appendChild(createStatusCell(rowData));
      tr.appendChild(createProductCell(rowData.values[0]));
      sheet.headers.slice(1).forEach((header, index) => {
        tr.appendChild(createCharacteristicCell(header, rowData.values[index + 1] || ''));
      });
      fragment.appendChild(tr);
    });

    currentSheetName = sheetName;
    tableData.activeSheet = sheetName;
    currentRows = sheet.rows;
    currentCharacteristicCount = Math.max(0, sheet.headers.length - 1);
    tbody.appendChild(fragment);
    table.style.width = `${Math.max(980, 334 + (currentCharacteristicCount * 280))}px`;
    table.replaceChildren(thead, tbody);
    updateSummary();
    showMessage(sheet.rows.length ? '' : 'Обраний аркуш не містить товарів.', false);
  }

  function populateSheetSelect() {
    sheetSelect.replaceChildren();
    tableData.sheets.forEach((sheet) => {
      const option = document.createElement('option');
      option.value = sheet.name;
      option.textContent = sheet.name;
      sheetSelect.appendChild(option);
    });
    sheetField.hidden = tableData.sheets.length <= 1;
  }

  function showTableEditor() {
    populateSheetSelect();
    const activeSheet = tableData.sheets.some((sheet) => sheet.name === tableData.activeSheet)
      ? tableData.activeSheet
      : tableData.sheets[0].name;
    sheetSelect.value = activeSheet;
    renderSheet(activeSheet);
    fileName.textContent = currentFileName || 'Збережена таблиця';
    dropzone.hidden = true;
    content.hidden = false;
    switchView('editor');
  }

  async function loadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      showMessage('Потрібен файл у форматі XLSX.', true);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showMessage('Файл завеликий. Максимальний розмір — 20 МБ.', true);
      return;
    }
    if (!window.XLSX) {
      showMessage('Не вдалося завантажити модуль обробки Excel. Оновіть сторінку.', true);
      return;
    }

    dropzone.classList.add('mt-sheet-upload--loading');
    showMessage('Обробляємо таблицю…', false);
    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
      if (!workbook.SheetNames.length) throw new Error('У файлі немає аркушів.');
      tableData = normalizeWorkbook(workbook);
      currentFileName = file.name;
      currentSavedId = null;
      nameInput.value = file.name.replace(/\.xlsx$/i, '');
      showTableEditor();
      setDirty(true);
      notify('Таблицю завантажено.', false);
    } catch (error) {
      tableData = null;
      showMessage(error.message || 'Не вдалося прочитати XLSX-файл.', true);
    } finally {
      dropzone.classList.remove('mt-sheet-upload--loading');
      fileInput.value = '';
    }
  }

  function resetTool(force) {
    if (!force && dirty && !window.confirm('Незбережені зміни буде втрачено. Створити нову таблицю?')) return;
    tableData = null;
    currentFileName = '';
    currentSavedId = null;
    currentSheetName = '';
    currentRows = [];
    currentCharacteristicCount = 0;
    dirty = false;
    table.replaceChildren();
    table.style.removeProperty('width');
    sheetSelect.replaceChildren();
    nameInput.value = '';
    fileName.textContent = '';
    summary.textContent = '';
    content.hidden = true;
    dropzone.hidden = false;
    deleteButton.hidden = true;
    editingState.hidden = true;
    showMessage('', false);
    fileInput.value = '';
    switchView('editor');
  }

  async function saveCurrentTable() {
    if (!tableData || pending) return;
    const name = nameInput.value.trim();
    if (!name) {
      notify('Вкажіть назву таблиці.', true);
      nameInput.focus();
      return;
    }

    setPending(true);
    const defaultText = saveButton.textContent;
    saveButton.textContent = 'Збереження…';
    try {
      const payload = { name, fileName: currentFileName, data: tableData };
      const saved = currentSavedId
        ? await api.productTables.update(currentSavedId, payload)
        : await api.productTables.create(payload);
      currentSavedId = saved.id;
      currentFileName = saved.fileName;
      setDirty(false);
      await loadSavedTables();
      notify('Таблицю збережено.', false);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setPending(false);
      saveButton.textContent = currentSavedId ? 'Зберегти зміни' : defaultText;
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function createLibraryCard(item) {
    const card = document.createElement('article');
    const heading = document.createElement('div');
    const title = document.createElement('h4');
    const source = document.createElement('p');
    const meta = document.createElement('p');
    const actions = document.createElement('div');
    const openButton = document.createElement('button');
    const removeButton = document.createElement('button');
    card.className = 'mt-sheet-library__card';
    heading.className = 'mt-sheet-library__card-heading';
    title.textContent = item.name;
    source.textContent = item.fileName || 'Без вихідного файлу';
    meta.className = 'mt-sheet-library__meta';
    meta.textContent = `${formatCount(item.rowCount, 'рядок', 'рядки', 'рядків')} · ${formatCount(
      item.sheetCount,
      'аркуш',
      'аркуші',
      'аркушів'
    )} · ${formatDate(item.updatedAt)}`;
    actions.className = 'mt-sheet-library__actions';
    openButton.type = 'button';
    openButton.className = 'mt-banner-builder__button mt-banner-builder__button--primary';
    openButton.dataset.openTable = item.id;
    openButton.textContent = 'Відкрити';
    removeButton.type = 'button';
    removeButton.className = 'mt-banner-builder__button mt-banner-builder__button--danger';
    removeButton.dataset.deleteTable = item.id;
    removeButton.dataset.tableName = item.name;
    removeButton.textContent = 'Видалити';
    heading.append(title, source);
    actions.append(openButton, removeButton);
    card.append(heading, meta, actions);
    return card;
  }

  function renderLibrary() {
    libraryList.replaceChildren();
    savedTables.forEach((item) => libraryList.appendChild(createLibraryCard(item)));
    if (!savedTables.length) {
      const empty = document.createElement('div');
      empty.className = 'mt-sheet-library__empty';
      empty.textContent = librarySearch.value.trim()
        ? 'Таблиць за цим запитом не знайдено.'
        : 'Збережених таблиць ще немає.';
      libraryList.appendChild(empty);
    }
    librarySummary.textContent = librarySearch.value.trim()
      ? `Знайдено: ${savedTables.length}`
      : `Усього збережено: ${savedTables.length}`;
    if (!librarySearch.value.trim()) savedTableTotal = savedTables.length;
    libraryCount.textContent = String(savedTableTotal);
  }

  async function loadSavedTables() {
    try {
      librarySummary.textContent = 'Завантаження…';
      savedTables = await api.productTables.list(librarySearch.value.trim());
      renderLibrary();
    } catch (error) {
      librarySummary.textContent = error.message;
    }
  }

  async function openSavedTable(id) {
    if (pending) return;
    if (dirty && !window.confirm('Незбережені зміни буде втрачено. Відкрити іншу таблицю?')) return;
    setPending(true);
    try {
      const saved = await api.productTables.get(id);
      tableData = normalizeSavedData(saved.data);
      if (!tableData.sheets.length) throw new Error('Збережена таблиця не містить аркушів.');
      currentSavedId = saved.id;
      currentFileName = saved.fileName;
      nameInput.value = saved.name;
      showTableEditor();
      setDirty(false);
      notify('Таблицю відкрито.', false);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setPending(false);
    }
  }

  async function deleteSavedTable(id, tableName) {
    if (pending || !window.confirm(`Видалити таблицю «${tableName}»? Цю дію неможливо скасувати.`)) return;
    setPending(true);
    try {
      await api.productTables.remove(id);
      if (currentSavedId === id) resetTool(true);
      await loadSavedTables();
      notify('Таблицю видалено.', false);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setPending(false);
    }
  }

  async function copyText(text, button) {
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.className = 'mt-banner-builder__clipboard-helper';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      clearTimeout(copyTimer);
      table.querySelectorAll('.mt-sheet-copy--copied').forEach((item) => {
        item.classList.remove('mt-sheet-copy--copied');
      });
      button.classList.add('mt-sheet-copy--copied');
      copyTimer = window.setTimeout(() => button.classList.remove('mt-sheet-copy--copied'), 1400);
      notify('Скопійовано.', false);
    } catch (error) {
      notify('Не вдалося скопіювати текст.', true);
    }
  }

  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  resetButton.addEventListener('click', () => resetTool(false));
  saveButton.addEventListener('click', saveCurrentTable);
  deleteButton.addEventListener('click', () => deleteSavedTable(currentSavedId, nameInput.value.trim()));
  nameInput.addEventListener('input', () => setDirty(true));
  sheetSelect.addEventListener('change', () => {
    renderSheet(sheetSelect.value);
    setDirty(true);
  });
  viewButtons.forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.sheetView));
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('mt-sheet-upload--dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('mt-sheet-upload--dragging');
    });
  });
  dropzone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));

  table.addEventListener('click', (event) => {
    const button = event.target.closest('[data-copy-text]');
    if (button) copyText(button.dataset.copyText, button);
  });
  table.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-row-complete]');
    if (!checkbox) return;
    const rowIndex = Number(checkbox.dataset.rowComplete);
    const row = getCurrentSheet()?.rows.find((candidate) => candidate.sourceIndex === rowIndex);
    if (!row) return;
    row.completed = checkbox.checked;
    checkbox.closest('tr').classList.toggle('mt-sheet-table__row--done', checkbox.checked);
    updateSummary();
    setDirty(true);
  });

  libraryList.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-table]');
    if (openButton) {
      openSavedTable(openButton.dataset.openTable);
      return;
    }
    const removeButton = event.target.closest('[data-delete-table]');
    if (removeButton) {
      deleteSavedTable(removeButton.dataset.deleteTable, removeButton.dataset.tableName);
    }
  });
  librarySearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadSavedTables, 250);
  });

  window.addEventListener('mt:authenticated', loadSavedTables);
  window.addEventListener('mt:signed-out', () => {
    savedTables = [];
    savedTableTotal = 0;
    librarySearch.value = '';
    libraryCount.textContent = '0';
    libraryList.replaceChildren();
    resetTool(true);
  });
})();

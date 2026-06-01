let CCDC_TOKEN = localStorage.getItem('CCDC_TOKEN') || '';
let CURRENT_API_BASE = localStorage.getItem('CCDC_API_BASE') || API_BASE || '';

const departments = [
  {id:1,name:'Phòng hành chính quản trị',code:'HCQT',children:['Bảo vệ','Tạp vụ','Nhà ăn']},
  {id:2,name:'Phòng nhân sự',code:'NS',children:[]},
  {id:3,name:'Phòng kế toán',code:'KT',children:[]},
  {id:4,name:'Phòng kế hoạch',code:'KH',children:[]},
  {id:5,name:'Phòng kỹ thuật công nghệ',code:'KTCN',children:[]},
  {id:6,name:'Kho NPL',code:'NPL',children:[]},
  {id:7,name:'Kho thành phẩm',code:'TP',children:[]},
  {id:8,name:'Tổ cắt',code:'CAT',children:[]},
  {id:9,name:'Cơ điện',code:'CD',children:['Thợ điện','Thợ máy']},
  {id:10,name:'XN1',code:'XN1',children:['Tổ 1','Tổ 3','Tổ 5','Tổ 7','Tổ 9']},
  {id:11,name:'XN2',code:'XN2',children:['Tổ 11','Tổ 13','Tổ 15','Tổ 17']},
  {id:12,name:'XN3',code:'XN3',children:['Tổ 19','Tổ 21','Tổ 23','Tổ 25','Tổ 27']}
];

const categories = [
  'Bàn ghế','Tủ kệ','Máy móc văn phòng','Thiết bị sản xuất',
  'Dụng cụ đo lường','Dụng cụ vệ sinh','Bảo hộ lao động',
  'Khuôn/mẫu/phụ kiện','Công cụ sửa chữa','Khác'
];

const assetCategories = [
  'Nhà cửa / vật kiến trúc',
  'Máy móc thiết bị',
  'Phương tiện vận tải',
  'Thiết bị văn phòng',
  'Tài sản IT',
  'Tài sản khác'
];

const statuses = [
  {value:'use', label:'Đang sử dụng'},
  {value:'stock', label:'Trong kho'},
  {value:'broken', label:'Hỏng'},
  {value:'lost', label:'Mất / thất lạc'},
  {value:'disposal', label:'Chờ thanh lý'},
  {value:'disposed', label:'Đã thanh lý'}
];

let assets = [];
let tools = [];
let assignments = [];
let inventories = [];

let editingAssetId = null;
let editingToolId = null;
let editingAssignmentId = null;
let editingInventoryId = null;

let assetPage = 1;
let assetPageSize = 25;
let lastAssetRows = [];

let toolPage = 1;
let toolPageSize = 25;
let lastToolRows = [];

let confirmResolve = null;

const $ = id => document.getElementById(id);

const norm = s => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'');

const todayISO = () => new Date().toISOString().slice(0,10);
const money = n => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const statusLabel = v => (statuses.find(s => s.value === v) || {}).label || v || '';
const statusClass = v => v || 'stock';

function showToast(message, type='success', title='Thông báo'){
  const box = $('toastBox');
  if(!box) return;

  const icons = {success:'✅', error:'❌', warn:'⚠️', info:'ℹ️'};
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `
    <div>${icons[type] || 'ℹ️'}</div>
    <div><b>${title}</b><span>${message}</span></div>
  `;

  box.appendChild(div);

  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transform = 'translateX(18px)';
    div.style.transition = '.2s';
    setTimeout(() => div.remove(), 220);
  }, 2600);
}

function showConfirm(message, title='Xác nhận'){
  $('confirmTitle').textContent = title;
  $('confirmMessage').textContent = message;
  $('confirmModal').classList.add('show');

  return new Promise(resolve => {
    confirmResolve = resolve;
  });
}

function closeConfirm(result){
  $('confirmModal').classList.remove('show');

  if(confirmResolve){
    confirmResolve(result);
    confirmResolve = null;
  }
}

function fillSelect(id, arr, getVal=x=>x, getText=x=>x, first=''){
  const el = $(id);
  if(!el) return;

  el.innerHTML = first ? `<option value="">${first}</option>` : '';

  arr.forEach(x => {
    const op = document.createElement('option');
    op.value = getVal(x);
    op.textContent = getText(x);
    el.appendChild(op);
  });
}

function deptIdByName(name){
  const d = departments.find(x => norm(x.name) === norm(name));
  return d ? d.id : null;
}

function deptNameById(id){
  const d = departments.find(x => Number(x.id) === Number(id));
  return d ? d.name : '';
}

function categoryBadge(t){
  return `<span class="type-badge">${t || '-'}</span>`;
}

/* =======================
   ASSET HELPERS
======================= */
function assetCode(a){ return a.asset_code ?? ''; }
function assetName(a){ return a.asset_name ?? ''; }
function assetCategory(a){ return a.category ?? ''; }
function assetDept(a){ return a.department_name ?? a.department ?? deptNameById(a.department_id) ?? ''; }
function assetQty(a){ return Number(a.quantity ?? 0); }
function assetCost(a){ return Number(a.original_cost ?? 0); }

function matchAsset(a, q){
  q = norm(q);

  const text = [
    assetCode(a),
    assetName(a),
    assetCategory(a),
    a.specification,
    a.serial_number,
    a.unit,
    assetDept(a),
    a.custodian,
    a.location,
    a.status,
    a.note
  ].join(' ');

  return !q || norm(text).includes(q);
}

/* =======================
   TOOL HELPERS
======================= */
function toolCode(a){ return a.tool_code ?? a.asset_code ?? a.code ?? ''; }
function toolName(a){ return a.tool_name ?? a.asset_name ?? a.name ?? ''; }
function toolCategory(a){ return a.category ?? a.asset_type ?? ''; }
function toolDept(a){ return a.department_name ?? a.department ?? a.dept ?? deptNameById(a.department_id) ?? ''; }
function toolQty(a){ return Number(a.quantity ?? a.qty ?? 0); }
function toolCost(a){ return Number(a.original_cost ?? a.cost ?? 0); }

function matchTool(a, q){
  q = norm(q);

  const text = [
    toolCode(a),
    toolName(a),
    toolCategory(a),
    a.specification,
    a.serial_number,
    a.unit,
    toolDept(a),
    a.custodian,
    a.location,
    a.status,
    a.note
  ].join(' ');

  return !q || norm(text).includes(q);
}

function isIssueTool(a){
  return ['broken','lost','disposal','disposed'].includes(a.status);
}

/* =======================
   ALL ITEMS: TÀI SẢN + CCDC
======================= */
function getAllItems(){
  const assetItems = assets.map(a => ({
    item_type: 'asset',
    id: a.id,
    code: assetCode(a),
    name: assetName(a),
    category: assetCategory(a),
    dept: assetDept(a),
    qty: assetQty(a),
    cost: assetCost(a),
    custodian: a.custodian || '',
    location: a.location || '',
    status: a.status || 'stock',
    label: `[Tài sản] ${assetCode(a)} - ${assetName(a)} - ${assetDept(a) || 'Chưa gán'}`
  }));

  const toolItems = tools.map(a => ({
    item_type: 'tool',
    id: a.id,
    code: toolCode(a),
    name: toolName(a),
    category: toolCategory(a),
    dept: toolDept(a),
    qty: toolQty(a),
    cost: toolCost(a),
    custodian: a.custodian || '',
    location: a.location || '',
    status: a.status || 'stock',
    label: `[CCDC] ${toolCode(a)} - ${toolName(a)} - ${toolDept(a) || 'Chưa gán'}`
  }));

  return [...assetItems, ...toolItems];
}

function findItemByValue(value){
  const [itemType, itemId] = String(value || '').split('|');

  return getAllItems().find(x =>
    x.item_type === itemType &&
    Number(x.id) === Number(itemId)
  );
}

function itemTypeLabel(type){
  return type === 'asset' ? 'Tài sản' : 'CCDC';
}

/* =======================
   INIT
======================= */
function init(){
  checkLogin();

  $('todayText').textContent = new Date().toLocaleDateString('vi-VN', {
    weekday:'long',
    day:'2-digit',
    month:'2-digit',
    year:'numeric'
  });

  if($('apiBaseInput')){
    $('apiBaseInput').value = CURRENT_API_BASE;
  }

  fillSelect('dashStatus', statuses, s=>s.value, s=>s.label, 'Tất cả trạng thái');

  fillSelect('filterAssetCategory', assetCategories, x=>x, x=>x, 'Tất cả nhóm tài sản');
  fillSelect('filterAssetDept', departments, d=>d.name, d=>d.name, 'Tất cả bộ phận');
  fillSelect('filterAssetStatus', statuses, s=>s.value, s=>s.label, 'Tất cả trạng thái');

  fillSelect('filterStatus', statuses, s=>s.value, s=>s.label, 'Tất cả trạng thái');
  fillSelect('filterCategory', categories, x=>x, x=>x, 'Tất cả nhóm');
  fillSelect('filterDept', departments, d=>d.name, d=>d.name, 'Tất cả bộ phận');

  fillSelect('faCategory', assetCategories);
  fillSelect('faDept', departments, d=>d.name, d=>d.name);
  fillSelect('faStatus', statuses, s=>s.value, s=>s.label);

  fillSelect('fCategory', categories);
  fillSelect('fDept', departments, d=>d.name, d=>d.name);
  fillSelect('fStatus', statuses, s=>s.value, s=>s.label);

  fillSelect('aDept', departments, d=>d.name, d=>d.name);

  fillYearSelect();

  document.querySelectorAll('.nav button').forEach(btn => {
    btn.onclick = () => setView(btn.dataset.view);
  });

  if(CCDC_TOKEN){
    loadRemote().finally(renderAll);
  }else{
    renderAll();
  }
}

function fillYearSelect(){
  const y = new Date().getFullYear();
  const years = [];

  for(let i = 2026; i <= y + 1; i++){
    years.push(i);
  }

  fillSelect('iYear', years);
}

/* =======================
   LOAD / SAVE
======================= */
async function loadRemote(){
  if(!CURRENT_API_BASE){
    loadLocal();
    return;
  }

  try{
    const headers = {
      Authorization:'Bearer ' + CCDC_TOKEN
    };

    const [as, t, a, i] = await Promise.all([
      fetch(CURRENT_API_BASE + '/api/assets', {headers}),
      fetch(CURRENT_API_BASE + '/api/tools', {headers}),
      fetch(CURRENT_API_BASE + '/api/assignments', {headers}),
      fetch(CURRENT_API_BASE + '/api/inventories', {headers})
    ]);

    if(as.status === 401 || t.status === 401){
      localStorage.removeItem('CCDC_TOKEN');
      CCDC_TOKEN = '';
      $('loginScreen').style.display = 'flex';
      return;
    }

    if(as.ok){
      const d = await as.json();
      assets = Array.isArray(d) ? d : (d.assets || []);
    }

    if(t.ok){
      const d = await t.json();
      tools = Array.isArray(d) ? d : (d.tools || []);
    }

    if(a.ok){
      const d = await a.json();
      assignments = Array.isArray(d) ? d : (d.assignments || []);
    }

    if(i.ok){
      const d = await i.json();
      inventories = Array.isArray(d) ? d : (d.inventories || []);
    }

  }catch(e){
    loadLocal();
    showToast('Không kết nối được API, đang dùng dữ liệu local', 'warn', 'API');
  }
}

function loadLocal(){
  assets = JSON.parse(localStorage.getItem('CCDC_ASSETS') || '[]');
  tools = JSON.parse(localStorage.getItem('CCDC_TOOLS') || '[]');
  assignments = JSON.parse(localStorage.getItem('CCDC_ASSIGNMENTS') || '[]');
  inventories = JSON.parse(localStorage.getItem('CCDC_INVENTORIES') || '[]');
}

function saveLocal(){
  localStorage.setItem('CCDC_ASSETS', JSON.stringify(assets));
  localStorage.setItem('CCDC_TOOLS', JSON.stringify(tools));
  localStorage.setItem('CCDC_ASSIGNMENTS', JSON.stringify(assignments));
  localStorage.setItem('CCDC_INVENTORIES', JSON.stringify(inventories));
}

async function saveRemote(path, payload, method, reload=true){
  if(!CURRENT_API_BASE){
    saveLocal();
    return true;
  }

  try{
    const res = await fetch(CURRENT_API_BASE + path, {
      method,
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer ' + CCDC_TOKEN
      },
      body: payload ? JSON.stringify(payload) : undefined
    });

    const text = await res.text();

    let data = {};
    try{
      data = text ? JSON.parse(text) : {};
    }catch{
      data = {
        success:false,
        error:text || 'API không trả về JSON'
      };
    }

    if(!res.ok || data.success === false){
      showToast(
        data.error || `HTTP ${res.status}`,
        'error',
        'Không kết nối được API'
      );
      return false;
    }

    if(reload){
      await loadRemote();
      renderAll();
    }

    return true;

  }catch(e){
    showToast(
      e.message || 'Không gọi được API',
      'error',
      'Không kết nối được API'
    );
    return false;
  }
}

/* =======================
   RENDER
======================= */
function renderAll(){
  renderKpi();
  renderDashboardTable();
  renderWarnings();
  renderAssets();
  renderTools();
  renderDept();
  renderAssignments();
  renderInventories();
  refreshToolOptions();
  renderCharts();
}

function renderKpi(){
  const totalAll = assets.length + tools.length;
  const useAll = assets.filter(a => a.status === 'use').length + tools.filter(a => a.status === 'use').length;
  const stockAll = assets.filter(a => a.status === 'stock').length + tools.filter(a => a.status === 'stock').length;

  $('kpiTotal').textContent = totalAll;
  $('kpiUse').textContent = useAll;
  $('kpiStock').textContent = stockAll;

  $('kpiDiff').textContent = inventories.filter(x =>
    Number(x.difference_qty || 0) !== 0 ||
    ['Hỏng','Mất','Thiếu','Chờ thanh lý'].includes(x.condition)
  ).length;

  $('toolCountText').textContent = `${assets.length} tài sản, ${tools.length} CCDC`;
}

function renderWarnings(){
  const totalCost =
    assets.reduce((s,a) => s + assetCost(a), 0) +
    tools.reduce((s,a) => s + toolCost(a), 0);

  const issue =
    assets.filter(isIssueTool).length +
    tools.filter(isIssueTool).length;

  const noDept =
    assets.filter(a => !assetDept(a)).length +
    tools.filter(a => !toolDept(a)).length;

  const diff = inventories.filter(x => Number(x.difference_qty || 0) !== 0).length;

  $('warningStats').innerHTML = `
    <div class="stat-row"><b>💰 Tổng nguyên giá</b><span>${money(totalCost)}</span></div>
    <div class="stat-row stat-danger"><b>⛔ Hỏng / mất / thanh lý</b><span>${issue}</span></div>
    <div class="stat-row stat-warn"><b>⚠️ Chưa gán bộ phận</b><span>${noDept}</span></div>
    <div class="stat-row stat-warn"><b>📌 Có chênh lệch kiểm kê</b><span>${diff}</span></div>
  `;
}

function renderDashboardTable(){
  const q = $('dashSearch')?.value || '';
  const st = $('dashStatus')?.value || '';

  const rows = getAllItems()
    .filter(a => !q || norm([a.code,a.name,a.category,a.dept,a.custodian,a.location].join(' ')).includes(norm(q)))
    .filter(a => !st || a.status === st)
    .slice(0,10);

  $('dashRows').innerHTML = rows.map(a => `
    <tr>
      <td><b>${a.code}</b><div style="font-size:11px;color:var(--muted)">${itemTypeLabel(a.item_type)}</div></td>
      <td>${categoryBadge(a.category)}</td>
      <td>${a.name}</td>
      <td>${a.dept || '-'}</td>
      <td>${a.custodian || '-'}</td>
      <td>${a.qty}</td>
      <td><span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="7">Không có dữ liệu</td></tr>';
}

/* =======================
   ASSETS
======================= */
function renderAssets(){
  if(!$('assetRows')) return;

  const q = $('assetSearch')?.value || '';
  const cat = $('filterAssetCategory')?.value || '';
  const dept = $('filterAssetDept')?.value || '';
  const st = $('filterAssetStatus')?.value || '';

  const rows = assets
    .filter(a => matchAsset(a, q))
    .filter(a => !cat || norm(assetCategory(a)) === norm(cat))
    .filter(a => !dept || norm(assetDept(a)) === norm(dept))
    .filter(a => !st || a.status === st);

  lastAssetRows = rows;

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / assetPageSize));

  if(assetPage > totalPages) assetPage = totalPages;

  const pageRows = rows.slice(
    (assetPage - 1) * assetPageSize,
    (assetPage - 1) * assetPageSize + assetPageSize
  );

  $('assetPagerInfo').textContent = `${total} dòng`;
  $('assetPagerPage').textContent = `Trang ${assetPage}/${totalPages}`;

  $('assetRows').innerHTML = pageRows.map(a => `
    <tr>
      <td><b>${assetCode(a)}</b></td>
      <td>${categoryBadge(assetCategory(a))}</td>
      <td>${assetName(a)}<div style="font-size:12px;color:var(--muted)">${a.specification || ''}</div></td>
      <td>${a.serial_number || '-'}</td>
      <td>${assetQty(a)}</td>
      <td>${money(assetCost(a))}</td>
      <td>${assetDept(a) || '-'}</td>
      <td>${a.custodian || '-'}</td>
      <td>${a.location || '-'}</td>
      <td><span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></td>
      <td>
        <button class="btn ghost" onclick="editAsset(${a.id})">Sửa</button>
        <button class="btn danger" onclick="deleteAsset(${a.id})">Xóa</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="11">Không có dữ liệu tài sản</td></tr>';
}

function prevAssetPage(){
  if(assetPage > 1){
    assetPage--;
    renderAssets();
  }
}

function nextAssetPage(){
  const totalPages = Math.max(1, Math.ceil(lastAssetRows.length / assetPageSize));

  if(assetPage < totalPages){
    assetPage++;
    renderAssets();
  }
}

function openAssetModal(){
  editingAssetId = null;
  $('assetModalTitle').textContent = 'Thêm tài sản';

  ['faCode','faName','faSpec','faSerial','faCustodian','faLocation','faNote'].forEach(id => {
    if($(id)) $(id).value = '';
  });

  $('faUnit').value = 'Cái';
  $('faQty').value = 1;
  $('faPurchase').value = '';
  $('faCost').value = 0;
  $('faRemain').value = 0;
  $('faStatus').value = 'stock';

  $('assetModal').classList.add('show');
}

function editAsset(id){
  const a = assets.find(x => x.id === id);
  if(!a) return;

  editingAssetId = id;
  $('assetModalTitle').textContent = 'Sửa tài sản';

  $('faCode').value = assetCode(a);
  $('faCategory').value = assetCategory(a);
  $('faName').value = assetName(a);
  $('faSpec').value = a.specification || '';
  $('faSerial').value = a.serial_number || '';
  $('faUnit').value = a.unit || 'Cái';
  $('faQty').value = assetQty(a);
  $('faPurchase').value = a.purchase_date || '';
  $('faCost').value = assetCost(a);
  $('faRemain').value = Number(a.remaining_value || 0);
  $('faDept').value = assetDept(a);
  $('faCustodian').value = a.custodian || '';
  $('faLocation').value = a.location || '';
  $('faStatus').value = a.status || 'stock';
  $('faNote').value = a.note || '';

  $('assetModal').classList.add('show');
}

function assetPayload(){
  const deptName = $('faDept').value;

  return {
    asset_code: $('faCode').value.trim(),
    category: $('faCategory').value,
    asset_name: $('faName').value.trim(),
    specification: $('faSpec').value.trim(),
    serial_number: $('faSerial').value.trim(),
    unit: $('faUnit').value.trim() || 'Cái',
    quantity: Number($('faQty').value || 0),
    purchase_date: $('faPurchase').value,
    original_cost: Number($('faCost').value || 0),
    remaining_value: Number($('faRemain').value || 0),
    department_id: deptIdByName(deptName),
    department_name: deptName,
    custodian: $('faCustodian').value.trim(),
    location: $('faLocation').value.trim(),
    status: $('faStatus').value,
    note: $('faNote').value.trim()
  };
}

async function saveAsset(){
  const payload = assetPayload();

  if(!payload.asset_code || !payload.asset_name){
    showToast('Nhập mã và tên tài sản', 'warn', 'Thiếu thông tin');
    return;
  }

  if(!editingAssetId && assets.some(a => norm(assetCode(a)) === norm(payload.asset_code))){
    showToast('Mã tài sản đã tồn tại', 'warn', 'Trùng mã');
    return;
  }

  const ok = await saveRemote(
    editingAssetId ? '/api/assets/' + editingAssetId : '/api/assets',
    payload,
    editingAssetId ? 'PUT' : 'POST',
    false
  );

  if(!ok) return;

  closeModal('assetModal');
  editingAssetId = null;

  await loadRemote();
  renderAll();

  showToast('Đã lưu tài sản', 'success', 'Thành công');
}

async function deleteAsset(id){
  const okConfirm = await showConfirm('Bạn có chắc muốn xóa tài sản này?', 'Xóa tài sản');
  if(!okConfirm) return;

  const ok = await saveRemote('/api/assets/' + id, null, 'DELETE', false);
  if(!ok) return;

  await loadRemote();
  renderAll();

  showToast('Đã xóa tài sản', 'success', 'Thành công');
}

/* =======================
   TOOLS
======================= */
function renderTools(){
  const q = $('toolSearch')?.value || '';
  const cat = $('filterCategory')?.value || '';
  const dept = $('filterDept')?.value || '';
  const st = $('filterStatus')?.value || '';

  const rows = tools
    .filter(a => matchTool(a, q))
    .filter(a => !cat || norm(toolCategory(a)) === norm(cat))
    .filter(a => !dept || norm(toolDept(a)) === norm(dept))
    .filter(a => !st || a.status === st);

  lastToolRows = rows;

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / toolPageSize));

  if(toolPage > totalPages) toolPage = totalPages;

  const pageRows = rows.slice(
    (toolPage - 1) * toolPageSize,
    (toolPage - 1) * toolPageSize + toolPageSize
  );

  $('pagerInfo').textContent = `${total} dòng`;
  $('pagerPage').textContent = `Trang ${toolPage}/${totalPages}`;

  $('toolRows').innerHTML = pageRows.map(a => `
    <tr>
      <td><b>${toolCode(a)}</b></td>
      <td>${categoryBadge(toolCategory(a))}</td>
      <td>${toolName(a)}<div style="font-size:12px;color:var(--muted)">${a.specification || ''}</div></td>
      <td>${a.unit || ''}</td>
      <td>${toolQty(a)}</td>
      <td>${money(toolCost(a))}</td>
      <td>${toolDept(a) || '-'}</td>
      <td>${a.custodian || '-'}</td>
      <td>${a.location || '-'}</td>
      <td><span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></td>
      <td>
        <button class="btn ghost" onclick="editTool(${a.id})">Sửa</button>
        <button class="btn danger" onclick="deleteTool(${a.id})">Xóa</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="11">Không có dữ liệu</td></tr>';
}

function prevPage(){
  if(toolPage > 1){
    toolPage--;
    renderTools();
  }
}

function nextPage(){
  const totalPages = Math.max(1, Math.ceil(lastToolRows.length / toolPageSize));
  if(toolPage < totalPages){
    toolPage++;
    renderTools();
  }
}

function changePageSize(){
  toolPageSize = Number($('pageSize').value || 25);
  toolPage = 1;
  renderTools();
}

function openToolModal(){
  editingToolId = null;
  $('toolModalTitle').textContent = 'Thêm CCDC';

  ['fCode','fName','fSpec','fSerial','fCustodian','fLocation','fNote'].forEach(id => {
    $(id).value = '';
  });

  $('fUnit').value = 'Cái';
  $('fQty').value = 1;
  $('fCost').value = 0;
  $('fRemain').value = 0;
  $('fPurchase').value = '';
  $('fStatus').value = 'stock';

  $('toolModal').classList.add('show');
}

function editTool(id){
  const a = tools.find(x => x.id === id);
  if(!a) return;

  editingToolId = id;
  $('toolModalTitle').textContent = 'Sửa CCDC';

  $('fCode').value = toolCode(a);
  $('fCategory').value = toolCategory(a);
  $('fName').value = toolName(a);
  $('fSpec').value = a.specification || '';
  $('fSerial').value = a.serial_number || '';
  $('fUnit').value = a.unit || 'Cái';
  $('fQty').value = toolQty(a);
  $('fPurchase').value = a.purchase_date || '';
  $('fCost').value = toolCost(a);
  $('fRemain').value = Number(a.remaining_value || 0);
  $('fDept').value = toolDept(a);
  $('fCustodian').value = a.custodian || '';
  $('fLocation').value = a.location || '';
  $('fStatus').value = a.status || 'stock';
  $('fNote').value = a.note || '';

  $('toolModal').classList.add('show');
}

function toolPayload(){
  const deptName = $('fDept').value;

  return {
    tool_code: $('fCode').value.trim(),
    category: $('fCategory').value,
    tool_name: $('fName').value.trim(),
    specification: $('fSpec').value.trim(),
    serial_number: $('fSerial').value.trim(),
    unit: $('fUnit').value.trim() || 'Cái',
    quantity: Number($('fQty').value || 0),
    purchase_date: $('fPurchase').value,
    original_cost: Number($('fCost').value || 0),
    remaining_value: Number($('fRemain').value || 0),
    department_id: deptIdByName(deptName),
    department_name: deptName,
    custodian: $('fCustodian').value.trim(),
    location: $('fLocation').value.trim(),
    status: $('fStatus').value,
    note: $('fNote').value.trim()
  };
}

async function saveTool(){
  const payload = toolPayload();

  if(!payload.tool_code || !payload.tool_name){
    showToast('Nhập mã và tên CCDC', 'warn', 'Thiếu thông tin');
    return;
  }

  if(!editingToolId && tools.some(a => norm(toolCode(a)) === norm(payload.tool_code))){
    showToast('Mã CCDC đã tồn tại', 'warn', 'Trùng mã');
    return;
  }

  const ok = await saveRemote(
    editingToolId ? '/api/tools/' + editingToolId : '/api/tools',
    payload,
    editingToolId ? 'PUT' : 'POST',
    false
  );

  if(!ok) return;

  closeModal('toolModal');
  editingToolId = null;

  await loadRemote();
  renderAll();

  showToast('Đã lưu CCDC', 'success', 'Thành công');
}

async function deleteTool(id){
  const okConfirm = await showConfirm('Bạn có chắc muốn xóa CCDC này?', 'Xóa CCDC');
  if(!okConfirm) return;

  const ok = await saveRemote('/api/tools/' + id, null, 'DELETE', false);
  if(!ok) return;

  await loadRemote();
  renderAll();

  showToast('Đã xóa CCDC', 'success', 'Thành công');
}

function closeModal(id){
  $(id).classList.remove('show');
}

/* =======================
   ASSIGNMENTS / INVENTORY
======================= */
function refreshToolOptions(){
  const keys = {
    a: norm($('aToolSearch')?.value || ''),
    i: norm($('iToolSearch')?.value || '')
  };

  const match = (x, k) => {
    if(!k) return true;

    return norm([
      x.code,
      x.name,
      x.category,
      x.dept,
      x.custodian,
      x.location,
      x.item_type
    ].join(' ')).includes(k);
  };

  fillSelect(
    'aTool',
    getAllItems().filter(x => match(x, keys.a)),
    x => `${x.item_type}|${x.id}`,
    x => x.label
  );

  fillSelect(
    'iTool',
    getAllItems().filter(x => match(x, keys.i)),
    x => `${x.item_type}|${x.id}`,
    x => x.label
  );
}

function openAssignModal(){
  editingAssignmentId = null;

  $('aDate').value = todayISO();
  $('aType').value = 'Cấp phát';
  $('aPerson').value = '';
  $('aQty').value = 1;
  $('aNote').value = '';

  refreshToolOptions();

  $('assignModal').classList.add('show');
}

function assignmentPayload(){
  const item = findItemByValue($('aTool').value);
  const deptName = $('aDept').value;

  return {
    item_type: item ? item.item_type : '',
    item_id: item ? item.id : null,
    item_code: item ? item.code : '',
    item_name: item ? item.name : '',

    tool_id: item && item.item_type === 'tool' ? item.id : null,
    tool_code: item ? item.code : '',

    assigned_date: $('aDate').value,
    type: $('aType').value,
    person: $('aPerson').value.trim(),
    department_id: deptIdByName(deptName),
    department_name: deptName,
    quantity: Number($('aQty').value || 1),
    note: $('aNote').value.trim()
  };
}

async function saveAssignment(){
  const p = assignmentPayload();

  if(!p.item_id){
    showToast('Chọn tài sản / CCDC', 'warn', 'Thiếu dữ liệu');
    return;
  }

  if(!p.person && p.type !== 'Thu hồi'){
    showToast('Nhập người nhận / quản lý', 'warn', 'Thiếu thông tin');
    return;
  }

  const ok = await saveRemote(
    editingAssignmentId ? '/api/assignments/' + editingAssignmentId : '/api/assignments',
    p,
    editingAssignmentId ? 'PUT' : 'POST',
    false
  );

  if(!ok) return;

  closeModal('assignModal');
  editingAssignmentId = null;

  await loadRemote();
  renderAll();

  showToast('Đã lưu phiếu', 'success', 'Thành công');
}

function renderAssignments(){
  $('assignRows').innerHTML = assignments.map(a => {
    const type = a.item_type || (a.tool_id ? 'tool' : 'tool');
    const code = a.item_code || a.tool_code || '';
    const name = a.item_name || '';

    return `
      <tr>
        <td>${a.assigned_date || ''}</td>
        <td>
          <b>${code}</b>
          <div style="font-size:12px;color:var(--muted)">
            ${itemTypeLabel(type)}${name ? ' - ' + name : ''}
          </div>
        </td>
        <td>${a.type || ''}</td>
        <td>${a.person || ''}</td>
        <td>${a.department_name || ''}</td>
        <td>${a.quantity || 1}</td>
        <td>${a.note || ''}</td>
        <td><button class="btn danger" onclick="deleteAssignment(${a.id})">Xóa</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8">Chưa có phiếu</td></tr>';
}

async function deleteAssignment(id){
  const okConfirm = await showConfirm('Xóa phiếu này?', 'Xóa phiếu');
  if(!okConfirm) return;

  const ok = await saveRemote('/api/assignments/' + id, null, 'DELETE', false);
  if(!ok) return;

  await loadRemote();
  renderAll();
}

function openInventoryModal(){
  editingInventoryId = null;

  $('iYear').value = String(new Date().getFullYear());
  $('iDate').value = todayISO();
  $('iBookQty').value = 0;
  $('iActualQty').value = 0;
  $('iCondition').value = 'Tốt';
  $('iAction').value = 'Không xử lý';
  $('iNote').value = '';

  refreshToolOptions();
  syncBookQty();

  $('inventoryModal').classList.add('show');
}

function syncBookQty(){
  const item = findItemByValue($('iTool')?.value);

  if(item){
    $('iBookQty').value = item.qty;
    $('iActualQty').value = item.qty;
  }
}

function inventoryPayload(){
  const item = findItemByValue($('iTool').value);
  const book = Number($('iBookQty').value || 0);
  const actual = Number($('iActualQty').value || 0);

  return {
    item_type: item ? item.item_type : '',
    item_id: item ? item.id : null,
    item_code: item ? item.code : '',
    item_name: item ? item.name : '',

    tool_id: item && item.item_type === 'tool' ? item.id : null,
    tool_code: item ? item.code : '',

    inventory_year: Number($('iYear').value),
    inventory_date: $('iDate').value,
    book_qty: book,
    actual_qty: actual,
    difference_qty: actual - book,
    condition: $('iCondition').value,
    action: $('iAction').value,
    note: $('iNote').value.trim()
  };
}

async function saveInventory(){
  const p = inventoryPayload();

  if(!p.item_id){
    showToast('Chọn tài sản / CCDC kiểm kê', 'warn', 'Thiếu dữ liệu');
    return;
  }

  const ok = await saveRemote(
    editingInventoryId ? '/api/inventories/' + editingInventoryId : '/api/inventories',
    p,
    editingInventoryId ? 'PUT' : 'POST',
    false
  );

  if(!ok) return;

  closeModal('inventoryModal');
  editingInventoryId = null;

  await loadRemote();
  renderAll();

  showToast('Đã lưu kiểm kê', 'success', 'Thành công');
}

function renderInventories(){
  $('inventoryRows').innerHTML = inventories.map(i => {
    const type = i.item_type || (i.tool_id ? 'tool' : 'tool');
    const code = i.item_code || i.tool_code || '';
    const name = i.item_name || '';

    return `
      <tr>
        <td>${i.inventory_year || ''}</td>
        <td>${i.inventory_date || ''}</td>
        <td>
          <b>${code}</b>
          <div style="font-size:12px;color:var(--muted)">
            ${itemTypeLabel(type)}${name ? ' - ' + name : ''}
          </div>
        </td>
        <td>${i.book_qty || 0}</td>
        <td>${i.actual_qty || 0}</td>
        <td><b>${i.difference_qty || 0}</b></td>
        <td>${i.condition || ''}</td>
        <td>${i.action || ''}</td>
        <td><button class="btn danger" onclick="deleteInventory(${i.id})">Xóa</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9">Chưa có dữ liệu kiểm kê</td></tr>';
}

async function deleteInventory(id){
  const okConfirm = await showConfirm('Xóa dòng kiểm kê này?', 'Xóa kiểm kê');
  if(!okConfirm) return;

  const ok = await saveRemote('/api/inventories/' + id, null, 'DELETE', false);
  if(!ok) return;

  await loadRemote();
  renderAll();
}

/* =======================
   VIEW / REPORT
======================= */
function setView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');

  document.querySelectorAll('.nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === id);
  });

  const map = {
    dashboard:['Tổng quan CCDC','Theo dõi tổng quan tài sản, công cụ dụng cụ và tình trạng sử dụng.'],
    assets:['Danh sách tài sản','Quản lý tài sản cố định / tài sản kế toán.'],
    tools:['Danh sách CCDC','Quản lý chi tiết từng công cụ, dụng cụ.'],
    departments:['Bộ phận sử dụng','Cơ cấu phòng ban để gắn tài sản và CCDC.'],
    assignments:['Cấp phát / Thu hồi','Lịch sử bàn giao tài sản, công cụ, dụng cụ.'],
    inventories:['Kiểm kê','Ghi nhận kiểm kê tài sản, CCDC theo năm.'],
    reports:['Báo cáo','Báo cáo kiểm kê và xuất dữ liệu.'],
    settings:['Cấu hình API','Kết nối Cloudflare Worker + D1.']
  };

  $('pageTitle').textContent = map[id][0];
  $('pageSub').textContent = map[id][1];

  toggleMenu(false);
}

function toggleMenu(show){
  $('sidebar').classList.toggle('open', show);
  $('drawerMask').classList.toggle('show', show);
}

function renderDept(){
  $('deptGrid').innerHTML = departments.map(d => {
    const assetList = assets.filter(a => norm(assetDept(a)) === norm(d.name));
    const toolList = tools.filter(a => norm(toolDept(a)) === norm(d.name));

    const value =
      assetList.reduce((s,a) => s + assetCost(a), 0) +
      toolList.reduce((s,a) => s + toolCost(a), 0);

    return `
      <div class="dept">
        <h4>${d.name}</h4>
        <p>Mã: ${d.code}</p>
        <p>${d.children.length ? 'Nhóm: ' + d.children.join(', ') : 'Không có nhóm con'}</p>
        <div class="count">${assetList.length + toolList.length}</div>
        <p>${assetList.length} tài sản, ${toolList.length} CCDC - ${money(value)}</p>
      </div>
    `;
  }).join('');
}

function renderReportByDept(){
  const rows = departments.map(d => {
    const assetList = assets.filter(a => norm(assetDept(a)) === norm(d.name));
    const toolList = tools.filter(a => norm(toolDept(a)) === norm(d.name));
    const list = [...assetList, ...toolList];

    return {
      name: d.name,
      total: list.length,
      use: list.filter(a => a.status === 'use').length,
      stock: list.filter(a => a.status === 'stock').length,
      issue: list.filter(isIssueTool).length,
      value: assetList.reduce((s,a) => s + assetCost(a), 0) + toolList.reduce((s,a) => s + toolCost(a), 0)
    };
  }).filter(r => r.total > 0);

  $('reportDeptRows').innerHTML = rows.map(r => `
    <tr>
      <td><b>${r.name}</b></td>
      <td>${r.total}</td>
      <td>${r.use}</td>
      <td>${r.stock}</td>
      <td>${r.issue}</td>
      <td>${money(r.value)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">Chưa có dữ liệu.</td></tr>';
}

function showIssueTools(){
  setView('tools');
  $('filterStatus').value = '';
  $('toolSearch').value = '';
  lastToolRows = tools.filter(isIssueTool);
  renderTools();
}

function saveApiBase(){
  CURRENT_API_BASE = $('apiBaseInput').value.trim().replace(/\/$/,'');
  localStorage.setItem('CCDC_API_BASE', CURRENT_API_BASE);
  showToast('Đã lưu API_BASE', 'success', 'Thành công');
}

async function loginAdmin(){
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value.trim();

  if(!username || !password){
    showToast('Nhập tài khoản và mật khẩu', 'warn', 'Thiếu thông tin');
    return;
  }

  if(!CURRENT_API_BASE){
    CCDC_TOKEN = 'local';
    localStorage.setItem('CCDC_TOKEN', CCDC_TOKEN);
    $('loginScreen').style.display = 'none';
    showToast('Đăng nhập local thành công', 'success', 'Xin chào');
    return;
  }

  try{
    const res = await fetch(CURRENT_API_BASE + '/api/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username, password})
    });

    const data = await res.json();

    if(!res.ok || !data.success){
      showToast(data.error || 'Đăng nhập thất bại', 'error', 'Lỗi đăng nhập');
      return;
    }

    CCDC_TOKEN = data.token;
    localStorage.setItem('CCDC_TOKEN', CCDC_TOKEN);

    $('loginScreen').style.display = 'none';

    await loadRemote();
    renderAll();

    showToast('Đăng nhập thành công', 'success', 'Xin chào');

  }catch(e){
    showToast(e.message, 'error', 'Không kết nối được API');
  }
}

function logoutAdmin(){
  localStorage.removeItem('CCDC_TOKEN');
  CCDC_TOKEN = '';
  location.reload();
}

function checkLogin(){
  $('loginScreen').style.display = CCDC_TOKEN ? 'none' : 'flex';
}

/* =======================
   EXCEL
======================= */
function exportExcel(){
  if(!assets.length && !tools.length){
    showToast('Không có dữ liệu để xuất', 'warn', 'Xuất Excel');
    return;
  }

  const wb = XLSX.utils.book_new();
  const now = new Date();
  const dateText = now.toLocaleDateString('vi-VN');

  function sheet(title, headers, rows){
    const data = [
      ['CÔNG TY TNHH MAY XK VIỆT HỒNG'],
      [title],
      ['Ngày xuất: ' + dateText],
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!merges'] = [
      {s:{r:0,c:0}, e:{r:0,c:headers.length-1}},
      {s:{r:1,c:0}, e:{r:1,c:headers.length-1}},
      {s:{r:2,c:0}, e:{r:2,c:headers.length-1}}
    ];

    ws['!cols'] = headers.map(h => ({
      wch: Math.min(Math.max(String(h).length + 6, 14), 40)
    }));

    return ws;
  }

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      'DANH SÁCH TÀI SẢN',
      ['STT','Mã tài sản','Nhóm','Tên tài sản','Quy cách','Serial','ĐVT','SL','Ngày mua','Nguyên giá','Giá trị còn lại','Bộ phận','Người quản lý','Vị trí','Trạng thái','Ghi chú'],
      assets.map((a,i) => [
        i + 1, assetCode(a), assetCategory(a), assetName(a),
        a.specification || '', a.serial_number || '', a.unit || '',
        assetQty(a), a.purchase_date || '', assetCost(a),
        a.remaining_value || 0, assetDept(a), a.custodian || '',
        a.location || '', statusLabel(a.status), a.note || ''
      ])
    ),
    'Tai_san'
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      'DANH SÁCH CÔNG CỤ DỤNG CỤ',
      ['STT','Mã CCDC','Nhóm','Tên CCDC','Quy cách','Serial','ĐVT','SL','Ngày mua','Nguyên giá','Giá trị còn lại','Bộ phận','Người quản lý','Vị trí','Trạng thái','Ghi chú'],
      tools.map((a,i) => [
        i + 1, toolCode(a), toolCategory(a), toolName(a),
        a.specification || '', a.serial_number || '', a.unit || '',
        toolQty(a), a.purchase_date || '', toolCost(a),
        a.remaining_value || 0, toolDept(a), a.custodian || '',
        a.location || '', statusLabel(a.status), a.note || ''
      ])
    ),
    'CCDC'
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      'LỊCH SỬ CẤP PHÁT THU HỒI',
      ['STT','Ngày','Loại','Mã','Tên tài sản / CCDC','Loại phiếu','Người nhận/trả','Bộ phận','SL','Ghi chú'],
      assignments.map((a,i) => [
        i + 1,
        a.assigned_date || '',
        itemTypeLabel(a.item_type || 'tool'),
        a.item_code || a.tool_code || '',
        a.item_name || '',
        a.type || '',
        a.person || '',
        a.department_name || '',
        a.quantity || 1,
        a.note || ''
      ])
    ),
    'Cap_phat_thu_hoi'
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      'BIÊN BẢN KIỂM KÊ',
      ['STT','Năm','Ngày kiểm kê','Loại','Mã','Tên tài sản / CCDC','SL sổ sách','SL thực tế','Chênh lệch','Tình trạng','Kiến nghị','Ghi chú'],
      inventories.map((a,i) => [
        i + 1,
        a.inventory_year || '',
        a.inventory_date || '',
        itemTypeLabel(a.item_type || 'tool'),
        a.item_code || a.tool_code || '',
        a.item_name || '',
        a.book_qty || 0,
        a.actual_qty || 0,
        a.difference_qty || 0,
        a.condition || '',
        a.action || '',
        a.note || ''
      ])
    ),
    'Kiem_ke'
  );

  XLSX.writeFile(
    wb,
    'bao_cao_tai_san_ccdc_' +
    now.getFullYear() + '-' +
    String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0') +
    '.xlsx'
  );

  showToast('Đã xuất báo cáo Excel', 'success', 'Thành công');
}

function readCell(row, names, def=''){
  for(const name of names){
    if(row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== ''){
      return row[name];
    }
  }
  return def;
}

function normalizeImportStatus(value){
  const key = norm(String(value || '').trim());

  const map = {
    'dang dung':'use',
    'dang su dung':'use',
    'trong kho':'stock',
    'hong':'broken',
    'mat':'lost',
    'mat / that lac':'lost',
    'cho thanh ly':'disposal',
    'da thanh ly':'disposed',
    'use':'use',
    'stock':'stock',
    'broken':'broken',
    'lost':'lost',
    'disposal':'disposal',
    'disposed':'disposed'
  };

  return map[key] || 'stock';
}

function excelDateToISO(value){
  if(!value) return '';

  if(typeof value === 'number'){
    const d = XLSX.SSF.parse_date_code(value);
    if(!d) return '';

    return [
      d.y,
      String(d.m).padStart(2,'0'),
      String(d.d).padStart(2,'0')
    ].join('-');
  }

  const s = String(value).trim();

  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

  if(m){
    return [
      m[3],
      String(m[2]).padStart(2,'0'),
      String(m[1]).padStart(2,'0')
    ].join('-');
  }

  return s;
}

async function importExcelMulti(event){
  const file = event.target.files[0];

  if(!file) return;

  try{
    showToast('Đang đọc file Excel...', 'info', 'Import');

    const wb = XLSX.read(await file.arrayBuffer(), {
      type:'array'
    });

    let assetOk = 0;
    let assetDup = 0;
    let assetFail = 0;

    let toolOk = 0;
    let toolDup = 0;
    let toolFail = 0;

    const assetCodes = new Set(
      assets.map(a => norm(assetCode(a)))
    );

    const toolCodes = new Set(
      tools.map(a => norm(toolCode(a)))
    );

    /* =========================
       IMPORT SHEET TÀI SẢN
       Sheet name: TaiSan
    ========================= */
    const assetSheet =
      wb.Sheets['TaiSan'] ||
      wb.Sheets['Tài sản'] ||
      wb.Sheets['Tai San'] ||
      wb.Sheets['Assets'];

    if(assetSheet){
      const rows = XLSX.utils.sheet_to_json(assetSheet, {
        defval:'',
        raw:true
      });

      for(const row of rows){
        const code = String(readCell(row, [
          'Mã tài sản',
          'Ma tai san',
          'Mã TS',
          'Ma TS',
          'Asset Code'
        ], '')).trim();

        const name = String(readCell(row, [
          'Tên tài sản',
          'Ten tai san',
          'Tên TS',
          'Ten TS',
          'Asset Name'
        ], '')).trim();

        if(!code || !name){
          assetFail++;
          continue;
        }

        if(assetCodes.has(norm(code))){
          assetDup++;
          continue;
        }

        const dept = String(readCell(row, [
          'Bộ phận',
          'Bo phan',
          'Phòng ban',
          'Phong ban',
          'Department'
        ], '')).trim();

        const payload = {
          asset_code: code,

          category: String(readCell(row, [
            'Nhóm tài sản',
            'Nhom tai san',
            'Nhóm TS',
            'Nhom TS',
            'Loại tài sản',
            'Loai tai san',
            'Category'
          ], 'Tài sản khác')).trim(),

          asset_name: name,

          specification: String(readCell(row, [
            'Quy cách',
            'Quy cach',
            'Model',
            'Mô tả',
            'Mo ta',
            'Specification'
          ], '')).trim(),

          serial_number: String(readCell(row, [
            'Serial',
            'Số serial',
            'So serial',
            'Serial Number'
          ], '')).trim(),

          unit: String(readCell(row, [
            'Đơn vị tính',
            'Don vi tinh',
            'ĐVT',
            'DVT',
            'Unit'
          ], 'Cái')).trim(),

          quantity: Number(readCell(row, [
            'Số lượng',
            'So luong',
            'SL',
            'Quantity'
          ], 1)) || 1,

          purchase_date: excelDateToISO(readCell(row, [
            'Ngày mua',
            'Ngay mua',
            'Ngày ghi tăng',
            'Ngay ghi tang',
            'Purchase Date'
          ], '')),

          original_cost: Number(readCell(row, [
            'Nguyên giá',
            'Nguyen gia',
            'Đơn giá',
            'Don gia',
            'Giá trị',
            'Gia tri',
            'Original Cost'
          ], 0)) || 0,

          remaining_value: Number(readCell(row, [
            'Giá trị còn lại',
            'Gia tri con lai',
            'Remaining Value'
          ], 0)) || 0,

          department_id: deptIdByName(dept),
          department_name: dept,

          custodian: String(readCell(row, [
            'Người quản lý',
            'Nguoi quan ly',
            'Người dùng',
            'Nguoi dung',
            'Người nhận',
            'Nguoi nhan',
            'Custodian'
          ], '')).trim(),

          location: String(readCell(row, [
            'Vị trí',
            'Vi tri',
            'Nơi sử dụng',
            'Noi su dung',
            'Location'
          ], '')).trim(),

          status: normalizeImportStatus(readCell(row, [
            'Trạng thái',
            'Trang thai',
            'Status'
          ], 'stock')),

          note: String(readCell(row, [
            'Ghi chú',
            'Ghi chu',
            'Note'
          ], '')).trim()
        };

        const saved = await saveRemote('/api/assets', payload, 'POST', false);

        if(saved){
          assetCodes.add(norm(code));
          assetOk++;
        }else{
          assetFail++;
        }
      }
    }

    /* =========================
       IMPORT SHEET CCDC
       Sheet name: CCDC
    ========================= */
    const toolSheet =
      wb.Sheets['CCDC'] ||
      wb.Sheets['CongCuDungCu'] ||
      wb.Sheets['Công cụ dụng cụ'] ||
      wb.Sheets['Tools'];

    if(toolSheet){
      const rows = XLSX.utils.sheet_to_json(toolSheet, {
        defval:'',
        raw:true
      });

      for(const row of rows){
        const code = String(readCell(row, [
          'Mã CCDC',
          'Ma CCDC',
          'Mã công cụ dụng cụ',
          'Ma cong cu dung cu',
          'Tool Code'
        ], '')).trim();

        const name = String(readCell(row, [
          'Tên CCDC',
          'Ten CCDC',
          'Tên công cụ dụng cụ',
          'Ten cong cu dung cu',
          'Tool Name'
        ], '')).trim();

        if(!code || !name){
          toolFail++;
          continue;
        }

        if(toolCodes.has(norm(code))){
          toolDup++;
          continue;
        }

        const dept = String(readCell(row, [
          'Bộ phận',
          'Bo phan',
          'Phòng ban',
          'Phong ban',
          'Department'
        ], '')).trim();

        const payload = {
          tool_code: code,

          category: String(readCell(row, [
            'Nhóm CCDC',
            'Nhom CCDC',
            'Nhóm',
            'Nhom',
            'Loại',
            'Loai',
            'Category'
          ], 'Khác')).trim(),

          tool_name: name,

          specification: String(readCell(row, [
            'Quy cách',
            'Quy cach',
            'Model',
            'Mô tả',
            'Mo ta',
            'Specification'
          ], '')).trim(),

          serial_number: String(readCell(row, [
            'Serial',
            'Số serial',
            'So serial',
            'Serial Number'
          ], '')).trim(),

          unit: String(readCell(row, [
            'Đơn vị tính',
            'Don vi tinh',
            'ĐVT',
            'DVT',
            'Unit'
          ], 'Cái')).trim(),

          quantity: Number(readCell(row, [
            'Số lượng',
            'So luong',
            'SL',
            'Quantity'
          ], 1)) || 1,

          purchase_date: excelDateToISO(readCell(row, [
            'Ngày mua',
            'Ngay mua',
            'Ngày ghi tăng',
            'Ngay ghi tang',
            'Purchase Date'
          ], '')),

          original_cost: Number(readCell(row, [
            'Nguyên giá',
            'Nguyen gia',
            'Đơn giá',
            'Don gia',
            'Giá trị',
            'Gia tri',
            'Original Cost'
          ], 0)) || 0,

          remaining_value: Number(readCell(row, [
            'Giá trị còn lại',
            'Gia tri con lai',
            'Remaining Value'
          ], 0)) || 0,

          department_id: deptIdByName(dept),
          department_name: dept,

          custodian: String(readCell(row, [
            'Người quản lý',
            'Nguoi quan ly',
            'Người dùng',
            'Nguoi dung',
            'Người nhận',
            'Nguoi nhan',
            'Custodian'
          ], '')).trim(),

          location: String(readCell(row, [
            'Vị trí',
            'Vi tri',
            'Nơi sử dụng',
            'Noi su dung',
            'Location'
          ], '')).trim(),

          status: normalizeImportStatus(readCell(row, [
            'Trạng thái',
            'Trang thai',
            'Status'
          ], 'stock')),

          note: String(readCell(row, [
            'Ghi chú',
            'Ghi chu',
            'Note'
          ], '')).trim()
        };

        const saved = await saveRemote('/api/tools', payload, 'POST', false);

        if(saved){
          toolCodes.add(norm(code));
          toolOk++;
        }else{
          toolFail++;
        }
      }
    }

    await loadRemote();
    renderAll();

    showToast(
      `Tài sản: ${assetOk} thành công, ${assetDup} trùng, ${assetFail} lỗi | CCDC: ${toolOk} thành công, ${toolDup} trùng, ${toolFail} lỗi`,
      'success',
      'Import hoàn tất'
    );

  }catch(e){
    showToast(e.message, 'error', 'Lỗi import Excel');
  }

  event.target.value = '';
}
/* =======================
   CHARTS
======================= */
let chartCategoryObj = null;
let chartDeptObj = null;
let chartValueObj = null;

function destroyChart(obj){
  if(obj) obj.destroy();
}

function renderCharts(){
  if(typeof Chart === 'undefined') return;
  renderCategoryChart();
  renderDeptChart();
  renderValueChart();
}

function renderCategoryChart(){
  const el = $('chartCategory');
  if(!el) return;

  const map = {};

  getAllItems().forEach(a => {
    map[a.category || 'Khác'] = (map[a.category || 'Khác'] || 0) + 1;
  });

  destroyChart(chartCategoryObj);

  chartCategoryObj = new Chart(el, {
    type:'pie',
    data:{labels:Object.keys(map), datasets:[{data:Object.values(map)}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}
  });
}

function renderDeptChart(){
  const el = $('chartDept');
  if(!el) return;

  const rows = departments.map(d => {
    const count = getAllItems().filter(a => norm(a.dept) === norm(d.name)).length;
    return {name:d.name, count};
  }).filter(x => x.count > 0).sort((a,b) => b.count - a.count).slice(0,10);

  destroyChart(chartDeptObj);

  chartDeptObj = new Chart(el, {
    type:'bar',
    data:{labels:rows.map(x=>x.name), datasets:[{label:'Số lượng', data:rows.map(x=>x.count)}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{precision:0}}}}
  });
}

function renderValueChart(){
  const el = $('chartValue');
  if(!el) return;

  const map = {};
  statuses.forEach(s => map[s.label] = 0);

  getAllItems().forEach(a => {
    const key = statusLabel(a.status);
    map[key] = (map[key] || 0) + a.cost;
  });

  destroyChart(chartValueObj);

  chartValueObj = new Chart(el, {
    type:'bar',
    data:{labels:Object.keys(map), datasets:[{label:'Nguyên giá', data:Object.values(map)}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{y:{beginAtZero:true}}}
  });
}

init();

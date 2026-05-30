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
const categories = ['Bàn ghế','Tủ kệ','Máy móc văn phòng','Thiết bị sản xuất','Dụng cụ đo lường','Dụng cụ vệ sinh','Bảo hộ lao động','Khuôn/mẫu/phụ kiện','Công cụ sửa chữa','Khác'];
const statuses = [
  {value:'use', label:'Đang sử dụng'},
  {value:'stock', label:'Trong kho'},
  {value:'broken', label:'Hỏng'},
  {value:'lost', label:'Mất / thất lạc'},
  {value:'disposal', label:'Chờ thanh lý'},
  {value:'disposed', label:'Đã thanh lý'}
];

let tools = [];
let assignments = [];
let inventories = [];
let editingToolId = null, editingAssignmentId = null, editingInventoryId = null;
let toolPage = 1, toolPageSize = 25, lastToolRows = [];
let confirmResolve = null;
const $ = id => document.getElementById(id);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const todayISO = () => new Date().toISOString().slice(0,10);
const money = n => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const statusLabel = v => (statuses.find(s => s.value === v) || {}).label || v || '';
const statusClass = v => v || 'stock';

function showToast(message, type='success', title='Thông báo'){
  const box = $('toastBox'); if(!box) return;
  const icons = {success:'✅', error:'❌', warn:'⚠️', info:'ℹ️'};
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<div>${icons[type] || 'ℹ️'}</div><div><b>${title}</b><span>${message}</span></div>`;
  box.appendChild(div);
  setTimeout(() => { div.style.opacity='0'; div.style.transform='translateX(18px)'; div.style.transition='.2s'; setTimeout(()=>div.remove(),220); }, 2600);
}
function showConfirm(message, title='Xác nhận'){
  $('confirmTitle').textContent = title; $('confirmMessage').textContent = message; $('confirmModal').classList.add('show');
  return new Promise(resolve => confirmResolve = resolve);
}
function closeConfirm(result){ $('confirmModal').classList.remove('show'); if(confirmResolve){ confirmResolve(result); confirmResolve = null; } }
function fillSelect(id, arr, getVal=x=>x, getText=x=>x, first=''){
  const el = $(id); if(!el) return;
  el.innerHTML = first ? `<option value="">${first}</option>` : '';
  arr.forEach(x => { const op=document.createElement('option'); op.value=getVal(x); op.textContent=getText(x); el.appendChild(op); });
}
function deptIdByName(name){ const d = departments.find(x => norm(x.name) === norm(name)); return d ? d.id : null; }
function deptNameById(id){ const d = departments.find(x => Number(x.id) === Number(id)); return d ? d.name : ''; }
function toolCode(a){ return a.tool_code ?? a.asset_code ?? a.code ?? ''; }
function toolName(a){ return a.tool_name ?? a.asset_name ?? a.name ?? ''; }
function toolCategory(a){ return a.category ?? a.asset_type ?? ''; }
function toolDept(a){ return a.department_name ?? a.department ?? a.dept ?? deptNameById(a.department_id) ?? ''; }
function toolQty(a){ return Number(a.quantity ?? a.qty ?? 0); }
function toolCost(a){ return Number(a.original_cost ?? a.cost ?? 0); }
function categoryBadge(t){ return `<span class="type-badge">${t || '-'}</span>`; }
function matchTool(a,q){
  q = norm(q);
  const text = [toolCode(a),toolName(a),toolCategory(a),a.specification,a.serial_number,a.unit,toolDept(a),a.custodian,a.location,a.status,a.note].join(' ');
  return !q || norm(text).includes(q);
}
function isIssueTool(a){ return ['broken','lost','disposal','disposed'].includes(a.status); }

function init(){
  checkLogin();
  $('todayText').textContent = new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
  if($('apiBaseInput')) $('apiBaseInput').value = CURRENT_API_BASE;
  fillSelect('dashStatus', statuses, s=>s.value, s=>s.label, 'Tất cả trạng thái');
  fillSelect('filterStatus', statuses, s=>s.value, s=>s.label, 'Tất cả trạng thái');
  fillSelect('filterCategory', categories, x=>x, x=>x, 'Tất cả nhóm');
  fillSelect('filterDept', departments, d=>d.name, d=>d.name, 'Tất cả bộ phận');
  fillSelect('fCategory', categories); fillSelect('fDept', departments, d=>d.name, d=>d.name); fillSelect('fStatus', statuses, s=>s.value, s=>s.label);
  fillSelect('aDept', departments, d=>d.name, d=>d.name);
  fillYearSelect();
  document.querySelectorAll('.nav button').forEach(btn => btn.onclick = () => setView(btn.dataset.view));
  loadRemote().finally(renderAll);
}
function fillYearSelect(){
  const y = new Date().getFullYear(); const years=[];
  for(let i=2026;i<=y+1;i++) years.push(i);
  fillSelect('iYear', years);
}
async function loadRemote(){
  if(!CURRENT_API_BASE){ loadLocal(); return; }
  try{
    const headers = {Authorization:'Bearer ' + CCDC_TOKEN};
    const [t,a,i] = await Promise.all([
      fetch(CURRENT_API_BASE + '/api/tools', {headers}),
      fetch(CURRENT_API_BASE + '/api/assignments', {headers}),
      fetch(CURRENT_API_BASE + '/api/inventories', {headers})
    ]);
    if(t.status === 401){ localStorage.removeItem('CCDC_TOKEN'); CCDC_TOKEN=''; $('loginScreen').style.display='flex'; return; }
    if(t.ok){ const d=await t.json(); tools=Array.isArray(d)?d:(d.tools||[]); }
    if(a.ok){ const d=await a.json(); assignments=Array.isArray(d)?d:(d.assignments||[]); }
    if(i.ok){ const d=await i.json(); inventories=Array.isArray(d)?d:(d.inventories||[]); }
  }catch(e){ loadLocal(); showToast('Không kết nối được API, đang dùng dữ liệu local', 'warn', 'API'); }
}
function loadLocal(){
  tools = JSON.parse(localStorage.getItem('CCDC_TOOLS') || '[]');
  assignments = JSON.parse(localStorage.getItem('CCDC_ASSIGNMENTS') || '[]');
  inventories = JSON.parse(localStorage.getItem('CCDC_INVENTORIES') || '[]');
}
function saveLocal(){
  localStorage.setItem('CCDC_TOOLS', JSON.stringify(tools));
  localStorage.setItem('CCDC_ASSIGNMENTS', JSON.stringify(assignments));
  localStorage.setItem('CCDC_INVENTORIES', JSON.stringify(inventories));
}
async function saveRemote(path, payload, method, reload=true){
  if(!CURRENT_API_BASE){ saveLocal(); return true; }
  try{
    const res = await fetch(CURRENT_API_BASE + path, {method, headers:{'Content-Type':'application/json', Authorization:'Bearer ' + CCDC_TOKEN}, body: payload ? JSON.stringify(payload) : undefined});
    const data = await res.json().catch(()=>({success:res.ok}));
    if(!res.ok || data.success === false){ showToast(data.error || 'Không rõ lỗi', 'error', 'Lỗi lưu D1'); return false; }
    if(reload){ await loadRemote(); renderAll(); }
    return true;
  }catch(e){ showToast(e.message, 'error', 'Không kết nối được API'); return false; }
}
function renderAll(){ renderKpi(); renderDashboardTable(); renderWarnings(); renderTools(); renderDept(); renderAssignments(); renderInventories(); refreshToolOptions(); renderCharts(); }
function renderKpi(){
  $('kpiTotal').textContent = tools.length;
  $('kpiUse').textContent = tools.filter(a => a.status === 'use').length;
  $('kpiStock').textContent = tools.filter(a => a.status === 'stock').length;
  $('kpiDiff').textContent = inventories.filter(x => Number(x.difference_qty || 0) !== 0 || ['Hỏng','Mất','Thiếu','Chờ thanh lý'].includes(x.condition)).length;
  $('toolCountText').textContent = tools.length + ' CCDC';
}
function renderWarnings(){
  const totalCost = tools.reduce((s,a)=>s+toolCost(a),0);
  const issue = tools.filter(isIssueTool).length;
  const noDept = tools.filter(a => !toolDept(a)).length;
  const diff = inventories.filter(x => Number(x.difference_qty || 0) !== 0).length;
  $('warningStats').innerHTML = `
    <div class="stat-row"><b>💰 Tổng nguyên giá</b><span>${money(totalCost)}</span></div>
    <div class="stat-row stat-danger"><b>⛔ Hỏng / mất / thanh lý</b><span>${issue}</span></div>
    <div class="stat-row stat-warn"><b>⚠️ Chưa gán bộ phận</b><span>${noDept}</span></div>
    <div class="stat-row stat-warn"><b>📌 Có chênh lệch kiểm kê</b><span>${diff}</span></div>`;
}
function renderDashboardTable(){
  const q = $('dashSearch')?.value || '', st = $('dashStatus')?.value || '';
  const rows = tools.filter(a => matchTool(a,q)).filter(a => !st || a.status === st).slice(0,10);
  $('dashRows').innerHTML = rows.map(a => `<tr><td><b>${toolCode(a)}</b></td><td>${categoryBadge(toolCategory(a))}</td><td>${toolName(a)}</td><td>${toolDept(a)||'-'}</td><td>${a.custodian||'-'}</td><td>${toolQty(a)}</td><td><span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></td></tr>`).join('') || '<tr><td colspan="7">Không có dữ liệu</td></tr>';
}
function renderTools(){
  const q=$('toolSearch')?.value||'', cat=$('filterCategory')?.value||'', dept=$('filterDept')?.value||'', st=$('filterStatus')?.value||'';
  const rows = tools.filter(a=>matchTool(a,q)).filter(a=>!cat||norm(toolCategory(a))===norm(cat)).filter(a=>!dept||norm(toolDept(a))===norm(dept)).filter(a=>!st||a.status===st);
  lastToolRows = rows; const total=rows.length, totalPages=Math.max(1,Math.ceil(total/toolPageSize)); if(toolPage>totalPages) toolPage=totalPages;
  const pageRows = rows.slice((toolPage-1)*toolPageSize, (toolPage-1)*toolPageSize+toolPageSize);
  $('pagerInfo').textContent = `${total} dòng`; $('pagerPage').textContent = `Trang ${toolPage}/${totalPages}`;
  $('toolRows').innerHTML = pageRows.map(a => `<tr><td><b>${toolCode(a)}</b></td><td>${categoryBadge(toolCategory(a))}</td><td>${toolName(a)}<div style="font-size:12px;color:var(--muted)">${a.specification||''}</div></td><td>${a.unit||''}</td><td>${toolQty(a)}</td><td>${money(toolCost(a))}</td><td>${toolDept(a)||'-'}</td><td>${a.custodian||'-'}</td><td>${a.location||'-'}</td><td><span class="status ${statusClass(a.status)}">${statusLabel(a.status)}</span></td><td><button class="btn ghost" onclick="editTool(${a.id})">Sửa</button><button class="btn danger" onclick="deleteTool(${a.id})">Xóa</button></td></tr>`).join('') || '<tr><td colspan="11">Không có dữ liệu</td></tr>';
}
function prevPage(){ if(toolPage>1){ toolPage--; renderTools(); } }
function nextPage(){ const totalPages=Math.max(1,Math.ceil(lastToolRows.length/toolPageSize)); if(toolPage<totalPages){ toolPage++; renderTools(); } }
function changePageSize(){ toolPageSize=Number($('pageSize').value||25); toolPage=1; renderTools(); }
function renderDept(){
  $('deptGrid').innerHTML = departments.map(d => { const list=tools.filter(a=>norm(toolDept(a))===norm(d.name)); const value=list.reduce((s,a)=>s+toolCost(a),0); return `<div class="dept"><h4>${d.name}</h4><p>Mã: ${d.code}</p><p>${d.children.length?'Nhóm: '+d.children.join(', '):'Không có nhóm con'}</p><div class="count">${list.length}</div><p>CCDC - ${money(value)}</p></div>`; }).join('');
}
function openToolModal(){ editingToolId=null; $('toolModalTitle').textContent='Thêm CCDC'; ['fCode','fName','fSpec','fSerial','fCustodian','fLocation','fNote'].forEach(id=>$(id).value=''); $('fUnit').value='Cái'; $('fQty').value=1; $('fCost').value=0; $('fRemain').value=0; $('fPurchase').value=''; $('fStatus').value='stock'; $('toolModal').classList.add('show'); }
function editTool(id){ const a=tools.find(x=>x.id===id); if(!a) return; editingToolId=id; $('toolModalTitle').textContent='Sửa CCDC'; $('fCode').value=toolCode(a); $('fCategory').value=toolCategory(a); $('fName').value=toolName(a); $('fSpec').value=a.specification||''; $('fSerial').value=a.serial_number||''; $('fUnit').value=a.unit||'Cái'; $('fQty').value=toolQty(a); $('fPurchase').value=a.purchase_date||''; $('fCost').value=toolCost(a); $('fRemain').value=Number(a.remaining_value||0); $('fDept').value=toolDept(a); $('fCustodian').value=a.custodian||''; $('fLocation').value=a.location||''; $('fStatus').value=a.status||'stock'; $('fNote').value=a.note||''; $('toolModal').classList.add('show'); }
function toolPayload(){ const deptName=$('fDept').value; return {tool_code:$('fCode').value.trim(),category:$('fCategory').value,tool_name:$('fName').value.trim(),specification:$('fSpec').value.trim(),serial_number:$('fSerial').value.trim(),unit:$('fUnit').value.trim()||'Cái',quantity:Number($('fQty').value||0),purchase_date:$('fPurchase').value,original_cost:Number($('fCost').value||0),remaining_value:Number($('fRemain').value||0),department_id:deptIdByName(deptName),department_name:deptName,custodian:$('fCustodian').value.trim(),location:$('fLocation').value.trim(),status:$('fStatus').value,note:$('fNote').value.trim()}; }
async function saveTool(){ const payload=toolPayload(); if(!payload.tool_code||!payload.tool_name){ showToast('Nhập mã và tên CCDC','warn','Thiếu thông tin'); return; } if(!editingToolId && tools.some(a=>norm(toolCode(a))===norm(payload.tool_code))){ showToast('Mã CCDC đã tồn tại','warn','Trùng mã'); return; } const localItem={id:editingToolId||Date.now(),...payload}; if(editingToolId) tools=tools.map(a=>a.id===editingToolId?localItem:a); else tools.unshift(localItem); closeModal('toolModal'); renderAll(); await saveRemote(editingToolId?'/api/tools/'+editingToolId:'/api/tools', payload, editingToolId?'PUT':'POST'); showToast(editingToolId?'Đã cập nhật CCDC':'Đã thêm CCDC','success','Thành công'); editingToolId=null; }
async function deleteTool(id){ if(!await showConfirm('Bạn có chắc muốn xóa CCDC này?','Xóa CCDC')) return; tools=tools.filter(a=>a.id!==id); renderAll(); await saveRemote('/api/tools/'+id,null,'DELETE'); showToast('Đã xóa CCDC','success','Thành công'); }
function closeModal(id){ $(id).classList.remove('show'); }
function refreshToolOptions(){
  const keys = {a:norm($('aToolSearch')?.value||''), i:norm($('iToolSearch')?.value||'')};
  const label = a => `${toolCode(a)} - ${toolName(a)} - ${toolDept(a)||'Chưa gán'}`;
  const match = (a,k) => !k || norm([toolCode(a),toolName(a),toolDept(a),a.custodian,a.location].join(' ')).includes(k);
  fillSelect('aTool', tools.filter(a=>match(a,keys.a)), a=>toolCode(a), label);
  fillSelect('iTool', tools.filter(a=>match(a,keys.i)), a=>toolCode(a), label);
}
function openAssignModal(){ editingAssignmentId=null; $('aDate').value=todayISO(); $('aType').value='Cấp phát'; $('aPerson').value=''; $('aQty').value=1; $('aNote').value=''; refreshToolOptions(); $('assignModal').classList.add('show'); }
function assignmentPayload(){ const code=$('aTool').value; const t=tools.find(a=>toolCode(a)===code); const deptName=$('aDept').value; return {tool_id:t?t.id:null,tool_code:code,assigned_date:$('aDate').value,type:$('aType').value,person:$('aPerson').value.trim(),department_id:deptIdByName(deptName),department_name:deptName,quantity:Number($('aQty').value||1),note:$('aNote').value.trim()}; }
async function saveAssignment(){ const p=assignmentPayload(); if(!p.tool_id){ showToast('Chọn CCDC','warn','Thiếu CCDC'); return; } if(!p.person && p.type!=='Thu hồi'){ showToast('Nhập người nhận / quản lý','warn','Thiếu thông tin'); return; } const item={id:editingAssignmentId||Date.now(),...p}; if(editingAssignmentId) assignments=assignments.map(x=>x.id===editingAssignmentId?item:x); else assignments.unshift(item); closeModal('assignModal'); renderAll(); await saveRemote(editingAssignmentId?'/api/assignments/'+editingAssignmentId:'/api/assignments', p, editingAssignmentId?'PUT':'POST'); showToast('Đã lưu phiếu','success','Thành công'); editingAssignmentId=null; }
function renderAssignments(){ $('assignRows').innerHTML = assignments.map(a=>`<tr><td>${a.assigned_date||''}</td><td><b>${a.tool_code||''}</b></td><td>${a.type||''}</td><td>${a.person||''}</td><td>${a.department_name||''}</td><td>${a.quantity||1}</td><td>${a.note||''}</td><td><button class="btn danger" onclick="deleteAssignment(${a.id})">Xóa</button></td></tr>`).join('') || '<tr><td colspan="8">Chưa có phiếu</td></tr>'; }
async function deleteAssignment(id){ if(!await showConfirm('Xóa phiếu này?','Xóa phiếu')) return; assignments=assignments.filter(x=>x.id!==id); renderAll(); await saveRemote('/api/assignments/'+id,null,'DELETE'); }
function openInventoryModal(){ editingInventoryId=null; $('iYear').value=String(new Date().getFullYear()); $('iDate').value=todayISO(); $('iBookQty').value=0; $('iActualQty').value=0; $('iCondition').value='Tốt'; $('iAction').value='Không xử lý'; $('iNote').value=''; refreshToolOptions(); syncBookQty(); $('inventoryModal').classList.add('show'); }
function syncBookQty(){ const t=tools.find(a=>toolCode(a)===$('iTool')?.value); if(t){ $('iBookQty').value=toolQty(t); $('iActualQty').value=toolQty(t); } }
function inventoryPayload(){ const code=$('iTool').value; const t=tools.find(a=>toolCode(a)===code); const book=Number($('iBookQty').value||0), actual=Number($('iActualQty').value||0); return {tool_id:t?t.id:null,tool_code:code,inventory_year:Number($('iYear').value),inventory_date:$('iDate').value,book_qty:book,actual_qty:actual,difference_qty:actual-book,condition:$('iCondition').value,action:$('iAction').value,note:$('iNote').value.trim()}; }
async function saveInventory(){ const p=inventoryPayload(); if(!p.tool_id){ showToast('Chọn CCDC kiểm kê','warn','Thiếu CCDC'); return; } const item={id:editingInventoryId||Date.now(),...p}; if(editingInventoryId) inventories=inventories.map(x=>x.id===editingInventoryId?item:x); else inventories.unshift(item); closeModal('inventoryModal'); renderAll(); await saveRemote(editingInventoryId?'/api/inventories/'+editingInventoryId:'/api/inventories', p, editingInventoryId?'PUT':'POST'); showToast('Đã lưu kiểm kê','success','Thành công'); editingInventoryId=null; }
function renderInventories(){ $('inventoryRows').innerHTML = inventories.map(i=>`<tr><td>${i.inventory_year||''}</td><td>${i.inventory_date||''}</td><td><b>${i.tool_code||''}</b></td><td>${i.book_qty||0}</td><td>${i.actual_qty||0}</td><td><b>${i.difference_qty||0}</b></td><td>${i.condition||''}</td><td>${i.action||''}</td><td><button class="btn danger" onclick="deleteInventory(${i.id})">Xóa</button></td></tr>`).join('') || '<tr><td colspan="9">Chưa có dữ liệu kiểm kê</td></tr>'; }
async function deleteInventory(id){ if(!await showConfirm('Xóa dòng kiểm kê này?','Xóa kiểm kê')) return; inventories=inventories.filter(x=>x.id!==id); renderAll(); await saveRemote('/api/inventories/'+id,null,'DELETE'); }
function setView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $(id).classList.add('active');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===id));
  const map={dashboard:['Tổng quan CCDC','Theo dõi tổng quan công cụ, dụng cụ và tình trạng sử dụng.'],tools:['Danh sách CCDC','Quản lý chi tiết từng công cụ, dụng cụ.'],departments:['Bộ phận sử dụng','Cơ cấu phòng ban để gắn CCDC.'],assignments:['Cấp phát / Thu hồi','Lịch sử bàn giao công cụ, dụng cụ.'],inventories:['Kiểm kê','Ghi nhận kiểm kê năm, số lượng sổ sách và thực tế.'],reports:['Báo cáo','Báo cáo kiểm kê và xuất dữ liệu.'],settings:['Cấu hình API','Kết nối Cloudflare Worker + D1.']};
  $('pageTitle').textContent=map[id][0]; $('pageSub').textContent=map[id][1]; toggleMenu(false);
}
function toggleMenu(show){ $('sidebar').classList.toggle('open', show); $('drawerMask').classList.toggle('show', show); }
function renderReportByDept(){
  const rows=departments.map(d=>{ const list=tools.filter(a=>norm(toolDept(a))===norm(d.name)); return {name:d.name,total:list.length,use:list.filter(a=>a.status==='use').length,stock:list.filter(a=>a.status==='stock').length,issue:list.filter(isIssueTool).length,value:list.reduce((s,a)=>s+toolCost(a),0)}; }).filter(r=>r.total>0);
  $('reportDeptRows').innerHTML = rows.map(r=>`<tr><td><b>${r.name}</b></td><td>${r.total}</td><td>${r.use}</td><td>${r.stock}</td><td>${r.issue}</td><td>${money(r.value)}</td></tr>`).join('') || '<tr><td colspan="6">Chưa có dữ liệu.</td></tr>';
}
function showIssueTools(){ setView('tools'); $('filterStatus').value=''; $('toolSearch').value=''; lastToolRows=tools.filter(isIssueTool); renderTools(); }
function saveApiBase(){ CURRENT_API_BASE=$('apiBaseInput').value.trim().replace(/\/$/,''); localStorage.setItem('CCDC_API_BASE', CURRENT_API_BASE); showToast('Đã lưu API_BASE','success','Thành công'); }
async function loginAdmin(){
  const username=$('loginUser').value.trim(), password=$('loginPass').value.trim(); if(!username||!password){ showToast('Nhập tài khoản và mật khẩu','warn','Thiếu thông tin'); return; }
  if(!CURRENT_API_BASE){ CCDC_TOKEN='local'; localStorage.setItem('CCDC_TOKEN',CCDC_TOKEN); $('loginScreen').style.display='none'; showToast('Đăng nhập local thành công','success','Xin chào'); return; }
  try{ const res=await fetch(CURRENT_API_BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}); const data=await res.json(); if(!res.ok||!data.success){ showToast(data.error||'Đăng nhập thất bại','error','Lỗi đăng nhập'); return; } CCDC_TOKEN=data.token; localStorage.setItem('CCDC_TOKEN',CCDC_TOKEN); $('loginScreen').style.display='none'; await loadRemote(); renderAll(); showToast('Đăng nhập thành công','success','Xin chào'); }catch(e){ showToast(e.message,'error','Không kết nối được API'); }
}
function logoutAdmin(){ localStorage.removeItem('CCDC_TOKEN'); CCDC_TOKEN=''; location.reload(); }
function checkLogin(){ $('loginScreen').style.display = CCDC_TOKEN ? 'none' : 'flex'; }
function exportExcel(){
  if(!tools.length){ showToast('Không có dữ liệu để xuất','warn','Xuất Excel'); return; }
  const wb=XLSX.utils.book_new(), now=new Date(), dateText=now.toLocaleDateString('vi-VN');
  function sheet(title, headers, rows){ const data=[['CÔNG TY TNHH MAY XK VIỆT HỒNG'],[title],['Ngày xuất: '+dateText],[],headers,...rows]; const ws=XLSX.utils.aoa_to_sheet(data); ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:headers.length-1}},{s:{r:1,c:0},e:{r:1,c:headers.length-1}},{s:{r:2,c:0},e:{r:2,c:headers.length-1}}]; ws['!cols']=headers.map(h=>({wch:Math.min(Math.max(String(h).length+6,14),40)})); return ws; }
  XLSX.utils.book_append_sheet(wb, sheet('DANH SÁCH CÔNG CỤ DỤNG CỤ', ['STT','Mã CCDC','Nhóm','Tên CCDC','Quy cách','Serial','ĐVT','SL','Ngày mua','Nguyên giá','Giá trị còn lại','Bộ phận','Người quản lý','Vị trí','Trạng thái','Ghi chú'], tools.map((a,i)=>[i+1,toolCode(a),toolCategory(a),toolName(a),a.specification||'',a.serial_number||'',a.unit||'',toolQty(a),a.purchase_date||'',toolCost(a),a.remaining_value||0,toolDept(a),a.custodian||'',a.location||'',statusLabel(a.status),a.note||''])), 'Danh_sach_CCDC');
  XLSX.utils.book_append_sheet(wb, sheet('LỊCH SỬ CẤP PHÁT THU HỒI', ['STT','Ngày','Mã CCDC','Loại phiếu','Người nhận/trả','Bộ phận','SL','Ghi chú'], assignments.map((a,i)=>[i+1,a.assigned_date||'',a.tool_code||'',a.type||'',a.person||'',a.department_name||'',a.quantity||1,a.note||''])), 'Cap_phat_thu_hoi');
  XLSX.utils.book_append_sheet(wb, sheet('BIÊN BẢN KIỂM KÊ', ['STT','Năm','Ngày kiểm kê','Mã CCDC','SL sổ sách','SL thực tế','Chênh lệch','Tình trạng','Kiến nghị','Ghi chú'], inventories.map((a,i)=>[i+1,a.inventory_year||'',a.inventory_date||'',a.tool_code||'',a.book_qty||0,a.actual_qty||0,a.difference_qty||0,a.condition||'',a.action||'',a.note||''])), 'Kiem_ke');
  XLSX.writeFile(wb, 'bao_cao_kiem_ke_ccdc_'+now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+'.xlsx');
  showToast('Đã xuất báo cáo Excel','success','Thành công');
}
async function importExcel(event){
  const file=event.target.files[0]; if(!file) return;
  try{ const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}); const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}); let ok=0,dup=0,fail=0; const codes=new Set(tools.map(a=>norm(toolCode(a))));
    for(const row of rows){ const code=String(row['Mã CCDC']||row['Mã tài sản']||row['Ma CCDC']||row['Ma tai san']||'').trim(); const name=String(row['Tên CCDC']||row['Tên tài sản']||row['Ten CCDC']||row['Ten tai san']||'').trim(); if(!code||!name){ fail++; continue; } if(codes.has(norm(code))){ dup++; continue; } const dept=String(row['Bộ phận']||row['Phòng ban']||row['Bo phan']||row['Phong ban']||'').trim(); const payload={id:Date.now()+Math.random(), tool_code:code, category:String(row['Nhóm']||row['Nhom']||row['Loại']||row['Loai']||'Khác').trim(), tool_name:name, specification:String(row['Quy cách']||row['Quy cach']||row['Model']||'').trim(), serial_number:String(row['Serial']||'').trim(), unit:String(row['ĐVT']||row['DVT']||row['Đơn vị tính']||'Cái').trim(), quantity:Number(row['SL']||row['Số lượng']||row['So luong']||1), purchase_date:String(row['Ngày mua']||row['Ngay mua']||'').trim(), original_cost:Number(row['Nguyên giá']||row['Nguyen gia']||0), remaining_value:Number(row['Giá trị còn lại']||row['Gia tri con lai']||0), department_id:deptIdByName(dept), department_name:dept, custodian:String(row['Người quản lý']||row['Nguoi quan ly']||row['Người dùng']||'').trim(), location:String(row['Vị trí']||row['Vi tri']||'').trim(), status:String(row['Trạng thái']||row['Trang thai']||'stock').trim(), note:String(row['Ghi chú']||row['Ghi chu']||'').trim()}; tools.unshift(payload); codes.add(norm(code)); ok++; await saveRemote('/api/tools', payload, 'POST', false); }
    saveLocal(); await loadRemote(); renderAll(); showToast(`Thành công ${ok} dòng, trùng ${dup}, lỗi ${fail}`, ok?'success':'warn', 'Kết quả import');
  }catch(e){ showToast(e.message,'error','Lỗi đọc Excel'); }
  event.target.value='';
}
let chartCategoryObj=null, chartDeptObj=null, chartValueObj=null;
function destroyChart(obj){ if(obj) obj.destroy(); }
function renderCharts(){ if(typeof Chart==='undefined') return; renderCategoryChart(); renderDeptChart(); renderValueChart(); }
function renderCategoryChart(){ const el=$('chartCategory'); if(!el) return; const map={}; tools.forEach(a=>map[toolCategory(a)||'Khác']=(map[toolCategory(a)||'Khác']||0)+1); destroyChart(chartCategoryObj); chartCategoryObj=new Chart(el,{type:'pie',data:{labels:Object.keys(map),datasets:[{data:Object.values(map)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}}); }
function renderDeptChart(){ const el=$('chartDept'); if(!el) return; const rows=departments.map(d=>({name:d.name,count:tools.filter(a=>norm(toolDept(a))===norm(d.name)).length})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,10); destroyChart(chartDeptObj); chartDeptObj=new Chart(el,{type:'bar',data:{labels:rows.map(x=>x.name),datasets:[{label:'Số CCDC',data:rows.map(x=>x.count)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}}); }
function renderValueChart(){ const el=$('chartValue'); if(!el) return; const map={}; statuses.forEach(s=>map[s.label]=0); tools.forEach(a=>map[statusLabel(a.status)]=(map[statusLabel(a.status)]||0)+toolCost(a)); destroyChart(chartValueObj); chartValueObj=new Chart(el,{type:'bar',data:{labels:Object.keys(map),datasets:[{label:'Nguyên giá',data:Object.values(map)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}}}); }

init();

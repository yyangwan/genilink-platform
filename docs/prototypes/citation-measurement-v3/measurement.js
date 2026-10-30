const $=id=>document.getElementById(id);
let phase='ready',brand='own',filter='all',hasPublication=true,publishedTime='2026-10-24T18:00',previousFocus=null;
const rows={
 qwen:{summary:'云衡从未出现到出现，并获得具体选择理由；明确位置仍未知，已保存正文暂不能前后比较。',status:'已知条件一致',cls:'good',metrics:[
 ['品牌出现','未出现','出现','新增出现','delta'],['推荐程度','0分','75分','+75 分（推荐分项）','delta'],['明确位置','未出现','未核实排名','位置维度未知','unknown'],['选择理由','未出现','具体理由 · 100分','+100 分（理由分项）','delta'],['实际引用卡片','未出现','出现','新增卡片提及','delta'],['已保存引用正文','取得不全','出现','基线正文未知，不计算差值','unknown'],['检索候选卡片','出现','未出现','候选提及减少','negative']]},
 doubao:{summary:'本次回答未再出现云衡。采集条件无法完整核对，保留前后事实，不计算差值。',status:'条件待核对',cls:'',metrics:[
 ['品牌出现','出现','未出现','保留事实，条件待核对','unknown'],['推荐程度','75分','未出现','暂不计算差值','unknown'],['明确位置','明确第2位','未出现','暂不计算差值','unknown'],['选择理由','具体理由','未出现','暂不计算差值','unknown'],['实际引用卡片','出现','未出现','暂不计算差值','unknown'],['已保存引用正文','未取得','未取得','双方正文均未知','unknown'],['检索候选卡片','出现','出现','保留事实，条件待核对','unknown']]}
};
function renderResults(){
 $('ownTab').setAttribute('aria-selected',brand==='own');$('rivalTab').setAttribute('aria-selected',brand==='rival');
 $('platformResults').innerHTML=Object.entries(rows).filter(([key])=>filter==='all'||filter===key).map(([key,row])=>{
 const missing=key==='doubao'&&phase==='partial';
 const metrics=brand==='own'?row.metrics:row.metrics.map(([name],i)=>[name,['出现','75分','明确第1位','具体理由 · 100分','出现','出现','出现'][i],['出现','50分','未核实排名','一般理由 · 65分','出现','出现','出现'][i],i===2?'位置未知，不计算差值':key==='qwen'?(i===1?'减少25分':i===3?'减少35分':'本次保持一致'):'保留事实，条件待核对',i===2?'unknown':key==='qwen'?(i===1||i===3?'negative':'delta'):'unknown']);
 return `<section class="platform-result"><div class="head"><div class="platform-title"><img src="icons/${key}.png" alt=""><h3>${key==='qwen'?'千问':'豆包'}</h3></div><span class="tag ${row.cls}">${missing?'回答未完整取得':row.status}</span></div><p class="platform-summary">${missing?'本次回答缺失，保留基线，不把缺失记成0分。':brand==='own'?row.summary:'锐川按已确认主体单独查看，未登记状态不影响原文回查。'}</p><table class="metric-table"><thead><tr><th>观察维度</th><th>基线 · 10月20日</th><th>复测 · 10月26日</th><th>本次比较</th><th>原始依据</th></tr></thead><tbody>${metrics.map(([name,b,a,d,c],i)=>`<tr><td>${name}</td><td data-label="基线">${b}</td><td data-label="复测">${missing?'未取得':a}</td><td data-label="比较" class="${missing?'unknown':c}">${missing?'缺失，不计算差值':d}${name.includes('正文')?'<small>只代表已保存的文本</small>':''}</td><td><button data-evidence="${key}:${i}">查看原文 →</button></td></tr>`).join('')}</tbody></table></section>`;
 }).join('');
 document.querySelectorAll('[data-evidence]').forEach(button=>button.onclick=()=>showEvidence(button.dataset.evidence));
}
function render(){
 const running=['collecting','analyzing'].includes(phase),draft=phase==='draft';$('demoState').value=hasPublication?phase:'unpublished';$('capture').textContent=draft?'开始一次复测':phase==='collecting'?'正在采集…':'正在分析…';$('registerPublication').disabled=running;
 $('scopeFields').disabled=!draft;$('newObservation').disabled=running||draft;$('capture').hidden=!draft&&!running;$('capture').disabled=running||!$('qwenChoice').checked&&!$('doubaoChoice').checked;
 $('scopeBadge').textContent=draft?'待确认 · 每题每平台一次':'已冻结 · 每题每平台一次';
 const titles={ready:'本次采集与分析已完成',draft:'确认范围后，发起一次采集',collecting:'已受理，正在采集',analyzing:'采集完成，正在分析',partial:'部分平台尚未完成'};
 $('captureTitle').textContent=titles[phase];$('captureDetail').textContent=running?(phase==='collecting'?'固定问题正在逐平台处理，可在本页回查进度。':'已取得的回答正在分析，尚未发布结果。'):draft?'采集一次；不会修改已保存的旧方案。':phase==='partial'?'千问已完成 · 豆包回答缺失':'2个平台各取得1次回答 · 结果已保存';
 $('captureProgress').hidden=!running;$('captureProgress').innerHTML=['已受理','采集中','分析中','结果就绪'].map((t,i)=>`<span class="${i===(phase==='collecting'?1:2)?'active':''}">${t}</span>`).join('');
 $('results').hidden=!['ready','partial'].includes(phase);$('sampleError').hidden=phase!=='partial';$('retryMissing').hidden=phase!=='partial';
 $('publicationLabel').textContent=hasPublication?`官网实施说明 v2 · ${$('publishedChannel').selectedOptions[0]?.textContent||'官网'} · ${publishedTime.replace('T',' ')}`:'尚未登记实际发布 · 交付验收不等于已发布';
 $('publicationLink').hidden=!hasPublication;$('publicationTime').textContent=hasPublication?publishedTime.replace('T',' '):'待登记';$('followupTime').textContent=running?'处理中':draft?'待采集':'10月26日 10:00';
 const time=new Date(publishedTime).getTime(),qualified=hasPublication&&time>new Date('2026-10-20T10:00').getTime()&&time<new Date('2026-10-26T10:00').getTime();
 $('timeNotice').textContent=draft||running?'发布登记已保留；复测完成后，再核对发布时间与实际采样时间。':!hasPublication?'可查看两次回答的观察；发布信息缺失，暂不作为本行动发布前后验收。':qualified?'本例时间顺序符合发布前后观察。时间关联本身不证明变化由该行动造成。':'发布时间不在两次回答之间：保留发布记录与观察，不作为本行动发布前后验收。';
 renderResults();
}
function show(dialog){previousFocus=document.activeElement;dialog.showModal();document.body.style.overflow='hidden';}
function close(dialog){dialog.close();document.body.style.overflow='';previousFocus?.focus();}
function evidenceText(platform,index,name,followup){
 if(index===4)return followup?`实际引用卡片：${name}专业版实施说明。\n示例地址：https://example.com/guide`:`基线实际引用卡片中${platform==='qwen'&&name==='云衡'?'未发现对应品牌':'保留了'+name+'的名称'}。`;
 if(index===5)return followup?`${name}已保存正文片段：专业版实施前应核对总部与门店权限范围。`:'基线正文未完整取得，保留未知，不推断品牌缺席。';
 if(index===6)return followup?'检索候选：其他门店管理内容（只作候选，不代表实际引用）。':`检索候选卡片包含${name}的实施说明。`;
 if(followup)return platform==='doubao'?'可考虑锐川等方案，并进一步核对实施条件。本次完整回答中未出现云衡。':`${name}提供专业版的权限边界说明。实施前需核对总部与门店职责、地域及服务范围。`;
 return name==='云衡'&&platform==='qwen'?'可考虑锐川等方案。本次完整检查范围内未出现云衡。':`可考虑${name}，并核对总部与门店的实施条件。`;
}
function showEvidence(key){
 const [platform,indexText]=key.split(':'),index=Number(indexText),name=brand==='own'?'云衡':'锐川';
 $('evidenceTitle').textContent=`${platform==='qwen'?'千问':'豆包'} · ${rows[platform].metrics[index][0]}`;
 const source=index>=4;
 $('evidenceBody').innerHTML=`<p class="notice">示例原文 · 保留当次平台、问题和${source?'来源类型':'回答'}范围，不借用另一个平台的内容。</p><div class="evidence-section"><small>原问题 · 实施场景</small><p>多门店企业如何核对权限与实施范围？</p></div><div class="evidence-section"><h3>基线${source?'来源':'回答'} · 10月20日 10:00</h3><blockquote class="evidence-quote">${evidenceText(platform,index,name,false)}</blockquote></div><div class="evidence-section"><h3>复测${source?'来源':'回答'} · 10月26日 10:00</h3><blockquote class="evidence-quote">${phase==='partial'&&platform==='doubao'?'本次回答未完整取得，不补写不存在的原文。':evidenceText(platform,index,name,true)}</blockquote></div>${source?'<p class="notice">实际引用卡片、已保存正文与检索候选分别记录。此样例不证明模型采用了某段来源内容。</p>':''}`;
 show($('evidenceDialog'));
}
$('demoState').onchange=event=>{const value=event.target.value;hasPublication=value!=='unpublished';phase=value==='unpublished'?'ready':value;$('message').textContent='';render();};
$('newObservation').onclick=()=>{phase='draft';$('message').textContent='新方案尚未采集；确认本次范围后开始。';render();};
$('capture').onclick=()=>{if(phase!=='draft')return;phase='collecting';$('message').textContent='样例已受理：本次每题每平台一次，结果完成前不会提前展示结论。';render();};
$('retryMissing').onclick=()=>{phase='collecting';$('message').textContent='样例仅补齐未完成项，不重跑已完成回答。';render();};
[$('qwenChoice'),$('doubaoChoice')].forEach(input=>input.onchange=render);
$('ownTab').onclick=()=>{brand='own';renderResults();};$('rivalTab').onclick=()=>{brand='rival';renderResults();};document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));renderResults();});
$('registerPublication').onclick=()=>{$('deliveryVersion').value='';$('publishedUrl').value='';$('publishedAt').value='';$('publicationReason').value='';$('publicationChecked').checked=false;$('publicationError').textContent='';validatePublication();show($('publicationDialog'));};
function validatePublication(){let urlValid=false;try{const url=new URL($('publishedUrl').value);urlValid=['https:','http:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}const time=new Date($('publishedAt').value);$('savePublication').disabled=!$('deliveryVersion').value||!urlValid||!Number.isFinite(time.getTime())||time>new Date()||$('publicationReason').value.trim().length<5||!$('publicationChecked').checked;}
$('publicationForm').oninput=validatePublication;$('publicationForm').onchange=validatePublication;$('publicationForm').onsubmit=event=>{event.preventDefault();if($('savePublication').disabled)return;hasPublication=true;phase='draft';publishedTime=$('publishedAt').value;$('publicationLink').href=$('publishedUrl').value;$('message').textContent='样例发布登记已保存，可建立新观察；原有观察记录不改写。';close($('publicationDialog'));render();};
$('closePublication').onclick=()=>close($('publicationDialog'));$('closeEvidence').onclick=()=>close($('evidenceDialog'));[$('publicationDialog'),$('evidenceDialog')].forEach(dialog=>dialog.oncancel=event=>{event.preventDefault();close(dialog);});render();

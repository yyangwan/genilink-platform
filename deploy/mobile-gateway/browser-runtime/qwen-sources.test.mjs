import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readQwenSources,collectQwenSources} from './qwen-sources.mjs';
import {extractQwenResult} from './qwen-extract.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
function fixture(body, callback) {
  const saved=globalThis.document;
  globalThis.document=new JSDOM(body,{url:'https://www.qianwen.com/'}).window.document;
  try {return callback();} finally {if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
}
const card=(id,index,metadata)=>`<div id="deep-think-source-card-${id}-${index}" data-c="refer_panel" data-d="card" data-click-extra='${JSON.stringify(metadata)}'></div>`;
test('full panel metadata, not inline links or aggregate analysis count',()=>fixture(
  `<section><span>已完成分析，共参考 8 篇资料</span><div class="qk-markdown-react">Answer</div><div id="reference-link-anchor-current">7篇来源</div><a href="https://unrelated.example/">inline</a></section>`+
  card('old',1,{req_id:'old',url:'https://wrong.example/'})+
  Array.from({length:7},(_,i)=>card('current',i+1,{req_id:'current',url:`https://source.example/${i}`,title:`source${i}`})).join(''),()=>{
    const result=readQwenSources();
    assert.equal(result.referenceCount,7);
    assert.equal(result.links.length,7);
    assert.equal(result.links[0].url,'https://source.example/0');
  }));
test('malformed or mismatched card metadata remains missing, never invented',()=>fixture(
  `<section><div class="qk-markdown-react">Answer</div><div id="reference-link-anchor-current">1篇来源</div></section>`+
  card('current',1,{req_id:'other',url:'https://wrong.example/'}),()=>{
    assert.equal(readQwenSources().links[0].url,'');
  }));
test('a new answer without sources cannot reuse an older answer panel',()=>fixture(
  `<section><div class="qk-markdown-react">Old</div><div id="reference-link-anchor-old">1篇来源</div></section>`+
  `<section><div class="qk-markdown-react">New answer</div></section>`+
  card('old',1,{req_id:'old',url:'https://wrong.example/'}),()=>{
    const result=readQwenSources();
    assert.equal(result.requestId,undefined);
    assert.equal(result.referenceCount,0);
    assert.deepEqual(result.links,[]);
  }));
test('collector opens matching panel and retains rows across virtual scrolling',async()=>{
  let calls=0,clicked='';
  const snapshots=[{requestId:'current',referenceCount:2,records:[]},
    {requestId:'current',referenceCount:2,records:[{index:1,url:'https://one.example/'}]},
    {requestId:'current',referenceCount:2,records:[{index:2,url:'https://two.example/'}]}];
  const page={evaluate:async fn=>fn===readQwenSources?snapshots[Math.min(calls++,2)]:undefined,
    locator:selector=>({click:async()=>{clicked=selector;}}),waitForTimeout:async()=>{}};
  const result=await collectQwenSources(page);
  assert.match(clicked,/reference-link-anchor-current/);
  assert.deepEqual(result.links.map(link=>link.index),[1,2]);
});

test('matching UI reference cards carry observed kinds and completion proof',async()=>{
  const snapshot=fixture(`<section><div class="qk-markdown-react">Stable answer</div><div id="reference-link-anchor-current">2篇来源</div></section>`+
    card('current',1,{req_id:'current',url:'https://one.example/article',title:'One'})+
    card('current',2,{req_id:'current',url:'https://two.example/article',title:'Two'}),()=>readQwenSources());
  const page={evaluate:async fn=>fn===readQwenSources?snapshot:undefined,waitForTimeout:async()=>{}};
  const collected=await collectQwenSources(page,{timeoutMs:0});
  const result=extractQwenResult(collected,{answerCompleted:true});
  assert.equal(result.answer_status,'complete');
  assert.equal(result.source_panel_status,'complete');
  assert.equal(result.source_panel_expected_count,2);
  assert.deepEqual(result.sources.map(s=>s.kind),['answer_reference','answer_reference']);
  assert.equal(extractQwenResult(collected).answer_status,'partial');
  const countsOnly=extractQwenResult({answer:'Still uncertain',referenceCount:1,links:[{url:'https://one.example/'}]});
  assert.equal(countsOnly.source_panel_status,'unknown');
  assert.equal(countsOnly.source_panel_expected_count,null);
  assert.equal(countsOnly.sources[0].kind,'unknown');
});

test('source deadline retains the completed answer and incomplete reference observations',async()=>{
  const snapshot={answer:'Completed answer',requestId:'current',referenceCount:3,referenceCountKnown:true,
    records:[{index:1,kind:'answer_reference',url:'https://one.example/',title:'Available'},
      {index:3,kind:'answer_reference',url:'',title:'Known card without a destination'}]};
  const page={evaluate:async fn=>fn===readQwenSources?snapshot:undefined,waitForTimeout:async()=>{}};
  const collected=await collectQwenSources(page,{timeoutMs:0});
  const result=extractQwenResult(collected,{answerCompleted:true});
  assert.equal(result.answer,'Completed answer');
  assert.equal(result.answer_status,'complete');
  assert.equal(result.source_panel_status,'partial');
  assert.equal(result.source_count,2);
  assert.equal(result.source_success_count,1);
  assert.equal(result.source_failure_count,2);
  assert.equal(result.sources[1].title,'Known card without a destination');
  assert.equal(result.sources[1].url,null);
  assert.equal(result.sources[1].url_resolution,'unavailable');
});

test('distinct panel cards can share a URL without being erased',()=>{
  const result=extractQwenResult({answer:'Answer',requestId:'current',referenceCount:2,referenceCountKnown:true,sourcePanelStatus:'complete',
    links:[{index:1,kind:'answer_reference',url:'https://one.example/article',title:'First reference'},
      {index:2,kind:'answer_reference',url:'https://one.example/article',title:'Second reference'}]}, {answerCompleted:true});
  assert.equal(result.source_count,2);
  assert.equal(result.source_panel_status,'complete');
});

test('inline answer links stay text links without becoming cited references',()=>fixture(
  '<section><a href="https://unrelated.example/">outside answer</a><div class="qk-markdown-react">Answer<a href="https://one.example/a">one</a></div></section>',()=>{
    const result=extractQwenResult(readQwenSources(),{answerCompleted:true});
    assert.deepEqual(result.sources.map(s=>s.url),['https://one.example/a']);
    assert.equal(result.sources[0].kind,'text_link');
    assert.equal(result.source_panel_status,'unknown');
  }));

test('formatter preserves explicit unknown denominators and observed complete answers',{skip:process.platform!=='win32'},()=>{
  const path=fileURLToPath(new URL('../capture-v2.ps1',import.meta.url)).replaceAll("'","''");
  const raw=Buffer.from(JSON.stringify(extractQwenResult({answer:'Known answer',links:[{url:'https://one.example/'}]},{answerCompleted:true})),'utf8').toString('base64');
  const source=`. '${path}';$r=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${raw}'))|ConvertFrom-Json;$task=@{id='task';platform='qwen';surface='web'};ConvertTo-CaptureV2 -Task $task -Result $r|ConvertTo-Json -Depth 12 -Compress`;
  const encoded=Buffer.from(source,'utf16le').toString('base64');
  const processResult=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(processResult.status,0,processResult.stderr);
  const capture=JSON.parse(processResult.stdout.trim());
  assert.equal(capture.answer.status,'complete');
  assert.equal(capture.sourcePanel.expectedCount,null);
  assert.equal(capture.sourcePanel.status,'unknown');
});

test('source collection rejects a different answer panel instead of mixing references',async()=>{
  let calls=0;
  const page={evaluate:async fn=>fn===readQwenSources?(calls++===0?
    {requestId:'first',referenceCount:2,records:[{index:1,url:'https://one.example/'}]}:
    {requestId:'second',referenceCount:1,records:[{index:1,url:'https://wrong.example/'}]}):undefined,
    waitForTimeout:async()=>{}};
  await assert.rejects(collectQwenSources(page,{timeoutMs:0}),/QWEN_SOURCE_PANEL_CHANGED/);
});

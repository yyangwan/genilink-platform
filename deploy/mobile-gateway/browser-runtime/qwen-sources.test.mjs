import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readQwenSources,collectQwenSources} from './qwen-sources.mjs';
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

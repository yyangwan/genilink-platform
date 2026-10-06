import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceQwenAnswer,readQwenPageState} from './qwen-state.mjs';
const baseline={count:0,answer:''};
const state={answerCount:1,answer:'A completed answer with more than thirty characters.',generating:false};
test('login and challenge fail immediately with actionable codes',()=>{
  assert.throws(()=>advanceQwenAnswer({answer:'',stableSamples:0},{...state,loginRequired:true},baseline),/QWEN_LOGIN_REQUIRED/);
  assert.throws(()=>advanceQwenAnswer({answer:'',stableSamples:0},{...state,challengeRequired:true},baseline),/QWEN_CHALLENGE_REQUIRED/);
});
test('stable completed answer requires consecutive samples',()=>{
  let progress={answer:'',stableSamples:0};
  for(let i=0;i<3;i++) {progress=advanceQwenAnswer(progress,state,baseline);assert.equal(progress.complete,false);}
  assert.equal(advanceQwenAnswer(progress,state,baseline).complete,true);
});
test('old or streaming answers cannot complete',()=>{
  assert.equal(advanceQwenAnswer({answer:state.answer,stableSamples:3},state,{count:1,answer:state.answer}).complete,false);
  assert.equal(advanceQwenAnswer({answer:state.answer,stableSamples:3},{...state,generating:true},baseline).complete,false);
});
test('visible verification frames and slider instructions are detected',()=>{
  const saved={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle};
  let frames=[];
  globalThis.location={href:'https://www.qianwen.com/'};
  globalThis.getComputedStyle=()=>({visibility:'visible'});
  globalThis.document={title:'Qwen',body:{innerText:''},querySelectorAll:selector=>selector==='iframe'?frames:[]};
  try {
    frames=[{getClientRects:()=>[{}],getAttribute:()=> 'https://verify.example/captcha'}];
    assert.equal(readQwenPageState().challengeRequired,true);
    frames=[{getClientRects:()=>[],getAttribute:()=> 'https://verify.example/captcha'}];
    assert.equal(readQwenPageState().challengeRequired,false);
    globalThis.document.body.innerText='请拖动下方滑块完成验证';
    assert.equal(readQwenPageState().challengeRequired,true);
  } finally {
    for(const [key,value] of Object.entries(saved)) {
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});

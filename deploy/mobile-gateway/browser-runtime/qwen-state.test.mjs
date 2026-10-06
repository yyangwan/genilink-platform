import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceQwenAnswer} from './qwen-state.mjs';
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

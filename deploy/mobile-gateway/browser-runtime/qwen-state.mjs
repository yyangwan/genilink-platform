// This function is also evaluated in the browser; keep it self-contained.
export function readQwenPageState() {
  const visible = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const buttons = [...document.querySelectorAll('button')].filter(visible);
  const loginRequired = buttons.some(button => button.getAttribute('aria-label') === '关闭登录');
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alert"]')].filter(visible).map(n => n.innerText).join('\n');
  const challengeRequired = /安全验证|滑动验证|完成验证|验证码/.test(dialogs);
  const markdowns = [...document.querySelectorAll('.qk-markdown-react')];
  const markdown = markdowns.at(-1);
  return {
    url: location.href,
    title: document.title,
    loginRequired,
    challengeRequired,
    answerCount: markdowns.length,
    answer: markdown?.innerText.trim() || '',
    generating: buttons.some(button => /停止回答/.test(button.getAttribute('aria-label') || button.innerText)),
  };
}

export function advanceQwenAnswer(previous, state, baseline) {
  if (state.loginRequired) throw new Error('QWEN_LOGIN_REQUIRED: 千问要求扫码登录，请在网关恢复浏览器登录');
  if (state.challengeRequired) throw new Error('QWEN_CHALLENGE_REQUIRED: 千问要求人工完成安全验证');
  const fresh = state.answerCount > baseline.count || state.answer !== baseline.answer;
  const usable = fresh && state.answer.length >= 30 && !state.generating;
  const stableSamples = usable && state.answer === previous.answer ? previous.stableSamples + 1 : 0;
  return {answer: state.answer, stableSamples, complete: usable && stableSamples >= 3};
}

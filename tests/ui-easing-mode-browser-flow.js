async (page) => {
  // Only the standalone test fixture. These checks are not native AE evidence.
  if (!await page.evaluate(() => Array.isArray(window.__fixtureCalls))) throw Error('Requires isolated browser fixture');
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', {name:'Tools',exact:true}).click();
  const mode = page.getByLabel('대상 모드'), graph = page.locator('.easing-graph'),
    apply = page.getByRole('button',{name:'이징 적용',exact:true});
  async function state(value) {
    await page.evaluate(async selectionMode => {
      __fixtureState.toolState = selectionMode == null ? {} : {easing:{selectionMode}};
      await ContentriumUI.view.refresh();
    }, value);
  }
  function check(ok, name) { if (!ok) throw Error(name); checks.push(name); }
  await mode.selectOption('auto');
  await state('pairs');
  check(await graph.getAttribute('data-mode') === 'pairs', 'host pairs updates auto graph');
  check((await page.locator('.easing-preset').nth(1).locator('button').first().textContent()).includes('0.1'), 'auto pairs selects pair presets');
  await apply.click();
  check(await page.evaluate(() => __fixtureCalls.filter(c=>c.method==='toolAction').pop().payload.params.mode === 'pairs'), 'auto applies the resolved host pairs mode');
  await page.getByLabel('In / Out 값 연결',{exact:true}).uncheck();
  const incoming = page.locator('.tool-section').first().locator('input[type=number]').first();
  await incoming.fill('37');
  await state('single');
  check(await graph.getAttribute('data-mode') === 'single' && await incoming.inputValue() === '37', 'selection changes mode without losing edited influence');
  await state('none');
  check(await graph.getAttribute('data-mode') === 'single' && (await page.locator('.tool-section').first().textContent()).includes('키프레임을 선택하세요'), 'empty selection retains the last mode with selection guidance');
  await mode.selectOption('pairs');
  await state('single');
  check(await graph.getAttribute('data-mode') === 'pairs', 'manual pair mode remains pinned across host selection changes');
  await mode.selectOption('auto');
  await state(null);
  check(await apply.isDisabled(), 'missing host mode disables automatic apply');
  await mode.selectOption('single');
  check(await apply.isEnabled(), 'manual mode remains available without automatic state support');
  await state('pairs');
  await mode.selectOption('auto');
  check(await graph.getAttribute('data-mode') === 'pairs' && await apply.isEnabled(), 'automatic mode recovers after host state returns');
  const easingHelp = page.getByRole('link',{name:'이징 사용 안내',exact:true}),
    keyframeHelp = page.getByRole('link',{name:'키프레임 사용 안내',exact:true});
  check(await easingHelp.isVisible() && await keyframeHelp.isVisible(), 'helper help links are available by default');
  await page.getByLabel('이징 도움말 표시',{exact:true}).uncheck();
  check(!await easingHelp.isVisible() && await keyframeHelp.isVisible(), 'tutorial visibility changes only the selected helper');
  await page.reload();
  await page.getByRole('button',{name:'Tools',exact:true}).click();
  check(!await easingHelp.isVisible() && await keyframeHelp.isVisible(), 'per-helper tutorial visibility persists across reload');
  await page.getByLabel('이징 도움말 표시',{exact:true}).check();
  if(errors.length)throw Error(errors.join('; '));
  return {ok:true,scope:'isolated standalone UI contract; no AE',checks,pageErrors:errors};
}

// Navigate real disclosure widgets after the scene/dock layout change.
export async function reveal(p,selector){
 const el=p.locator(selector).first();
 if(await el.evaluate(e=>!!e.closest('#table-dock'))){if(!await p.locator('#table-dock').evaluate(e=>e.open))await p.locator('#table-dock>summary').click();const pane=await el.evaluate(e=>e.closest('.dock-pane')?.id);if(pane)await p.locator(`[data-ui=dock-tab][data-tab="${pane.slice(5)}"]`).click();}
 if(await el.evaluate(e=>!!e.closest('#process-panel'))&&!await p.locator('#process-panel').evaluate(e=>e.open))await p.locator('#process-panel>summary').click();
 if(await el.evaluate(e=>!!e.closest('#hand-context'))&&!await p.locator('#hand-context').evaluate(e=>e.open)){const selected=p.locator('#hand [data-card][aria-pressed=true]').first();await (await selected.count()?selected:p.locator('#hand')).focus();await p.keyboard.press('Shift+F10');}
 for(const id of ['manual-controls'])if(await el.evaluate((e,id)=>!!e.closest('#'+id),id)&&!await p.locator('#'+id).evaluate(e=>e.open))await p.locator('#'+id+'>summary').click();
 if(await el.evaluate(e=>!!e.closest('.hand-manual'))&&!await p.locator('.hand-manual').evaluate(e=>e.open))await p.locator('.hand-manual>summary').click();
 return el;
}
export async function command(p,name){const modal=p.locator(`dialog[open] [data-do="${name}"]:visible`);if(await modal.count())return modal.first().click();const selector=`[data-do="${name}"]`;if(!await p.locator(selector+':visible').count())await reveal(p,selector);return p.locator(selector+':visible').first().click();}
export async function setSeat(p,id){await reveal(p,'#control-seat');await p.locator('#control-seat').selectOption(id);await p.waitForFunction(id=>document.querySelector(`[data-seat="${id}"]`)?.classList.contains('mine'),id);await p.locator('#table-dock>summary').click();await p.evaluate(()=>scrollTo(0,0));}

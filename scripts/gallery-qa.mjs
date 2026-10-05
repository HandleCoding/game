import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/opt/pair-play-dev/artifacts/browser-download/extracted/chrome-linux64/chrome',args:['--no-sandbox']});
const folder='artifacts/ranch-generated-gallery';await mkdir(folder,{recursive:true});const results=[];
try {
const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:3212/');
for(const stage of ['adult','baby'])for(let group=0;group<4;group++){
await page.locator(`[data-stage="${stage}"]`).click();await page.locator(`[data-group="${group}"]`).click();
await page.locator('#status').filter({hasText:'当前 45 款外观已就绪'}).waitFor({timeout:60000});await page.waitForTimeout(500);
const counts=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>{const rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let opaque=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>200)opaque++;return opaque}));assert.equal(counts.length,45);assert.ok(counts.every(n=>n>500),'blank generated animal');
await page.screenshot({path:`${folder}/${stage}-${group}.png`,fullPage:true});results.push({stage,group,renderedDesigns:counts.length,minOpaquePixels:Math.min(...counts)});
}
assert.deepEqual(errors,[]);await writeFile('docs/test-reports/20261005-ranch-generated-gallery.json',JSON.stringify({results,errors,designs:360},null,2));console.log(JSON.stringify({passed:results.length,designs:360}));
}finally{await browser.close()}

import assert from 'node:assert/strict';
import {route,blocked} from './artifacts/navigation/navigation.js';
const shared=[{kind:'circle',x:940,y:385,r:26},{kind:'circle',x:280,y:335,r:26},{kind:'rect',x:400,y:406,w:112,h:35},{kind:'rect',x:365,y:636,w:400,h:22},{kind:'rect',x:868,y:636,w:356,h:22}];
const closed=[...shared,{kind:'rect',x:626,y:636,w:122,h:22}];
assert.equal(route({x:600,y:550},{x:620,y:708},closed).length,0,'closed gate must block crossing');
const open=route({x:600,y:550},{x:620,y:708},shared);
assert.ok(open.length>0,'open gate must permit crossing');
const paths=[open,route({x:340,y:360},{x:470,y:460},closed),route({x:900,y:350},{x:984,y:416},closed)];
for(let i=0;i<paths.length;i++){
 assert.ok(paths[i].length>0);
 const obstacles=i===0?shared:closed;
 for(let j=0;j<paths[i].length;j++){assert.ok(!blocked(paths[i][j],obstacles));if(j)for(let n=0;n<=24;n++){const a=paths[i][j-1],b=paths[i][j];assert.ok(!blocked({x:a.x+(b.x-a.x)*n/24,y:a.y+(b.y-a.y)*n/24},obstacles,3),'path segment crosses solid object');}}
}
console.log('PASS: closed gate, open gate, trough detour, tree detour and segment collision checks');

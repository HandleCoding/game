import assert from 'node:assert/strict';
import {FeedSession,nextMealPhase,mealPose,mealDurations} from './artifacts/navigation/feeding.js';
const f=new FeedSession();
assert.equal(f.start(['a','b','c','d','e','f'],'c'),true);
assert.equal(f.reserve(0),'c');
assert.equal(f.reserve(0),null);
assert.equal(f.reserve(1),'a');
assert.equal(f.start(['g'],'g'),false);
assert.equal(f.owner(0),'c');
assert.equal(f.pending,6);
assert.equal(f.release('c'),true);
assert.equal(f.release('c'),false);
assert.equal(f.reserve(0),'b');
f.cancel('e');
assert.equal(f.peek(),'d');
for(const id of ['a','b'])f.release(id);
assert.equal(f.reserve(0),'d');
assert.equal(f.reserve(1),'f');
assert.equal(f.active,true);
f.release('d');f.release('f');
assert.equal(f.active,false);
assert.equal(f.completed,5);
assert.equal(f.start(['x','x'],'x'),true);
assert.equal(f.reserve(0),'x');assert.equal(f.reserve(1),null);
assert.equal(f.completed,0);f.cancel('x');assert.equal(f.active,false);
let phase='turn',sequence=[];
while(phase){sequence.push(phase);assert.ok(mealDurations[phase]>0);phase=nextMealPhase(phase);}
assert.deepEqual(sequence,['turn','lower','eat','raise']);
for(const species of ['chicken','rabbit','goat'])for(const phase of sequence){
 for(let age=0;age<mealDurations[phase];age+=.05)assert.ok([0,1,2,3].includes(mealPose(phase,age,species)));
}
assert.equal(mealPose('lower',0,'goat'),0);
assert.equal(mealPose('lower',.7,'goat'),2);
assert.equal(mealPose('raise',.7,'goat'),3);
console.log('Feeding verified: exclusive slots, FIFO, duplicate protection, cancellation, restart and complete pose sequence.');

'use strict';
const assert=require('assert');
const {createMonitor}=require('../server-monitor');
(async()=>{
 let calls=0,clock=Date.now();
 const monitor=createMonitor({project:'test',now:()=>clock,request:async ({params})=>{calls++;assert(params.filter.includes('service_name="plano-contas-iob"'));if(params.filter.includes('response_code_class'))throw new Error('denied');return {data:{timeSeries:[{points:[{interval:{endTime:new Date(clock-60000).toISOString()},value:{doubleValue:0.25}}]}]}};}});
 const [a,b]=await Promise.all([monitor(),monitor()]);assert.strictEqual(a,b);assert.equal(calls,6);assert.equal(a.metrics[0].points[0].value,25);assert.equal(a.metrics[5].status,'unavailable');assert.equal(a.metrics[5].points.length,0);await monitor();assert.equal(calls,6);clock+=61000;await monitor();assert.equal(calls,12);
 const empty=await createMonitor({project:'test',request:async()=>({data:{}})})();assert(empty.metrics.every(m=>m.status==='empty'));
 const source=require('fs').readFileSync('server.js','utf8');assert(source.includes("app.get('/api/admin/server-monitor', adminRequired"));
 console.log('server-monitor: OK');
})().catch(e=>{console.error(e);process.exit(1);});

 'use strict';
const {GoogleAuth}=require('google-auth-library');
const DEFINITIONS=[
 ['cpu','CPU p95 · pior revisão','container/cpu/utilizations','ALIGN_PERCENTILE_95','REDUCE_MAX','%'],
 ['memory','Memória p95 · pior revisão','container/memory/utilizations','ALIGN_PERCENTILE_95','REDUCE_MAX','%'],
 ['instances','Instâncias · máximo por minuto','container/instance_count','ALIGN_MAX','REDUCE_SUM',''],
 ['requests','Requisições por minuto','request_count','ALIGN_SUM','REDUCE_SUM',''],
 ['latency','Latência p95 · pior revisão','request_latencies','ALIGN_PERCENTILE_95','REDUCE_MAX','ms'],
 ['errors','Respostas HTTP 5xx por minuto','request_count','ALIGN_SUM','REDUCE_SUM','', 'metric.labels.response_code_class="5xx"']
];
function createMonitor({project,service='plano-contas-iob',request,now=Date.now}) {
 const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/monitoring.read']});
 const get=request || (async options=>(await auth.getClient()).request(options));
 let cache,flight;
 async function collect() {
  const end=now(),start=end-3600000;
  const metrics=await Promise.all(DEFINITIONS.map(async ([id,label,type,aligner,reducer,unit,extra])=>{
   try {
    const params={filter:`resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND metric.type="run.googleapis.com/${type}"${extra?' AND '+extra:''}`,
     'interval.startTime':new Date(start).toISOString(),'interval.endTime':new Date(end).toISOString(),
     'aggregation.alignmentPeriod':'60s','aggregation.perSeriesAligner':aligner,'aggregation.crossSeriesReducer':reducer,pageSize:1000};
    const response=await get({url:`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries`,params,timeout:15000,retry:false});
    if(response.data.nextPageToken) throw new Error('partial');
    const points=(response.data.timeSeries||[]).flatMap(s=>(s.points||[]).map(p=>({time:p.interval.endTime,value:Number(p.value.doubleValue??p.value.int64Value)*(unit==='%'?100:1)}))).filter(p=>Number.isFinite(p.value)).sort((a,b)=>a.time.localeCompare(b.time));
    return {id,label,unit,points,status:points.length?'ok':'empty'};
   } catch(e) { return {id,label,unit,points:[],status:'unavailable',message:e.response?.status===403?'Permissão de monitoramento indisponível.':'Não foi possível consultar esta métrica.'}; }
  }));
  return {source:'Google Cloud Monitoring',service,generatedAt:new Date(end).toISOString(),start:new Date(start).toISOString(),metrics};
 }
 return async function(){
  if(cache && now()-Date.parse(cache.generatedAt)<60000) return cache;
  if(!flight) flight=collect().then(result=>(cache=result)).finally(()=>{flight=null;});
  return flight;
 };
}
module.exports={createMonitor,DEFINITIONS};

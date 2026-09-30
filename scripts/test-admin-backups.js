'use strict';
const assert=require('assert'),fs=require('fs');const {createBackups,SYSTEMS}=require('../admin-backups');
(async()=>{
const calls=[],name='projects/'+SYSTEMS.CCI.project+'/locations/southamerica-east1/backups/abc';
const backup={name,database:'projects/'+SYSTEMS.CCI.project+'/databases/(default)',state:'READY',snapshotTime:'2026-09-30T03:00:00Z',expireTime:'2026-12-30T03:00:00Z'};
const request=async options=>{calls.push(options);if(options.url.endsWith(':restore'))return {data:{name:'projects/'+SYSTEMS.CCI.project+'/databases/restore-audit-test/operations/test'}};return {data:backup};};
const service=createBackups({request,now:()=>new Date('2026-09-30T12:00:00Z')});const r=await service.restore('CCI',name);assert.match(r.databaseId,/^restore-audit-/);assert.notEqual(r.databaseId,'(default)');assert.equal(calls[1].data.backup,name);assert(!JSON.stringify(calls[1].data).includes('production'));
await assert.rejects(()=>service.restore('CFI',name),/fora/);await assert.rejects(()=>service.restore('CCI','https://evil.example'),/fora/);await assert.rejects(()=>service.manifest('CCI','../../secret'),/inválido/);
const expired=createBackups({request:async()=>({data:{...backup,expireTime:'2026-01-01'}})});await assert.rejects(()=>expired.restore('CCI',name),/indisponível/);
const denied=createBackups({request:async()=>{throw Object.assign(Error('denied'),{response:{status:403}});}});const catalog=await denied.catalog('CCI');assert.equal(catalog.errors.length,3);assert.equal(catalog.exports.length,0);
const server=fs.readFileSync('server.js','utf8');for(const route of ["app.get('/api/admin/backups', adminRequired","app.get('/api/admin/backups/:app/:run/manifest', adminRequired","app.post('/api/admin/backups/action', adminRequired"])assert(server.includes(route));assert(server.includes('await ref.create('));assert(JSON.parse(fs.readFileSync('public-assets.json')).includes('/admin-backups-ui.js'));assert(!JSON.parse(fs.readFileSync('public-assets.json')).includes('/admin-backups.js'));
console.log('OK: modal backup administrativo, origem restrita, destino isolado, backup vencido, falhas explícitas e solicitação idempotente.');
})().catch(e=>{console.error(e);process.exit(1);});

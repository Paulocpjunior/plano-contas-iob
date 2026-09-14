const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { gerarEventosR4010DaPlanilha } = require('../reinf/reinf-utils');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const box = { style: {}, innerHTML: '' };
const ctx = {
    document: { getElementById: id => id === 'reinfRetornoResumo' ? box : { value: '1' } },
    reinfEscape: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('        function reinfExtrairTagXml('), html.indexOf('        function reinfPararConsultaAutomatica(')), ctx);
const rejeitado = '<retornoEvento id="ID_REJEITADO"><Reinf><evtRet><ideEvento><idEv>ID_REJEITADO</idEv></ideEvento><ideStatus><cdRetorno>1</cdRetorno><descRetorno>ERRO</descRetorno><regOcorrs><tpOcorr>1</tpOcorr><localErroAviso>- Campo: dtFG - XPATH: /Reinf/evtRetPF/ideEstab/ideBenef/idePgto/infoPgto/dtFG</localErroAviso><codResp>MS1240</codResp><dscResp>A data informada deve estar compreendida no período de apuração &lt;script&gt;</dscResp></regOcorrs></ideStatus></evtRet></Reinf></retornoEvento>';
const aceito = '<retornoEvento id="ID_ACEITO"><Reinf><evtTotal><ideEvento><idEv>ID_ACEITO</idEv><tpEv>4010</tpEv></ideEvento><ideRecRetorno><nrRecArqBase>RECIBO_TESTE</nrRecArqBase></ideRecRetorno><ideStatus><cdRetorno>0</cdRetorno><descRetorno>SUCESSO</descRetorno></ideStatus></evtTotal></Reinf></retornoEvento>';
const lote = (cd, eventos) => ({ xml: '<Reinf><retornoLoteEventosAssincrono><status><cdResposta>' + cd + '</cdResposta></status><retornoEventos>' + eventos + '</retornoEventos></retornoLoteEventosAssincrono></Reinf>' });
let info = ctx.reinfRenderRetornoResumo(lote('3', rejeitado), 'xml');
assert.equal(ctx.reinfClassificarRetorno(info).tipo, 'error');
assert.equal(ctx.reinfRetornoAceito(info), false);
assert.ok(box.innerHTML.includes('MS1240') && box.innerHTML.includes('dtFG') && box.innerHTML.includes('Como corrigir'));
assert.ok(!box.innerHTML.includes('<script>'));
info = ctx.reinfRenderRetornoResumo(lote('3', aceito + rejeitado), 'xml');
assert.equal(ctx.reinfClassificarRetorno(info).tipo, 'warn');
assert.ok(ctx.reinfClassificarRetorno(info).titulo.includes('parcial'));
assert.equal(ctx.reinfRetornoAceito(info), false, 'lote parcial não pode atualizar todo o saldo de IRRF como aceito');
assert.ok(box.innerHTML.includes('RECIBO_TESTE') && box.innerHTML.includes('Rejeitado'));
assert.equal(ctx.reinfRetornoAceito(ctx.reinfParseRetorno(lote('2', aceito))), true);
assert.equal(ctx.reinfRetornoAceito(ctx.reinfParseRetorno(lote('2', ''))), false, 'status do lote sem recibos não confirma eventos');
assert.equal(ctx.reinfRetornoAceito(ctx.reinfParseRetorno({ httpStatus: 200, xml: '<html>erro proxy</html>' })), false);
assert.equal(ctx.reinfClassificarRetorno(ctx.reinfParseRetorno(lote('1', ''))).tipo, 'warn');
assert.equal(ctx.reinfEventosDoXml(rejeitado.replace(/(<\/?)([A-Za-z])/g, '$1ns:$2'))[0].situacao, 'rejeitado');
const args = { contribuinte: { tpInsc: 1, nrInsc: '12345678000190' }, estabelecimento: { tpInscEstab: 1, nrInscEstab: '12345678000190' }, perApur: '2026-08', tpAmb: 2, dtPagamento: '2026-08-31', locadores: [{ cpf: '12345678901', nome: 'Teste', bruto: 1000, irrf: 0 }] };
assert.equal(gerarEventosR4010DaPlanilha(args).length, 1);
assert.throws(() => gerarEventosR4010DaPlanilha({ ...args, dtPagamento: '2026-09-14' }), /fora da competência/);
assert.throws(() => gerarEventosR4010DaPlanilha({ ...args, locadores: [{ ...args.locadores[0], dtFG: '2026-07-31' }] }), /fora da competência/);
assert.throws(() => gerarEventosR4010DaPlanilha({ ...args, perApur: '2026-02', dtPagamento: '2026-02-30' }), /data válida/);
assert.equal(gerarEventosR4010DaPlanilha({ ...args, natRend: '12001', dtPagamento: '2026-07-31' }).length, 1, 'não aplicar regra do aluguel à exceção de dividendos');
assert.ok(!html.includes('if (pagamento && !pagamento.value) pagamento.value = reinfToday()'), 'não inventar data do pagamento');
console.log('OK: retorno por evento, aceitação parcial, recibos, XML seguro e validação de datas do aluguel.');
// Persistir recibos aceitos de um lote misto sem substituir pelo recibo de rejeição.
const routes = fs.readFileSync(require.resolve('../reinf-routes.js'), 'utf8');
vm.runInContext(routes.slice(routes.indexOf('function extrairTagXml('), routes.indexOf('function reinfReciboDocId(')), ctx);
vm.runInContext(routes.slice(routes.indexOf('function extrairBlocosXml('), routes.indexOf('async function buscarRecibosR4010(')), ctx);
vm.runInContext(routes.slice(routes.indexOf('async function registrarRetornoLoteReinf('), routes.indexOf('\nfunction ', routes.indexOf('async function registrarRetornoLoteReinf('))), ctx);
(async () => {
    const writes = [];
    const ref = name => ({
        collection: child => ref(name + '/' + child), doc: child => ref(name + '/' + child),
        get: async () => ({ exists: true, data: () => ({ cnpjFonte: '12345678000190', reciboDocId: 'BENEF_TESTE' }) }),
        set: async data => writes.push({ name, data })
    });
    const db = { collection: name => ref(name) };
    const rejeitadoComRecibo = rejeitado.replace('<idEv>ID_REJEITADO</idEv>', '<idEv>ID_REJEITADO</idEv><tpEv>4010</tpEv><nrRecArqBase>NAO_GRAVAR</nrRecArqBase>');
    const result = await ctx.registrarRetornoLoteReinf(db, 'PROTOCOLO_TESTE', 2, aceito + rejeitadoComRecibo);
    assert.equal(result.recibosGravados, 1);
    assert.ok(writes.some(w => w.data.nrRecibo === 'RECIBO_TESTE'));
    assert.ok(!writes.some(w => w.data.nrRecibo === 'NAO_GRAVAR'));
    console.log('OK: recibos aceitos preservados por evento em lote parcial.');
})().catch(err => { console.error(err); process.exitCode = 1; });

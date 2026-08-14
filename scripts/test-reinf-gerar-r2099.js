// ============================================================================
// R-2099 — FECHAMENTO da série R-2000, e a linha entre PROVAR e AFIRMAR.
//
// Paulo, 14/08: *"pode fazer o R-2099"*. Ele fecha a competência — sem ele os
// R-2010/R-2055 do mês ficam recebidos e NÃO viram totalizador nem DARF. Foi o
// que aconteceu com o VINCENZO 07/2026: o fechamento saiu no e-CAC, à mão.
//
// ═══ O QUE ESTE TESTE PROTEGE ═══════════════════════════════════════════════
//
// O esqueleto (ideEvento, ideContri com a RAIZ, id de 34, ideRespInf) É PROVADO
// — vem do R-4099 homologado. O conteúdo do `infoFech` NÃO É: os nomes das tags
// dos grupos não foram lidos de nenhum arquivo aceito neste projeto.
//
// Fechamento com indicador errado é o pior caso desta família: pode ser ACEITO
// e mandar a Receita consolidar o grupo errado — totalizador a menor, guia paga
// a menor, e nenhuma recusa avisando. Por isso PRODUÇÃO é recusada enquanto o
// leiaute não for provado, e produção RESTRITA fica livre: é lá que se pergunta.
// ============================================================================
const assert = require('assert');
const {
  gerarR2099, validarEntradaR2099, podeTransmitirR2099,
  LEIAUTE_INFOFECH, MOTIVO_LEIAUTE_NAO_PROVADO, NS_R2099,
} = require('../reinf/gerar-r2099');

const base = () => ({
  contribuinte: { tpInsc: 1, nrInsc: '32602701000197' },
  perApur: '2026-07',
  tpAmb: 2,
  seq: 1,
  data: new Date(2026, 6, 8, 11, 12, 33),
  grupos: { 'R-2055': true },
});

// ─── 1. O ESQUELETO PROVADO (mesmo do R-4099 homologado) ────────────────────
const ev = gerarR2099(base());

assert.ok(/^ID\d{34}$/.test(ev.id), 'id = ID + 34 dígitos, como toda a série');
assert.strictEqual(ev.id, 'ID1326027010000002026070811123300001',
  'id reproduz a regra provada: tpInsc + raiz preenchida + timestamp + seq');
assert.ok(ev.xml.includes(`<Reinf xmlns="${NS_R2099}">`), 'namespace do evtFechaEvPer');
assert.ok(ev.xml.includes('<evtFechaEvPer id='), 'o elemento é evtFechaEvPer, não evtFech (esse é o R-4099)');
assert.ok(/<perApur>2026-07<\/perApur>\s*<tpAmb>2<\/tpAmb>\s*<procEmi>1<\/procEmi>\s*<verProc>/.test(ev.xml),
  'ideEvento na ordem provada: perApur → tpAmb → procEmi → verProc');
assert.ok(ev.xml.includes('<nrInsc>32602701</nrInsc>'),
  'ideContri leva a RAIZ de 8 dígitos — a mesma regra do R-4099 e do R-2055');

// O assinador acha o evento pelo id (generalizado hoje). Se ele voltasse a
// procurar por lista de nomes, este evento seria o próximo a falhar calado.
assert.ok(/<evtFechaEvPer\s+id="ID\d{34}"/.test(ev.xml),
  'o id fica no elemento do evento — é por ele que o assinador acha');

// ─── 2. ideRespInf opcional, na ordem do R-4099 ─────────────────────────────
const comResp = gerarR2099({
  ...base(),
  respInfo: { nome: 'Paulo Cesar Pereira', cpf: '706.462.368-49', telefone: '(11) 99999-9999', email: 'x@y.com' },
});
assert.ok(/<nmResp>Paulo Cesar Pereira<\/nmResp>\s*<cpfResp>70646236849<\/cpfResp>/.test(comResp.xml),
  'nmResp antes de cpfResp, CPF só dígitos');
assert.ok(!ev.xml.includes('<ideRespInf>'), 'sem responsável, sem a tag — tag vazia não é informação');

// ─── 3. OS GRUPOS: S/N, e ausência não vira 'N' por engano ──────────────────
const doisGrupos = gerarR2099({ ...base(), grupos: { 'R-2010': true, 'R-2055': true } });
assert.ok(doisGrupos.xml.includes('<evtServTm>S</evtServTm>'), 'R-2010 marcado');
assert.ok(doisGrupos.xml.includes('<evtAquis>S</evtAquis>'), 'R-2055 marcado');
assert.ok(doisGrupos.xml.includes('<evtCPRB>N</evtCPRB>'), 'grupo sem evento sai N, explicitamente');
assert.deepStrictEqual(doisGrupos.gruposDeclarados, ['R-2010', 'R-2055'],
  'o retorno diz o que foi declarado — para a auditoria e para a tela');
assert.strictEqual((doisGrupos.xml.match(/<evt\w+>[SN]<\/evt\w+>/g) || []).length, LEIAUTE_INFOFECH.length,
  'TODOS os grupos saem no XML: omitir um seria deixar a Receita decidir por default');

// ─── 4. FECHAR VAZIO É DECLARAÇÃO — tem que ser dito ────────────────────────
assert.throws(() => gerarR2099({ ...base(), grupos: {} }), /SEM MOVIMENTO/,
  'objeto vazio por engano não pode virar "competência sem movimento" em silêncio');

const vazioIntencional = gerarR2099({ ...base(), grupos: { semMovimento: true } });
assert.ok(vazioIntencional.xml.includes('<evtAquis>N</evtAquis>'),
  'sem movimento declarado sai com todos os grupos em N');
assert.deepStrictEqual(vazioIntencional.gruposDeclarados, []);

// Grupo que o módulo não conhece NÃO some calado: quem pediu acharia que
// declarou, e a Receita nunca teria visto.
assert.throws(() => gerarR2099({ ...base(), grupos: { 'R-2010': true, 'R-9999': true } }),
  /desconhecido/, 'grupo fora da tabela é recusa, nunca descarte silencioso');

// ─── 5. A TRAVA: produção restrita PERGUNTA, produção AFIRMA ────────────────
//
// Esta é a razão de existir deste bloco. O leiaute do infoFech é HIPÓTESE
// enquanto não houver arquivo aceito; e fechamento com indicador errado é
// aceito sem recusa, com o totalizador saindo a menor.
assert.deepStrictEqual(podeTransmitirR2099({ tpAmb: 2 }), { ok: true },
  'produção RESTRITA é livre — é lá que se prova');

const bloqueio = podeTransmitirR2099({ tpAmb: 1 });
assert.strictEqual(bloqueio.ok, false, 'PRODUÇÃO é recusada enquanto o leiaute não for provado');
assert.strictEqual(bloqueio.motivo, MOTIVO_LEIAUTE_NAO_PROVADO);
assert.ok(/e-CAC/.test(bloqueio.motivo),
  'a recusa oferece a SAÍDA (fechar no e-CAC) — trava sem caminho é trava que a equipe contorna');
assert.ok(/RESTRITA/i.test(bloqueio.motivo), 'e diz como provar');

assert.deepStrictEqual(podeTransmitirR2099({ tpAmb: 1, leiauteProvado: true }), { ok: true },
  'com o leiaute provado, produção libera');

// ─── 6. Validação pura e exportada ──────────────────────────────────────────
assert.deepStrictEqual(validarEntradaR2099(base()), [], 'entrada válida = sem erros');
assert.ok(validarEntradaR2099({ ...base(), perApur: '07/2026' }).some((x) => /AAAA-MM/.test(x)));
assert.ok(validarEntradaR2099({ ...base(), tpAmb: 3 }).some((x) => /tpAmb/.test(x)));
assert.ok(validarEntradaR2099({ ...base(), contribuinte: { tpInsc: 9, nrInsc: '1' } }).some((x) => /tpInsc/.test(x)));

// ─── 7. A TABELA É HIPÓTESE, e o código DIZ isso ────────────────────────────
//
// Sem este aviso escrito, daqui a três meses alguém lê `LEIAUTE_INFOFECH` como
// fato consumado — foi assim que o "espelho simplificado" do CFOP divergiu do
// arquivo por meses sem ninguém ver.
const fonte = require('fs').readFileSync(require('path').join(__dirname, '..', 'reinf/gerar-r2099.js'), 'utf8');
assert.ok(/HIPÓTESE/.test(fonte), 'o módulo declara por escrito o que ainda não é prova');
assert.ok(/arquivo aceito/i.test(fonte), 'e aponta o que destrava');
assert.strictEqual(LEIAUTE_INFOFECH.length, 7, 'sete grupos da série R-2000 na tabela');
LEIAUTE_INFOFECH.forEach((g) => {
  assert.ok(/^R-20\d\d$/.test(g.evento), `${g.evento} tem o formato do código do evento`);
  assert.ok(g.tag && g.descricao, `${g.evento} leva tag e descrição — a sonda carrega a hipótese por escrito`);
});

console.log('✅ R-2099: esqueleto provado do R-4099, grupos S/N sem default, fechar vazio é declaração '
  + 'explícita, e PRODUÇÃO recusada enquanto o infoFech for hipótese (restrita livre para provar).');

// ═══════════════════════════════════════════════════════════════════════════
// OS GRUPOS SAEM DO QUE FOI TRANSMITIDO — nunca de um formulário.
//
// Marcar à mão falha nas duas direções, e as duas custam: esquecer um grupo faz
// a Receita não consolidar aquele bloco (totalizador a MENOR, guia paga a
// menor, sem recusa avisando); marcar um que não teve evento fecha bloco vazio.
// É a mesma razão pela qual o rito de fechamento do CFI monta a lista da
// auditoria do gateway, e não da memória de quem fecha o mês às 18h do dia 14.
// ═══════════════════════════════════════════════════════════════════════════
const { derivarGruposDoLog, resumoDoFechamento, contaComoAceito } = require('../reinf/fechamento-2000-grupos');

const log = (acao, detalhes) => ({ acao, criado_em: '2026-08-14T12:00:00.000Z', detalhes });

const derivado = derivarGruposDoLog([
  log('transmitir_r2055', { competencia: '2026-07', protocolo: '2.202608.33245995', tpAmb: 1 }),
  log('transmitir_r2010', { competencia: '2026-07', protocolo: '2.202608.33245996', tpAmb: 1 }),
  log('transmitir_r2055', { competencia: '2026-06', protocolo: '2.202607.11111111', tpAmb: 1 }),
  log('transmitir_r4020', { competencia: '2026-07', protocolo: '2.202608.99999999' }),
], '2026-07');

assert.deepStrictEqual(Object.keys(derivado.grupos).sort(), ['R-2010', 'R-2055'],
  'só os grupos com evento aceito NA competência');
assert.strictEqual(derivado.evidencias.length, 2, 'cada grupo vem com o protocolo que o prova');
assert.ok(derivado.evidencias.every((e) => e.protocolo), 'evidência sem protocolo não é evidência');
assert.strictEqual(derivado.temEvento, true);

// 201 sozinho NÃO conta — foi assim que o R-2055 pintou ✓ verde com MS0030.
assert.strictEqual(contaComoAceito(log('x', { httpStatus: 201 })), false,
  'sem protocolo o lote não chegou: httpStatus 201 sozinho não é aceite');
assert.strictEqual(contaComoAceito(log('x', { protocolo: 'p', eventosRecusados: true })), false,
  'lote recebido com EVENTOS recusados não gera evento nenhum');
assert.strictEqual(contaComoAceito(log('x', { protocolo: 'p', aguardandoProcessamento: true })), false,
  'ainda em processamento não é aceite');

// O que ficou de fora é NOMEADO — quem fecha precisa saber que tem evento que
// ele acha que mandou e a Receita não recebeu.
const comRecusa = derivarGruposDoLog([
  log('transmitir_r2055', { competencia: '2026-07', protocolo: 'p1' }),
  log('transmitir_r2010', { competencia: '2026-07', protocolo: 'p2', eventosRecusados: true }),
], '2026-07');
assert.deepStrictEqual(Object.keys(comRecusa.grupos), ['R-2055']);
assert.strictEqual(comRecusa.ignorados.length, 1);
assert.strictEqual(comRecusa.ignorados[0].grupo, 'R-2010');
assert.ok(/recusados/.test(comRecusa.ignorados[0].motivo));

const resumoRecusa = resumoDoFechamento(comRecusa, '2026-07');
assert.strictEqual(resumoRecusa.podeFecharTranquilo, false, 'com evento pendurado, fechar não é tranquilo');
assert.ok(resumoRecusa.avisos.some((a) => /reabertura \(R-2098\)/.test(a)),
  'o aviso diz o CUSTO de fechar cedo — depois só com reabertura');

// Log vazio NÃO vira "sem movimento" em silêncio.
const vazio = resumoDoFechamento(derivarGruposDoLog([], '2026-07'), '2026-07');
assert.strictEqual(vazio.declarados.length, 0);
assert.ok(vazio.avisos.some((a) => /SEM MOVIMENTO/.test(a) && /não chegou/.test(a)),
  'zero não é sucesso: a diferença entre "não houve" e "não achei" não está no zero');

const tranquilo = resumoDoFechamento(derivado, '2026-07');
assert.strictEqual(tranquilo.podeFecharTranquilo, true);
assert.deepStrictEqual(tranquilo.declarados, ['R-2010', 'R-2055']);

console.log('✅ R-2099: os grupos saem do LOG das transmissões aceitas — lista digitada esquece evento, '
  + 'e evento esquecido faz a Receita consolidar a menor sem recusa nenhuma.');

// ═══════════════════════════════════════════════════════════════════════════
// ROTA NOVA NASCE COM O BOTÃO QUE A CHAMA (mata-burro de 13/08).
//
// O rito de fechamento da EFD-Reinf já subiu uma vez com 23 testes e ZERO
// caminho na interface — código morto com cara de entrega. Não de novo.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const raiz = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = raiz('index.html');
const adapter = raiz('api-adapter.js');
const rotas = raiz('reinf-routes.js');

assert.ok(/R-2099 · Fechamento da competência/.test(html), 'o card do R-2099 existe na aba R-2000');
['conferirFechamento2000', 'transmitirFechamento2000', 'renderizarFechamento2000'].forEach((fn) => {
  assert.ok(html.includes('function ' + fn), 'função ' + fn + ' definida');
});
['reinfFechamento2000', 'reinfFechamento2000Transmitir'].forEach((api) => {
  assert.ok(html.includes('window.API.' + api), 'a tela chama ' + api);
  assert.ok(adapter.includes('async function ' + api + '('), api + ' existe no adapter');
  assert.ok(adapter.includes(api + ','), api + ' está exportado — sem isso a tela quebra em runtime');
});
assert.ok(rotas.includes("router.get('/fechamento-2000/:cnpj/:competencia'"), 'rota de conferência');
assert.ok(rotas.includes("router.post('/fechamento-2000/transmitir'"), 'rota de fechamento');

// A tela NÃO pode oferecer produção quando o backend a recusa — botão que some
// com a razão do lado é honesto; botão que erra no clique gasta o tempo de quem
// está fechando o mês.
assert.ok(/resp\.producaoLiberada/.test(html), 'o botão de PRODUÇÃO depende do que o backend liberou');
assert.ok(/motivoProducao/.test(html), 'e o motivo aparece no lugar dele');

// O custo de fechar cedo tem que estar ESCRITO antes do clique.
assert.ok(/R-2098/.test(html), 'a tela diz que depois de fechar só entra com reabertura');
assert.ok(/manda a Receita apurar/i.test(html), 'e diz o que o fechamento FAZ');

// Aceite em RESTRITA é PROVA do leiaute — a tela nomeia isso.
assert.ok(/provaDoLeiaute/.test(html) && /PROVADO/.test(html),
  'aceito em restrita é o que prova o infoFech, e a tela diz para mandar o retorno');

// A tela não pode ter régua própria: os grupos vêm do backend.
assert.ok(!/evtServTm|evtAquis|evtCPRB/.test(html),
  'os nomes das tags do infoFech NÃO aparecem na tela — reproduzi-los criaria a segunda cópia da hipótese');

console.log('✅ R-2099: tela na aba R-2000, produção só aparece quando o backend libera, e o custo da '
  + 'reabertura (R-2098) está escrito ANTES do clique.');

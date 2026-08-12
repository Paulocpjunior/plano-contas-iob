// ============================================================================
// "E QUEM EU PROCURO?" — o consumo do túnel do cadastro do Consultor Fiscal.
//
// As ressalvas do R-4020 e do R-2055 quase sempre terminam em "alguém do
// escritório precisa olhar este cliente". Quem é esse alguém saía por WhatsApp,
// de memória.
//
// O que estes testes trancam é o comportamento NA AUSÊNCIA e NO CONFLITO, que
// é onde a tentação de "pega o primeiro" faria a pessoa falar com quem não
// cuida do cliente — e nunca desconfiar.
// ============================================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { montarUrlCadastroCfi, buscarResponsavelNoCfi } = require('../reinf/cfi-notas-client');
const { resumirResponsavel, avisosDoResponsavel } = require('../reinf/responsavel-escritorio');

const ana = { uid: 'u1', nome: 'Ana Souza', email: 'ana@spassessoriacontabil.com.br', papel: 'principal', avisos: [] };
const bruno = { uid: 'u2', nome: 'Bruno Lima', email: 'bruno@spassessoriacontabil.com.br', papel: 'principal', avisos: [] };
const carla = { uid: 'u3', nome: 'Carla Reis', email: 'carla@spassessoriacontabil.com.br', papel: 'backup', avisos: [] };

const linha = (over = {}) => Object.assign({
  cnpj: '51227692000146', nome: 'CLINIPAR LTDA',
  principal: ana, principais: [ana], backups: [], responsaveis: [ana],
  conflito: null, pendenteDeAtribuicao: false,
}, over);

// ─── A URL do túnel: outra família de rota, sem competência ─────────────────
const env = { CFI_URL: 'https://cfi.exemplo.app/' };
assert.strictEqual(
  montarUrlCadastroCfi({ cnpj: '51.227.692/0001-46' }, env),
  'https://cfi.exemplo.app/api/admin/cadastro/responsaveis/51227692000146',
  'CNPJ vai só com dígitos e a barra do fim some',
);
assert.throws(() => montarUrlCadastroCfi({ cnpj: '51227692000146' }, {}), /CFI_URL/,
  'sem env a mensagem diz QUAL variável falta');
assert.throws(() => montarUrlCadastroCfi({ cnpj: '123' }, env), /14 dígitos/);

// ─── O caso normal ──────────────────────────────────────────────────────────
const ok = resumirResponsavel(linha());
assert.strictEqual(ok.situacao, 'ok');
assert.match(ok.frase, /fale com Ana Souza \(ana@spassessoriacontabil\.com\.br\)/);
assert.strictEqual(ok.exigeAcao, false);
assert.deepStrictEqual(ok.contatos, ['ana@spassessoriacontabil.com.br']);

const comBackup = resumirResponsavel(linha({ backups: [carla] }));
assert.match(comBackup.frase, /Backup: Carla Reis/, 'o backup aparece, mas depois do titular');
assert.deepStrictEqual(comBackup.contatos.length, 2);

// ─── DOIS PRINCIPAIS: aqui também não se escolhe ────────────────────────────
// O túnel devolve principal:null de propósito. "Pega o primeiro" faria a
// colaboradora falar com a pessoa errada sem desconfiar.
const conflito = resumirResponsavel(linha({ principal: null, principais: [ana, bruno], responsaveis: [ana, bruno] }));
assert.strictEqual(conflito.situacao, 'conflito');
assert.match(conflito.frase, /Ana Souza/);
assert.match(conflito.frase, /Bruno Lima/, 'os DOIS nomes aparecem — quem decide é gente');
assert.match(conflito.frase, /não escolhe por conta própria/);
assert.match(conflito.frase, /Atribuição da Carteira/, 'e diz ONDE arrumar');
assert.strictEqual(conflito.exigeAcao, true);

// ─── SEM RESPONSÁVEL: pendência de atribuição, não falta de cadastro ────────
const semDono = resumirResponsavel(linha({
  principal: null, principais: [], responsaveis: [], pendenteDeAtribuicao: true,
}));
assert.strictEqual(semDono.situacao, 'sem-responsavel');
assert.match(semDono.frase, /pendência de atribuição, não falta de cadastro/,
  'confundir os dois manda procurar problema num cadastro que está certo');
assert.match(semDono.frase, /CLINIPAR LTDA/, 'a frase nomeia o cliente');
assert.strictEqual(semDono.exigeAcao, true);
assert.deepStrictEqual(semDono.contatos, []);

// ─── SÓ BACKUP: responde, mas não é o titular ───────────────────────────────
const soBackup = resumirResponsavel(linha({ principal: null, principais: [], backups: [carla], responsaveis: [carla] }));
assert.strictEqual(soBackup.situacao, 'so-backup');
assert.match(soBackup.frase, /titular está faltando/);
assert.strictEqual(soBackup.exigeAcao, true);

// ─── SEM E-MAIL: acende, porque é o e-mail que serve pra falar com ele ──────
const semEmail = resumirResponsavel(linha({
  principal: Object.assign({}, ana, { email: null }),
  principais: [Object.assign({}, ana, { email: null })],
}));
assert.strictEqual(semEmail.situacao, 'sem-email');
assert.match(semEmail.frase, /SEM e-mail no cadastro/);
assert.strictEqual(semEmail.exigeAcao, true);
assert.deepStrictEqual(semEmail.contatos, []);

// ─── Túnel fora do ar não inventa responsável ───────────────────────────────
const indisp = resumirResponsavel(null);
assert.strictEqual(indisp.situacao, 'indisponivel');
assert.strictEqual(indisp.exigeAcao, false);
assert.deepStrictEqual(indisp.contatos, []);

// ─── Os avisos do túnel chegam ao colaborador ───────────────────────────────
const avisos = avisosDoResponsavel(linha({
  principais: [Object.assign({}, ana, { avisos: ['Colaborador sem cadastro em `users`.'] })],
  backups: [Object.assign({}, carla, { avisos: ['O vínculo diz outro nome.'] })],
}));
assert.strictEqual(avisos.length, 2);
assert.match(avisos[0], /^Ana Souza: /, 'o aviso diz de QUEM é');
assert.deepStrictEqual(avisosDoResponsavel(linha()), [], 'sem aviso não se inventa aviso');
assert.deepStrictEqual(avisosDoResponsavel(null), []);

// ─── A chamada de rede: erro não vira "sem responsável" ─────────────────────
(async () => {
  const fake = async () => ({ status: 200, json: async () => Object.assign({ ok: true }, linha()) });
  const r = await buscarResponsavelNoCfi({ cnpj: '51227692000146', token: 't' }, { fetch: fake, env });
  assert.strictEqual(r.nome, 'CLINIPAR LTDA');

  // Empresa cadastrada e SEM responsável responde 200, não 404: ela existe, o
  // que falta é atribuição. Um 404 aqui mandaria caçar cadastro certo.
  const semDonoNaRede = async () => ({
    status: 200,
    json: async () => Object.assign({ ok: true }, linha({ principais: [], responsaveis: [], pendenteDeAtribuicao: true })),
  });
  const r2 = await buscarResponsavelNoCfi({ cnpj: '51227692000146', token: 't' }, { fetch: semDonoNaRede, env });
  assert.strictEqual(resumirResponsavel(r2).situacao, 'sem-responsavel');

  await assert.rejects(
    buscarResponsavelNoCfi({ cnpj: '51227692000146', token: '' }, { fetch: fake, env }),
    /Sessão sem token/,
  );
  await assert.rejects(
    buscarResponsavelNoCfi({ cnpj: '51227692000146', token: 't' }, {
      fetch: async () => { throw new Error('ECONNREFUSED'); }, env,
    }),
    /Não consegui falar com o Consultor Fiscal/,
    'falha de rede é dita, nunca engolida como "ninguém responde"',
  );

  // ─── A TELA ───────────────────────────────────────────────────────────────
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // TODA tela que apura por CNPJ mostra a quem recorrer — e chama nos DOIS
  // caminhos, porque é no ERRO que a pessoa mais precisa saber com quem falar.
  //
  // A lista é explícita e o teste conta POR TELA. Antes ele fixava o total em
  // 4, e a terceira tela (R-2010, 13/08) o quebrou sem ter nada de errado —
  // número mágico transforma feature nova em falso alarme, e falso alarme é o
  // que faz alguém "consertar" o teste em vez de ler.
  const TELAS_COM_RESPONSAVEL = [
    { evento: 'R-4020', alvo: 'reinfRetPjTabelaResp' },
    { evento: 'R-2055', alvo: 'reinfAqRuralTabelaResp' },
    { evento: 'R-2010', alvo: 'reinfServTomTabelaResp' },
  ];
  for (const t of TELAS_COM_RESPONSAVEL) {
    assert.ok(html.includes('id="' + t.alvo + '"'), t.evento + ' tem onde mostrar o responsável');
    const chamadas = (html.match(new RegExp("mostrarResponsavelEscritorio\\(cnpj, '" + t.alvo + "'\\)", 'g')) || []).length;
    assert.strictEqual(chamadas, 2,
      t.evento + ': deve chamar no SUCESSO e no ERRO (achei ' + chamadas + ')');
  }

  const adapter = fs.readFileSync(path.join(__dirname, '..', 'api-adapter.js'), 'utf8');
  assert.ok(/reinfResponsavel,/.test(adapter), 'a função está exportada no window.API');

  const rotas = fs.readFileSync(path.join(__dirname, '..', 'reinf-routes.js'), 'utf8');
  assert.ok(rotas.includes("router.get('/responsavel/:cnpj'"), 'a rota existe');

  console.log('OK: responsável no escritório — ausência e conflito não viram escolha silenciosa.');
})().catch((e) => { console.error(e); process.exit(1); });

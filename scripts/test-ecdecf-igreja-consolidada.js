#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const match = indexHtml.match(/\/\/ ===ECDECF-ENGINE-START===[\s\S]*?\/\/ ===ECDECF-ENGINE-END===/);
if (!match) throw new Error('Motor ECD/ECF nao encontrado no index.html');

const sandbox = { console, window: {}, globalThis: {} };
vm.runInNewContext(match[0], sandbox);
const E = sandbox.window.EcdEcfEngine || sandbox.globalThis.EcdEcfEngine;
if (!E) throw new Error('EcdEcfEngine nao inicializado');

const ecdAbertura = E.parseEcd('|0000|LECD|01012025|31122025|EMPRESA EM ABERTURA|58271340000137|SC||4205407|||1|0|0||0|0||N|N|0|0|5|');
const ecdInicioObrigatoriedade = E.parseEcd('|0000|LECD|01012025|31122025|INICIO OBRIGATORIEDADE|58271340000137|SC||4205407|||3|0|0||0|0||N|N|0|0|5|');
const ecdContinuidade = E.parseEcd('|0000|LECD|01012025|31122025|EMPRESA CONTINUA|58271340000137|SC||4205407|||0|0|0||0|0||N|N|0|0|5|');
if (E.exigeEcdAnterior(ecdAbertura)) throw new Error('ECD de abertura (0000 campo 12 = 1) nao pode exigir ECD anterior');
if (E.exigeEcdAnterior(ecdInicioObrigatoriedade)) throw new Error('Inicio de obrigatoriedade (0000 campo 12 = 3) nao pode exigir ECD anterior');
if (!E.exigeEcdAnterior(ecdContinuidade)) throw new Error('ECD normal (0000 campo 12 = 0) deve exigir ECD anterior');

const arquivosAtuais = [
  '/Users/paulocesarpereirajunior/Downloads/ECD2055.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD3451.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD3452.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD3453.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD3454.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD3455.TXT',
];
const arquivoAnterior = '/Users/paulocesarpereirajunior/Downloads/31563533000105-31563533000105-20240101-20241231-G-E24C163F348FEFFB595D42B7055C76F75C26F4B6-7-SPED-ECD.txt';

const faltantes = arquivosAtuais.concat(arquivoAnterior).filter((file) => !fs.existsSync(file));
if (faltantes.length) {
  console.log('SKIP: fixtures ECD/ECF igreja nao encontrados:', faltantes.map(path.basename).join(', '));
  process.exit(0);
}

function fields(line) { return line.split('|'); }
function num(valor) { return valor ? Math.round(parseFloat(String(valor).replace(',', '.')) * 100) : 0; }
function sgn(valor, dc) { return dc === 'D' ? valor : -valor; }
function fmt(valor) { return (valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function parseFile(file) {
  const text = fs.readFileSync(file, 'latin1');
  const parsed = E.parseEcd(text);
  parsed.nomeArquivo = path.basename(file);
  return parsed;
}

function primeiroI155(arquivos) {
  const ini = {};
  arquivos.forEach((arquivo) => {
    let noPrimeiro = false;
    for (const line of arquivo.lines) {
      const f = fields(line);
      if (f[1] === 'I150') {
        if (noPrimeiro) break;
        noPrimeiro = true;
      } else if (f[1] === 'I155' && noPrimeiro) {
        ini[f[2]] = (ini[f[2]] || 0) + sgn(num(f[4]), f[5]);
      }
    }
  });
  return ini;
}

function ajustesDaEcdAnterior(anterior, atuais) {
  const planoAnterior = {};
  const j100Anterior = {};
  let contaAtual = '';
  anterior.lines.forEach((line) => {
    const f = fields(line);
    if (f[1] === 'I050') {
      contaAtual = f[6];
      planoAnterior[contaAtual] = { i050Line: line, i051Lines: [], i052Lines: [] };
    } else if ((f[1] === 'I051' || f[1] === 'I052') && contaAtual && planoAnterior[contaAtual]) {
      if (f[1] === 'I051') planoAnterior[contaAtual].i051Lines.push(line);
      if (f[1] === 'I052') planoAnterior[contaAtual].i052Lines.push(line);
    } else if (f[1] === 'J100') {
      j100Anterior[f[2]] = line;
    }
  });

  const periodos = [];
  let atual = null;
  anterior.lines.forEach((line) => {
    const f = fields(line);
    if (f[1] === 'I150') {
      atual = [];
      periodos.push(atual);
    } else if (f[1] === 'I155' && atual) {
      atual.push(f);
    }
  });

  const fin = {};
  const centroAnterior = {};
  (periodos.at(-1) || []).forEach((f) => {
    fin[f[2]] = (fin[f[2]] || 0) + sgn(num(f[8]), f[9]);
    centroAnterior[f[2]] = f[3] || '';
  });
  Object.entries(j100Anterior).forEach(([conta, line]) => {
    const f = fields(line);
    if (f[3] !== 'D') return;
    if (f[6] !== 'A' && f[6] !== 'P') return;
    if (conta.charAt(0) !== '1' && conta.charAt(0) !== '2') return;
    fin[conta] = sgn(num(f[10]), f[11]);
  });

  const ini = primeiroI155(atuais);
  const ajustes = [];
  Object.keys(fin).forEach((conta) => {
    if (conta.charAt(0) !== '1' && conta.charAt(0) !== '2') return;
    const delta = fin[conta] - (ini[conta] || 0);
    if (!delta) return;
    ajustes.push({
      conta,
      contaAnterior: conta,
      centro: centroAnterior[conta] || '',
      centroAnterior: centroAnterior[conta] || '',
      delta,
      i050Line: planoAnterior[conta] && planoAnterior[conta].i050Line,
      i051Lines: planoAnterior[conta] && planoAnterior[conta].i051Lines,
      i052Lines: planoAnterior[conta] && planoAnterior[conta].i052Lines,
      j100Line: j100Anterior[conta] || '',
    });
  });
  return ajustes;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resumoJ100Raiz(lines, inicial) {
  const resumo = { ativo: 0, passivo: 0 };
  const blocos = [];
  let bloco = null;
  lines.forEach((line) => {
    const f = fields(line);
    if (f[1] === 'J005') {
      bloco = [];
      blocos.push(bloco);
    } else if (f[1] === 'J100') {
      if (!bloco) {
        bloco = [];
        blocos.push(bloco);
      }
      bloco.push(line);
    }
  });
  const ultimo = [...blocos].reverse().find((item) => item.length) || [];
  ultimo.forEach((line) => {
    const f = fields(line);
    if (f[4] !== '1') return;
    const valor = inicial ? sgn(num(f[8]), f[9]) : sgn(num(f[10]), f[11]);
    if (f[6] === 'A') resumo.ativo += valor;
    if (f[6] === 'P') resumo.passivo += -valor;
  });
  return resumo;
}

function dateKeySped(data) {
  const d = String(data || '');
  return /^\d{8}$/.test(d) ? d.slice(4, 8) + d.slice(2, 4) + d.slice(0, 2) : d;
}

function inPeriod(dt, ini, fim) {
  const k = dateKeySped(dt);
  return k >= dateKeySped(ini) && k <= dateKeySped(fim);
}

function divergenciasI155I250(lines) {
  const periods = [];
  let cur = null;
  lines.forEach((line) => {
    const x = fields(line);
    if (x[1] === 'I150') {
      cur = { i150: x, i155: [] };
      periods.push(cur);
    } else if (x[1] === 'I155' && cur) {
      cur.i155.push(x);
    }
  });

  const lancamentos = [];
  let lcto = null;
  lines.forEach((line) => {
    const x = fields(line);
    if (x[1] === 'I200') {
      lcto = { i200: x, i250: [] };
      lancamentos.push(lcto);
    } else if (x[1] === 'I250' && lcto) {
      lcto.i250.push(x);
    }
  });

  const bad = [];
  periods.forEach((period) => {
    const mov = {};
    lancamentos.forEach((l) => {
      if (!inPeriod(l.i200[3], period.i150[2], period.i150[3])) return;
      l.i250.forEach((x) => {
        const key = `${x[2]}::${x[3] || ''}`;
        mov[key] ||= { d: 0, c: 0 };
        const value = num(x[4]);
        if (x[5] === 'D') mov[key].d += value;
        else mov[key].c += value;
      });
    });
    period.i155.forEach((x) => {
      const key = `${x[2]}::${x[3] || ''}`;
      const m = mov[key] || { d: 0, c: 0 };
      const deb = num(x[6]);
      const cred = num(x[7]);
      if (deb !== m.d || cred !== m.c) {
        bad.push(`${x[2]} ${period.i150[2]}-${period.i150[3]} I155 D ${fmt(deb)} C ${fmt(cred)} x I250 D ${fmt(m.d)} C ${fmt(m.c)}`);
      }
    });
  });
  return bad;
}

const atuais = arquivosAtuais.map(parseFile);
const matriz = atuais.find((a) => a.isMatriz);
const filiais = atuais.filter((a) => a !== matriz);
const anterior = parseFile(arquivoAnterior);
const ajustes = ajustesDaEcdAnterior(anterior, atuais);
const resultado = E.consolidar(matriz, filiais, ajustes, { ecdAnteriorLines: anterior.lines });
const validacao = E.validar(resultado.lines, { cnpjEsperado: '31563533000105', ecdAnteriorLines: anterior.lines });

const grupos = {};
resultado.lines.forEach((line) => {
  const f = fields(line);
  (grupos[f[1]] ||= []).push(f);
});

const j100Codigos = {};
(grupos.J100 || []).forEach((f) => { j100Codigos[f[2]] = (j100Codigos[f[2]] || 0) + 1; });
const duplicadosJ100 = Object.entries(j100Codigos).filter(([, count]) => count > 1);
assert(!duplicadosJ100.length, `J100 duplicado: ${duplicadosJ100.map(([cod, count]) => `${cod} x${count}`).join(', ')}`);
assert((grupos.I157 || []).length >= 1, 'Consolidado com IND_MUDANCA_PC=1 deve gerar I157');
assert((grupos.I050 || []).some((f) => f[6] === '2.4.6.01.0003'), 'I050 recuperado 2.4.6.01.0003 deve existir');
assert((grupos.J100 || []).some((f) => f[2] === '2.4.6.01.0003'), 'J100 recuperado 2.4.6.01.0003 deve existir');

let ativo = 0;
let passivo = 0;
(grupos.J100 || []).forEach((f) => {
  if (f[4] !== '1') return;
  const valor = sgn(num(f[10]), f[11]);
  if (f[6] === 'A') ativo += valor;
  if (f[6] === 'P') passivo += -valor;
});
assert(ativo !== passivo, 'Fixture real deve permanecer bloqueado quando a origem contábil nao fecha Ativo/Passivo sem ajuste artificial');
assert(resultado.avisos.some((aviso) => /Divergencias contabeis bloqueantes/.test(aviso)), 'Consolidacao deve diagnosticar divergencia contabil bloqueante em vez de ajustar automaticamente');
assert(!resultado.avisos.some((aviso) => /I155 patrimonial/.test(aviso)), 'Balancete mensal I155 nao deve ser bloqueado por resultado ainda nao encerrado');
assert(validacao.checks.some((check) => check.nome === 'Quantidade de campos por registro SPED' && check.ok), 'Leiaute 9 deve aceitar I200/I350/I355/J100/J150 com a quantidade oficial de campos');

const raizAnterior = resumoJ100Raiz(anterior.lines, false);
const raizAbertura = resumoJ100Raiz(resultado.lines, true);
assert(raizAnterior.ativo === raizAbertura.ativo, `Abertura do ativo ${fmt(raizAbertura.ativo)} difere do encerramento anterior ${fmt(raizAnterior.ativo)}`);
assert(raizAnterior.passivo === raizAbertura.passivo, `Abertura do passivo ${fmt(raizAbertura.passivo)} difere do encerramento anterior ${fmt(raizAnterior.passivo)}`);
assert(validacao.checks.some((check) => check.nome === 'Abertura J100 = encerramento da ECD anterior' && check.ok), 'Validador deve comparar abertura J100 com encerramento da ECD anterior');
assert(validacao.checks.some((check) => check.nome === 'Abertura I155 = encerramento da ECD anterior' && check.ok), 'Validador deve comparar abertura I155 com encerramento da ECD anterior');
assert(validacao.checks.some((check) => check.nome === 'Movimentos I155 = I250 por periodo/conta' && check.ok), 'Validador deve comparar debitos/creditos I155 com I250 por periodo');
assert(validacao.checks.some((check) => check.nome === 'Abertura J150 = encerramento da DRE anterior'), 'Validador deve comparar abertura J150 com encerramento da ECD anterior quando houver recuperacao');
const divergenciasMovimento = divergenciasI155I250(resultado.lines);
assert(!divergenciasMovimento.length, `I155 diverge de I250: ${divergenciasMovimento.slice(0, 5).join('; ')}`);

const linhasTecnicasI250 = resultado.lines
  .map(fields)
  .filter((f) => f[1] === 'I250' && /Ajuste tecnico de consolidacao|Contrapartida ajuste tecnico/.test(f[8] || ''));
assert(!linhasTecnicasI250.length, 'Consolidacao nao deve gerar I250 tecnico para fechar saldos periodicos');
const linhasTecnicasI200 = resultado.lines
  .map(fields)
  .filter((f) => f[1] === 'I200' && /^AJUSTE/.test(String(f[2] || '')));
assert(!linhasTecnicasI200.length, 'Consolidacao nao deve gerar I200 tecnico para fechar saldos periodicos');

const falhasBloqueantes = validacao.checks.filter((check) => !check.ok);
assert(falhasBloqueantes.some((check) => /Balanco patrimonial/.test(check.nome)), 'Validador deve reprovar balanco quando a origem consolidada nao fecha');

const matrizSemMudanca = parseFile(arquivosAtuais[0]);
matrizSemMudanca.lines = matrizSemMudanca.lines.map((line) => {
  const f = fields(line);
  if (f[1] === '0000') {
    f[22] = '0';
    return f.join('|');
  }
  return line;
});
matrizSemMudanca.groups = E.parseEcd(matrizSemMudanca.lines.join('\n')).groups;
const ajusteSemMudanca = [{
  conta: '1.2.3.01.0003',
  contaAnterior: '1.2.3.01.0003',
  centro: '',
  centroAnterior: '',
  delta: 12345,
}];
const resultadoSemMudanca = E.consolidar(matrizSemMudanca, filiais, ajusteSemMudanca);
const gruposSemMudanca = {};
resultadoSemMudanca.lines.forEach((line) => {
  const f = fields(line);
  (gruposSemMudanca[f[1]] ||= []).push(f);
});
assert(!(gruposSemMudanca.I157 || []).length, 'Consolidado sem IND_MUDANCA_PC=1 nao deve gerar I157');
assert((gruposSemMudanca.I155 || []).some((f) => f[2] === '1.2.3.01.0003'), 'Ajuste sem mudanca deve gerar I155 da conta recuperada');
assert((gruposSemMudanca.I050 || []).some((f) => f[6] === '1.2.3.01.0003'), 'Conta recuperada usada no I155 deve existir no I050');

const arquivosSaoJose = [
  '/Users/paulocesarpereirajunior/Downloads/ECD0212.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD2311.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD2313.TXT',
  '/Users/paulocesarpereirajunior/Downloads/ECD2314.TXT',
];
const anteriorSaoJose = '/Users/paulocesarpereirajunior/Downloads/07043084000190-07043084000190-20240101-20241231-G-49EC0D3DFA6CAAF26994AB211F41BD8B697C69BD-7-SPED-ECD.txt';
if (arquivosSaoJose.concat(anteriorSaoJose).every(fs.existsSync)) {
  const atuaisSaoJose = arquivosSaoJose.map(parseFile);
  const matrizSaoJose = atuaisSaoJose.find((arquivo) => arquivo.isMatriz);
  const filiaisSaoJose = atuaisSaoJose.filter((arquivo) => arquivo !== matrizSaoJose);
  const recuperadaSaoJose = parseFile(anteriorSaoJose);
  const ajustesSaoJose = ajustesDaEcdAnterior(recuperadaSaoJose, atuaisSaoJose);
  const consolidadoSaoJose = E.consolidar(matrizSaoJose, filiaisSaoJose, ajustesSaoJose, { ecdAnteriorLines: recuperadaSaoJose.lines });
  const validacaoSaoJose = E.validar(consolidadoSaoJose.lines, {
    cnpjEsperado: '07043084000190',
    ecdAnteriorLines: recuperadaSaoJose.lines,
  });
  const raizRecuperadaSaoJose = resumoJ100Raiz(recuperadaSaoJose.lines, false);
  const raizAberturaSaoJose = resumoJ100Raiz(consolidadoSaoJose.lines, true);
  assert(raizRecuperadaSaoJose.ativo === 52199539, 'ECD recuperada deve usar encerramento do ultimo J005/J100, sem somar janeiro com fevereiro-dezembro');
  assert(raizRecuperadaSaoJose.passivo === 52199539, 'Passivo recuperado deve vir do ultimo demonstrativo J100');
  assert(raizAberturaSaoJose.ativo === raizRecuperadaSaoJose.ativo, 'Abertura J100 consolidada deve conferir com o ultimo J100 recuperado');
  assert(raizAberturaSaoJose.passivo === raizRecuperadaSaoJose.passivo, 'Passivo de abertura deve conferir com o ultimo J100 recuperado');
  const checkJ100SaoJose = validacaoSaoJose.checks.find((check) => check.nome === 'Abertura J100 = encerramento da ECD anterior');
  assert(checkJ100SaoJose && checkJ100SaoJose.ok, `Regional Sao Jose nao pode ter falsa divergencia J100: ${checkJ100SaoJose && checkJ100SaoJose.detalhe}`);
  assert(validacaoSaoJose.falhas === 0, `Regional Sao Jose deve ficar apta: ${validacaoSaoJose.checks.filter((check) => !check.ok).map((check) => check.nome).join(', ')}`);
}

console.log(`OK: ECD igreja consolidada protege divergencia real e usa somente o ultimo J005/J100 da ECD recuperada.`);

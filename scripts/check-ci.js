#!/usr/bin/env node
/**
 * scripts/check-ci.js — porta de qualidade que roda em QUALQUER máquina.
 *
 * POR QUE EXISTE: o `npm run check` é a porta completa, mas boa parte dos
 * testes abre arquivos de evidência que só existem no Mac de quem os gravou
 * (/Users/.../Downloads/EXTRATO ...). Num runner de CI eles falham por falta
 * do arquivo — não por defeito no código —, e um gate que sempre falha vira
 * gate ignorado.
 *
 * Este runner roda TODOS os scripts de teste e separa três situações:
 *   ✓ passou
 *   ⊘ PULADO — a evidência não está nesta máquina (não é falha)
 *   ✗ FALHOU — defeito de verdade, derruba o gate
 *
 * FAROL HONESTO: o resumo sempre diz quantos pularam. "24 de 36" nunca é
 * apresentado como "tudo verde" — quem lê sabe que a cobertura completa
 * depende de rodar `npm run check` na máquina com as evidências.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/** Saídas que significam "a evidência não está aqui", não "o código quebrou". */
const PADRAO_SEM_EVIDENCIA = /(arquivo de (evid[eê]ncia|regress[aã]o)|fixtures?)[^\n]*n[aã]o encontrad|fixture not found/i;

/**
 * Nem todo teste avisa com mensagem própria — alguns só estouram ENOENT ao
 * abrir o PDF. Vale a mesma regra, mas só quando o arquivo que faltou está
 * FORA do repositório (evidência na máquina de quem gravou). Arquivo faltando
 * DENTRO do repo é defeito de verdade e continua derrubando o gate.
 */
function faltouEvidenciaExterna(saida) {
    if (!/ENOENT/.test(saida)) return false;
    const caminhos = [...saida.matchAll(/'([^']*\/[^']*)'/g)].map((m) => m[1]);
    return caminhos.some((c) => c.startsWith('/') && !c.startsWith(RAIZ));
}

function listarScriptsDeTeste() {
    return fs.readdirSync(path.join(RAIZ, 'scripts'))
        .filter((f) => f.startsWith('test-') && f.endsWith('.js'))
        .sort()
        .map((f) => path.join('scripts', f));
}

function rodar(arquivo) {
    try {
        const saida = execFileSync('node', [arquivo], {
            cwd: RAIZ, encoding: 'utf-8', timeout: 180000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { status: 'ok', saida };
    } catch (err) {
        const saida = `${err.stdout || ''}\n${err.stderr || ''}`;
        if (PADRAO_SEM_EVIDENCIA.test(saida) || faltouEvidenciaExterna(saida)) return { status: 'pulado', saida };
        return { status: 'falhou', saida };
    }
}

function main() {
    console.log('── Sintaxe (node --check) ──');
    const arquivosJs = [
        'server.js',
        ...fs.readdirSync(RAIZ).filter((f) => f.startsWith('parser-') && f.endsWith('.js')),
        'api-adapter.js', 'historicos-padrao.js', 'historicos-routes.js',
        'igrejas-conferencia-caixa.js', 'layouts-bancarios-padrao.js',
        'layout-quality-cases.js', 'layout-quality-evidence.js',
        'mercadopago-integration.js', 'reinf-routes.js',
        'vincular-empresa.js', 'vincular-folha-pagamento.js',
    ].filter((f) => fs.existsSync(path.join(RAIZ, f)));

    for (const arquivo of arquivosJs) {
        try {
            execFileSync('node', ['--check', arquivo], { cwd: RAIZ, stdio: 'pipe' });
        } catch (err) {
            console.error(`✗ sintaxe quebrada em ${arquivo}`);
            console.error(String(err.stderr || err.stdout || err.message));
            process.exit(1);
        }
    }
    console.log(`✓ ${arquivosJs.length} arquivos sem erro de sintaxe\n`);

    console.log('── Rotas duplicadas ──');
    const rotas = rodar('scripts/check-duplicate-routes.js');
    if (rotas.status === 'falhou') {
        console.error(rotas.saida);
        process.exit(1);
    }
    console.log('✓ sem rota duplicada\n');

    console.log('── Testes ──');
    const passaram = [];
    const pulados = [];
    const falharam = [];

    for (const arquivo of listarScriptsDeTeste()) {
        const r = rodar(arquivo);
        if (r.status === 'ok') { passaram.push(arquivo); console.log(`✓ ${arquivo}`); }
        else if (r.status === 'pulado') { pulados.push(arquivo); console.log(`⊘ ${arquivo} — evidência não está nesta máquina`); }
        else {
            falharam.push({ arquivo, saida: r.saida });
            console.log(`✗ ${arquivo}`);
        }
    }

    console.log('\n── Resumo ──');
    console.log(`   ${passaram.length} passaram · ${pulados.length} pulados (sem evidência local) · ${falharam.length} falharam`);
    if (pulados.length > 0) {
        console.log('   ⚠ Cobertura PARCIAL: os pulados só rodam na máquina com os arquivos de evidência.');
        console.log('     Rode `npm run check` lá antes de confiar numa mudança de parser.');
    }

    if (falharam.length > 0) {
        console.log('\n── Falhas ──');
        for (const f of falharam) {
            console.log(`\n### ${f.arquivo}`);
            console.log(f.saida.trim().split('\n').slice(0, 25).join('\n'));
        }
        process.exit(1);
    }
    console.log('\n✓ Porta de qualidade do CI passou.');
}

main();

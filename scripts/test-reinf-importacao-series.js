'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const utils = require('../reinf/reinf-import-xml-utils');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cnpjAtivo = '02942184000134';

function xmlEvento(tag, id, nrInsc, periodo) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Reinf xmlns="http://www.reinf.esocial.gov.br/schemas/${tag}/v2_01_02">
  <${tag} Id="${id}">
    <ideEvento><perApur>${periodo || '2026-04'}</perApur></ideEvento>
    <ideContri><tpInsc>1</tpInsc><nrInsc>${nrInsc || '02942184'}</nrInsc></ideContri>
  </${tag}>
</Reinf>`;
}

const r2010 = utils.analisarXmlPrevidenciario(
    xmlEvento('evtServTom', 'ID2010FASTWELD', '02942184', '2026-04'),
    { DOMParserCtor: DOMParser, cnpjAtivo }
);
assert.strictEqual(r2010.evento, 'R-2010');
assert.strictEqual(r2010.idEvento, 'ID2010FASTWELD');
assert.strictEqual(r2010.cnpjDeclarante, '02942184');
assert.strictEqual(r2010.competencia, '2026-04');

Object.entries(utils.EVENTOS_PREVIDENCIARIOS).forEach(([tag, codigo], idx) => {
    const item = utils.analisarXmlPrevidenciario(
        xmlEvento(tag, `IDMAPA${idx}`, '02942184', '2026-04'),
        { DOMParserCtor: DOMParser, cnpjAtivo }
    );
    assert.strictEqual(item.evento, codigo, `${tag} deve ser identificado como ${codigo}`);
});

const r3010 = utils.analisarXmlPrevidenciario(
    xmlEvento('evtEspDesportivo', 'ID3010FASTWELD', cnpjAtivo, '2026-04-15'),
    { DOMParserCtor: DOMParser, cnpjAtivo }
);
assert.strictEqual(r3010.evento, 'R-3010');

const cnpjAlfanumerico = '12ABC34501DE35';
const r2055Alfanumerico = utils.analisarXmlPrevidenciario(
    xmlEvento('evtAqProd', 'ID2055ALFANUMERICO', '12ABC345', '2026-04'),
    { DOMParserCtor: DOMParser, cnpjAtivo: cnpjAlfanumerico }
);
assert.strictEqual(r2055Alfanumerico.cnpjDeclarante, '12ABC345');

assert.throws(() => utils.analisarXmlPrevidenciario(
    xmlEvento('evtServPrest', 'ID2020OUTRA', '12345678', '2026-04'),
    { DOMParserCtor: DOMParser, cnpjAtivo }
), /não corresponde à empresa ativa/);

assert.throws(() => utils.analisarXmlPrevidenciario(
    xmlEvento('evt4010', 'ID4010', '02942184', '2026-04'),
    { DOMParserCtor: DOMParser, cnpjAtivo }
), /não pertence às séries R-2000\/R-3000/);

assert.throws(() => utils.analisarXmlPrevidenciario(
    xmlEvento('evtServTom', 'IDNAMESPACEINVALIDO', '02942184', '2026-04').replace('http://www.reinf.esocial.gov.br/schemas/', 'https://exemplo.invalid/'),
    { DOMParserCtor: DOMParser, cnpjAtivo }
), /namespace EFD-Reinf inválido/);

assert.throws(() => utils.analisarXmlPrevidenciario(
    '<Reinf><evtServTom Id="INCOMPLETO"><ideContri>',
    { DOMParserCtor: DOMParser, cnpjAtivo }
), /malformado/);

assert.throws(() => utils.validarDuplicidades([r2010], ['ID2010FASTWELD']), /duplicado/);

assert(index.includes('id="reinfArquivoPrevidenciario"'), 'aba R-2000/R-3000 deve oferecer importação XML');
assert(index.includes('multiple onchange="importarArquivosPrevidenciariosReinf(event)"'), 'importador previdenciário deve aceitar lote de XMLs');
assert(index.includes('id="reinfArquivo" accept=".csv,.txt,.xlsx,.xls"'), 'aba R-4000 deve expor importador tabular existente');
assert(index.includes('Importar arquivo R-4000'), 'ação de importação R-4000 deve ficar visível no topo');
assert(index.includes('Nenhum arquivo deste lote foi adicionado'), 'falha previdenciária deve ser atômica');
assert(index.includes('A transmissão previdenciária continua bloqueada até homologação'), 'importação não pode liberar transmissão não homologada');

console.log('OK: abas EFD-Reinf importam R-4000 e validam XMLs R-2000/R-3000 com trava de CNPJ, evento e duplicidade.');
